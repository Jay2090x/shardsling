/**
 * Shardsling simulation core.
 *
 * Rules for this module (keep it headless):
 *  - no DOM / window / performance / Math.random access
 *  - all randomness comes from the seeded generator stored in the state
 *  - step() only reads its arguments and only writes into `state`
 *
 * That makes it usable in Node for automated tests, replays and training an agent.
 */
import {
  ARENA_H,
  ARENA_W,
  COMBO_WINDOW,
  DRONE,
  MAX_COMBO_MULT,
  SHARD,
  TETHER,
  WAVE_DELAY,
  WAVE_MAX_AGE,
} from './constants';
import { nextRandom, randInt, randRange } from './rng';
import type { GameState, Mode, Shard, SimInput, Tier } from './types';

export function createGame(seed: number, mode: Mode = 'play'): GameState {
  const s: GameState = {
    seed: seed >>> 0,
    rng: seed >>> 0,
    mode,
    phase: 'playing',
    tick: 0,
    time: 0,
    wave: 0,
    waveTimer: 0,
    waveAge: 0,
    score: 0,
    lives: DRONE.lives,
    combo: 0,
    comboTimer: 0,
    maxCombo: 0,
    breaks: 0,
    drone: {
      x: ARENA_W / 2,
      y: ARENA_H / 2,
      px: ARENA_W / 2,
      py: ARENA_H / 2,
      vx: 0,
      vy: 0,
      r: DRONE.radius,
      invuln: DRONE.startInvuln,
    },
    tether: { state: 'idle', hx: ARENA_W / 2, hy: ARENA_H / 2, targetId: -1, length: 0, dir: 1 },
    shards: [],
    nextId: 1,
    prevHook: false,
    events: [],
  };
  spawnWave(s, 1);
  s.events = [];
  return s;
}

/**
 * Fixed layout of the practice arena used by the first-run tutorial.
 * The ammo shard is inside hook range of the move target, the big target is just outside it.
 */
export const TUTORIAL_LAYOUT = {
  start: { x: 470, y: 560 },
  moveTarget: { x: 800, y: 560 },
  moveRadius: 70,
  ammo: { x: 800, y: 730 },
  target: { x: 1230, y: 500 },
} as const;

/** Practice arena for the tutorial: mode 'tutorial', one small ammo shard and one big target, nothing drifts. */
export function createTutorial(seed: number): GameState {
  const s = createGame(seed, 'tutorial');
  const L = TUTORIAL_LAYOUT;
  s.shards = [];
  s.nextId = 1;
  s.drone.x = s.drone.px = L.start.x;
  s.drone.y = s.drone.py = L.start.y;
  s.drone.invuln = 0;
  s.tether.hx = L.start.x;
  s.tether.hy = L.start.y;
  s.shards.push(makeShard(s, 1, L.ammo.x, L.ammo.y, 0, 0));
  s.shards.push(makeShard(s, 3, L.target.x, L.target.y, 0, 0));
  for (const sh of s.shards) sh.spin *= 0.4;
  return s;
}

/** Deep copy (the state is plain JSON-like data). */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    drone: { ...s.drone },
    tether: { ...s.tether },
    shards: s.shards.map((sh) => ({ ...sh, verts: sh.verts.slice() })),
    events: s.events.slice(),
  };
}

/** Pure variant of step(): returns a new state and leaves the input state untouched. */
export function stepPure(s: GameState, input: SimInput, dt: number): GameState {
  const next = cloneState(s);
  step(next, input, dt);
  return next;
}

export function makeShard(
  s: GameState,
  tier: Tier,
  x: number,
  y: number,
  vx: number,
  vy: number,
): Shard {
  const r = SHARD.radius[tier];
  const n = tier === 0 ? 5 : randInt(s, 6, 8);
  const verts: number[] = [];
  for (let i = 0; i < n; i++) {
    // alternate long/short spikes for a crystal silhouette
    verts.push(i % 2 === 0 ? randRange(s, 0.92, 1.12) : randRange(s, 0.62, 0.86));
  }
  return {
    id: s.nextId++,
    tier,
    x,
    y,
    px: x,
    py: y,
    vx,
    vy,
    r,
    mass: (r / 20) * (r / 20),
    angle: randRange(s, 0, Math.PI * 2),
    spin: randRange(s, -1.2, 1.2),
    verts,
    armed: 0,
    safe: 0,
    life: tier === 0 ? SHARD.dustLife : Infinity,
  };
}

function spawnWave(s: GameState, wave: number): void {
  s.wave = wave;
  s.waveAge = 0;
  const large = Math.min(1 + Math.ceil(wave / 2), 6);
  const medium = Math.min(1 + Math.floor(wave / 2), 6);
  const speed = Math.min(45 + wave * 9, 140);
  const total = large + medium;
  if (wave === 1) {
    // onboarding: one slow medium shard starts inside hook range
    const a = randRange(s, 0, Math.PI * 2);
    const x = s.drone.x + Math.cos(a) * 250;
    const y = s.drone.y + Math.sin(a) * 200;
    s.shards.push(makeShard(s, 2, x, y, Math.cos(a) * 20, Math.sin(a) * 20));
  }
  for (let i = 0; i < total; i++) {
    const tier: Tier = i < large ? 3 : 2;
    const r = SHARD.radius[tier];
    // spawn along the edges, away from the drone
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 20; tries++) {
      const edge = randInt(s, 0, 3);
      const m = r + 30;
      if (edge === 0) {
        x = randRange(s, m, ARENA_W - m);
        y = m;
      } else if (edge === 1) {
        x = ARENA_W - m;
        y = randRange(s, m, ARENA_H - m);
      } else if (edge === 2) {
        x = randRange(s, m, ARENA_W - m);
        y = ARENA_H - m;
      } else {
        x = m;
        y = randRange(s, m, ARENA_H - m);
      }
      const dx = x - s.drone.x;
      const dy = y - s.drone.y;
      if (dx * dx + dy * dy > 360 * 360) break;
    }
    // drift roughly towards the centre
    const toC = Math.atan2(ARENA_H / 2 - y, ARENA_W / 2 - x) + randRange(s, -0.7, 0.7);
    const v = speed * randRange(s, 0.7, 1.15);
    s.shards.push(makeShard(s, tier, x, y, Math.cos(toC) * v, Math.sin(toC) * v));
  }
}

function speedOf(o: { vx: number; vy: number }): number {
  return Math.sqrt(o.vx * o.vx + o.vy * o.vy);
}

function isHeld(s: GameState, sh: Shard): boolean {
  return s.tether.state === 'attached' && s.tether.targetId === sh.id;
}

function isHot(s: GameState, sh: Shard): boolean {
  const sp = speedOf(sh);
  if (sp < SHARD.hotSpeed) return false;
  return sh.armed > 0 || isHeld(s, sh);
}

function findShard(s: GameState, id: number): Shard | undefined {
  for (const sh of s.shards) if (sh.id === id) return sh;
  return undefined;
}

function maxSpinFor(r: number): number {
  return TETHER.maxSpinSpeed * Math.sqrt(SHARD.radius[1] / r);
}

/** Advance the simulation by dt seconds (callers use the fixed SIM_DT). Mutates `s`. */
export function step(s: GameState, input: SimInput, dt: number): GameState {
  s.events = [];
  s.tick++;
  s.time += dt;

  const d = s.drone;
  d.px = d.x;
  d.py = d.y;
  for (const sh of s.shards) {
    sh.px = sh.x;
    sh.py = sh.y;
  }

  const alive = s.phase === 'playing';
  const hookHeld = alive && input.hook;

  // ---- drone movement -------------------------------------------------------
  if (alive) {
    let mx = input.moveX;
    let my = input.moveY;
    const ml = Math.sqrt(mx * mx + my * my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    d.vx += mx * DRONE.accel * dt;
    d.vy += my * DRONE.accel * dt;
  }
  const dDamp = Math.exp(-DRONE.drag * dt);
  d.vx *= dDamp;
  d.vy *= dDamp;
  const dsp = speedOf(d);
  // a heavy shard on the rope may drag the drone above its own top speed
  const cap = s.tether.state === 'attached' ? DRONE.maxSpeed * 2.2 : DRONE.maxSpeed;
  if (dsp > cap) {
    d.vx *= cap / dsp;
    d.vy *= cap / dsp;
  }
  d.x += d.vx * dt;
  d.y += d.vy * dt;
  if (d.invuln > 0) d.invuln = Math.max(0, d.invuln - dt);

  // ---- tether ----------------------------------------------------------------
  updateTether(s, input, hookHeld, dt);

  // ---- shards: integrate ------------------------------------------------------
  const toRemove = new Set<number>();
  for (const sh of s.shards) {
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    sh.angle += sh.spin * dt;
    if (sh.armed > 0) {
      sh.armed = Math.max(0, sh.armed - dt);
      if (speedOf(sh) < SHARD.hotSpeed * 0.8) sh.armed = 0;
    }
    if (sh.safe > 0) sh.safe = Math.max(0, sh.safe - dt);
    if (!isHeld(s, sh)) {
      const sp = speedOf(sh);
      if (sp > SHARD.maxDrift) {
        const k = Math.exp(-SHARD.driftDrag * dt);
        const target = Math.max(SHARD.maxDrift, sp * k);
        sh.vx *= target / sp;
        sh.vy *= target / sp;
      }
    }
    if (sh.tier === 0 && alive) {
      sh.life -= dt;
      if (sh.life <= 0) {
        toRemove.add(sh.id);
        s.events.push({ type: 'fade', x: sh.x, y: sh.y });
      }
    }
  }

  // ---- walls ------------------------------------------------------------------
  for (const sh of s.shards) bounceWalls(s, sh, SHARD.wallRestitution, true);
  bounceWalls(s, d, DRONE.restitution, false);

  // ---- shard vs shard -----------------------------------------------------------
  const toBreak: { id: number; nx: number; ny: number; impact: number }[] = [];
  const n = s.shards.length;
  for (let i = 0; i < n; i++) {
    const a = s.shards[i];
    for (let j = i + 1; j < n; j++) {
      const b = s.shards[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = a.r + b.r;
      const dist2 = dx * dx + dy * dy;
      if (dist2 >= rr * rr || dist2 === 0) continue;
      const dist = Math.sqrt(dist2);
      const nx = dx / dist;
      const ny = dy / dist;
      // positional separation (mass weighted)
      const overlap = rr - dist;
      const tm = a.mass + b.mass;
      a.x -= nx * overlap * (b.mass / tm);
      a.y -= ny * overlap * (b.mass / tm);
      b.x += nx * overlap * (a.mass / tm);
      b.y += ny * overlap * (a.mass / tm);
      // relative velocity along the normal (positive = approaching)
      const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (vn <= 0) continue;

      const hotA = isHot(s, a);
      const hotB = isHot(s, b);
      let impulseScale = 1;
      if ((hotA || hotB) && vn > SHARD.breakSpeed) {
        if (hotA && hotB) {
          toBreak.push({ id: a.id, nx: -nx, ny: -ny, impact: vn });
          toBreak.push({ id: b.id, nx, ny, impact: vn });
        } else {
          const proj = hotA ? a : b;
          const target = hotA ? b : a;
          const dirX = hotA ? nx : -nx;
          const dirY = hotA ? ny : -ny;
          toBreak.push({ id: target.id, nx: dirX, ny: dirY, impact: vn });
          if (target.tier >= proj.tier && vn > SHARD.selfBreakSpeed && !isHeld(s, proj)) {
            toBreak.push({ id: proj.id, nx: -dirX, ny: -dirY, impact: vn });
          }
          // a heavy projectile ploughs through lighter shards
          impulseScale = proj.tier > target.tier ? 0.35 : 0.8;
        }
      } else if (vn > 60) {
        s.events.push({ type: 'clack', x: a.x + nx * a.r, y: a.y + ny * a.r, speed: vn });
      }
      const jImp = ((1 + SHARD.restitution) * vn * impulseScale) / (1 / a.mass + 1 / b.mass);
      a.vx -= (jImp / a.mass) * nx;
      a.vy -= (jImp / a.mass) * ny;
      b.vx += (jImp / b.mass) * nx;
      b.vy += (jImp / b.mass) * ny;
    }
  }

  // ---- drone vs shards --------------------------------------------------------------
  for (const sh of s.shards) {
    if (isHeld(s, sh) || toRemove.has(sh.id)) continue;
    const dx = sh.x - d.x;
    const dy = sh.y - d.y;
    const rr = sh.r + d.r;
    const dist2 = dx * dx + dy * dy;
    if (dist2 >= rr * rr || dist2 === 0) continue;
    const dist = Math.sqrt(dist2);
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = rr - dist;
    const tm = DRONE.mass + sh.mass;
    d.x -= nx * overlap * (sh.mass / tm);
    d.y -= ny * overlap * (sh.mass / tm);
    sh.x += nx * overlap * (DRONE.mass / tm);
    sh.y += ny * overlap * (DRONE.mass / tm);
    const vn = (d.vx - sh.vx) * nx + (d.vy - sh.vy) * ny;
    const harmful =
      alive && s.mode === 'play' && d.invuln <= 0 && sh.safe <= 0 && sh.tier > 0;
    if (harmful) {
      s.lives--;
      d.invuln = DRONE.hitInvuln;
      s.events.push({ type: 'hurt', x: d.x, y: d.y, lives: s.lives });
      d.vx -= nx * 420;
      d.vy -= ny * 420;
      // losing a life also drops whatever is on the rope
      if (s.tether.state !== 'idle') s.tether.state = 'retracting';
      if (s.lives <= 0) {
        s.phase = 'gameover';
        s.events.push({ type: 'gameover', score: s.score });
      }
    }
    if (vn > 0) {
      const jImp = ((1 + 0.6) * vn) / (1 / DRONE.mass + 1 / sh.mass);
      d.vx -= (jImp / DRONE.mass) * nx;
      d.vy -= (jImp / DRONE.mass) * ny;
      sh.vx += (jImp / sh.mass) * nx;
      sh.vy += (jImp / sh.mass) * ny;
    }
  }

  // ---- breaking ---------------------------------------------------------------------
  for (const br of toBreak) {
    if (toRemove.has(br.id)) continue;
    const sh = findShard(s, br.id);
    if (!sh) continue;
    toRemove.add(sh.id);
    breakShard(s, sh, br.nx, br.ny, br.impact);
  }
  if (toRemove.size > 0) {
    s.shards = s.shards.filter((sh) => !toRemove.has(sh.id));
    if (s.tether.state === 'attached' || s.tether.state === 'firing') {
      if (toRemove.has(s.tether.targetId)) s.tether.state = 'retracting';
    }
  }

  // ---- combo / waves ---------------------------------------------------------------------
  if (s.comboTimer > 0) {
    s.comboTimer -= dt;
    if (s.comboTimer <= 0) {
      s.comboTimer = 0;
      s.combo = 0;
    }
  }

  if (alive && s.mode !== 'tutorial') {
    s.waveAge += dt;
    if (s.waveTimer > 0) {
      s.waveTimer -= dt;
      if (s.waveTimer <= 0) {
        s.waveTimer = 0;
        spawnWave(s, s.wave + 1);
      }
    } else {
      let solid = 0;
      for (const sh of s.shards) if (sh.tier > 0) solid++;
      // next wave when the field is (almost) clear, or anyway after WAVE_MAX_AGE seconds
      if (solid <= 1 || s.waveAge > WAVE_MAX_AGE) {
        const bonus = s.mode === 'play' ? 50 * s.wave : 0;
        s.score += bonus;
        s.waveTimer = WAVE_DELAY;
        s.events.push({ type: 'wave', wave: s.wave + 1, bonus });
      }
    }
  }

  s.prevHook = hookHeld;
  return s;
}

function bounceWalls(
  s: GameState,
  o: { x: number; y: number; vx: number; vy: number; r: number },
  rest: number,
  emit: boolean,
): void {
  let hit = 0;
  if (o.x < o.r) {
    o.x = o.r;
    if (o.vx < 0) {
      hit = Math.max(hit, -o.vx);
      o.vx = -o.vx * rest;
    }
  } else if (o.x > ARENA_W - o.r) {
    o.x = ARENA_W - o.r;
    if (o.vx > 0) {
      hit = Math.max(hit, o.vx);
      o.vx = -o.vx * rest;
    }
  }
  if (o.y < o.r) {
    o.y = o.r;
    if (o.vy < 0) {
      hit = Math.max(hit, -o.vy);
      o.vy = -o.vy * rest;
    }
  } else if (o.y > ARENA_H - o.r) {
    o.y = ARENA_H - o.r;
    if (o.vy > 0) {
      hit = Math.max(hit, o.vy);
      o.vy = -o.vy * rest;
    }
  }
  if (emit && hit > 220) s.events.push({ type: 'bounce', x: o.x, y: o.y, speed: hit });
}

function updateTether(s: GameState, input: SimInput, hookHeld: boolean, dt: number): void {
  const t = s.tether;
  const d = s.drone;

  if (t.state === 'idle') {
    t.hx = d.x;
    t.hy = d.y;
    if (hookHeld) {
      const target = pickTarget(s, input);
      if (target) {
        t.state = 'firing';
        t.targetId = target.id;
        s.events.push({ type: 'fire', x: d.x, y: d.y });
      }
    }
    return;
  }

  if (t.state === 'firing') {
    const target = findShard(s, t.targetId);
    if (!target || !hookHeld) {
      t.state = 'retracting';
    } else {
      const dx = target.x - t.hx;
      const dy = target.y - t.hy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const stepLen = TETHER.headSpeed * dt;
      if (dist <= target.r + stepLen) {
        t.state = 'attached';
        t.hx = target.x;
        t.hy = target.y;
        const rx = target.x - d.x;
        const ry = target.y - d.y;
        t.length = Math.max(TETHER.minLength, Math.sqrt(rx * rx + ry * ry));
        // keep the shard's current sense of rotation around the drone
        const cross = rx * (target.vy - d.vy) - ry * (target.vx - d.vx);
        t.dir = cross >= 0 ? 1 : -1;
        target.armed = 0;
        s.events.push({ type: 'attach', x: target.x, y: target.y });
      } else {
        t.hx += (dx / dist) * stepLen;
        t.hy += (dy / dist) * stepLen;
        // give up if the shard escaped far beyond range
        const ox = t.hx - d.x;
        const oy = t.hy - d.y;
        if (ox * ox + oy * oy > (TETHER.range * 1.6) ** 2) t.state = 'retracting';
      }
    }
  }

  if (t.state === 'attached') {
    const sh = findShard(s, t.targetId);
    if (!sh) {
      t.state = 'retracting';
    } else if (!hookHeld) {
      // release: the shard flies off tangentially with whatever speed it has
      const sp = speedOf(sh);
      sh.armed = SHARD.armTime;
      sh.safe = SHARD.releaseSafeTime;
      t.state = 'retracting';
      t.hx = sh.x;
      t.hy = sh.y;
      s.events.push({ type: 'fling', x: sh.x, y: sh.y, speed: sp });
    } else {
      applyRope(s, sh, dt);
      t.hx = sh.x;
      t.hy = sh.y;
    }
  }

  if (t.state === 'retracting') {
    const dx = d.x - t.hx;
    const dy = d.y - t.hy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const stepLen = TETHER.retractSpeed * dt;
    if (dist <= stepLen + d.r) {
      t.state = 'idle';
      t.targetId = -1;
      t.hx = d.x;
      t.hy = d.y;
    } else {
      t.hx += (dx / dist) * stepLen;
      t.hy += (dy / dist) * stepLen;
    }
  }
}

/** Which shard the hook would grab right now (read-only; also used for the aim preview). */
export function pickTarget(s: GameState, input: SimInput): Shard | undefined {
  const d = s.drone;
  const range2 = TETHER.range * TETHER.range;
  let best: Shard | undefined;
  let bestScore = Infinity;
  const hasAim = input.aimX !== null && input.aimY !== null;
  for (const sh of s.shards) {
    const dx = sh.x - d.x;
    const dy = sh.y - d.y;
    const dd = dx * dx + dy * dy;
    if (dd > range2) continue;
    let score: number;
    if (hasAim) {
      const ax = sh.x - (input.aimX as number);
      const ay = sh.y - (input.aimY as number);
      score = ax * ax + ay * ay;
    } else {
      score = dd;
    }
    if (score < bestScore) {
      bestScore = score;
      best = sh;
    }
  }
  return best;
}

function applyRope(s: GameState, sh: Shard, dt: number): void {
  const d = s.drone;
  const t = s.tether;
  // reel towards the orbit radius
  const orbit = d.r + sh.r + TETHER.orbitGap;
  if (t.length > orbit) t.length = Math.max(orbit, t.length - TETHER.reelSpeed * dt);
  else t.length = Math.min(orbit, t.length + TETHER.reelSpeed * dt);

  let rx = sh.x - d.x;
  let ry = sh.y - d.y;
  let dist = Math.sqrt(rx * rx + ry * ry) || 0.0001;
  let nx = rx / dist;
  let ny = ry / dist;

  // spin up: tangential force on the shard (heavy shards spin up slower)
  const tx = -ny * t.dir;
  const ty = nx * t.dir;
  const vt = (sh.vx - d.vx) * tx + (sh.vy - d.vy) * ty;
  const maxV = maxSpinFor(sh.r);
  if (vt < maxV) {
    const a = Math.min(TETHER.spinForce / sh.mass, (maxV - vt) / dt);
    sh.vx += tx * a * dt;
    sh.vy += ty * a * dt;
  }

  // inextensible rope: positional correction + remove separating radial velocity
  const md = 1 / DRONE.mass;
  const ms = 1 / sh.mass;
  const wsum = md + ms;
  if (dist > t.length) {
    const err = dist - t.length;
    d.x += nx * err * (md / wsum);
    d.y += ny * err * (md / wsum);
    sh.x -= nx * err * (ms / wsum);
    sh.y -= ny * err * (ms / wsum);
    rx = sh.x - d.x;
    ry = sh.y - d.y;
    dist = Math.sqrt(rx * rx + ry * ry) || 0.0001;
    nx = rx / dist;
    ny = ry / dist;
  }
  const vr = (sh.vx - d.vx) * nx + (sh.vy - d.vy) * ny;
  if (vr > 0 || dist < t.length * 0.98) {
    // rope is taut (or being reeled in): cancel radial separation, pull in gently
    const desired = dist < t.length * 0.98 ? Math.min(0, vr) : 0;
    const imp = (vr - desired) / wsum;
    if (vr > desired) {
      sh.vx -= nx * imp * ms;
      sh.vy -= ny * imp * ms;
      d.vx += nx * imp * md;
      d.vy += ny * imp * md;
    }
  }
}

function breakShard(s: GameState, sh: Shard, nx: number, ny: number, impact: number): void {
  if (s.comboTimer > 0) s.combo++;
  else s.combo = 1;
  s.comboTimer = COMBO_WINDOW;
  if (s.combo > s.maxCombo) s.maxCombo = s.combo;
  const mult = Math.min(s.combo, MAX_COMBO_MULT);
  const points = s.mode === 'play' ? SHARD.score[sh.tier] * mult : 0;
  s.score += points;
  s.breaks++;
  s.events.push({ type: 'break', x: sh.x, y: sh.y, r: sh.r, tier: sh.tier, combo: s.combo, points });

  if (sh.tier === 0) return;
  const childTier = (sh.tier - 1) as Tier;
  // large -> 2-3 medium, medium -> 2-3 small, small -> 2 dust (dust is ammo too)
  const count = sh.tier === 1 ? 2 : randInt(s, 2, 3);
  const base = nextRandom(s) * Math.PI * 2;
  const push = Math.min(impact * 0.45, 380);
  for (let k = 0; k < count; k++) {
    const ang = base + (k / count) * Math.PI * 2 + randRange(s, -0.3, 0.3);
    const cx = Math.cos(ang);
    const cy = Math.sin(ang);
    const off = sh.r * 0.5;
    const spread = randRange(s, 90, 170);
    const frag = makeShard(
      s,
      childTier,
      sh.x + cx * off,
      sh.y + cy * off,
      sh.vx * 0.4 + cx * spread + nx * push,
      sh.vy * 0.4 + cy * spread + ny * push,
    );
    frag.armed = SHARD.fragmentArmTime;
    frag.safe = 0.5;
    frag.spin = randRange(s, -4, 4);
    s.shards.push(frag);
  }
}

/**
 * Enemies: hunter (slowly homes in on the drone), prism (telegraphed aimed shots, bursts into armed
 * crystals when smashed) and the boss (every ENEMY.boss.everyWaves waves). Headless and deterministic.
 * Everything an enemy fires is an ordinary small crystal: dangerous to touch, but also new ammo.
 */
import { ARENA_H, ARENA_W, DRONE, ENEMY, SHARD } from './constants';
import { randRange } from './rng';
import { canHurtDrone, edgePoint, hurtDrone, makeShard, registerSmash, speedOf } from './shared';
import type { Enemy, EnemyKind, GameState, Shard } from './types';

const H = ENEMY.hunter;
const P = ENEMY.prism;
const B = ENEMY.boss;

export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % B.everyWaves === 0;
}

export function hunterCount(wave: number): number {
  if (isBossWave(wave) || wave < H.fromWave) return 0;
  return Math.min(1 + Math.floor((wave - H.fromWave) / 2), 4);
}

export function prismCount(wave: number): number {
  if (isBossWave(wave) || wave < P.fromWave) return 0;
  return Math.min(1 + Math.floor((wave - P.fromWave) / 3), 3);
}

export function makeEnemy(s: GameState, kind: EnemyKind, x: number, y: number): Enemy {
  const r = kind === 'hunter' ? H.radius : kind === 'prism' ? P.radius : B.radius;
  const mass = kind === 'hunter' ? H.mass : kind === 'prism' ? P.mass : B.mass;
  const hp = kind === 'boss' ? B.hp + B.hpPerBoss * Math.max(0, s.bosses - 1) : 1;
  const a = randRange(s, 0, Math.PI * 2);
  const v = kind === 'prism' ? P.drift : 0;
  return {
    id: s.nextId++,
    kind,
    x,
    y,
    px: x,
    py: y,
    vx: Math.cos(a) * v,
    vy: Math.sin(a) * v,
    r,
    mass,
    hp,
    maxHp: hp,
    angle: a,
    spin: kind === 'prism' ? randRange(s, 0.6, 1.1) * (a > Math.PI ? 1 : -1) : 0,
    spawn: kind === 'boss' ? ENEMY.spawnTime * 1.6 : ENEMY.spawnTime,
    cooldown: kind === 'prism' ? P.fireFirst + randRange(s, 0, 1.5) : kind === 'boss' ? B.firstAttack : 0,
    charge: 0,
    chargeMax: 0,
    attack: 'none',
    aim: 0,
    flash: 0,
    stun: 0,
  };
}

/** Adds the enemies of a freshly spawned wave. */
export function spawnEnemies(s: GameState, wave: number): void {
  const add = (e: Enemy) => {
    s.enemies.push(e);
    s.events.push({ type: 'enemySpawn', kind: e.kind, x: e.x, y: e.y });
  };
  if (isBossWave(wave)) {
    s.bosses++;
    const x = s.drone.x < ARENA_W / 2 ? ARENA_W * 0.72 : ARENA_W * 0.28;
    add(makeEnemy(s, 'boss', x, ARENA_H / 2));
    return;
  }
  for (let i = hunterCount(wave); i > 0; i--) {
    const p = edgePoint(s, H.radius, 450);
    add(makeEnemy(s, 'hunter', p.x, p.y));
  }
  for (let i = prismCount(wave); i > 0; i--) {
    const p = edgePoint(s, P.radius, 420);
    // prisms float a bit inside the arena so their shots have room
    const e = makeEnemy(s, 'prism', p.x + (ARENA_W / 2 - p.x) * 0.15, p.y + (ARENA_H / 2 - p.y) * 0.15);
    add(e);
  }
}

function hunterSpeed(wave: number): number {
  return Math.min(H.speed + H.speedPerWave * Math.max(0, wave - H.fromWave), H.maxSpeed);
}

function solidCount(s: GameState): number {
  let n = 0;
  for (const sh of s.shards) if (sh.tier > 0) n++;
  return n;
}

function fireShard(s: GameState, e: Enemy, angle: number, speed: number): void {
  const off = e.r + SHARD.radius[1] + 6;
  const sh = makeShard(s, 1, e.x + Math.cos(angle) * off, e.y + Math.sin(angle) * off, Math.cos(angle) * speed, Math.sin(angle) * speed);
  sh.spin = randRange(s, -5, 5);
  s.shards.push(sh);
}

function steerTo(e: Enemy, vx: number, vy: number, accel: number, dt: number): void {
  const dvx = vx - e.vx;
  const dvy = vy - e.vy;
  const l = Math.sqrt(dvx * dvx + dvy * dvy);
  const max = accel * dt;
  if (l <= max) {
    e.vx = vx;
    e.vy = vy;
  } else {
    e.vx += (dvx / l) * max;
    e.vy += (dvy / l) * max;
  }
}

/**
 * AI, attacks and movement. `ws` is the world time scale (Focus perk); `active` is false once the run is over
 * (enemies then just drift and stop attacking).
 */
export function updateEnemies(s: GameState, dt: number, ws: number, active: boolean): void {
  const d = s.drone;
  const t = dt * ws;
  for (const e of s.enemies) {
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
    if (e.spawn > 0) {
      e.spawn = Math.max(0, e.spawn - t);
      continue;
    }
    const dx = d.x - e.x;
    const dy = d.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const toDrone = Math.atan2(dy, dx);

    if (e.kind === 'hunter') {
      const sp = hunterSpeed(s.wave);
      if (e.stun > 0) {
        e.stun = Math.max(0, e.stun - t);
        steerTo(e, (-dx / dist) * sp * 0.8, (-dy / dist) * sp * 0.8, H.accel, t);
      } else if (active) {
        steerTo(e, (dx / dist) * sp, (dy / dist) * sp, H.accel, t);
      } else {
        steerTo(e, 0, 0, H.accel, t);
      }
      // face the movement (the eye looks at the drone, see renderer)
      e.angle = toDrone;
    } else if (e.kind === 'prism') {
      e.angle += e.spin * t;
      if (e.charge > 0) {
        // hold still while telegraphing, then shoot exactly along the shown line
        const k = Math.exp(-4 * t);
        e.vx *= k;
        e.vy *= k;
        e.charge = Math.max(0, e.charge - t);
        if (e.charge === 0 && active) {
          fireShard(s, e, e.aim, P.shotSpeed);
          s.events.push({ type: 'enemyFire', kind: e.kind, attack: 'shot', x: e.x, y: e.y });
          e.cooldown = P.fireEvery;
          // resume drifting
          e.vx = Math.cos(e.angle) * P.drift;
          e.vy = Math.sin(e.angle) * P.drift;
        }
      } else {
        const sp = speedOf(e);
        if (sp < P.drift * 0.6) {
          e.vx += Math.cos(e.angle) * P.drift * t;
          e.vy += Math.sin(e.angle) * P.drift * t;
        } else if (sp > P.drift * 2) {
          const k = Math.exp(-1.2 * t);
          e.vx *= k;
          e.vy *= k;
        }
        e.cooldown -= t;
        if (active && e.cooldown <= 0 && solidCount(s) < B.maxShards) {
          e.attack = 'shot';
          e.aim = toDrone;
          e.charge = e.chargeMax = P.charge;
          s.events.push({ type: 'charge', kind: e.kind, attack: 'shot', x: e.x, y: e.y });
        }
      }
    } else {
      // boss: slow pursuit, stops to telegraph, alternates aimed volley and radial nova
      e.angle += 0.35 * t;
      if (e.charge > 0) {
        const k = Math.exp(-5 * t);
        e.vx *= k;
        e.vy *= k;
        e.charge = Math.max(0, e.charge - t);
        if (e.charge === 0 && active) {
          if (e.attack === 'volley') {
            for (let i = 0; i < B.volleyCount; i++) {
              fireShard(s, e, e.aim + (i - (B.volleyCount - 1) / 2) * B.volleySpread, B.volleySpeed);
            }
          } else {
            for (let i = 0; i < B.novaCount; i++) fireShard(s, e, e.aim + (i / B.novaCount) * Math.PI * 2, B.novaSpeed);
          }
          s.events.push({ type: 'enemyFire', kind: 'boss', attack: e.attack, x: e.x, y: e.y });
          e.cooldown = e.hp <= e.maxHp / 2 ? B.enragedEvery : B.attackEvery;
        }
      } else {
        if (active) steerTo(e, (dx / dist) * B.speed, (dy / dist) * B.speed, 60, t);
        else steerTo(e, 0, 0, 60, t);
        e.cooldown -= t;
        if (active && e.cooldown <= 0 && solidCount(s) < B.maxShards) {
          e.attack = e.attack === 'volley' ? 'nova' : 'volley';
          // the nova's gaps are offset from the drone direction so standing still is safe-ish, moving is safer
          e.aim = e.attack === 'volley' ? toDrone : toDrone + Math.PI / B.novaCount;
          e.charge = e.chargeMax = e.attack === 'volley' ? B.chargeVolley : B.chargeNova;
          s.events.push({ type: 'charge', kind: 'boss', attack: e.attack, x: e.x, y: e.y });
        }
      }
    }

    e.x += e.vx * t;
    e.y += e.vy * t;
    wallClamp(e, e.kind === 'hunter' ? 0.6 : 0.9);
  }
}

function wallClamp(e: Enemy, rest: number): void {
  if (e.x < e.r) {
    e.x = e.r;
    if (e.vx < 0) e.vx = -e.vx * rest;
  } else if (e.x > ARENA_W - e.r) {
    e.x = ARENA_W - e.r;
    if (e.vx > 0) e.vx = -e.vx * rest;
  }
  if (e.y < e.r) {
    e.y = e.r;
    if (e.vy < 0) e.vy = -e.vy * rest;
  } else if (e.y > ARENA_H - e.r) {
    e.y = ARENA_H - e.r;
    if (e.vy > 0) e.vy = -e.vy * rest;
  }
}

export interface EnemyHooks {
  isHot(sh: Shard): boolean;
  isHeld(sh: Shard): boolean;
  /** schedule a crystal to shatter at the end of the step (projectile hitting the boss) */
  breakLater(sh: Shard, nx: number, ny: number, impact: number): void;
}

/** Hunter / prism destroyed: points, combo and (prism) a burst of armed crystals. */
export function killEnemy(s: GameState, e: Enemy, nx: number, ny: number): void {
  if (e.hp <= 0 && e.kind !== 'boss') return;
  e.hp = 0;
  const base = e.kind === 'hunter' ? H.score : e.kind === 'prism' ? P.score : B.killScore;
  const { combo, points } = registerSmash(s, base);
  s.events.push({ type: 'enemyKill', kind: e.kind, x: e.x, y: e.y, r: e.r, combo, points });
  if (e.kind === 'prism') {
    const base0 = Math.atan2(ny, nx);
    for (let k = 0; k < P.splinters; k++) {
      const a = base0 + (k / P.splinters) * Math.PI * 2;
      const sh = makeShard(
        s,
        1,
        e.x + Math.cos(a) * e.r * 0.6,
        e.y + Math.sin(a) * e.r * 0.6,
        Math.cos(a) * P.splinterSpeed,
        Math.sin(a) * P.splinterSpeed,
      );
      sh.armed = SHARD.armTime * 0.5;
      sh.safe = P.splinterSafe;
      sh.spin = randRange(s, -6, 6);
      s.shards.push(sh);
    }
  }
}

/**
 * Enemy vs crystals, drone and each other. A hot crystal (flung or swung fast) smashes hunters and prisms
 * and chips the boss; slow contacts just bounce. Returns true if the boss went down this step.
 */
export function collideEnemies(s: GameState, hooks: EnemyHooks): boolean {
  let bossDown = false;
  const d = s.drone;
  const n = s.enemies.length;
  for (let i = 0; i < n; i++) {
    const e = s.enemies[i];
    if (e.spawn > 0 || e.hp <= 0) continue;

    // ---- vs crystals
    for (const sh of s.shards) {
      if (e.hp <= 0) break;
      const dx = sh.x - e.x;
      const dy = sh.y - e.y;
      const rr = sh.r + e.r;
      const dist2 = dx * dx + dy * dy;
      if (dist2 >= rr * rr || dist2 === 0) continue;
      const dist = Math.sqrt(dist2);
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = rr - dist;
      const tm = e.mass + sh.mass;
      e.x -= nx * overlap * (sh.mass / tm);
      e.y -= ny * overlap * (sh.mass / tm);
      sh.x += nx * overlap * (e.mass / tm);
      sh.y += ny * overlap * (e.mass / tm);
      // relative normal speed (positive = approaching), same convention as crystal vs crystal
      const vn = (e.vx - sh.vx) * nx + (e.vy - sh.vy) * ny;
      if (vn <= 0) continue;
      let scale = 1;
      if (hooks.isHot(sh) && vn > SHARD.breakSpeed) {
        if (e.kind === 'boss') {
          if (e.flash <= 0) {
            const dmg = Math.max(1, sh.tier);
            e.hp = Math.max(0, e.hp - dmg);
            e.flash = B.hitInvuln;
            const { points } = registerSmash(s, B.hitScore * dmg);
            s.events.push({ type: 'bossHit', x: sh.x, y: sh.y, hp: e.hp, maxHp: e.maxHp, points });
            if (e.hp <= 0) {
              killEnemy(s, e, -nx, -ny);
              bossDown = true;
            }
          }
          // the crystal shatters on the armour (its fragments are new ammo)
          hooks.breakLater(sh, nx, ny, vn);
        } else {
          killEnemy(s, e, nx, ny);
          scale = 0.3; // the crystal flies on
        }
      }
      const jImp = ((1 + 0.8) * vn * scale) / (1 / e.mass + 1 / sh.mass);
      e.vx -= (jImp / e.mass) * nx;
      e.vy -= (jImp / e.mass) * ny;
      sh.vx += (jImp / sh.mass) * nx;
      sh.vy += (jImp / sh.mass) * ny;
      if (e.kind === 'boss') {
        // the boss barely moves
        e.vx *= 0.5;
        e.vy *= 0.5;
      }
    }
    if (e.hp <= 0) continue;

    // ---- vs drone
    {
      const dx = e.x - d.x;
      const dy = e.y - d.y;
      const rr = e.r + d.r;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < rr * rr && dist2 > 0) {
        const dist = Math.sqrt(dist2);
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = rr - dist;
        const tm = DRONE.mass + e.mass;
        d.x -= nx * overlap * (e.mass / tm);
        d.y -= ny * overlap * (e.mass / tm);
        e.x += nx * overlap * (DRONE.mass / tm);
        e.y += ny * overlap * (DRONE.mass / tm);
        if (canHurtDrone(s)) {
          hurtDrone(s, nx, ny);
          if (e.kind === 'hunter') e.stun = H.stunAfterHit;
        } else if (e.kind === 'boss') {
          // even while blinking, the boss pushes the drone away
          d.vx -= nx * 260;
          d.vy -= ny * 260;
        }
        const vn = (d.vx - e.vx) * nx + (d.vy - e.vy) * ny;
        if (vn > 0) {
          const jImp = ((1 + 0.6) * vn) / (1 / DRONE.mass + 1 / e.mass);
          d.vx -= (jImp / DRONE.mass) * nx;
          d.vy -= (jImp / DRONE.mass) * ny;
          e.vx += (jImp / e.mass) * nx;
          e.vy += (jImp / e.mass) * ny;
        }
      }
    }

    // ---- vs other enemies (soft separation so hunters don't stack)
    for (let j = i + 1; j < n; j++) {
      const o = s.enemies[j];
      if (o.spawn > 0 || o.hp <= 0) continue;
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      const rr = o.r + e.r;
      const dist2 = dx * dx + dy * dy;
      if (dist2 >= rr * rr || dist2 === 0) continue;
      const dist = Math.sqrt(dist2);
      const overlap = rr - dist;
      const tm = e.mass + o.mass;
      e.x -= (dx / dist) * overlap * (o.mass / tm);
      e.y -= (dy / dist) * overlap * (o.mass / tm);
      o.x += (dx / dist) * overlap * (e.mass / tm);
      o.y += (dy / dist) * overlap * (e.mass / tm);
    }
  }
  return bossDown;
}

/** Shockwave perk: hunters and prisms inside the radius are destroyed too. */
export function blastEnemies(s: GameState, x: number, y: number, radius: number): void {
  for (const e of s.enemies) {
    if (e.kind === 'boss' || e.spawn > 0 || e.hp <= 0) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const rr = radius + e.r;
    if (dx * dx + dy * dy < rr * rr) {
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      killEnemy(s, e, dx / l, dy / l);
    }
  }
}

/** While enemies are alive and the field is low on crystals, a medium crystal drifts in now and then. */
export function updateSupply(s: GameState, dt: number): void {
  if (s.enemies.length === 0 || solidCount(s) >= ENEMY.supplyBelow) {
    s.supplyTimer = ENEMY.supplyEvery;
    return;
  }
  s.supplyTimer -= dt;
  if (s.supplyTimer > 0) return;
  s.supplyTimer = ENEMY.supplyEvery;
  const p = edgePoint(s, SHARD.radius[2], 300);
  const a = Math.atan2(ARENA_H / 2 - p.y, ARENA_W / 2 - p.x);
  s.shards.push(makeShard(s, 2, p.x, p.y, Math.cos(a) * 70, Math.sin(a) * 70));
}

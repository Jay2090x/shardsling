/** Small helpers shared by the simulation modules (headless, deterministic). */
import { ARENA_H, ARENA_W, COMBO_WINDOW, DRONE, MAX_COMBO_MULT, SHARD } from './constants';
import { randInt, randRange } from './rng';
import type { GameState, Shard, Tier } from './types';

export function speedOf(o: { vx: number; vy: number }): number {
  return Math.sqrt(o.vx * o.vx + o.vy * o.vy);
}

export function makeShard(s: GameState, tier: Tier, x: number, y: number, vx: number, vy: number): Shard {
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

/** Counts a smash for the combo and returns the points it is worth (0 outside play mode). */
export function registerSmash(s: GameState, base: number): { combo: number; points: number } {
  if (s.comboTimer > 0) s.combo++;
  else s.combo = 1;
  s.comboTimer = COMBO_WINDOW;
  if (s.combo > s.maxCombo) s.maxCombo = s.combo;
  const mult = Math.min(s.combo, MAX_COMBO_MULT);
  const points = s.mode === 'play' ? base * mult : 0;
  s.score += points;
  s.breaks++;
  return { combo: s.combo, points };
}

/** The drone takes a hit (caller checks invulnerability and mode). nx/ny point from the drone to the hazard. */
export function hurtDrone(s: GameState, nx: number, ny: number): void {
  const d = s.drone;
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

export function canHurtDrone(s: GameState): boolean {
  return s.phase === 'playing' && s.mode === 'play' && s.drone.invuln <= 0;
}

/** A point on a random edge, preferably far from the drone. */
export function edgePoint(s: GameState, r: number, minDist = 360): { x: number; y: number } {
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
    if (dx * dx + dy * dy > minDist * minDist) break;
  }
  return { x, y };
}

export function bounceWalls(
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

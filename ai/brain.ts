/**
 * Shardsling agent "brain": a tiny fully connected neural network (MLP) plus the
 * observation vector it sees and the action it picks.
 *
 * No generative AI, no pretrained weights: the weights are found from scratch by a
 * genetic algorithm (neuroevolution, see train.ts) playing the real simulation in src/sim.
 *
 * Runs unchanged in Node (training) and in the browser (replays / brain view).
 */
import { ARENA_H, ARENA_W, DRONE, TETHER } from '../src/sim/constants';
import { pickTarget } from '../src/sim/sim';
import type { GameState, SimInput } from '../src/sim/types';

export const N_IN = 24;
export const N_HID = 16;
/** 9 movement choices (stop + 8 directions) and 1 hook output (held when > 0) => 18 possible actions */
export const N_MOVE = 9;
export const N_OUT = N_MOVE + 1;
export const N_WEIGHTS = N_IN * N_HID + N_HID + N_HID * N_OUT + N_OUT;
/** the agent decides every DECIDE_EVERY simulation ticks (sim runs at 120 Hz => 60 decisions/s) */
export const DECIDE_EVERY = 2;

export const INPUT_LABELS: string[] = [
  'pos x', 'pos y', 'vel x', 'vel y',
  'swinging', 'rope busy',
  'crystal dx', 'crystal dy', 'in reach',
  'held dx', 'held dy', 'spin', 'laser',
  'radar N', 'radar NE', 'radar E', 'radar SE', 'radar S', 'radar SW', 'radar W', 'radar NW',
  'enemy dx', 'enemy dy', 'enemy',
];
export const OUTPUT_LABELS: string[] = ['stop', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'hook'];

const S2 = Math.SQRT1_2;
/** movement vectors for outputs 0..8 (screen coordinates: y grows downwards, N = up) */
export const MOVES: readonly [number, number][] = [
  [0, 0], [0, -1], [S2, -S2], [1, 0], [S2, S2], [0, 1], [-S2, S2], [-1, 0], [-S2, -S2],
];

const clamp1 = (v: number) => (v > 1 ? 1 : v < -1 ? -1 : v);

/** Ray from (x,y) along unit (ux,uy): 1 - distance/900 to the first target it would hit, 0 if none. */
function laser(s: GameState, ignoreId: number, x: number, y: number, ux: number, uy: number, r: number): number {
  let best = Infinity;
  const test = (ox: number, oy: number, or: number) => {
    const dx = ox - x;
    const dy = oy - y;
    const along = dx * ux + dy * uy;
    if (along <= 0 || along > 900) return;
    const perp = Math.abs(dx * uy - dy * ux);
    if (perp < or + r && along < best) best = along;
  };
  for (const sh of s.shards) if (sh.id !== ignoreId && sh.tier > 0) test(sh.x, sh.y, sh.r);
  for (const e of s.enemies) if (e.spawn <= 0) test(e.x, e.y, e.r);
  return best === Infinity ? 0 : 1 - best / 900;
}

/** Fills `out` (length N_IN) with the observation for the current state. All values are in -1..1. */
export function observe(s: GameState, out: Float64Array = new Float64Array(N_IN)): Float64Array {
  const d = s.drone;
  const t = s.tether;
  out.fill(0);
  out[0] = (d.x / ARENA_W) * 2 - 1;
  out[1] = (d.y / ARENA_H) * 2 - 1;
  out[2] = clamp1(d.vx / DRONE.maxSpeed);
  out[3] = clamp1(d.vy / DRONE.maxSpeed);
  out[4] = t.state === 'attached' ? 1 : 0;
  out[5] = t.state === 'firing' || t.state === 'retracting' ? 1 : 0;

  // nearest crystal (what the hook would go for)
  let near = null as null | { x: number; y: number };
  let nd = Infinity;
  for (const sh of s.shards) {
    if (t.state === 'attached' && sh.id === t.targetId) continue;
    const dd = (sh.x - d.x) ** 2 + (sh.y - d.y) ** 2;
    if (dd < nd) {
      nd = dd;
      near = sh;
    }
  }
  if (near) {
    out[6] = clamp1((near.x - d.x) / 600);
    out[7] = clamp1((near.y - d.y) / 600);
  }
  out[8] = t.state === 'idle' && pickTarget(s, { moveX: 0, moveY: 0, hook: true, aimX: null, aimY: null }) ? 1 : 0;

  // crystal on the rope: where it is, how fast it spins, and a "laser" along its flight direction
  if (t.state === 'attached') {
    const held = s.shards.find((x) => x.id === t.targetId);
    if (held) {
      const rx = held.x - d.x;
      const ry = held.y - d.y;
      out[9] = clamp1(rx / 150);
      out[10] = clamp1(ry / 150);
      const dist = Math.hypot(rx, ry) || 1;
      const tx = -ry / dist;
      const ty = rx / dist;
      out[11] = clamp1(Math.abs((held.vx - d.vx) * tx + (held.vy - d.vy) * ty) / TETHER.maxSpinSpeed);
      const sp = Math.hypot(held.vx, held.vy);
      if (sp > 1) out[12] = laser(s, held.id, held.x, held.y, held.vx / sp, held.vy / sp, held.r);
    }
  }

  // danger radar: 8 sectors around the drone (N, NE, E, ... clockwise), closeness of the nearest hazard
  const radar = (ox: number, oy: number, or: number) => {
    const dx = ox - d.x;
    const dy = oy - d.y;
    const gap = Math.hypot(dx, dy) - or - d.r;
    const v = 1 - gap / 250;
    if (v <= 0) return;
    // angle measured clockwise from north
    let a = Math.atan2(dx, -dy);
    if (a < 0) a += Math.PI * 2;
    const sector = Math.round(a / (Math.PI / 4)) % 8;
    const k = 13 + sector;
    const val = v > 1 ? 1 : v;
    if (val > out[k]) out[k] = val;
  };
  for (const sh of s.shards) {
    if (sh.tier === 0 || sh.safe > 0) continue;
    if (t.state === 'attached' && sh.id === t.targetId) continue;
    radar(sh.x, sh.y, sh.r);
  }
  let ne = null as null | { x: number; y: number };
  let ned = Infinity;
  for (const e of s.enemies) {
    if (e.spawn > 0) continue;
    radar(e.x, e.y, e.r);
    const dd = (e.x - d.x) ** 2 + (e.y - d.y) ** 2;
    if (dd < ned) {
      ned = dd;
      ne = e;
    }
  }
  if (ne) {
    out[21] = clamp1((ne.x - d.x) / 800);
    out[22] = clamp1((ne.y - d.y) / 800);
    out[23] = 1;
  }
  return out;
}

export interface Activations {
  input: Float64Array;
  hidden: Float64Array;
  output: Float64Array;
}

export function makeActivations(): Activations {
  return { input: new Float64Array(N_IN), hidden: new Float64Array(N_HID), output: new Float64Array(N_OUT) };
}

/** Forward pass. Weight layout: W1 (N_HID x N_IN), b1, W2 (N_OUT x N_HID), b2. */
export function forward(w: ArrayLike<number>, act: Activations): void {
  const { input, hidden, output } = act;
  let o = 0;
  const b1 = N_IN * N_HID;
  for (let h = 0; h < N_HID; h++) {
    let sum = w[b1 + h];
    for (let i = 0; i < N_IN; i++) sum += w[o + i] * input[i];
    o += N_IN;
    hidden[h] = Math.tanh(sum);
  }
  o = b1 + N_HID;
  const b2 = o + N_OUT * N_HID;
  for (let k = 0; k < N_OUT; k++) {
    let sum = w[b2 + k];
    for (let h = 0; h < N_HID; h++) sum += w[o + h] * hidden[h];
    o += N_HID;
    output[k] = sum;
  }
}

/** Action index 0..17: move * 2 + (hook ? 1 : 0) */
export function decide(s: GameState, w: ArrayLike<number>, act: Activations): number {
  observe(s, act.input);
  forward(w, act);
  let best = 0;
  for (let k = 1; k < N_MOVE; k++) if (act.output[k] > act.output[best]) best = k;
  return best * 2 + (act.output[N_MOVE] > 0 ? 1 : 0);
}

export function actionToInput(a: number): SimInput {
  const m = MOVES[a >> 1];
  return { moveX: m[0], moveY: m[1], hook: (a & 1) === 1, aimX: null, aimY: null };
}

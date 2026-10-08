export type Tier = 0 | 1 | 2 | 3;

/** Per-step input. Plain data so it can be logged, replayed or produced by an agent. */
export interface SimInput {
  /** desired movement, each axis -1..1 (vector is clamped to length 1) */
  moveX: number;
  moveY: number;
  /** hook button held */
  hook: boolean;
  /** optional aim point in arena coordinates (mouse); null = auto-target nearest shard */
  aimX: number | null;
  aimY: number | null;
}

export const NO_INPUT: SimInput = { moveX: 0, moveY: 0, hook: false, aimX: null, aimY: null };

export interface Shard {
  id: number;
  tier: Tier;
  x: number;
  y: number;
  /** position before the last step (render interpolation only) */
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  mass: number;
  angle: number;
  spin: number;
  /** polygon radius multipliers, evenly spaced around the circle */
  verts: number[];
  /** >0: armed after a fling (can break other shards) */
  armed: number;
  /** >0: cannot hurt the drone */
  safe: number;
  /** remaining life for dust (tier 0), Infinity otherwise */
  life: number;
}

export interface Drone {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  invuln: number;
}

export type TetherState = 'idle' | 'firing' | 'attached' | 'retracting';

export interface Tether {
  state: TetherState;
  hx: number;
  hy: number;
  targetId: number;
  length: number;
  dir: 1 | -1;
}

export type SimEvent =
  | { type: 'fire'; x: number; y: number }
  | { type: 'attach'; x: number; y: number }
  | { type: 'fling'; x: number; y: number; speed: number }
  | { type: 'break'; x: number; y: number; r: number; tier: Tier; combo: number; points: number }
  | { type: 'fade'; x: number; y: number }
  | { type: 'bounce'; x: number; y: number; speed: number }
  | { type: 'clack'; x: number; y: number; speed: number }
  | { type: 'hurt'; x: number; y: number; lives: number }
  | { type: 'wave'; wave: number; bonus: number }
  | { type: 'gameover'; score: number };

export type Mode = 'attract' | 'play';
export type Phase = 'playing' | 'gameover';

export interface GameState {
  seed: number;
  rng: number;
  mode: Mode;
  phase: Phase;
  tick: number;
  time: number;
  wave: number;
  /** >0: next wave spawns when this reaches 0 */
  waveTimer: number;
  /** seconds since the current wave spawned */
  waveAge: number;
  score: number;
  lives: number;
  combo: number;
  comboTimer: number;
  maxCombo: number;
  breaks: number;
  drone: Drone;
  tether: Tether;
  shards: Shard[];
  nextId: number;
  prevHook: boolean;
  /** events produced by the most recent step (cleared at the start of every step) */
  events: SimEvent[];
}

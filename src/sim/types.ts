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
  | { type: 'wave'; wave: number; bonus: number; boss: boolean }
  | { type: 'clear'; wave: number; bonus: number }
  | { type: 'perk'; perk: PerkId; level: number }
  | { type: 'blast'; x: number; y: number; r: number }
  | { type: 'enemySpawn'; kind: EnemyKind; x: number; y: number }
  | { type: 'enemyKill'; kind: EnemyKind; x: number; y: number; r: number; combo: number; points: number }
  | { type: 'charge'; kind: EnemyKind; attack: EnemyAttack; x: number; y: number }
  | { type: 'enemyFire'; kind: EnemyKind; attack: EnemyAttack; x: number; y: number }
  | { type: 'bossHit'; x: number; y: number; hp: number; maxHp: number; points: number }
  | { type: 'gameover'; score: number };

export type PerkId = 'rope' | 'spin' | 'life' | 'blast' | 'magnet' | 'focus';
export const PERK_IDS: readonly PerkId[] = ['rope', 'spin', 'life', 'blast', 'magnet', 'focus'];

export type EnemyKind = 'hunter' | 'prism' | 'boss';
export type EnemyAttack = 'none' | 'shot' | 'volley' | 'nova';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  r: number;
  mass: number;
  hp: number;
  maxHp: number;
  angle: number;
  spin: number;
  /** >0: warping in (harmless, frozen) */
  spawn: number;
  /** seconds until the next attack (prism, boss) */
  cooldown: number;
  /** >0: telegraphing `attack`; fires when it reaches 0 */
  charge: number;
  chargeMax: number;
  attack: EnemyAttack;
  /** aim angle chosen when the telegraph started (the shot follows exactly this line) */
  aim: number;
  /** >0: hit flash / short invulnerability (boss) */
  flash: number;
  /** >0: hunter backs off after touching the drone */
  stun: number;
}

/** 'tutorial': harmless practice arena (no damage, no points, no waves). */
export type Mode = 'attract' | 'play' | 'tutorial';
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
  enemies: Enemy[];
  nextId: number;
  /** perk stacks picked so far */
  perks: Record<PerkId, number>;
  /** pending choice after a cleared wave (play mode); null = none. See perkOfferReady()/choosePerk(). */
  perkOffer: PerkId[] | null;
  /** counts down while enemies are alive and ammo is scarce */
  supplyTimer: number;
  /** number of bosses met so far (later bosses are tougher) */
  bosses: number;
  prevHook: boolean;
  /** events produced by the most recent step (cleared at the start of every step) */
  events: SimEvent[];
}

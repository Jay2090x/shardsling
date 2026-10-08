/** Logical arena size. Everything in the simulation lives in this coordinate space. */
export const ARENA_W = 1600;
export const ARENA_H = 900;

/** Fixed simulation rate. The renderer may run at any refresh rate. */
export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;

export const DRONE = {
  radius: 18,
  mass: 2,
  accel: 2600,
  drag: 3.2, // 1/s, exponential velocity decay
  maxSpeed: 560,
  restitution: 0.55,
  startInvuln: 1.5,
  hitInvuln: 2.0,
  lives: 3,
} as const;

export const TETHER = {
  range: 400, // max distance to acquire a shard
  headSpeed: 2400,
  retractSpeed: 3000,
  minLength: 50,
  reelSpeed: 420, // px/s, rope shortens towards the orbit radius
  orbitGap: 58, // orbit radius = drone.r + shard.r + gap
  spinForce: 3400, // tangential force (mass units * px/s^2)
  maxSpinSpeed: 1150, // relative orbit speed for a small shard (scaled by size)
} as const;

export const SHARD = {
  /** radius per tier: 0 = dust, 1 = small, 2 = medium, 3 = large */
  radius: [11, 20, 32, 50],
  score: [10, 20, 40, 80],
  restitution: 0.88,
  wallRestitution: 0.92,
  hotSpeed: 300, // a shard moving faster than this (after a fling or while swung) is "hot"
  breakSpeed: 240, // min. normal impact speed for a hot shard to break another one
  selfBreakSpeed: 520, // projectile also shatters if it hits an equal/bigger shard this hard
  armTime: 1.6, // seconds a flung shard stays armed
  fragmentArmTime: 0.4, // fragments of a hit stay hot briefly -> chain reactions
  releaseSafeTime: 0.6, // a freshly flung shard cannot hurt the drone
  driftDrag: 0.45, // extra drag above drift speed (1/s)
  maxDrift: 150,
  dustLife: 10,
} as const;

export const COMBO_WINDOW = 1.5;
export const MAX_COMBO_MULT = 10;
export const WAVE_DELAY = 1.4;
export const WAVE_MAX_AGE = 55;

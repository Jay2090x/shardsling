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

/** Perks: after every cleared wave (play mode) the player picks 1 of 3. Stacks are capped per perk. */
export const PERKS = {
  /** seconds after a clear before the choice is offered (lets the last smash play out) */
  offerDelay: 0.6,
  choices: 3,
  rope: { max: 3, rangePerStack: 0.15 }, // hook range +15% per stack
  spin: { max: 3, forcePerStack: 0.22, speedPerStack: 0.1 }, // faster spin-up, higher top speed
  life: { maxLives: 5 }, // +1 life, offered while below the cap
  blast: { max: 3, radiusPerStack: 55 }, // smashes also shatter small crystals / hunters in this radius
  magnet: { max: 2, turnRate: 2.2, cone: 0.8, range: 650 }, // flung crystals curve toward targets (rad/s per stack)
  focus: { max: 2, slowPerStack: 0.2 }, // world runs slower while a crystal is on the rope
} as const;

/** Enemies (from later waves) and the boss. All are smashed by flinging crystals into them. */
export const ENEMY = {
  spawnTime: 1.0, // warp-in: harmless and frozen while the spawn ring closes
  /** while enemies are alive and the field runs out of ammo, a medium crystal drifts in every few seconds */
  supplyEvery: 2.5,
  supplyBelow: 3,
  hunter: {
    fromWave: 3,
    radius: 20,
    mass: 1.2,
    accel: 160,
    speed: 75, // slow on purpose: the drone tops out at 560
    speedPerWave: 3,
    maxSpeed: 115,
    stunAfterHit: 1.4, // backs off after touching the drone
    score: 150,
  },
  prism: {
    fromWave: 5,
    radius: 30,
    mass: 2.6,
    drift: 55,
    fireFirst: 3.0,
    fireEvery: 5.0,
    charge: 1.0, // telegraph (aim line) before every shot
    shotSpeed: 320,
    splinters: 5, // smashed: bursts into armed crystals (chain reactions), harmless to the drone at first
    splinterSpeed: 430,
    splinterSafe: 0.9,
    score: 200,
  },
  boss: {
    everyWaves: 10,
    radius: 86,
    mass: 40,
    hp: 14,
    hpPerBoss: 6,
    speed: 38,
    firstAttack: 3.0,
    attackEvery: 3.4,
    enragedEvery: 2.5, // below half hp
    chargeVolley: 1.1,
    chargeNova: 1.3,
    volleyCount: 3,
    volleySpread: 0.32,
    volleySpeed: 330,
    novaCount: 8,
    novaSpeed: 250,
    hitInvuln: 0.15,
    hitScore: 60,
    killScore: 2500,
    maxShards: 16, // no new attack while the field is this full
    ammo: 4, // medium crystals that come with the boss
  },
} as const;

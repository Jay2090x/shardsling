import { describe, expect, it } from 'vitest';
import { ENEMY, SHARD, SIM_DT } from '../src/sim/constants';
import {
  choosePerk,
  createGame,
  createTutorial,
  hunterCount,
  isBossWave,
  makeEnemy,
  makeShard,
  perkOfferReady,
  prismCount,
  spawnWave,
  step,
} from '../src/sim/sim';
import { heuristicInput } from '../src/sim/bot';
import { NO_INPUT, type GameState } from '../src/sim/types';

/** Empty arena, drone parked in the middle and (by default) invulnerable. */
function arena(seed = 1, invuln = 999): GameState {
  const s = createGame(seed);
  s.shards = [];
  s.enemies = [];
  s.drone.invuln = invuln;
  return s;
}

function ready<T extends { spawn: number }>(e: T): T {
  e.spawn = 0;
  return e;
}

function flung(s: GameState, tier: 0 | 1 | 2 | 3, x: number, y: number, vx: number, vy = 0) {
  const sh = makeShard(s, tier, x, y, vx, vy);
  sh.armed = SHARD.armTime;
  sh.safe = 1;
  return sh;
}

const run = (s: GameState, seconds: number) => {
  const events: GameState['events'] = [];
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    step(s, NO_INPUT, SIM_DT);
    events.push(...s.events);
  }
  return events;
};

describe('enemy waves', () => {
  it('hunters from wave 3, prisms from wave 5, a boss alone in wave 10 (and 20)', () => {
    expect([1, 2, 3, 4, 5, 7, 9].map(hunterCount)).toEqual([0, 0, 1, 1, 2, 3, 4]);
    expect([4, 5, 7, 8, 11].map(prismCount)).toEqual([0, 1, 1, 2, 3]);
    expect(isBossWave(10)).toBe(true);
    expect(isBossWave(20)).toBe(true);
    expect(isBossWave(9)).toBe(false);
    expect(hunterCount(10) + prismCount(10)).toBe(0);
    const s = arena(2);
    spawnWave(s, 10);
    expect(s.enemies.map((e) => e.kind)).toEqual(['boss']);
    expect(s.shards.length).toBe(ENEMY.boss.ammo); // something to throw at it
    expect(s.events.some((e) => e.type === 'wave' && e.boss)).toBe(true);
    const t = arena(3);
    spawnWave(t, 5);
    expect(t.enemies.filter((e) => e.kind === 'hunter').length).toBe(2);
    expect(t.enemies.filter((e) => e.kind === 'prism').length).toBe(1);
  });

  it('the tutorial arena has no enemies', () => {
    const s = createTutorial(1);
    run(s, 10);
    expect(s.enemies.length).toBe(0);
  });

  it('a wave with enemies left does not clear, and a supply crystal drifts in when ammo runs out', () => {
    const s = arena(4);
    s.enemies.push(ready(makeEnemy(s, 'hunter', 200, 200)));
    s.drone.x = 1400;
    const ev = run(s, ENEMY.supplyEvery + 0.5);
    expect(ev.some((e) => e.type === 'clear')).toBe(false);
    expect(s.shards.filter((x) => x.tier === 2).length).toBeGreaterThanOrEqual(1);
  });

  it('same seed -> identical run with enemies (determinism)', () => {
    const play = () => {
      const s = createGame(77);
      spawnWave(s, 6);
      for (let i = 0; i < 120 * 20; i++) step(s, heuristicInput(s), SIM_DT);
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });
});

describe('hunter', () => {
  it('warps in harmlessly, then drifts slowly toward the drone', () => {
    const s = arena(5, 0);
    const h = makeEnemy(s, 'hunter', s.drone.x + 25, s.drone.y); // spawns overlapping the drone
    s.enemies.push(h);
    const ev = run(s, ENEMY.spawnTime * 0.8);
    expect(ev.some((e) => e.type === 'hurt')).toBe(false);
    // far away: it closes in, but slower than the drone can fly
    const t = arena(6);
    const far = ready(makeEnemy(t, 'hunter', 200, 450));
    t.enemies.push(far);
    const d0 = Math.hypot(far.x - t.drone.x, far.y - t.drone.y);
    run(t, 2);
    const e = t.enemies[0];
    expect(Math.hypot(e.x - t.drone.x, e.y - t.drone.y)).toBeLessThan(d0 - 60);
    expect(Math.hypot(e.vx, e.vy)).toBeLessThanOrEqual(ENEMY.hunter.maxSpeed + 1e-6);
  });

  it('touching it costs a life, then it backs off', () => {
    const s = arena(7, 0);
    const h = ready(makeEnemy(s, 'hunter', s.drone.x + 50, s.drone.y));
    h.vx = -100;
    s.enemies.push(h);
    const ev = run(s, 0.3);
    expect(ev.filter((e) => e.type === 'hurt').length).toBe(1);
    expect(s.lives).toBe(2);
    expect(s.enemies[0].stun).toBeGreaterThan(0);
    const d0 = Math.hypot(s.enemies[0].x - s.drone.x, s.enemies[0].y - s.drone.y);
    run(s, 0.8);
    expect(Math.hypot(s.enemies[0].x - s.drone.x, s.enemies[0].y - s.drone.y)).toBeGreaterThan(d0);
  });

  it('a flung crystal smashes it (points + combo); a slow crystal only bumps it', () => {
    const s = arena(8);
    s.drone.y = 800;
    s.enemies.push(ready(makeEnemy(s, 'hunter', 800, 300)));
    s.shards = [flung(s, 1, 650, 300, 700)];
    const ev = run(s, 0.4);
    const kill = ev.find((e) => e.type === 'enemyKill');
    expect(kill).toBeDefined();
    expect(s.enemies.length).toBe(0);
    expect(s.score).toBeGreaterThanOrEqual(ENEMY.hunter.score);

    const t = arena(9);
    t.drone.y = 800;
    t.enemies.push(ready(makeEnemy(t, 'hunter', 800, 300)));
    t.shards = [makeShard(t, 1, 700, 300, 120, 0)];
    run(t, 1);
    expect(t.enemies.length).toBe(1);
  });
});

describe('prism', () => {
  it('telegraphs every shot (aim line) and fires exactly along it', () => {
    const s = arena(10);
    const p = ready(makeEnemy(s, 'prism', 300, 200));
    p.cooldown = 0.1;
    s.enemies.push(p);
    let chargeTick = -1;
    let fireTick = -1;
    let aim = 0;
    for (let i = 0; i < 120 * 3 && fireTick < 0; i++) {
      step(s, NO_INPUT, SIM_DT);
      if (s.events.some((e) => e.type === 'charge')) {
        chargeTick = s.tick;
        aim = s.enemies[0].aim;
      }
      if (s.events.some((e) => e.type === 'enemyFire')) fireTick = s.tick;
    }
    expect(chargeTick).toBeGreaterThan(0);
    expect((fireTick - chargeTick) * SIM_DT).toBeCloseTo(ENEMY.prism.charge, 1);
    // aimed at where the drone was when the telegraph started
    expect(aim).toBeCloseTo(Math.atan2(s.drone.y - 200, s.drone.x - 300), 1);
    const shot = s.shards[s.shards.length - 1];
    expect(shot.tier).toBe(1);
    expect(Math.atan2(shot.vy, shot.vx)).toBeCloseTo(aim, 5);
  });

  it('smashed, it bursts into armed crystals that cannot hurt the drone at first', () => {
    const s = arena(11);
    s.drone.y = 800;
    s.enemies.push(ready(makeEnemy(s, 'prism', 800, 300)));
    s.shards = [flung(s, 1, 650, 300, 700)];
    let burst: ReturnType<typeof makeShard>[] = [];
    for (let i = 0; i < 60 && burst.length === 0; i++) {
      const before = s.nextId;
      step(s, NO_INPUT, SIM_DT);
      if (s.events.some((e) => e.type === 'enemyKill' && e.kind === 'prism')) burst = s.shards.filter((x) => x.id >= before);
    }
    expect(burst.length).toBe(ENEMY.prism.splinters);
    expect(burst.every((x) => x.armed > 0 && x.safe > 0 && x.tier === 1)).toBe(true);
  });
});

describe('boss', () => {
  it('telegraphs, then alternates an aimed volley and a radial nova', () => {
    const s = arena(12);
    const b = ready(makeEnemy(s, 'boss', 400, 450));
    b.cooldown = 0.1;
    s.enemies.push(b);
    const ev = run(s, 6);
    const charges = ev.filter((e) => e.type === 'charge');
    const fires = ev.filter((e) => e.type === 'enemyFire');
    expect(charges.length).toBeGreaterThanOrEqual(2);
    expect(fires.map((e) => (e as { attack: string }).attack).slice(0, 2)).toEqual(['volley', 'nova']);
    expect(s.shards.length).toBe(ENEMY.boss.volleyCount + ENEMY.boss.novaCount);
  });

  it('needs many hits: each flung crystal chips it and shatters on the armour', () => {
    const s = arena(13);
    s.drone.x = 200;
    s.drone.y = 800;
    const b = ready(makeEnemy(s, 'boss', 900, 400));
    b.cooldown = 999;
    s.enemies.push(b);
    expect(b.hp).toBe(ENEMY.boss.hp);
    const proj = flung(s, 2, 700, 400, 700);
    s.shards = [proj];
    const ev = run(s, 0.5);
    const hits = ev.filter((e) => e.type === 'bossHit');
    expect(hits.length).toBe(1); // short invulnerability: one crystal = one hit
    expect(s.enemies[0].hp).toBe(ENEMY.boss.hp - 2); // medium crystal = 2 damage
    expect(s.shards.some((x) => x.id === proj.id)).toBe(false);
    expect(s.shards.filter((x) => x.tier === 1).length).toBeGreaterThanOrEqual(2); // its fragments are ammo
  });

  it('goes down at 0 hp, takes the field with it, and the wave clears with a perk offer', () => {
    const s = arena(14);
    s.drone.x = 200;
    s.drone.y = 800;
    spawnWave(s, 10);
    s.shards = [];
    const b = ready(s.enemies[0]);
    b.x = 900;
    b.y = 400;
    b.cooldown = 999;
    b.hp = 1;
    s.shards = [flung(s, 1, 700, 400, 700), makeShard(s, 3, 1400, 150, 0, 0)];
    const ev = run(s, 1.2);
    expect(ev.some((e) => e.type === 'enemyKill' && e.kind === 'boss')).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(ENEMY.boss.killScore);
    expect(s.enemies.length).toBe(0);
    expect(ev.some((e) => e.type === 'clear')).toBe(true);
    expect(perkOfferReady(s)).toBe(true);
    expect(choosePerk(s, 0)).toBe(true);
    run(s, 1);
    expect(s.wave).toBe(11);
  });

  it('a boss wave never times out', () => {
    const s = arena(15);
    s.drone.x = 100;
    s.drone.y = 100;
    spawnWave(s, 10);
    s.enemies[0].cooldown = 9999;
    s.waveAge = 1000;
    run(s, 2);
    expect(s.wave).toBe(10);
  });
});

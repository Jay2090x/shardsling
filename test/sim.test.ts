import { describe, expect, it } from 'vitest';
import { ARENA_H, ARENA_W, SIM_DT, SHARD } from '../src/sim/constants';
import { createGame, step, stepPure, makeShard } from '../src/sim/sim';
import { heuristicInput } from '../src/sim/bot';
import { runEpisode } from '../src/sim/headless';
import { NO_INPUT, type SimInput } from '../src/sim/types';

const hold = (extra: Partial<SimInput> = {}): SimInput => ({ ...NO_INPUT, hook: true, ...extra });

describe('simulation core (headless)', () => {
  it('runs without a DOM', () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    const s = createGame(1);
    for (let i = 0; i < 600; i++) step(s, NO_INPUT, SIM_DT);
    expect(s.tick).toBe(600);
  });

  it('is deterministic for the same seed and differs for other seeds', () => {
    const a = runEpisode(7, heuristicInput, 60);
    const b = runEpisode(7, heuristicInput, 60);
    const c = runEpisode(8, heuristicInput, 60);
    expect(a).toEqual(b);
    expect(JSON.stringify(createGame(7).shards)).not.toBe(JSON.stringify(createGame(8).shards));
    expect(c.seed).toBe(8);
  });

  it('stepPure does not mutate its input', () => {
    const s = createGame(3);
    const before = JSON.stringify(s);
    const next = stepPure(s, hold({ moveX: 1 }), SIM_DT);
    expect(JSON.stringify(s)).toBe(before);
    expect(next.tick).toBe(s.tick + 1);
  });

  it('keeps everything inside the walls (no wrap-around)', () => {
    const s = createGame(11);
    for (let i = 0; i < 120 * 30; i++) {
      step(s, { ...NO_INPUT, moveX: 1, moveY: -1 }, SIM_DT);
      for (const sh of s.shards) {
        expect(sh.x).toBeGreaterThanOrEqual(sh.r - 1e-6);
        expect(sh.x).toBeLessThanOrEqual(ARENA_W - sh.r + 1e-6);
        expect(sh.y).toBeGreaterThanOrEqual(sh.r - 1e-6);
        expect(sh.y).toBeLessThanOrEqual(ARENA_H - sh.r + 1e-6);
      }
    }
    expect(s.drone.x).toBeCloseTo(ARENA_W - s.drone.r, 0);
  });

  it('hook -> attach -> spin up -> fling -> breaks another shard into fragments', () => {
    const s = createGame(5);
    s.drone.invuln = 999;
    s.shards = [
      makeShard(s, 1, 900, 450, 0, 0), // ammo right of the drone
      makeShard(s, 3, 800, 150, 0, 0), // big target above
    ];
    const target = s.shards[1];
    let attached = false;
    let released = false;
    let broke = false;
    for (let i = 0; i < 120 * 6 && !broke; i++) {
      let hook = true;
      if (s.tether.state === 'attached') {
        attached = true;
        const held = s.shards.find((x) => x.id === s.tether.targetId)!;
        const sp = Math.hypot(held.vx, held.vy);
        // release when flying towards the target fast enough
        const tx = target.x - held.x;
        const ty = target.y - held.y;
        const tl = Math.hypot(tx, ty);
        const cos = (held.vx * tx + held.vy * ty) / (sp * tl);
        if (sp > 600 && cos > 0.985) hook = false;
      }
      if (released) hook = false;
      step(s, { ...NO_INPUT, hook }, SIM_DT);
      if (s.events.some((e) => e.type === 'fling')) released = true;
      if (s.events.some((e) => e.type === 'break' && e.tier === 3)) broke = true;
    }
    expect(attached).toBe(true);
    expect(released).toBe(true);
    expect(broke).toBe(true);
    // the big shard became 2-3 medium fragments, which are new ammo
    expect(s.shards.filter((x) => x.tier === 2).length).toBeGreaterThanOrEqual(2);
    expect(s.score).toBeGreaterThan(0);
  });

  it('heavy shards spin up slower than light ones', () => {
    const speedAfter = (tier: 1 | 3) => {
      const s = createGame(9);
      s.drone.invuln = 999;
      s.shards = [makeShard(s, tier, 950, 450, 0, 0)];
      for (let i = 0; i < 60; i++) step(s, hold(), SIM_DT);
      const sh = s.shards[0];
      return Math.hypot(sh.vx - s.drone.vx, sh.vy - s.drone.vy);
    };
    expect(speedAfter(1)).toBeGreaterThan(speedAfter(3) * 1.3);
  });

  it('touching a drifting shard costs a life, three hits end the run', () => {
    const s = createGame(2);
    s.drone.invuln = 0;
    let hurts = 0;
    for (let i = 0; i < 120 * 30 && s.phase === 'playing'; i++) {
      s.shards = [makeShard(s, 3, s.drone.x + 40, s.drone.y, -50, 0)];
      step(s, NO_INPUT, SIM_DT);
      hurts += s.events.filter((e) => e.type === 'hurt').length;
    }
    expect(hurts).toBe(3);
    expect(s.phase).toBe('gameover');
  });

  it('dust fades out and the next wave arrives when the field is clear', () => {
    const s = createGame(4);
    s.shards = [makeShard(s, 0, 300, 300, 0, 0)];
    let wave = false;
    for (let i = 0; i < 120 * 3; i++) {
      step(s, NO_INPUT, SIM_DT);
      if (s.events.some((e) => e.type === 'wave')) wave = true;
    }
    expect(wave).toBe(true);
    expect(s.wave).toBe(2);
    expect(s.shards.some((x) => x.tier >= 2)).toBe(true);
    expect(SHARD.dustLife).toBeGreaterThan(0);
  });

  it('a simple scripted (non-learning) policy can score — the core loop is playable', () => {
    const runs = [1, 2, 3, 4, 5, 6].map((seed) => runEpisode(seed, heuristicInput, 120));
    const breaks = runs.reduce((a, r) => a + r.breaks, 0);
    expect(breaks / runs.length).toBeGreaterThan(4);
    expect(runs.every((r) => r.score > 0)).toBe(true);
  });
});

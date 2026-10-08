import { describe, expect, it } from 'vitest';
import { SIM_DT, TETHER } from '../src/sim/constants';
import { createGame, createTutorial, makeShard, pickTarget, step, TUTORIAL_LAYOUT } from '../src/sim/sim';
import { NO_INPUT } from '../src/sim/types';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('tutorial practice arena', () => {
  it('has one ammo shard in hook range of the move target and a big target out of range', () => {
    const s = createTutorial(42);
    expect(s.mode).toBe('tutorial');
    expect(s.shards.length).toBe(2);
    const [ammo, target] = s.shards;
    expect(ammo.tier).toBe(1);
    expect(target.tier).toBe(3);
    const L = TUTORIAL_LAYOUT;
    expect(dist(L.moveTarget, ammo)).toBeLessThan(TETHER.range * 0.6);
    expect(dist(L.moveTarget, target)).toBeGreaterThan(TETHER.range);
    // from the move target, the hook picks the ammo shard (nearest)
    s.drone.x = L.moveTarget.x;
    s.drone.y = L.moveTarget.y;
    expect(pickTarget(s, NO_INPUT)?.id).toBe(ammo.id);
  });

  it('is harmless, scores nothing and never spawns waves', () => {
    const s = createTutorial(1);
    let hurts = 0;
    for (let i = 0; i < 120 * 70; i++) {
      if (i % 120 === 0) s.shards.push(makeShard(s, 3, s.drone.x + 40, s.drone.y, -60, 0));
      step(s, NO_INPUT, SIM_DT);
      hurts += s.events.filter((e) => e.type === 'hurt' || e.type === 'wave').length;
    }
    expect(hurts).toBe(0);
    expect(s.lives).toBe(3);
    expect(s.wave).toBe(1);
    expect(s.score).toBe(0);
    // an empty arena stays empty (no next wave)
    const e = createTutorial(2);
    e.shards = [];
    for (let i = 0; i < 120 * 60; i++) step(e, NO_INPUT, SIM_DT);
    expect(e.shards.length).toBe(0);
  });

  it('move -> hook -> fling at the target breaks it (the tutorial is completable)', () => {
    const s = createTutorial(7);
    const L = TUTORIAL_LAYOUT;
    // fly to the ring
    let reached = false;
    for (let i = 0; i < 120 * 4 && !reached; i++) {
      const dx = L.moveTarget.x - s.drone.x;
      const dy = L.moveTarget.y - s.drone.y;
      const l = Math.hypot(dx, dy);
      step(s, { ...NO_INPUT, moveX: dx / l, moveY: dy / l }, SIM_DT);
      reached = dist(s.drone, L.moveTarget) < L.moveRadius;
    }
    expect(reached).toBe(true);
    const target = s.shards.find((x) => x.tier === 3)!;
    let broke = false;
    let released = false;
    for (let i = 0; i < 120 * 6 && !broke; i++) {
      let hook = !released;
      if (s.tether.state === 'attached') {
        const held = s.shards.find((x) => x.id === s.tether.targetId)!;
        const sp = Math.hypot(held.vx, held.vy);
        const tx = target.x - held.x;
        const ty = target.y - held.y;
        const cos = (held.vx * tx + held.vy * ty) / (sp * Math.hypot(tx, ty));
        if (sp > 600 && cos > 0.985) hook = false;
      }
      step(s, { ...NO_INPUT, hook }, SIM_DT);
      if (s.events.some((e) => e.type === 'fling')) released = true;
      if (s.events.some((e) => e.type === 'break' && e.tier === 3)) broke = true;
    }
    expect(broke).toBe(true);
  });

  it('normal play still advances waves (tutorial flag does not leak)', () => {
    const s = createGame(4);
    s.shards = [];
    for (let i = 0; i < 120 * 3; i++) step(s, NO_INPUT, SIM_DT);
    expect(s.wave).toBe(2);
  });
});

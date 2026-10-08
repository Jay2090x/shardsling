import { describe, expect, it } from 'vitest';
import { ARENA_H, ARENA_W, PERKS, SHARD, SIM_DT, TETHER, WAVE_DELAY } from '../src/sim/constants';
import { applyPerk, rollPerkOffer, perkAvailable } from '../src/sim/perks';
import {
  choosePerk,
  createGame,
  hookRange,
  makeShard,
  perkOfferReady,
  pickTarget,
  step,
  worldTimeScale,
} from '../src/sim/sim';
import { NO_INPUT, PERK_IDS, type GameState, type SimInput } from '../src/sim/types';

const hold = (extra: Partial<SimInput> = {}): SimInput => ({ ...NO_INPUT, hook: true, ...extra });

/** A game whose field is empty except for one dust grain -> the wave clears on the next step. */
function clearedGame(seed = 1, mode: 'play' | 'attract' = 'play'): GameState {
  const s = createGame(seed, mode);
  s.drone.invuln = 999;
  s.shards = [makeShard(s, 0, 200, 200, 0, 0)];
  return s;
}

/** An armed (flung) crystal heading right at `speed`. */
function flung(s: GameState, tier: 0 | 1 | 2 | 3, x: number, y: number, vx: number, vy = 0) {
  const sh = makeShard(s, tier, x, y, vx, vy);
  sh.armed = SHARD.armTime;
  sh.safe = 1;
  return sh;
}

describe('perk offer after a cleared wave', () => {
  it('offers 3 different perks shortly after the clear; picking one applies it and the next wave follows', () => {
    const s = clearedGame(3);
    step(s, NO_INPUT, SIM_DT);
    expect(s.events.some((e) => e.type === 'clear')).toBe(true);
    expect(s.perkOffer).not.toBeNull();
    const offer = s.perkOffer!;
    expect(offer.length).toBe(PERKS.choices);
    expect(new Set(offer).size).toBe(offer.length);
    // not shown immediately: the last smash plays out first
    expect(perkOfferReady(s)).toBe(false);
    let steps = 0;
    while (!perkOfferReady(s) && steps < 1000) {
      step(s, NO_INPUT, SIM_DT);
      steps++;
    }
    expect(steps * SIM_DT).toBeCloseTo(PERKS.offerDelay, 1);
    expect(s.wave).toBe(1); // the next wave waits behind the offer
    const picked = offer[1];
    const before = s.perks[picked];
    expect(choosePerk(s, 1)).toBe(true);
    expect(s.perks[picked]).toBe(before + 1);
    expect(s.perkOffer).toBeNull();
    expect(s.events.some((e) => e.type === 'perk' && e.perk === picked)).toBe(true);
    expect(choosePerk(s, 0)).toBe(false); // nothing left to pick
    for (let i = 0; i < 120 * WAVE_DELAY; i++) step(s, NO_INPUT, SIM_DT);
    expect(s.wave).toBe(2);
  });

  it('an unanswered offer lapses when the next wave arrives (headless runs never block)', () => {
    const s = clearedGame(4);
    for (let i = 0; i < 120 * 2; i++) step(s, NO_INPUT, SIM_DT);
    expect(s.wave).toBe(2);
    expect(s.perkOffer).toBeNull();
    expect(Object.values(s.perks).every((v) => v === 0)).toBe(true);
  });

  it('the menu demo (attract mode) never offers perks', () => {
    const s = clearedGame(5, 'attract');
    step(s, NO_INPUT, SIM_DT);
    expect(s.events.some((e) => e.type === 'clear')).toBe(true);
    expect(s.perkOffer).toBeNull();
  });

  it('maxed perks are never offered; Extra Life only below the cap', () => {
    const s = createGame(6);
    for (const id of PERK_IDS) if (id !== 'life') for (let i = 0; i < PERKS[id].max; i++) applyPerk(s, id);
    s.lives = PERKS.life.maxLives;
    expect(PERK_IDS.every((id) => !perkAvailable(s, id))).toBe(true);
    expect(rollPerkOffer(s)).toBeNull();
    s.lives = 2;
    expect(rollPerkOffer(s)).toEqual(['life']);
    for (let seed = 1; seed < 40; seed++) {
      const g = createGame(seed);
      g.perks.rope = PERKS.rope.max;
      expect(rollPerkOffer(g)).not.toContain('rope');
    }
  });
});

describe('perk effects', () => {
  it('Long Rope: a crystal just out of reach becomes hookable', () => {
    const s = createGame(7);
    s.shards = [makeShard(s, 1, s.drone.x + TETHER.range + 40, s.drone.y, 0, 0)];
    expect(pickTarget(s, NO_INPUT)).toBeUndefined();
    applyPerk(s, 'rope');
    expect(hookRange(s)).toBeCloseTo(TETHER.range * (1 + PERKS.rope.rangePerStack));
    expect(pickTarget(s, NO_INPUT)?.id).toBe(s.shards[0].id);
  });

  it('Fast Swing: a crystal on the rope spins up faster and reaches a higher top speed', () => {
    const swing = (stacks: number, steps: number) => {
      const s = createGame(8);
      s.drone.invuln = 999;
      s.perks.spin = stacks;
      s.shards = [makeShard(s, 1, 950, 450, 0, 0)];
      for (let i = 0; i < steps; i++) step(s, hold(), SIM_DT);
      const sh = s.shards[0];
      return Math.hypot(sh.vx - s.drone.vx, sh.vy - s.drone.vy);
    };
    expect(swing(1, 40)).toBeGreaterThan(swing(0, 40) * 1.08);
    expect(swing(2, 400)).toBeGreaterThan(swing(0, 400) * 1.12);
  });

  it('Extra Life: +1 life, capped', () => {
    const s = createGame(9);
    applyPerk(s, 'life');
    expect(s.lives).toBe(4);
    applyPerk(s, 'life');
    applyPerk(s, 'life');
    expect(s.lives).toBe(PERKS.life.maxLives);
  });

  it('Shockwave: a smash also shatters small crystals nearby (only with the perk)', () => {
    const run = (stacks: number) => {
      const s = createGame(10);
      s.drone.invuln = 999;
      s.perks.blast = stacks;
      const proj = flung(s, 1, 600, 450, 700);
      const target = makeShard(s, 2, 700, 450, 0, 0);
      const bystander = makeShard(s, 1, 700, 450 + 32 + 20 + 30, 0, 0); // 30px gap below the target
      s.shards = [proj, target, bystander];
      let blasts = 0;
      for (let i = 0; i < 40; i++) {
        step(s, NO_INPUT, SIM_DT);
        blasts += s.events.filter((e) => e.type === 'blast').length;
      }
      return { bystanderAlive: s.shards.some((x) => x.id === bystander.id), blasts };
    };
    expect(run(0)).toEqual({ bystanderAlive: true, blasts: 0 });
    const withPerk = run(1);
    expect(withPerk.bystanderAlive).toBe(false);
    expect(withPerk.blasts).toBeGreaterThan(0);
  });

  it('Magnet Hook: a flung crystal that would just miss curves into the target', () => {
    const run = (stacks: number) => {
      const s = createGame(11);
      s.drone.x = 200;
      s.drone.y = 800;
      s.drone.invuln = 999;
      s.perks.magnet = stacks;
      const proj = flung(s, 1, 500, 400, 650);
      const target = makeShard(s, 1, 900, 470, 0, 0); // 70px off the flight line, radii sum 40 -> miss
      s.shards = [proj, target];
      let hit = false;
      for (let i = 0; i < 120 && !hit; i++) {
        step(s, NO_INPUT, SIM_DT);
        hit = s.events.some((e) => e.type === 'break');
      }
      return hit;
    };
    expect(run(0)).toBe(false);
    expect(run(1)).toBe(true);
  });

  it('Focus: the world slows down while a crystal is on the rope', () => {
    const drift = (stacks: number) => {
      const s = createGame(12);
      s.drone.invuln = 999;
      s.perks.focus = stacks;
      const ammo = makeShard(s, 1, 900, 450, 0, 0);
      const other = makeShard(s, 2, 300, 150, 100, 0);
      s.shards = [ammo, other];
      // hook first, then measure how far the other crystal drifts in one second
      for (let i = 0; i < 30; i++) step(s, hold(), SIM_DT);
      expect(s.tether.state).toBe('attached');
      expect(worldTimeScale(s)).toBeCloseTo(stacks ? 1 - PERKS.focus.slowPerStack * stacks : 1);
      const x0 = s.shards.find((x) => x.id === other.id)!.x;
      for (let i = 0; i < 120; i++) step(s, hold(), SIM_DT);
      return s.shards.find((x) => x.id === other.id)!.x - x0;
    };
    const normal = drift(0);
    const slowed = drift(1);
    expect(normal).toBeGreaterThan(80);
    expect(slowed / normal).toBeCloseTo(1 - PERKS.focus.slowPerStack, 1);
    // without a crystal on the rope there is no slow-down
    const s = createGame(13);
    s.perks.focus = 2;
    expect(worldTimeScale(s)).toBe(1);
    expect(ARENA_W).toBeGreaterThan(ARENA_H);
  });
});

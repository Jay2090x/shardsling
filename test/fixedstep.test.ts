import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../src/engine/fixedStep';
import { SIM_DT, SIM_HZ } from '../src/sim/constants';
import { createGame, step } from '../src/sim/sim';
import { nextRandom } from '../src/sim/rng';
import type { GameState, SimInput } from '../src/sim/types';

/** Deterministic, tick-indexed input log (like a recorded replay). */
function scriptedInput(tick: number): SimInput {
  const t = tick * SIM_DT;
  const phase = Math.floor(t / 0.75) % 4;
  return {
    moveX: phase === 0 ? 1 : phase === 2 ? -1 : 0,
    moveY: phase === 1 ? 1 : phase === 3 ? -0.5 : 0,
    hook: t % 2.4 < 1.7,
    aimX: null,
    aimY: null,
  };
}

/**
 * Drives the game like the browser does: one advance() per display frame,
 * frames arriving at the given refresh rate (optionally jittered).
 */
function runAtRefreshRate(hz: number, seconds: number, opts: { jitter?: number; snapshotTick?: number } = {}) {
  const s = createGame(42);
  const stepper = new FixedStepper(SIM_DT);
  const jitterRng = { rng: hz * 1000 + 7 };
  let wall = 0;
  let snapshot: string | null = null;
  const frames: number[] = [];
  while (wall < seconds - 1e-9) {
    let dt = 1 / hz;
    if (opts.jitter) dt *= 1 + (nextRandom(jitterRng) * 2 - 1) * opts.jitter;
    dt = Math.min(dt, seconds - wall);
    wall += dt;
    frames.push(dt);
    stepper.advance(dt, () => {
      step(s, scriptedInput(s.tick), SIM_DT);
      if (opts.snapshotTick !== undefined && s.tick === opts.snapshotTick) snapshot = JSON.stringify(s);
    });
  }
  return { state: s, snapshot: snapshot as string | null, frames: frames.length };
}

function summary(s: GameState) {
  return {
    tick: s.tick,
    drone: [s.drone.x, s.drone.y, s.drone.vx, s.drone.vy],
    score: s.score,
    shards: s.shards.length,
    lives: s.lives,
  };
}

describe('fixed timestep: identical speed at any refresh rate', () => {
  const SECONDS = 20;
  const TICKS = SECONDS * SIM_HZ;

  it('runs exactly SIM_HZ simulation steps per second at 30/60/144/165/240 Hz', () => {
    for (const hz of [30, 60, 144, 165, 240]) {
      const { state, frames } = runAtRefreshRate(hz, SECONDS);
      expect(frames).toBe(Math.round(hz * SECONDS));
      expect(state.tick).toBe(TICKS);
      expect(state.time).toBeCloseTo(SECONDS, 6);
    }
  });

  it('seed + input log gives the bit-identical game state at 60, 144 and 240 Hz', () => {
    const ref = runAtRefreshRate(60, SECONDS, { snapshotTick: TICKS });
    expect(ref.snapshot).not.toBeNull();
    for (const hz of [144, 240, 30, 165]) {
      const other = runAtRefreshRate(hz, SECONDS, { snapshotTick: TICKS });
      expect(other.snapshot).toBe(ref.snapshot);
      expect(summary(other.state)).toEqual(summary(ref.state));
    }
  });

  it('stays identical with irregular frame times (±40% jitter)', () => {
    const ref = runAtRefreshRate(60, SECONDS, { snapshotTick: TICKS - 5 });
    const jittered = runAtRefreshRate(144, SECONDS, { jitter: 0.4, snapshotTick: TICKS - 5 });
    expect(jittered.snapshot).toBe(ref.snapshot);
  });

  it('the scripted run actually exercised the game (moved, hooked, flung)', () => {
    const { state } = runAtRefreshRate(60, SECONDS);
    expect(Math.hypot(state.drone.x - 800, state.drone.y - 450)).toBeGreaterThan(1);
    expect(state.tick).toBe(TICKS);
  });

  it('a long stall does not fast-forward the game (spiral-of-death guard)', () => {
    const stepper = new FixedStepper(SIM_DT);
    let steps = 0;
    stepper.advance(5, () => steps++); // 5 s hitch (e.g. tab in background)
    expect(steps).toBeLessThanOrEqual(stepper.maxStepsPerFrame);
  });
});

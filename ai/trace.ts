/**
 * Per-frame trace of a replay, computed in Node (the exact environment the network was trained and
 * evaluated in). The video director in the browser only draws these frames; it does not simulate.
 * (Browser and Node JS engines round Math.exp/sin/tanh... differently in the last bit, and the game
 * is chaotic, so re-simulating in the browser would drift away from the real run after ~a minute.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_DT } from '../src/sim/constants';
import { choosePerk, createGame, perkOfferReady, step } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';
import { actionToInput, decide, DECIDE_EVERY, makeActivations } from './brain';

export interface TraceSpec {
  file: string;
  member?: number;
  seed: number;
  start?: number;
  speed?: number | { t: number; speed: number }[];
}

export interface TraceFrame {
  state: unknown;
  events: SimEvent[];
  alpha: number;
  renderTime: number;
  action: number;
  input: number[];
  hidden: number[];
  output: number[];
}

function speedAt(spec: TraceSpec, t: number): number {
  const s = spec.speed;
  if (s === undefined) return 1;
  if (typeof s === 'number') return s;
  let v = s[0].speed;
  for (const p of s) if (t >= p.t) v = p.speed;
  return v;
}

const r2 = (_k: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v);

export function loadWeights(root: string, spec: TraceSpec): number[] {
  const j = JSON.parse(readFileSync(join(root, spec.file), 'utf8'));
  return spec.member !== undefined ? j.members[spec.member].weights : j.weights;
}

/** Returns a JSON string: { weights, frames: TraceFrame[] } */
export function traceRun(root: string, spec: TraceSpec, dur: number, fps: number): string {
  const w = loadWeights(root, spec);
  const s = createGame(spec.seed, 'play');
  const act = makeActivations();
  let a = 0;
  let events: SimEvent[] = [];
  const tick = (record: boolean) => {
    if (s.phase === 'playing') {
      if (perkOfferReady(s)) choosePerk(s, 0);
      if (s.tick % DECIDE_EVERY === 0) a = decide(s, w, act);
      step(s, actionToInput(a), SIM_DT);
    } else {
      step(s, actionToInput(0), SIM_DT);
    }
    if (record) for (const e of s.events) events.push(e);
  };
  if (spec.start) {
    const target = Math.round(spec.start / SIM_DT);
    while (s.tick < target && s.phase === 'playing') tick(false);
  }
  let renderTime = s.time;
  let acc = 0;
  const frames: string[] = [];
  const n = Math.round(dur * fps);
  const dt = 1 / fps;
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const sp = speedAt(spec, t);
    events = [];
    acc += (dt * sp) / SIM_DT;
    while (acc >= 1 - 1e-9) {
      tick(true);
      acc -= 1;
    }
    renderTime += dt * sp;
    const { events: _ev, ...state } = s;
    void _ev;
    frames.push(
      JSON.stringify(
        {
          state,
          events,
          alpha: Math.min(1, Math.max(0, acc)),
          renderTime,
          action: a,
          input: Array.from(act.input),
          hidden: Array.from(act.hidden),
          output: Array.from(act.output),
        },
        r2,
      ),
    );
  }
  return `{"weights":${JSON.stringify(w)},"frames":[${frames.join(',')}]}`;
}

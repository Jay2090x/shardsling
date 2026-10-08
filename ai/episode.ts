/**
 * Runs one game of Shardsling with a network in control (no rendering).
 * Perks: the agent does not choose them; it always takes the first card offered (a fixed rule).
 */
import { SIM_DT } from '../src/sim/constants';
import { choosePerk, createGame, perkOfferReady, step } from '../src/sim/sim';
import type { GameState } from '../src/sim/types';
import { actionToInput, decide, DECIDE_EVERY, makeActivations } from './brain';

export interface EpisodeStats {
  seed: number;
  score: number;
  wave: number;
  seconds: number;
  breaks: number;
  maxCombo: number;
  livesLeft: number;
  flings: number;
  /** flings after which the flung crystal broke something within 1.6 s (approximation: a break happened while it was armed) */
  hitFlings: number;
  hookTime: number;
  enemyKills: number;
  bossKills: number;
  dead: boolean;
}

export interface EpisodeOptions {
  maxSeconds: number;
  /** record the action taken at every decision (for replays) */
  record?: boolean;
  onStep?: (s: GameState) => void;
}

export function fitnessOf(r: EpisodeStats): number {
  return r.score + 4 * r.seconds;
}

export function runAgent(seed: number, w: ArrayLike<number>, opt: EpisodeOptions): { stats: EpisodeStats; actions: number[] } {
  const s = createGame(seed, 'play');
  const act = makeActivations();
  const maxTicks = Math.round(opt.maxSeconds / SIM_DT);
  const actions: number[] = [];
  let a = 0;
  let flings = 0;
  let hitFlings = 0;
  let pendingFling = 0; // seconds left in which a break counts for the last fling
  let hookTicks = 0;
  let enemyKills = 0;
  let bossKills = 0;
  while (s.phase === 'playing' && s.tick < maxTicks) {
    if (perkOfferReady(s)) choosePerk(s, 0);
    if (s.tick % DECIDE_EVERY === 0) {
      a = decide(s, w, act);
      if (opt.record) actions.push(a);
    }
    step(s, actionToInput(a), SIM_DT);
    if (s.tether.state === 'attached') hookTicks++;
    if (pendingFling > 0) pendingFling -= SIM_DT;
    for (const e of s.events) {
      if (e.type === 'fling') {
        flings++;
        pendingFling = 1.6;
      } else if ((e.type === 'break' || e.type === 'enemyKill' || e.type === 'bossHit') && pendingFling > 0) {
        hitFlings++;
        pendingFling = 0;
      }
      if (e.type === 'enemyKill') {
        enemyKills++;
        if (e.kind === 'boss') bossKills++;
      }
    }
    opt.onStep?.(s);
  }
  return {
    stats: {
      seed,
      score: s.score,
      wave: s.wave,
      seconds: s.tick * SIM_DT,
      breaks: s.breaks,
      maxCombo: s.maxCombo,
      livesLeft: s.lives,
      flings,
      hitFlings,
      hookTime: hookTicks * SIM_DT,
      enemyKills,
      bossKills,
      dead: s.phase === 'gameover',
    },
    actions,
  };
}

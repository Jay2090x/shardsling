import { SIM_DT } from './constants';
import { createGame, step } from './sim';
import type { GameState, SimInput } from './types';

export type Policy = (s: GameState) => SimInput;

export interface EpisodeResult {
  seed: number;
  score: number;
  wave: number;
  ticks: number;
  breaks: number;
  maxCombo: number;
  livesLeft: number;
}

/** Runs one episode without any rendering. */
export function runEpisode(seed: number, policy: Policy, maxSeconds = 180): EpisodeResult {
  const s = createGame(seed);
  const maxTicks = Math.round(maxSeconds / SIM_DT);
  while (s.phase === 'playing' && s.tick < maxTicks) {
    step(s, policy(s), SIM_DT);
  }
  return {
    seed,
    score: s.score,
    wave: s.wave,
    ticks: s.tick,
    breaks: s.breaks,
    maxCombo: s.maxCombo,
    livesLeft: s.lives,
  };
}

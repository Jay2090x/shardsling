// Headless runner: plays N episodes with the heuristic policy (no DOM, no rendering).
// Usage: npm run sim -- [episodes] [maxSeconds]
import { heuristicInput } from '../src/sim/bot';
import { runEpisode, type EpisodeResult } from '../src/sim/headless';
import { NO_INPUT } from '../src/sim/types';
import { nextRandom } from '../src/sim/rng';

const episodes = Number(process.argv[2] ?? 10);
const maxSeconds = Number(process.argv[3] ?? 180);

function randomPolicyFactory(seed: number) {
  const r = { rng: seed };
  let cur = { ...NO_INPUT };
  return () => {
    if (nextRandom(r) < 0.05) {
      cur = {
        moveX: Math.round(nextRandom(r) * 2 - 1),
        moveY: Math.round(nextRandom(r) * 2 - 1),
        hook: nextRandom(r) < 0.6,
        aimX: null,
        aimY: null,
      };
    }
    return cur;
  };
}

for (const [name, mk] of [
  ['random', (seed: number) => randomPolicyFactory(seed * 7 + 1)],
  ['heuristic', () => heuristicInput],
] as const) {
  const t0 = performance.now();
  let ticks = 0;
  const rows: EpisodeResult[] = [];
  for (let e = 0; e < episodes; e++) {
    const res = runEpisode(1000 + e, mk(1000 + e), maxSeconds);
    ticks += res.ticks;
    rows.push(res);
  }
  const ms = performance.now() - t0;
  const avg = (k: keyof EpisodeResult) => (rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(1);
  console.log(
    `${name.padEnd(9)} episodes=${episodes} avgScore=${avg('score')} avgWave=${avg('wave')} avgBreaks=${avg('breaks')} avgMaxCombo=${avg('maxCombo')} avgSimSeconds=${(Number(avg('ticks')) / 120).toFixed(1)} | ${Math.round(ticks / (ms / 1000)).toLocaleString('en')} steps/s (${(ticks / 120 / (ms / 1000)).toFixed(0)}x realtime)`,
  );
}

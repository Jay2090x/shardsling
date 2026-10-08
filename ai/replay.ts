/**
 * Records deterministic replays (seed + every action the network took) and verifies them by replaying
 * the action log alone (no network) through the simulation.
 *   npx tsx ai/replay.ts ai/runs/ep1 <name>:<checkpoint|popN>:<seed> ...
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_DT } from '../src/sim/constants';
import { choosePerk, createGame, perkOfferReady, step } from '../src/sim/sim';
import { actionToInput, DECIDE_EVERY } from './brain';
import { runAgent } from './episode';

export function replayActions(seed: number, actions: number[], maxSeconds: number) {
  const s = createGame(seed, 'play');
  const maxTicks = Math.round(maxSeconds / SIM_DT);
  let a = 0;
  let k = 0;
  while (s.phase === 'playing' && s.tick < maxTicks) {
    if (perkOfferReady(s)) choosePerk(s, 0);
    if (s.tick % DECIDE_EVERY === 0) a = actions[k++];
    step(s, actionToInput(a), SIM_DT);
  }
  return { score: s.score, wave: s.wave, ticks: s.tick, phase: s.phase };
}

if (process.argv[1].endsWith('replay.ts')) {
  const dir = process.argv[2];
  mkdirSync(join(dir, 'replays'), { recursive: true });
  for (const spec of process.argv.slice(3)) {
    const [name, ck, seedStr] = spec.split(':');
    const seed = Number(seedStr);
    let weights: number[];
    let generation: number | string;
    if (ck.startsWith('pop')) {
      const pop = JSON.parse(readFileSync(join(dir, 'gen0_population.json'), 'utf8'));
      weights = pop.members[Number(ck.slice(3))].weights;
      generation = `0 (random member ${ck.slice(3)}, ranked by fitness)`;
    } else {
      const j = JSON.parse(readFileSync(join(dir, 'checkpoints', `${ck}.json`), 'utf8'));
      weights = j.weights;
      generation = j.generation;
    }
    const maxSeconds = 300;
    const r = runAgent(seed, weights, { maxSeconds, record: true });
    const check = replayActions(seed, r.actions, maxSeconds);
    const ok = check.score === r.stats.score && check.ticks === Math.round(r.stats.seconds / SIM_DT);
    writeFileSync(
      join(dir, 'replays', `${name}.json`),
      JSON.stringify({
        name,
        checkpoint: ck,
        generation,
        seed,
        decideEvery: DECIDE_EVERY,
        simHz: 1 / SIM_DT,
        perkRule: 'always the first card offered',
        result: r.stats,
        verified: ok,
        actions: Buffer.from(Uint8Array.from(r.actions)).toString('base64'),
      }),
    );
    console.log(name, ck, seed, `score ${r.stats.score} ${r.stats.seconds.toFixed(1)}s wave ${r.stats.wave} ${r.stats.dead ? 'dead' : 'alive'} verified=${ok}`);
  }
}

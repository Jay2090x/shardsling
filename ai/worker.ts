import { parentPort } from 'node:worker_threads';
import { fitnessOf, runAgent, type EpisodeStats } from './episode';

interface Job {
  id: number;
  weights: number[];
  seeds: number[];
  maxSeconds: number;
}

parentPort!.on('message', (job: Job) => {
  const stats: EpisodeStats[] = [];
  let fit = 0;
  for (const seed of job.seeds) {
    const r = runAgent(seed, job.weights, { maxSeconds: job.maxSeconds });
    stats.push(r.stats);
    fit += fitnessOf(r.stats);
  }
  parentPort!.postMessage({ id: job.id, fitness: fit / job.seeds.length, stats });
});

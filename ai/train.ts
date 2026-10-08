/**
 * Neuroevolution trainer for the Shardsling agent (genetic algorithm over the weights of a small MLP).
 *
 *   npx tsx ai/train.ts --out ai/runs/ep1 --gens 250 --pop 150
 *
 * Every generation: each network plays the same 4 fresh seeds (120 s max per game) in the headless sim.
 * fitness = score + 4 * seconds survived (averaged). The best network of the generation is then
 * benchmarked on 10 fixed held-out seeds (never used for training) - that benchmark is the honest
 * learning curve. Writes stats.csv and one checkpoint (weights + stats) per generation.
 */
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { N_HID, N_IN, N_OUT, N_WEIGHTS, DECIDE_EVERY } from './brain';
import type { EpisodeStats } from './episode';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const OUT = args.get('out') ?? 'ai/runs/ep1';
const GENS = Number(args.get('gens') ?? 250);
const POP = Number(args.get('pop') ?? 150);
const SEED = Number(args.get('seed') ?? 2026);
const TRAIN_SEEDS = Number(args.get('trainSeeds') ?? 4);
const TRAIN_SECONDS = 120;
const BENCH_SEEDS = Array.from({ length: 10 }, (_, i) => 900001 + i * 7919);
const BENCH_SECONDS = 180;
const ELITE = 8;
const TOURNAMENT = 5;
const MUT_RATE = 0.08;
const MUT_SIGMA = 0.35;

// seeded RNG for the trainer itself (mulberry32) => the whole run is reproducible
let rs = SEED >>> 0;
function rnd(): number {
  let t = (rs = (rs + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function gauss(): number {
  return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
}

function randomGenome(): number[] {
  // scaled by fan-in so that untrained networks produce varied (chaotic) behaviour
  const w: number[] = [];
  for (let i = 0; i < N_IN * N_HID; i++) w.push(gauss() * (1.5 / Math.sqrt(N_IN)));
  for (let i = 0; i < N_HID; i++) w.push(gauss() * 0.5);
  for (let i = 0; i < N_HID * N_OUT; i++) w.push(gauss() * (1.5 / Math.sqrt(N_HID)));
  for (let i = 0; i < N_OUT; i++) w.push(gauss() * 0.5);
  return w;
}

function mutate(w: number[]): number[] {
  return w.map((x) => (rnd() < MUT_RATE ? x + gauss() * MUT_SIGMA : x));
}
function crossover(a: number[], b: number[]): number[] {
  // uniform crossover per hidden neuron (keeps each neuron's incoming weights together)
  const c = a.slice();
  for (let h = 0; h < N_HID; h++) {
    if (rnd() < 0.5) continue;
    for (let i = 0; i < N_IN; i++) c[h * N_IN + i] = b[h * N_IN + i];
    c[N_IN * N_HID + h] = b[N_IN * N_HID + h];
    const o = N_IN * N_HID + N_HID;
    for (let k = 0; k < N_OUT; k++) c[o + k * N_HID + h] = b[o + k * N_HID + h];
  }
  return c;
}

// ---------------------------------------------------------------- worker pool
const nWorkers = Math.max(1, Math.min(cpus().length - 1, Number(args.get('workers') ?? 7)));
const workers: Worker[] = [];
for (let i = 0; i < nWorkers; i++) {
  workers.push(new Worker(new URL('./worker-entry.mjs', import.meta.url)));
}
interface Result {
  id: number;
  fitness: number;
  stats: EpisodeStats[];
}
interface Job {
  weights: number[];
  seeds: number[];
  maxSeconds: number;
}
function runJobs(jobs: Job[]): Promise<Result[]> {
  return new Promise((resolve) => {
    const results: Result[] = new Array(jobs.length);
    let next = 0;
    let done = 0;
    const feed = (wk: Worker) => {
      if (next >= jobs.length) return;
      const id = next++;
      wk.postMessage({ id, ...jobs[id] });
    };
    for (const wk of workers) {
      wk.removeAllListeners('message');
      wk.on('message', (r: Result) => {
        results[r.id] = r;
        done++;
        if (done === jobs.length) resolve(results);
        else feed(wk);
      });
      feed(wk);
    }
  });
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

async function main() {
  mkdirSync(join(OUT, 'checkpoints'), { recursive: true });
  const csv = join(OUT, 'stats.csv');
  {
    writeFileSync(
      csv,
      'generation,best_fitness,mean_fitness,median_fitness,best_train_score,bench_mean_score,bench_max_score,bench_mean_wave,bench_max_wave,bench_mean_seconds,bench_deaths,bench_flings,bench_hit_rate,bench_breaks,bench_max_combo,bench_enemy_kills,bench_boss_kills,bench_hook_share,seconds_elapsed\n',
    );
  }
  writeFileSync(
    join(OUT, 'config.json'),
    JSON.stringify(
      { GENS, POP, SEED, TRAIN_SEEDS, TRAIN_SECONDS, BENCH_SEEDS, BENCH_SECONDS, ELITE, TOURNAMENT, MUT_RATE, MUT_SIGMA, N_IN, N_HID, N_OUT, N_WEIGHTS, DECIDE_EVERY, fitness: 'score + 4 * seconds survived, mean over 3 seeds' },
      null,
      2,
    ),
  );
  let pop: number[][] = Array.from({ length: POP }, randomGenome);
  const t0 = Date.now();
  for (let gen = 0; gen < GENS; gen++) {
    const seeds = Array.from({ length: TRAIN_SEEDS }, () => Math.floor(rnd() * 0xffffffff));
    const res = await runJobs(pop.map((weights) => ({ weights, seeds, maxSeconds: TRAIN_SECONDS })));
    const order = res.map((_, i) => i).sort((a, b) => res[b].fitness - res[a].fitness);
    const fits = order.map((i) => res[i].fitness);
    const bestIdx = order[0];
    const best = pop[bestIdx];
    // held-out benchmark of the generation's best network (one job per seed, in parallel)
    const bs = (await runJobs(BENCH_SEEDS.map((seed) => ({ weights: best, seeds: [seed], maxSeconds: BENCH_SECONDS })))).map(
      (r) => r.stats[0],
    );
    const flings = sum(bs.map((b) => b.flings));
    const hits = sum(bs.map((b) => b.hitFlings));
    const row = [
      gen,
      fits[0].toFixed(1),
      mean(fits).toFixed(1),
      fits[Math.floor(fits.length / 2)].toFixed(1),
      mean(res[bestIdx].stats.map((s) => s.score)).toFixed(1),
      mean(bs.map((b) => b.score)).toFixed(1),
      Math.max(...bs.map((b) => b.score)),
      mean(bs.map((b) => b.wave)).toFixed(2),
      Math.max(...bs.map((b) => b.wave)),
      mean(bs.map((b) => b.seconds)).toFixed(1),
      bs.filter((b) => b.dead).length,
      flings,
      flings > 0 ? (hits / flings).toFixed(3) : '0',
      sum(bs.map((b) => b.breaks)),
      Math.max(...bs.map((b) => b.maxCombo)),
      sum(bs.map((b) => b.enemyKills)),
      sum(bs.map((b) => b.bossKills)),
      (sum(bs.map((b) => b.hookTime)) / Math.max(1, sum(bs.map((b) => b.seconds)))).toFixed(3),
      ((Date.now() - t0) / 1000).toFixed(0),
    ];
    appendFileSync(csv, row.join(',') + '\n');
    writeFileSync(
      join(OUT, 'checkpoints', `gen_${String(gen).padStart(4, '0')}.json`),
      JSON.stringify({ generation: gen, fitness: fits[0], trainSeeds: seeds, trainStats: res[bestIdx].stats, bench: bs, weights: best }),
    );
    console.log(
      `gen ${gen} best ${fits[0].toFixed(0)} mean ${mean(fits).toFixed(0)} | bench score ${row[5]} max ${row[6]} wave ${row[7]} deaths ${row[10]}/10 hit ${row[12]} | ${row[18]}s`,
    );

    if (gen === 0) {
      // keep the whole untrained population (for "generation 0" footage: random, untrained networks)
      writeFileSync(
        join(OUT, 'gen0_population.json'),
        JSON.stringify({ trainSeeds: seeds, members: order.map((i) => ({ fitness: res[i].fitness, stats: res[i].stats, weights: pop[i] })) }),
      );
    }
    // next generation
    const next: number[][] = order.slice(0, ELITE).map((i) => pop[i]);
    const pick = () => {
      let b = Math.floor(rnd() * POP);
      for (let k = 1; k < TOURNAMENT; k++) {
        const c = Math.floor(rnd() * POP);
        if (res[c].fitness > res[b].fitness) b = c;
      }
      return pop[b];
    };
    while (next.length < POP) {
      let child = pick();
      if (rnd() < 0.5) child = crossover(child, pick());
      next.push(mutate(child));
    }
    pop = next;
  }
  for (const w of workers) await w.terminate();
}

main();

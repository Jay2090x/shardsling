/**
 * Behaviour analysis of trained checkpoints (what the networks really do, measured in the sim).
 *   npx tsx ai/analyze.ts ai/runs/ep1 gen_0000 gen_0010 ... [--seeds 30]
 * Prints JSON with per-checkpoint behaviour stats. Nothing here changes the agent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARENA_H, ARENA_W, SIM_DT } from '../src/sim/constants';
import { choosePerk, createGame, perkOfferReady, step } from '../src/sim/sim';
import { actionToInput, decide, DECIDE_EVERY, makeActivations } from './brain';

export interface Behaviour {
  games: number;
  meanScore: number;
  medianScore: number;
  maxScore: number;
  meanSeconds: number;
  deaths: number;
  meanWave: number;
  maxWave: number;
  flingsPerMin: number;
  firesPerMin: number;
  hookShare: number;
  throwHits: number;
  flailHits: number;
  bankShots: number;
  hitRate: number;
  meanSwing: number;
  releaseLaserShare: number;
  laserBaseShare: number;
  spinCW: number;
  centerShare: number;
  edgeShare: number;
  meanSpeed: number;
  deathsByOwnCrystal: number;
  deathsByEnemy: number;
  deathsByShard: number;
  maxCombo: number;
  bestSeed: number;
  idleShare: number;
  stopShare: number;
  /** throws released faster than 500 px/s and how many of them broke something */
  fastFlings: number;
  fastHits: number;
}

export function analyse(w: number[], seeds: number[], maxSeconds = 180): Behaviour {
  const act = makeActivations();
  const scores: number[] = [];
  let secs = 0, deaths = 0, waves = 0, maxWave = 0, flings = 0, fires = 0, hookT = 0, throwHits = 0, flailHits = 0, bank = 0;
  let swings = 0, swingT = 0, relLaser = 0, laserT = 0, attachedT = 0, cw = 0, attaches = 0, center = 0, edge = 0, speed = 0, ticks = 0;
  let fastF = 0, fastH = 0, flungFast = false;
  let dOwn = 0, dEnemy = 0, dShard = 0, maxCombo = 0, best = -1, bestSeed = 0, idle = 0, stop = 0;
  for (const seed of seeds) {
    const s = createGame(seed, 'play');
    let a = 0;
    let flung = -1; // id of the last thrown crystal
    let flungT = 0;
    let bounced = false;
    let swingStart = 0;
    let lastLaser = 0;
    const thrown = new Map<number, number>(); // crystal id -> time thrown (for "hit by its own crystal")
    const maxTicks = Math.round(maxSeconds / SIM_DT);
    while (s.phase === 'playing' && s.tick < maxTicks) {
      if (perkOfferReady(s)) choosePerk(s, 0);
      if (s.tick % DECIDE_EVERY === 0) {
        a = decide(s, w, act);
        lastLaser = act.input[12];
        if (s.tether.state === 'attached') {
          attachedT++;
          if (lastLaser > 0) laserT++;
        }
        if ((a >> 1) === 0) stop++;
      }
      const prevState = s.tether.state;
      const heldId = s.tether.targetId;
      step(s, actionToInput(a), SIM_DT);
      ticks++;
      const d = s.drone;
      speed += Math.hypot(d.vx, d.vy);
      const nx = d.x / ARENA_W, ny = d.y / ARENA_H;
      if (Math.abs(nx - 0.5) < 0.2 && Math.abs(ny - 0.5) < 0.2) center++;
      if (nx < 0.08 || nx > 0.92 || ny < 0.1 || ny > 0.9) edge++;
      if (s.tether.state === 'attached') hookT++;
      if (s.tether.state === 'idle') idle++;
      // track the thrown crystal for bank shots
      if (flung >= 0) {
        const sh = s.shards.find((q) => q.id === flung);
        if (!sh || s.time - flungT > 1.6) flung = -1;
        else if (sh.x - sh.r < 3 || sh.x + sh.r > ARENA_W - 3 || sh.y - sh.r < 3 || sh.y + sh.r > ARENA_H - 3) bounced = true;
      }
      for (const e of s.events) {
        if (e.type === 'attach') {
          attaches++;
          swingStart = s.time;
          if (s.tether.dir === 1) cw++;
        }
        if (e.type === 'fire') fires++;
        if (e.type === 'fling') {
          flings++;
          swings++;
          swingT += s.time - swingStart;
          if (lastLaser > 0) relLaser++;
          flung = heldId;
          flungT = s.time;
          flungFast = e.speed > 500;
          if (flungFast) fastF++;
          bounced = false;
          thrown.set(heldId, s.time);
        }
        if (e.type === 'break' || e.type === 'enemyKill' || e.type === 'bossHit') {
          if (prevState === 'attached' && s.tether.state === 'attached') {
            // broke something while the crystal was still on the rope
            const held = s.shards.find((q) => q.id === s.tether.targetId);
            if (held && Math.hypot(held.x - e.x, held.y - e.y) < held.r + 80) flailHits++;
          } else if (flung >= 0 || s.time - flungT < 1.6) {
            if (flung >= 0) {
              throwHits++;
              if (flungFast) fastH++;
              if (bounced) bank++;
              flung = -1;
            }
          }
        }
        if (e.type === 'hurt') {
          // what hit the drone? nearest hazard
          let bestD = Infinity;
          let kind = 'shard';
          for (const sh of s.shards) {
            if (sh.tier === 0) continue;
            const dd = Math.hypot(sh.x - e.x, sh.y - e.y) - sh.r;
            if (dd < bestD) {
              bestD = dd;
              const tt = thrown.get(sh.id);
              kind = tt !== undefined && s.time - tt < 6 ? 'own' : 'shard';
            }
          }
          for (const en of s.enemies) {
            const dd = Math.hypot(en.x - e.x, en.y - e.y) - en.r;
            if (dd < bestD) {
              bestD = dd;
              kind = 'enemy';
            }
          }
          if (kind === 'own') dOwn++;
          else if (kind === 'enemy') dEnemy++;
          else dShard++;
        }
      }
    }
    scores.push(s.score);
    secs += s.time;
    if (s.phase === 'gameover') deaths++;
    waves += s.wave;
    maxWave = Math.max(maxWave, s.wave);
    maxCombo = Math.max(maxCombo, s.maxCombo);
    if (s.score > best) {
      best = s.score;
      bestSeed = seed;
    }
  }
  const sorted = scores.slice().sort((x, y) => x - y);
  const mins = secs / 60;
  return {
    games: seeds.length,
    meanScore: scores.reduce((x, y) => x + y, 0) / scores.length,
    medianScore: sorted[Math.floor(sorted.length / 2)],
    maxScore: best,
    meanSeconds: secs / seeds.length,
    deaths,
    meanWave: waves / seeds.length,
    maxWave,
    flingsPerMin: flings / mins,
    firesPerMin: fires / mins,
    hookShare: hookT / ticks,
    throwHits,
    flailHits,
    bankShots: bank,
    hitRate: flings ? throwHits / flings : 0,
    meanSwing: swings ? swingT / swings : 0,
    releaseLaserShare: flings ? relLaser / flings : 0,
    laserBaseShare: attachedT ? laserT / attachedT : 0,
    spinCW: attaches ? cw / attaches : 0,
    centerShare: center / ticks,
    edgeShare: edge / ticks,
    meanSpeed: speed / ticks,
    deathsByOwnCrystal: dOwn,
    deathsByEnemy: dEnemy,
    deathsByShard: dShard,
    maxCombo,
    bestSeed,
    idleShare: idle / ticks,
    stopShare: stop / (ticks / DECIDE_EVERY),
    fastFlings: fastF,
    fastHits: fastH,
  };
}

if (process.argv[1].endsWith('analyze.ts')) {
  const dir = process.argv[2];
  const names = process.argv.slice(3).filter((x) => !x.startsWith('--'));
  const nSeeds = 30;
  // default: the 10 benchmark seeds + 20 more; --fresh: 30 seeds never seen in training or benchmark selection
  const base = process.argv.includes('--fresh') ? 5000011 : 900001;
  const seeds = Array.from({ length: nSeeds }, (_, i) => base + i * 7919);
  const out: Record<string, Behaviour> = {};
  for (const n of names) {
    let w: number[];
    if (n.startsWith('pop')) {
      const pop = JSON.parse(readFileSync(join(dir, 'gen0_population.json'), 'utf8'));
      w = pop.members[Number(n.slice(3))].weights;
    } else w = JSON.parse(readFileSync(join(dir, 'checkpoints', `${n}.json`), 'utf8')).weights;
    out[n] = analyse(w, seeds);
    const b = out[n];
    console.log(
      n.padEnd(10),
      `score ${b.meanScore.toFixed(0)} med ${b.medianScore} max ${b.maxScore}@${b.bestSeed} | ${b.meanSeconds.toFixed(0)}s deaths ${b.deaths}/${b.games} wave ${b.meanWave.toFixed(1)}/${b.maxWave} | flings/min ${b.flingsPerMin.toFixed(1)} hook ${(b.hookShare * 100).toFixed(0)}% swing ${b.meanSwing.toFixed(2)}s | throwHits ${b.throwHits} (rate ${(b.hitRate * 100).toFixed(0)}%) flail ${b.flailHits} bank ${b.bankShots} | laser@release ${(b.releaseLaserShare * 100).toFixed(0)}% vs base ${(b.laserBaseShare * 100).toFixed(0)}% | cw ${(b.spinCW * 100).toFixed(0)}% center ${(b.centerShare * 100).toFixed(0)}% edge ${(b.edgeShare * 100).toFixed(0)}% speed ${b.meanSpeed.toFixed(0)} stop ${(b.stopShare * 100).toFixed(0)}% | deaths own ${b.deathsByOwnCrystal} enemy ${b.deathsByEnemy} shard ${b.deathsByShard} combo ${b.maxCombo} | fast throws ${b.fastFlings} hit ${b.fastHits} (${b.fastFlings ? ((b.fastHits / b.fastFlings) * 100).toFixed(0) : 0}%)`,
    );
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(out));
}

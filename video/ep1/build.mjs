// Episode 1 script -> scenes.json (long video), short.json (Shorts teaser), thumb.json (thumbnail frame).
// Every number shown on screen is read from the training logs / analysis files below, not typed in by hand.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const here = dirname(new URL(import.meta.url).pathname);
const run = join(here, '../../ai/runs/ep1');
const A = (n) => {
  const txt = readFileSync(join(run, 'analysis', `fresh2_${n}.txt`), 'utf8').trim().split('\n');
  return JSON.parse(txt[txt.length - 1])[n];
};
const csv = readFileSync(join(run, 'stats.csv'), 'utf8').trim().split('\n');
const keys = csv[0].split(',');
const rows = csv.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [keys[i], Number(v)])));
const cfg = JSON.parse(readFileSync(join(run, 'config.json'), 'utf8'));
const pop = JSON.parse(readFileSync(join(run, 'gen0_population.json'), 'utf8'));
const zeroScorers = pop.members.filter((m) => m.stats.every((s) => s.score === 0)).length;
const lastGen = rows[rows.length - 1].generation;
const gens = rows.length;
const trainGames = gens * cfg.POP * cfg.TRAIN_SEEDS;
const minutes = Math.round(rows[rows.length - 1].seconds_elapsed / 60);
const BEST = 'gen_0183';
const BESTGEN = 183;
const BESTSEED = 5079201;
const bench = (g) => rows.find((r) => r.generation === g).bench_mean_score;
const b = { p0: A('pop0'), p75: A('pop75'), p149: A('pop149'), g1: A('gen_0001'), g10: A('gen_0010'), g40: A('gen_0040'), g100: A('gen_0100'), best: A(BEST) };
const pct = (x) => `${Math.round(x * 100)}%`;
const fmt = (x) => Math.round(x).toLocaleString('en');
const bestHits = b.best.throwHits + b.best.flailHits;
const bestLost = b.best.deathsByShard + b.best.deathsByEnemy + b.best.deathsByOwnCrystal;
const p149Lost = b.p149.deathsByShard + b.p149.deathsByEnemy + b.p149.deathsByOwnCrystal;
const p75Lost = b.p75.deathsByShard + b.p75.deathsByEnemy + b.p75.deathsByOwnCrystal;
// facts of the best replay (seed 5079201), from ai/runs/ep1/replays/best_run.json (verified replay)
const bestRun = JSON.parse(readFileSync(join(run, 'replays', 'best_run.json'), 'utf8')).result;
const gen1Run = JSON.parse(readFileSync(join(run, 'replays', 'gen1_same_seed.json'), 'utf8')).result;

const C = { cyan: '#22e5ff', magenta: '#ff2bd6', yellow: '#ffe14d', green: '#7dff5a', red: '#ff3b5c', violet: '#b45cff', orange: '#ff9a3b' };
const ck = (g) => `/ai/runs/ep1/checkpoints/gen_${String(g).padStart(4, '0')}.json`;
const popf = '/ai/runs/ep1/gen0_population.json';
const bestSpec = (extra) => ({ file: ck(BESTGEN), seed: BESTSEED, ...extra });
const M = {
  calm: { prog: 'B', bass: false, drums: false, vol: 0.8 },
  calmBeat: { prog: 'B', drums: false, hats: true, vol: 0.85 },
  groove: { prog: 'A', drums: true, vol: 0.75 },
  full: { prog: 'A', drums: true, vol: 0.9 },
  boss: { prog: 'A', drums: true, boss: true, vol: 0.9 },
  sparse: { prog: 'A', bass: false, drums: false, vol: 0.7 },
};

const scenes = [
  {
    id: '01_cold', kind: 'game', dur: 9, layout: 'full', music: M.full, fadeIn: 0.3,
    run: bestSpec({ start: 86.0, label: 'TRAINED AI', sub: `generation ${BESTGEN}` }),
    captions: [
      { t0: 0.3, t1: 4.2, text: 'This spaceship has no gun.' },
      { t0: 4.5, t1: 8.8, text: 'This AI learned to play it anyway.', sub: 'every clip in this video is a real replay' },
    ],
  },
  {
    id: '02_title', kind: 'title', dur: 5, music: M.full, fadeOut: 0.4, accents: [{ t: 0.05, kind: 'whoosh' }],
    data: { lines: ['I GAVE AN AI', 'A SPACESHIP', 'WITH NO GUN'], sub: 'a tiny neural network, trained from scratch by evolution' },
    bgRun: bestSpec({ start: 40, speed: 0.6 }),
  },
  {
    id: '03_rules', kind: 'game', dur: 36, layout: 'full', music: M.calmBeat, fadeIn: 0.4,
    run: bestSpec({ start: 2.0, speed: [{ t: 0, speed: 0.5 }, { t: 12, speed: 1 }], label: `TRAINED AI · GENERATION ${BESTGEN}`, sub: 'real replay · game the AI never saw in training' }),
    marks: [{ t0: 0.3, t1: 4.5, target: 'drone', label: 'AI', color: C.green }, { t0: 5, t1: 9.8, target: 'held', color: C.yellow }],
    captions: [
      { t0: 0.3, t1: 4.5, text: 'The green ship is the AI. It can move. That is all, plus one button:' },
      { t0: 4.8, t1: 9.8, text: 'Hold the hook: a harpoon grabs the nearest crystal and swings it around on a rope.' },
      { t0: 10.0, t1: 14.5, text: 'Let go: the crystal flies off in a straight line.' },
      { t0: 14.8, t1: 20.6, text: 'If it hits another crystal hard enough, that crystal shatters. Every fragment is new ammo.' },
      { t0: 21.0, t1: 25.4, text: 'Clear the field and the next wave arrives.' },
      { t0: 25.7, t1: 30.2, text: 'Smash fast to build a combo: up to x10 points per smash.' },
      { t0: 30.5, t1: 35.8, text: 'Touch a drifting crystal or an enemy and you lose a life. Three lives.' },
    ],
  },
  {
    id: '04_net', kind: 'net', dur: 24, music: M.calm, fadeIn: 0.4,
    run: bestSpec({ start: 24 }),
    captions: [
      { t0: 0.3, t1: 6.0, text: 'The AI is a tiny neural network. This is all of it, live.', size: 46 },
      { t0: 6.3, t1: 13.0, text: "It sees 24 numbers: where it is and how fast, the nearest crystal, its rope, an 8-way danger radar and a 'laser' that says if the swinging crystal is flying at a target.", size: 42 },
      { t0: 13.3, t1: 18.4, text: 'It answers with 10 numbers: 9 ways to move (or stop) and hook on/off.', size: 46 },
      { t0: 18.7, t1: 23.7, text: 'No pretrained model, no examples of how to play. It starts as random numbers.', size: 46 },
    ],
  },
  {
    id: '05_evolution', kind: 'card', dur: 17, music: M.calm,
    bgRun: { file: popf, member: 10, seed: 5000011, start: 5 },
    data: {
      heading: 'HOW IT LEARNS: EVOLUTION',
      bullets: [
        { t: 0.8, text: `${cfg.POP} random brains each play ${cfg.TRAIN_SEEDS} games in the real game code.` },
        { t: 3.6, text: 'Fitness = points + 4 per second survived.' },
        { t: 6.4, text: `The best ${cfg.ELITE} are kept. Everyone else is replaced by mixed and slightly mutated copies of good brains.` },
        { t: 10.0, text: 'Repeat, with new games every generation.' },
        { t: 12.6, text: `This run: ${gens} generations · ${fmt(trainGames)} training games · ${minutes} minutes on an 8-core computer.`, color: C.yellow },
      ],
    },
  },
  {
    id: '06_gen0grid', kind: 'grid', dur: 14, cols: 4, rows: 3, music: M.sparse, audio: 'none',
    data: { title: `GENERATION 0: 12 OF ${cfg.POP} RANDOM BRAINS`, color: C.cyan },
    runs: [0, 10, 25, 40, 55, 70, 75, 90, 105, 120, 135, 149].map((m) => ({ file: popf, member: m, seed: 5000011, start: 15, speed: 2, label: `#${m + 1}` })),
    captions: [{ t0: 6.5, t1: 13.7, text: `Half of them never scored a single point.`, sub: `${zeroScorers} of ${cfg.POP} scored 0 in all ${cfg.TRAIN_SEEDS} games` }],
  },
  {
    id: '07_wall', kind: 'game', dur: 10, layout: 'full', music: M.sparse,
    run: { file: popf, member: 75, seed: 5000011, start: 120.5, label: 'GENERATION 0', sub: 'random brain #76 of 150', color: C.red },
    marks: [{ t0: 0.3, t1: 9.7, target: 'drone', color: C.red }],
    captions: [{ t0: 0.3, t1: 9.7, text: 'Random brain #76 drives into the wall and stays there.', sub: `30 test games: ${pct(b.p75.edgeShare)} of its time at the edge, ${fmt(b.p75.meanScore)} points on average` }],
  },
  {
    id: '08_selfhit', kind: 'game', dur: 10, layout: 'full', music: M.sparse,
    run: { file: popf, member: 149, seed: 5000011, start: 0, label: 'GENERATION 0', sub: 'random brain #150 of 150', color: C.red },
    captions: [{ t0: 0.3, t1: 9.7, text: 'Random brain #150 throws crystals around and keeps hitting itself.', sub: `30 test games: ${b.p149.deathsByOwnCrystal} of its ${p149Lost} lost lives came from its own crystals` }],
  },
  {
    id: '09_neverletgo', kind: 'game', dur: 10, layout: 'full', music: M.sparse,
    run: { file: popf, member: 0, seed: 5000011, start: 14, label: 'GENERATION 0', sub: 'the best random brain', color: C.yellow },
    marks: [{ t0: 3, t1: 8, target: 'held', color: C.yellow }],
    captions: [{ t0: 0.3, t1: 9.7, text: 'The best random brain grabs a crystal and never lets go. It scores by ramming things with it.', sub: `hook held ${pct(b.p0.hookShare)} of the time · ${b.p0.flailHits} of its ${b.p0.flailHits + b.p0.throwHits} hits without letting go` }],
  },
  {
    id: '10_chart', kind: 'chart', dur: 16, music: M.groove,
    data: {
      csv: '/ai/runs/ep1/stats.csv', key: 'bench_mean_score', title: 'AVERAGE TEST SCORE PER GENERATION', ylabel: 'POINTS (10 TEST GAMES)',
      marks: [{ gen: 10, text: 'gen 10' }, { gen: 40, text: 'gen 40' }, { gen: 100, text: 'gen 100' }, { gen: BESTGEN, text: `gen ${BESTGEN}`, color: C.green }],
    },
    captions: [{ t0: 9.5, t1: 15.7, text: `Generation 0: ${fmt(bench(0))} points. Generation ${BESTGEN}: ${fmt(bench(BESTGEN))}.`, sub: 'same 10 test games for every generation, never used for training' }],
  },
  {
    id: '11_gen10', kind: 'game', dur: 14, layout: 'full', music: M.groove,
    run: { file: ck(10), seed: 5000011, start: 76, speed: [{ t: 0, speed: 0.5 }, { t: 5, speed: 1 }], label: 'GENERATION 10', color: C.orange },
    captions: [
      { t0: 0.3, t1: 6.5, text: 'Generation 10 found its first strategy: spam.', sub: `it grabs and lets go ${fmt(b.g10.flingsPerMin)} times a minute` },
      { t0: 6.8, t1: 13.7, text: 'Lots of throws, few hits.', sub: `only ${pct(b.g10.fastHits / b.g10.fastFlings)} of its fast throws broke anything (30 test games)` },
    ],
  },
  {
    id: '12_gen40', kind: 'game', dur: 22, layout: 'brain', music: M.groove,
    run: { file: ck(40), seed: 5000011, start: 64, speed: [{ t: 0, speed: 0.5 }, { t: 8, speed: 1 }], label: 'GENERATION 40', sub: 'brain view: real activations', color: C.violet },
    marks: [{ t0: 1, t1: 7, target: 'held', label: 'laser = is this crystal flying at a target?', color: C.yellow }],
    captions: [
      { t0: 0.3, t1: 7.4, text: "Remember the 'laser' input? At first the AI ignored it.", sub: `generation 1 let go with the laser on target ${pct(b.g1.releaseLaserShare)} of the time, about chance (${pct(b.g1.laserBaseShare)})` },
      { t0: 7.7, t1: 14.6, text: `Generation 40: ${pct(b.g40.releaseLaserShare)} of its releases happen while the laser is on target.`, sub: `the laser is on target only ${pct(b.g40.laserBaseShare)} of the time` },
      { t0: 14.9, t1: 21.7, text: `By generation 100 it was ${pct(b.g100.releaseLaserShare)}. It learned to wait for the shot.` },
    ],
  },
  {
    id: '13_best_brain', kind: 'game', dur: 20, layout: 'brain', music: M.full,
    run: bestSpec({ start: 23.0, speed: [{ t: 0, speed: 0.5 }, { t: 10, speed: 1 }], label: `GENERATION ${BESTGEN}`, sub: 'brain view: real activations', color: C.green }),
    captions: [
      { t0: 0.3, t1: 6.8, text: 'It also learned to smash with the crystal still on the rope.', sub: `${pct(b.best.flailHits / bestHits)} of its hits happen without letting go (${fmt(b.best.flailHits)} of ${fmt(bestHits)}, 30 test games)` },
      { t0: 7.1, t1: 13.4, text: 'And it still throws a lot, but now it aims.', sub: `${fmt(b.best.flingsPerMin)} releases a minute · ${pct(b.best.fastHits / b.best.fastFlings)} of fast throws hit (generation 10: ${pct(b.g10.fastHits / b.g10.fastFlings)})` },
      { t0: 13.7, t1: 19.7, text: 'Each hit makes fragments, the fragments become ammo, and the chain keeps going.' },
    ],
  },
  {
    id: '14_weakness', kind: 'game', dur: 14, layout: 'full', music: M.sparse,
    run: bestSpec({ start: 127.0, speed: [{ t: 0, speed: 0.5 }, { t: 7, speed: 1 }], label: `GENERATION ${BESTGEN}`, color: C.red }),
    marks: [{ t0: 0.3, t1: 6, target: 'drone', color: C.red }],
    captions: [{ t0: 0.3, t1: 13.7, text: 'Its weakness: it never really learned to dodge.', sub: `30 test games: ${b.best.deathsByShard} of ${bestLost} lost lives came from drifting crystals, ${b.best.deathsByEnemy} from enemies` }],
  },
  {
    id: '15_split', kind: 'split', dur: 40, music: M.groove,
    runs: [
      { file: ck(1), seed: BESTSEED, start: 0, speed: 3, label: 'GENERATION 1', color: C.red },
      { file: ck(BESTGEN), seed: BESTSEED, start: 0, speed: 3, label: `GENERATION ${BESTGEN}`, color: C.green },
    ],
    captions: [
      { t0: 0.5, t1: 6, text: 'Same game, same seed, same starting crystals.' },
      { t0: 12, t1: 18, text: `Generation 1 is still stuck in wave ${gen1Run.wave}.` },
      { t0: 33, t1: 39.7, text: `Generation 1: game over at ${fmt(gen1Run.score)} points. Generation ${BESTGEN} keeps going.` },
    ],
  },
  {
    id: '16_best_run', kind: 'game', dur: 70, layout: 'full', music: M.boss, fadeOut: 0.6,
    run: bestSpec({ start: 60.0, speed: [{ t: 0, speed: 1 }, { t: 47, speed: 2 }], label: 'BEST TEST GAME', sub: `generation ${BESTGEN} · seed it never trained on` }),
    captions: [
      { t0: 0.5, t1: 5.5, text: 'Its best test game, picking up in wave 4.' },
      { t0: 20.6, t1: 26.5, text: 'Enemies: hunters chase the ship, and from wave 5 prisms shoot at it.' },
      { t0: 33, t1: 39, text: 'This chain went to 110 smashes in a row.', sub: 'the counter on screen stops at x10, the chain kept going' },
      { t0: 55.2, t1: 59, text: 'Wave 7.' },
      { t0: 66.4, t1: 69.7, text: `Game over: ${fmt(bestRun.score)} points, wave ${bestRun.wave}, ${bestRun.enemyKills} enemies smashed.`, color: C.yellow },
    ],
  },
  {
    id: '17_learned', kind: 'card', dur: 15, music: M.calm, fadeIn: 0.4,
    bgRun: bestSpec({ start: 60, speed: 0.5 }),
    data: {
      heading: 'WHAT IT LEARNED IN ' + gens + ' GENERATIONS',
      bullets: [
        { t: 0.8, text: 'Grab, swing, and let go when the laser is on a target.' },
        { t: 3.4, text: 'Throw a lot, and keep chains going with the fragments.' },
        { t: 6.0, text: 'Smash with the crystal still on the rope.' },
        { t: 8.6, text: 'Dodging: not yet.', color: C.red },
        { t: 11.2, text: 'What should it learn next? Tell me in the comments.', color: C.yellow },
      ],
    },
  },
  {
    id: '18_end', kind: 'end', dur: 16, music: M.calm, fadeIn: 0.5,
    bgRun: bestSpec({ start: 90, speed: 0.5 }),
    data: { score: `AI best test game: ${fmt(bestRun.score)} points (generation ${BESTGEN})` },
  },
];

const total = scenes.reduce((a, s) => a + s.dur, 0);
writeFileSync(join(here, 'scenes.json'), JSON.stringify(scenes, null, 1));

// Shorts teaser (1080x1920)
const short = [
  {
    id: 's1_stack', kind: 'stack', dur: 44, music: M.full, sfxVol: 0.6,
    data: { title: `GEN 1 vs GEN ${BESTGEN}`, sub: 'same game · same seed · real replays', y0: 330, gap: 150 },
    runs: [
      { file: ck(1), seed: BESTSEED, start: 28, speed: 2, label: 'GENERATION 1', color: C.red },
      { file: ck(BESTGEN), seed: BESTSEED, start: 28, speed: 2, label: `GENERATION ${BESTGEN}`, color: C.green },
    ],
    captions: [
      { t0: 0.2, t1: 5.5, text: 'An AI ship with no gun. Only a rope.', size: 52 },
      { t0: 6, t1: 13, text: 'Generation 1 has no idea what the rope is for.', size: 52 },
      { t0: 14, t1: 22, text: `Generation ${BESTGEN} learned to aim the throws.`, size: 52 },
      { t0: 23, t1: 31, text: 'A tiny neural network, trained by evolution.', size: 52 },
      { t0: 32, t1: 39.5, text: 'Full experiment on the channel.', size: 52 },
      { t0: 40, t1: 43.8, text: 'Play free: jay2090x.github.io/shardsling', size: 46, color: C.green },
    ],
  },
];
writeFileSync(join(here, 'short.json'), JSON.stringify(short, null, 1));

const thumb = [
  {
    id: 'thumb', kind: 'thumb', dur: 0.4,
    run: bestSpec({ start: 87.25 }),
    data: {
      vignette: true,
      crop: { sx: 10, sy: 96, z: 1.5 },
      lines: [
        { text: 'NO GUN.', color: C.magenta, size: 200, x: 70, y: 270 },
        { text: 'JUST A', color: C.cyan, size: 110, x: 80, y: 480 },
        { text: 'ROPE.', color: C.cyan, size: 150, x: 75, y: 620 },
        { text: 'GEN 0 → GEN 183', color: C.yellow, size: 70, x: 80, y: 900 },
      ],
    },
  },
];
writeFileSync(join(here, 'thumb.json'), JSON.stringify(thumb, null, 1));
console.log(`scenes: ${scenes.length}, total ${total.toFixed(1)} s (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')})`);
console.log(JSON.stringify({ zeroScorers, gens, lastGen, trainGames, minutes, bestRun, gen1Run }));

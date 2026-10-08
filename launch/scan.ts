/** Finds visually busy moments in real runs (for covers/screenshots/previews). Usage: npx tsx launch/scan.ts */
import { readFileSync } from 'node:fs';
import { SIM_DT } from '../src/sim/constants';
import { heuristicInput } from '../src/sim/bot';
import { choosePerk, createGame, perkOfferReady, spawnWave, step } from '../src/sim/sim';
import { actionToInput, decide, DECIDE_EVERY, makeActivations } from '../ai/brain';

interface Spec { name: string; file?: string; seed: number; wave?: number; bot?: boolean; dur: number }
const specs: Spec[] = JSON.parse(process.argv[2] ?? '[]');
for (const sp of specs) {
  const w = sp.file ? JSON.parse(readFileSync(sp.file, 'utf8')).weights : [];
  const s = createGame(sp.seed, 'play');
  if (sp.wave) { s.shards = []; s.enemies = []; s.perkOffer = null; s.waveTimer = 0; spawnWave(s, sp.wave); }
  const act = makeActivations();
  let a = 0;
  const breaks: number[] = [];
  const rows: { t: number; sc: number; d: string }[] = [];
  while (s.time < sp.dur && s.phase === 'playing') {
    if (perkOfferReady(s)) choosePerk(s, 0);
    if (sp.bot) step(s, heuristicInput(s), SIM_DT);
    else { if (s.tick % DECIDE_EVERY === 0) a = decide(s, w, act); step(s, actionToInput(a), SIM_DT); }
    for (const e of s.events) if (e.type === 'break' || e.type === 'enemyKill' || e.type === 'bossHit') breaks.push(s.time);
    if (s.tick % 12 !== 0) continue;
    while (breaks.length && breaks[0] < s.time - 0.8) breaks.shift();
    const held = s.tether.state === 'attached' ? s.shards.find((x) => x.id === s.tether.targetId) : undefined;
    const hs = held ? Math.hypot(held.vx, held.vy) : 0;
    const big = s.shards.filter((x) => x.tier >= 2).length;
    const en = s.enemies.length;
    const sc = (held ? 2 + Math.min(hs / 600, 2) * (held.tier >= 2 ? 1.5 : 1) : 0) + Math.min(breaks.length, 8) * 0.6 + Math.min(big, 8) * 0.3 + en * 0.8 + Math.min(s.combo, 10) * 0.15;
    rows.push({ t: s.time, sc, d: `held=${held ? held.tier : '-'} v=${hs.toFixed(0)} brk=${breaks.length} big=${big} en=${s.enemies.map((e) => e.kind[0]).join('')} combo=${s.combo} wave=${s.wave} score=${s.score} lives=${s.lives}` });
  }
  rows.sort((x, y) => y.sc - x.sc);
  const picked: typeof rows = [];
  for (const r of rows) if (picked.every((p) => Math.abs(p.t - r.t) > 3)) { picked.push(r); if (picked.length >= 12) break; }
  console.log(`== ${sp.name} (ended t=${s.time.toFixed(1)} phase=${s.phase} wave=${s.wave} score=${s.score})`);
  for (const p of picked.sort((x, y) => x.t - y.t)) console.log(`  t=${p.t.toFixed(1)} score=${p.sc.toFixed(2)} ${p.d}`);
}

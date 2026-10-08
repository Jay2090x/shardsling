/**
 * Finds notable moments in a replay (for picking honest clip times): combos, hits, lives lost, waves.
 *   npx tsx ai/moments.ts ai/runs/ep1 <checkpoint|popN> <seed> [maxSeconds]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runAgent } from './episode';

const [dir, ck, seedStr, maxStr] = process.argv.slice(2);
const w = ck.startsWith('pop')
  ? JSON.parse(readFileSync(join(dir, 'gen0_population.json'), 'utf8')).members[Number(ck.slice(3))].weights
  : JSON.parse(readFileSync(join(dir, 'checkpoints', `${ck}.json`), 'utf8')).weights;
const lines: string[] = [];
let lastCombo = 0;
let flingT = -9;
let firstThrowHit = -1;
let held = false;
const r = runAgent(Number(seedStr), w, {
  maxSeconds: Number(maxStr ?? 300),
  onStep: (s) => {
    const t = s.time.toFixed(2);
    for (const e of s.events) {
      if (e.type === 'fling') flingT = s.time;
      if (e.type === 'break' && e.points > 0) {
        if (!held && s.time - flingT < 1.6 && firstThrowHit < 0) {
          firstThrowHit = s.time;
          lines.push(`${t} FIRST THROW HIT`);
        }
        if (e.combo >= 5 && e.combo > lastCombo && e.combo % 5 === 0) lines.push(`${t} combo x${e.combo} score ${s.score}`);
        lastCombo = e.combo;
      }
      if (e.type === 'hurt') lines.push(`${t} HURT lives ${e.lives}`);
      if (e.type === 'clear') lines.push(`${t} CLEAR wave ${e.wave}`);
      if (e.type === 'wave') lines.push(`${t} WAVE ${e.wave}${e.boss ? ' BOSS' : ''}`);
      if (e.type === 'perk') lines.push(`${t} perk ${e.perk}`);
      if (e.type === 'enemyKill') lines.push(`${t} kill ${e.kind}`);
      if (e.type === 'gameover') lines.push(`${t} GAMEOVER ${e.score}`);
    }
    if (s.combo === 0) lastCombo = 0;
    held = s.tether.state === 'attached';
  },
});
console.log(lines.join('\n'));
console.log(JSON.stringify(r.stats));

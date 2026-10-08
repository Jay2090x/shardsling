/**
 * Offline audio mix for the videos: the game's own sound effects (ZzFX parameters copied from
 * src/audio/audio.ts, same event -> sound mapping) placed at the exact times the replayed simulation
 * produced them, plus the self-written soundtrack (score.ts). Rendered with OfflineAudioContext.
 */
import { buildSamples, ZZFX_RATE, type ZzfxParams } from '../../src/audio/zzfx';
import type { SimEvent } from '../../src/sim/types';
import { Score, type Section } from './score';

const SOUNDS = {
  fire: [0.25, 0, 1300, 0, 0.01, 0.05, 1, 2, -45],
  hook: [0.55, 0, 620, 0, 0.03, 0.11, 1, 1.8, 0, 0, 620, 0.04],
  fling: [0.55, 0, 110, 0.03, 0.04, 0.17, 4, 1.2, 14, 0, 0, 0, 0, 0.8, 0, 0, 0, 0.5],
  smash: [0.85, 0, 333, 0.005, 0.02, 0.35, 4, 1.9, 0, 0, 0, 0, 0, 0.5, 0, 0.6, 0, 0.4],
  clack: [0.18, 0, 1500, 0, 0, 0.03, 1, 3],
  hurt: [1, 0, 420, 0.01, 0.1, 0.45, 2, 1.6, -8, 0, 0, 0, 0, 0.4, 0, 0.2],
  chime: [0.4, 0, 880, 0.005, 0.05, 0.3, 1, 2],
  gameover: [0.8, 0, 220, 0.02, 0.35, 0.7, 2, 1.5, -1.5, 0, 0, 0, 0, 0.2, 0, 0, 0.12, 0.6],
  perk: [0.5, 0, 1675, 0, 0.06, 0.24, 1, 1.82, 0, 0, 837, 0.06],
  kill: [0.8, 0, 200, 0.005, 0.05, 0.4, 3, 2, -3, 0, 0, 0, 0, 0.6, 0, 0.3, 0, 0.5],
  bossHit: [1, 0, 90, 0.005, 0.06, 0.3, 4, 2, -1, 0, 0, 0, 0, 0.3, 0, 0.4, 0, 0.6],
  bossDown: [1, 0, 60, 0.01, 0.3, 1.4, 4, 2, 0, 0, 0, 0, 0, 0.6, 0, 0.5, 0.2, 0.5],
  charge: [0.32, 0, 180, 0.5, 0.35, 0.1, 2, 1, 3, 0, 0, 0, 0.07, 0, 0, 0, 0, 0.8, 0, 0.5, 1200],
  enemyFire: [0.4, 0, 520, 0, 0.02, 0.12, 2, 1, -25, 0, 0, 0, 0, 0.2],
  spawn: [0.3, 0, 90, 0.2, 0.1, 0.2, 1, 1, 8],
  blast: [0.55, 0, 120, 0.01, 0.03, 0.25, 4, 1, 0, 0, 0, 0, 0, 1],
} satisfies Record<string, ZzfxParams>;
type SoundName = keyof typeof SOUNDS;
// video mix: a little more spacing than in the game, the AI fires the hook far more often than people do
const MIN_GAP: Partial<Record<SoundName, number>> = { fling: 0.09, hook: 0.07,  smash: 0.03, clack: 0.06, kill: 0.04, fire: 0.05, bossHit: 0.05, blast: 0.08 };

export interface Cue {
  t: number;
  e: SimEvent;
  vol?: number;
}
export interface Accent {
  t: number;
  kind: 'whoosh' | 'chime' | 'perk' | 'hit';
  vol?: number;
}

let rs = 12345;
const rnd = () => {
  let t = (rs = (rs + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let outL: Float32Array | null = null;
let outR: Float32Array | null = null;

interface Play { name: SoundName; t: number; rate: number; vol: number }

async function render(spec: { total: number; sections: Section[]; cues: Cue[]; accents: Accent[]; musicVol?: number; sfxVol?: number }): Promise<number> {
  const sr = 48000;
  // 1) decide every sound once (min-gap filter + jitter), independent of the render windows
  const plays: Play[] = [];
  const last = new Map<SoundName, number>();
  const play = (name: SoundName, t: number, o: { rate?: number; vol?: number; delay?: number; jitter?: number } = {}) => {
    const gap = MIN_GAP[name];
    if (gap !== undefined && !o.delay) {
      const l = last.get(name) ?? -1;
      if (t - l < gap) return;
      last.set(name, t);
    }
    const j = o.jitter ?? 0.05;
    plays.push({ name, t: t + (o.delay ?? 0), rate: (o.rate ?? 1) * (1 + (rnd() * 2 - 1) * j), vol: o.vol ?? 1 });
  };
  const handle = (e: SimEvent, t: number, v: number) => {
    switch (e.type) {
      case 'fire': play('fire', t, { vol: 0.7 * v }); break;
      case 'attach': play('hook', t, { vol: v }); break;
      case 'fling': play('fling', t, { rate: Math.min(1.5, 0.8 + e.speed / 1600), vol: Math.min(1, 0.4 + e.speed / 1200) * v }); break;
      case 'break': {
        const rate = [1.6, 1.2, 0.95, 0.72][e.tier] * (1 + Math.min(e.combo, 10) * 0.035);
        play('smash', t, { rate, vol: (e.points > 0 || e.tier > 0 ? 1 : 0.5) * v });
        break;
      }
      case 'clack': play('clack', t, { vol: Math.min(1, e.speed / 400) * v }); break;
      case 'hurt': play('hurt', t, { vol: v }); break;
      case 'clear': [1, 1.26, 1.5, 2].forEach((r, i) => play('chime', t, { rate: r, delay: i * 0.075, jitter: 0, vol: v })); break;
      case 'perk': play('perk', t, { jitter: 0, vol: v }); break;
      case 'gameover':
        play('gameover', t, { jitter: 0, vol: v });
        [1, 0.84, 0.67].forEach((r, i) => play('chime', t, { rate: r * 0.5, delay: 0.15 + i * 0.18, jitter: 0, vol: 0.7 * v }));
        break;
      case 'enemyKill':
        if (e.kind === 'boss') {
          play('bossDown', t, { vol: v });
          [1, 1.26, 1.5, 2, 2.52].forEach((r, i) => play('chime', t, { rate: r, delay: 0.3 + i * 0.07, jitter: 0, vol: v }));
        } else play('kill', t, { rate: e.kind === 'prism' ? 1.3 : 1, vol: v });
        break;
      case 'bossHit': play('bossHit', t, { vol: v }); break;
      case 'charge': play('charge', t, { rate: e.kind === 'boss' ? 0.8 : 1.15, vol: (e.kind === 'boss' ? 1 : 0.6) * v, jitter: 0 }); break;
      case 'enemyFire': play('enemyFire', t, { rate: e.kind === 'boss' ? 0.7 : 1, vol: v }); break;
      case 'enemySpawn': play('spawn', t, { rate: e.kind === 'boss' ? 0.5 : 1, vol: (e.kind === 'boss' ? 1 : 0.6) * v }); break;
      case 'blast': play('blast', t, { vol: 0.6 * v }); break;
      default: break;
    }
  };
  const cues = spec.cues.slice().sort((a, b) => a.t - b.t);
  for (const c of cues) if (c.t >= 0 && c.t < spec.total - 0.05) handle(c.e, c.t, c.vol ?? 1);
  for (const a of spec.accents) {
    const v = a.vol ?? 1;
    if (a.kind === 'whoosh') play('fling', a.t, { rate: 0.7, vol: 0.5 * v, jitter: 0 });
    if (a.kind === 'chime') [1, 1.26, 1.5].forEach((r, i) => play('chime', a.t, { rate: r, delay: i * 0.08, jitter: 0, vol: 0.6 * v }));
    if (a.kind === 'perk') play('perk', a.t, { jitter: 0, vol: 0.6 * v });
    if (a.kind === 'hit') play('smash', a.t, { rate: 0.8, vol: 0.8 * v, jitter: 0 });
  }

  // 2) render in short windows with a pre-roll (tails, echo, compressor settle), then stitch
  const total = Math.ceil(spec.total * sr);
  outL = new Float32Array(total);
  outR = new Float32Array(total);
  const WIN = 20 * sr;
  const PRE = 4 * sr;
  const buffers = new Map<SoundName, Float32Array>();
  const samples = (name: SoundName) => {
    let d = buffers.get(name);
    if (!d) { d = buildSamples(SOUNDS[name] as ZzfxParams); buffers.set(name, d); }
    return d;
  };
  for (let w0 = 0; w0 < total; w0 += WIN) {
    const w1 = Math.min(total, w0 + WIN);
    const f0 = Math.max(0, w0 - PRE);
    const shift = f0 / sr;
    const ctx = new OfflineAudioContext(2, w1 - f0, sr);
    const master = ctx.createDynamicsCompressor();
    master.threshold.value = -10;
    master.ratio.value = 4;
    master.attack.value = 0.003;
    master.release.value = 0.15;
    master.connect(ctx.destination);
    const sfx = ctx.createGain();
    sfx.gain.value = spec.sfxVol ?? 0.55;
    sfx.connect(master);
    const musicBus = ctx.createGain();
    musicBus.gain.value = spec.musicVol ?? 0.5;
    musicBus.connect(master);
    rs = 777 + w0;
    new Score(ctx, musicBus, rnd).play(spec.sections, spec.total, shift, w1 / sr, shift);
    const bufs = new Map<SoundName, AudioBuffer>();
    for (const p of plays) {
      if (p.t < shift || p.t >= w1 / sr) continue;
      let b = bufs.get(p.name);
      if (!b) {
        const data = samples(p.name);
        b = ctx.createBuffer(1, Math.max(1, data.length), ZZFX_RATE);
        b.getChannelData(0).set(data);
        bufs.set(p.name, b);
      }
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = p.rate;
      const g = ctx.createGain();
      g.gain.value = p.vol;
      src.connect(g).connect(sfx);
      src.start(p.t - shift);
    }
    const r = await ctx.startRendering();
    outL.set(r.getChannelData(0).subarray(w0 - f0), w0);
    outR.set(r.getChannelData(1).subarray(w0 - f0), w0);
  }
  return total;
}

/** interleaved 16-bit PCM of [from, to) samples, base64 */
function chunk(from: number, to: number): string {
  const l = outL!;
  const r = outR!;
  const n = Math.max(0, Math.min(to, l.length) - from);
  const out = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = Math.max(-32768, Math.min(32767, Math.round(l[from + i] * 32767)));
    out[i * 2 + 1] = Math.max(-32768, Math.min(32767, Math.round(r[from + i] * 32767)));
  }
  const bytes = new Uint8Array(out.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

(window as unknown as Record<string, unknown>).mixer = { render, chunk };
(window as unknown as Record<string, unknown>).mixerReady = true;

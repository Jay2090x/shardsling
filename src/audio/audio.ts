/**
 * Sound for Shardsling: ZzFX-generated effects + the procedural music loop.
 * Lives outside src/sim: it only listens to simulation events.
 *
 * Browser rules handled here:
 *  - no AudioContext before the first user gesture (pointerdown / keydown / touchend unlock it, iOS-safe)
 *  - suspend() while paused or hidden, resume() on the next gesture / RESUME
 *  - mute is remembered in localStorage
 */
import type { SimEvent } from '../sim/types';
import { loadMuted, saveMuted } from '../storage';
import { Music } from './music';
import { buildSamples, ZZFX_RATE, type ZzfxParams } from './zzfx';

// [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide, pitchJump,
//  pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]
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
export type SoundName = keyof typeof SOUNDS;

const MIN_GAP: Partial<Record<SoundName, number>> = { smash: 0.03, clack: 0.06, kill: 0.04, fire: 0.05, bossHit: 0.05, blast: 0.08 };
const MAX_VOICES = 14;

export class GameAudio {
  ctx: AudioContext | null = null;
  muted = loadMuted();
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: Music | null = null;
  private buffers = new Map<SoundName, AudioBuffer>();
  private lastPlayed = new Map<SoundName, number>();
  private voices = 0;
  /** what the game wants (applied as soon as a context exists) */
  private active = true;
  private wantMusic = false;
  private musicIntensity = 0;

  constructor() {
    const unlock = () => this.unlock();
    // capture phase: runs before the game's own handlers, so the context exists when PLAY starts the music
    for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  /** Called on every user gesture: creates/resumes the AudioContext (iOS only allows this inside a gesture). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.55;
      this.sfx.connect(this.master);
      const musicBus = this.ctx.createGain();
      musicBus.gain.value = 0.5;
      musicBus.connect(this.master);
      this.music = new Music(this.ctx, musicBus);
      this.music.intensity = this.musicIntensity;
      // iOS: a (silent) buffer started inside the gesture unlocks output
      const b = this.ctx.createBufferSource();
      b.buffer = this.ctx.createBuffer(1, 1, 22050);
      b.connect(this.ctx.destination);
      b.start(0);
      if (this.wantMusic) this.music.start();
    }
    if (this.active && this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
  }

  /** false while paused / tab hidden: everything goes silent (context suspended). */
  setActive(on: boolean): void {
    this.active = on;
    if (!this.ctx) return;
    if (on) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
    } else if (this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => undefined);
    }
  }

  get running(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  setMuted(m: boolean): void {
    this.muted = m;
    saveMuted(m);
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0 : 1, t, 0.03);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  startMusic(): void {
    this.wantMusic = true;
    this.music?.start();
  }

  stopMusic(fade = 0.5): void {
    this.wantMusic = false;
    this.music?.stop(fade);
  }

  get musicPlaying(): boolean {
    return this.music?.playing ?? false;
  }

  setIntensity(level: number): void {
    this.musicIntensity = level;
    if (this.music) this.music.intensity = level;
  }

  private buffer(name: SoundName): AudioBuffer | null {
    if (!this.ctx) return null;
    let b = this.buffers.get(name);
    if (!b) {
      const data = buildSamples(SOUNDS[name]);
      b = this.ctx.createBuffer(1, Math.max(1, data.length), ZZFX_RATE);
      b.getChannelData(0).set(data);
      this.buffers.set(name, b);
    }
    return b;
  }

  play(name: SoundName, opts: { rate?: number; vol?: number; delay?: number; jitter?: number } = {}): void {
    if (!this.ctx || !this.sfx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const gap = MIN_GAP[name];
    if (gap !== undefined && !opts.delay) {
      const last = this.lastPlayed.get(name) ?? -1;
      if (now - last < gap) return;
      this.lastPlayed.set(name, now);
    }
    if (this.voices >= MAX_VOICES) return;
    const buf = this.buffer(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const j = opts.jitter ?? 0.05;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j);
    const g = this.ctx.createGain();
    g.gain.value = opts.vol ?? 1;
    src.connect(g).connect(this.sfx);
    this.voices++;
    src.onended = () => {
      this.voices--;
      g.disconnect();
    };
    src.start(now + (opts.delay ?? 0));
  }

  /** Maps simulation events to sounds. */
  handle(e: SimEvent): void {
    switch (e.type) {
      case 'fire':
        this.play('fire', { vol: 0.7 });
        break;
      case 'attach':
        this.play('hook');
        break;
      case 'fling':
        this.play('fling', { rate: Math.min(1.5, 0.8 + e.speed / 1600), vol: Math.min(1, 0.4 + e.speed / 1200) });
        break;
      case 'break': {
        const rate = [1.6, 1.2, 0.95, 0.72][e.tier] * (1 + Math.min(e.combo, 10) * 0.035);
        this.play('smash', { rate, vol: e.points > 0 || e.tier > 0 ? 1 : 0.5 });
        break;
      }
      case 'clack':
        this.play('clack', { vol: Math.min(1, e.speed / 400) });
        break;
      case 'hurt':
        this.play('hurt');
        break;
      case 'clear':
        [1, 1.26, 1.5, 2].forEach((r, i) => this.play('chime', { rate: r, delay: i * 0.075, jitter: 0 }));
        break;
      case 'perk':
        this.play('perk', { jitter: 0 });
        break;
      case 'gameover':
        this.play('gameover', { jitter: 0 });
        [1, 0.84, 0.67].forEach((r, i) => this.play('chime', { rate: r * 0.5, delay: 0.15 + i * 0.18, jitter: 0, vol: 0.7 }));
        break;
      case 'enemyKill':
        if (e.kind === 'boss') {
          this.play('bossDown');
          [1, 1.26, 1.5, 2, 2.52].forEach((r, i) => this.play('chime', { rate: r, delay: 0.3 + i * 0.07, jitter: 0 }));
        } else this.play('kill', { rate: e.kind === 'prism' ? 1.3 : 1 });
        break;
      case 'bossHit':
        this.play('bossHit');
        break;
      case 'charge':
        this.play('charge', { rate: e.kind === 'boss' ? 0.8 : 1.15, vol: e.kind === 'boss' ? 1 : 0.6, jitter: 0 });
        break;
      case 'enemyFire':
        this.play('enemyFire', { rate: e.kind === 'boss' ? 0.7 : 1 });
        break;
      case 'enemySpawn':
        this.play('spawn', { rate: e.kind === 'boss' ? 0.5 : 1, vol: e.kind === 'boss' ? 1 : 0.6 });
        break;
      case 'blast':
        this.play('blast', { vol: 0.6 });
        break;
      default:
        break;
    }
  }
}

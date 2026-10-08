/**
 * Soundtrack for the videos: the game's own synthwave loop (src/audio/music.ts, same instruments and
 * A-minor progression at 112 BPM) re-arranged into sections, plus a second, calmer progression.
 * Self-written, no samples, no third-party music. Rendered offline (OfflineAudioContext).
 */
const BPM = 112;
export const STEP = 60 / BPM / 4;
export const BAR = STEP * 16;
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// progression A = the game's loop: Am F C G Am F Dm E
const PROG_A = {
  bass: [45, 41, 48, 43, 45, 41, 38, 40],
  chords: [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62], [57, 60, 64], [57, 60, 65], [57, 62, 65], [56, 59, 64]],
};
// progression B (new, calmer): F G Em Am  F G Am Am
const PROG_B = {
  bass: [41, 43, 40, 45, 41, 43, 45, 45],
  chords: [[57, 60, 65], [55, 59, 62], [55, 59, 64], [57, 60, 64], [57, 60, 65], [55, 59, 62], [57, 60, 64], [57, 60, 64]],
};
const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 2, 3, 4, 3];

export interface Section {
  t0: number;
  t1: number;
  prog?: 'A' | 'B';
  bass?: boolean;
  pad?: boolean;
  arp?: boolean;
  drums?: boolean;
  hats?: boolean;
  boss?: boolean;
  vol?: number;
}

export class Score {
  private out: GainNode;
  private echo: GainNode;
  private noise: AudioBuffer;
  constructor(
    private ctx: BaseAudioContext,
    dest: AudioNode,
    private rnd: () => number,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    this.echo = ctx.createGain();
    this.echo.gain.value = 0.3;
    this.echo.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(this.out);
    const len = ctx.sampleRate * 0.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = rnd() * 2 - 1;
  }

  /**
   * Schedule the arrangement (sections aligned to the bar grid starting at t=0). Only steps with
   * absolute time in [from, to) are scheduled, at (t - shift) in this context's timeline, so a long
   * mix can be rendered in short windows (a huge OfflineAudioContext graph is extremely slow).
   */
  play(sections: Section[], total: number, from = 0, to = total, shift = 0): void {
    const g = this.out.gain;
    const at = (t: number) => Math.max(0, t - shift);
    g.setValueAtTime(0, 0);
    let lastVol = 0;
    for (const s of sections) {
      const v = s.vol ?? 1;
      g.setValueAtTime(lastVol, at(s.t0));
      g.linearRampToValueAtTime(v, at(s.t0 + 0.8));
      lastVol = v;
    }
    g.setValueAtTime(lastVol, at(total - 2.5));
    g.linearRampToValueAtTime(0, at(total - 0.2));
    const steps = Math.ceil(total / STEP);
    for (let i = 0; i < steps; i++) {
      const t = i * STEP;
      if (t < from || t >= to) continue;
      const sec = sections.find((s) => t >= s.t0 && t < s.t1);
      if (!sec) continue;
      this.playStep(i, t - shift, sec);
    }
  }

  private playStep(i: number, t: number, sec: Section): void {
    const p = sec.prog === 'B' ? PROG_B : PROG_A;
    const bar = Math.floor(i / 16) % 8;
    const st = i % 16;
    const boss = !!sec.boss;
    if (sec.bass !== false && st % 2 === 0) this.bass(midi(p.bass[bar] - 12 + (st % 4 === 2 ? 12 : 0)), t, STEP * 1.7, boss);
    if (sec.pad !== false && st === 0) for (const n of p.chords[bar]) this.pad(midi(n - 12), t, STEP * 16);
    if (sec.arp !== false && !(bar % 2 === 1 && st === 15)) {
      const chord = p.chords[bar];
      const k = ARP[st];
      this.pluck(midi(chord[k % 3] + 12 * Math.floor(k / 3) + 12), t, st % 4 === 0 ? 0.075 : 0.05);
    }
    if (sec.drums) {
      if (st === 0 || st === 8 || (boss && (st === 4 || st === 12))) this.kick(t);
      if (st === 4 || st === 12) this.snare(t);
    }
    if (sec.drums || sec.hats) {
      if (st % 4 === 2) this.hat(t, 0.05);
      if (boss && st % 2 === 1) this.hat(t, 0.02);
    }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  private bass(f: number, t: number, dur: number, bright: boolean): void {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 6;
    flt.frequency.setValueAtTime(bright ? 1400 : 900, t);
    flt.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.16, 0.005, dur);
    o.connect(flt).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  private pad(f: number, t: number, dur: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.022, t + 0.4);
    g.gain.setValueAtTime(0.022, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 1100;
    flt.connect(g).connect(this.out);
    for (const det of [-7, 7]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(flt);
      o.start(t);
      o.stop(t + dur + 0.25);
    }
  }
  private pluck(f: number, t: number, vol: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(3200, t);
    flt.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    const g = this.ctx.createGain();
    this.env(g, t, vol * 0.5, 0.004, 0.18);
    o.connect(flt).connect(g);
    g.connect(this.out);
    g.connect(this.echo);
    o.start(t);
    o.stop(t + 0.2);
  }
  private kick(t: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = this.ctx.createGain();
    this.env(g, t, 0.34, 0.003, 0.24);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.26);
  }
  private noiseHit(t: number, type: BiquadFilterType, freq: number, vol: number, dur: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = freq;
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.002, dur);
    src.connect(flt).connect(g).connect(this.out);
    src.start(t, this.rnd() * 0.3);
    src.stop(t + dur + 0.02);
  }
  private hat(t: number, vol: number): void {
    this.noiseHit(t, 'highpass', 7500, vol, 0.045);
  }
  private snare(t: number): void {
    this.noiseHit(t, 'bandpass', 1800, 0.07, 0.16);
  }
}

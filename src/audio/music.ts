/**
 * Small self-written synthwave loop (Web Audio oscillators, no samples, no external files).
 * 8 bars in A minor at 112 BPM: octave-bouncing saw bass, soft pad, plucky arpeggio with echo,
 * kick + offbeat hats. A lookahead scheduler queues notes slightly ahead of the audio clock, so it
 * pauses by itself when the AudioContext is suspended.
 */
const BPM = 112;
const STEP = 60 / BPM / 4; // 16th note
const STEPS_PER_BAR = 16;
const BARS = 8;

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

// bass roots and triads for each bar: Am F C G Am F Dm E
const BASS = [45, 41, 48, 43, 45, 41, 38, 40];
const CHORDS = [
  [57, 60, 64],
  [57, 60, 65],
  [55, 60, 64],
  [55, 59, 62],
  [57, 60, 64],
  [57, 60, 65],
  [57, 62, 65],
  [56, 59, 64],
];
const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 2, 3, 4, 3];

export class Music {
  private out: GainNode;
  private echo: GainNode;
  private noise: AudioBuffer;
  private timer: number | null = null;
  private nextTime = 0;
  private stepIndex = 0;
  /** 0 = normal, 1 = boss (four-on-the-floor, brighter bass) */
  intensity = 0;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    // feedback echo for the arpeggio (3/16 note)
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
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  start(volume = 1): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(volume, t + 0.6);
    if (this.timer !== null) return;
    this.stepIndex = 0;
    this.nextTime = t + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 40);
    this.schedule();
  }

  stop(fade = 0.5): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + fade);
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    const ahead = this.ctx.currentTime + 0.18;
    // after a long suspend/hitch, don't try to catch up on missed notes
    if (this.nextTime < this.ctx.currentTime - 0.1) this.nextTime = this.ctx.currentTime + 0.02;
    while (this.nextTime < ahead) {
      this.playStep(this.stepIndex, this.nextTime);
      this.stepIndex = (this.stepIndex + 1) % (STEPS_PER_BAR * BARS);
      this.nextTime += STEP;
    }
  }

  private playStep(i: number, t: number): void {
    const bar = Math.floor(i / STEPS_PER_BAR);
    const st = i % STEPS_PER_BAR;
    const boss = this.intensity > 0;
    // bass: 8ths, root / octave bounce
    if (st % 2 === 0) {
      const n = BASS[bar] - 12 + (st % 4 === 2 ? 12 : 0);
      this.bass(midi(n), t, STEP * 1.7, boss);
    }
    // pad: once per bar
    if (st === 0) for (const n of CHORDS[bar]) this.pad(midi(n - 12), t, STEP * STEPS_PER_BAR);
    // arpeggio (16ths), rests on the last step of every second bar
    if (!(bar % 2 === 1 && st === 15)) {
      const chord = CHORDS[bar];
      const k = ARP[st];
      const n = chord[k % 3] + 12 * Math.floor(k / 3) + 12;
      this.pluck(midi(n), t, st % 4 === 0 ? 0.075 : 0.05);
    }
    // drums
    if (st === 0 || st === 8 || (boss && (st === 4 || st === 12))) this.kick(t);
    if (st % 4 === 2) this.hat(t, 0.05);
    if (boss && st % 2 === 1) this.hat(t, 0.02);
    if (st === 4 || st === 12) this.snare(t);
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
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }

  private hat(t: number, vol: number): void {
    this.noiseHit(t, 'highpass', 7500, vol, 0.045);
  }

  private snare(t: number): void {
    this.noiseHit(t, 'bandpass', 1800, 0.07, 0.16);
  }
}

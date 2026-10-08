/** One replayed game: the real simulation + the real game renderer, driven by a trained network. */
import { Effects } from '../../src/render/fx';
import { Renderer } from '../../src/render/renderer';
import { ARENA_H, ARENA_W, SIM_DT } from '../../src/sim/constants';
import { choosePerk, createGame, perkOfferReady, pickTarget, step } from '../../src/sim/sim';
import type { GameState, SimEvent } from '../../src/sim/types';
import { actionToInput, decide, DECIDE_EVERY, makeActivations, type Activations } from '../../ai/brain';

export interface TimedEvent {
  t: number;
  e: SimEvent;
}

export class Run {
  state: GameState;
  act: Activations = makeActivations();
  fx = new Effects();
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  action = 0;
  actions: number[] = [];
  events: TimedEvent[] = [];
  private acc = 0;
  renderTime = 0;
  /** suppress fx while seeking */
  private quiet = false;
  /** scene clock (seconds) used to timestamp events for the audio mix */
  clock = 0;
  deadFor = 0;
  /** draw the game's HUD (score, lives, wave) */
  hud = true;
  /** suppress every text the game renderer draws (score popups, labels): store covers may only show the title */
  noText = false;

  constructor(
    readonly seed: number,
    readonly weights: ArrayLike<number>,
    w: number,
    h: number,
  ) {
    this.state = createGame(seed, 'play');
    this.canvas = document.createElement('canvas');
    this.renderer = new Renderer(this.canvas);
    this.setSize(w, h);
  }

  setSize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
    const margin = 2;
    const scale = Math.min((w - margin * 2) / ARENA_W, (h - margin * 2) / ARENA_H);
    const r = this.renderer as unknown as { cssW: number; cssH: number; view: { scale: number; offX: number; offY: number; dpr: number } };
    r.cssW = w;
    r.cssH = h;
    r.view = { scale, dpr: 1, offX: (w - ARENA_W * scale) / 2, offY: (h - ARENA_H * scale) / 2 };
  }

  /** camera: arena point (x0, y0) at the canvas top-left, `scale` canvas px per arena unit */
  setCamera(x0: number, y0: number, scale: number): void {
    const r = this.renderer as unknown as { view: { scale: number; offX: number; offY: number; dpr: number } };
    r.view = { scale, dpr: 1, offX: -x0 * scale, offY: -y0 * scale };
  }

  private tick(): void {
    const s = this.state;
    if (s.phase !== 'playing') {
      this.deadFor += SIM_DT;
      step(s, actionToInput(0), SIM_DT);
      return;
    }
    if (perkOfferReady(s)) choosePerk(s, 0);
    if (s.tick % DECIDE_EVERY === 0) {
      this.action = decide(s, this.weights, this.act);
      this.actions.push(this.action);
    }
    step(s, actionToInput(this.action), SIM_DT);
    if (!this.quiet) {
      for (const e of s.events) {
        this.fx.handle(e);
        this.events.push({ t: this.clock, e });
      }
      this.fx.spotlight = 0; // the "YOU" label is for human players
    }
  }

  /** fast-forward to sim time `seconds` without effects */
  seek(seconds: number): void {
    this.quiet = true;
    const target = Math.round(seconds / SIM_DT);
    while (this.state.tick < target && this.state.phase === 'playing') this.tick();
    this.quiet = false;
    this.fx.clear();
    this.renderTime = this.state.time;
  }

  /** advance by one video frame at `speed` x real time */
  advance(frameDt: number, speed: number): void {
    this.acc += (frameDt * speed) / SIM_DT;
    while (this.acc >= 1 - 1e-9) {
      this.tick();
      this.acc -= 1;
    }
    this.fx.update(frameDt * Math.min(speed, 1.5));
    this.renderTime += frameDt * speed;
  }

  protected alpha(): number {
    return Math.min(1, Math.max(0, this.acc));
  }

  render(): HTMLCanvasElement {
    const s = this.state;
    const alpha = this.alpha();
    let preview = null;
    if (s.phase === 'playing' && s.tether.state === 'idle') {
      const hook = (this.action & 1) === 1;
      const t = pickTarget(s, { moveX: 0, moveY: 0, hook, aimX: null, aimY: null });
      preview = { targetId: t ? t.id : -1, hookHeld: hook };
    }
    const c2 = this.canvas.getContext('2d')!;
    if (this.noText) {
      c2.fillText = () => {};
      c2.strokeText = () => {};
    }
    this.renderer.render(s, alpha, this.fx, this.renderTime, this.hud, preview, null);
    if (this.noText) {
      delete (c2 as unknown as Record<string, unknown>).fillText;
      delete (c2 as unknown as Record<string, unknown>).strokeText;
    }
    return this.canvas;
  }

  /** arena -> canvas pixel transform of this run's viewport */
  toCanvas(x: number, y: number): { x: number; y: number; scale: number } {
    const v = (this.renderer as unknown as { view: { scale: number; offX: number; offY: number } }).view;
    return { x: v.offX + x * v.scale, y: v.offY + y * v.scale, scale: v.scale };
  }
}

/** Frames precomputed in Node (ai/trace.ts): the browser only draws them. */
export interface TraceData {
  weights: number[];
  frames: {
    state: GameState;
    events: SimEvent[];
    alpha: number;
    renderTime: number;
    action: number;
    input: number[];
    hidden: number[];
    output: number[];
  }[];
}

export class TraceRun extends Run {
  private i = 0;
  private alphaT = 1;
  constructor(
    private trace: TraceData,
    seed: number,
    w: number,
    h: number,
  ) {
    super(seed, trace.weights, w, h);
    this.state = trace.frames[0].state;
    this.state.events = [];
  }
  override seek(): void {}
  override advance(frameDt: number, speed: number): void {
    const f = this.trace.frames[Math.min(this.i, this.trace.frames.length - 1)];
    this.i++;
    this.state = f.state;
    this.state.events = [];
    for (const e of f.events) {
      this.fx.handle(e);
      this.events.push({ t: this.clock, e });
    }
    this.fx.spotlight = 0;
    this.fx.update(frameDt * Math.min(speed, 1.5));
    this.renderTime = f.renderTime;
    this.alphaT = f.alpha;
    this.action = f.action;
    this.act.input.set(f.input);
    this.act.hidden.set(f.hidden);
    this.act.output.set(f.output);
  }
  protected override alpha(): number {
    return this.alphaT;
  }
}

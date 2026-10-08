/**
 * Video director: renders the scenes of an episode frame by frame (driven by Playwright from
 * video/render.mjs). Every gameplay frame is the real game renderer drawing a real, deterministic
 * replay of a trained network (seed + weights). Nothing is staged.
 */
import '../../src/fonts.css';
import { ARENA_W, ARENA_H } from '../../src/sim/constants';
import { INPUT_LABELS, N_HID, N_IN, N_OUT, N_WEIGHTS } from '../../ai/brain';
import { drawBrain } from './brainview';
import { Run, TraceRun, type TimedEvent, type TraceData } from './run';
import { B, B5, C, ease, fadeWin, glowText, H, H7, panel, roundRect, wrap } from './style';

export interface Caption {
  t0: number;
  t1: number;
  text: string;
  sub?: string;
  pos?: 'bottom' | 'top' | 'center';
  color?: string;
  size?: number;
}
export interface RunSpec {
  file: string;
  member?: number;
  seed: number;
  start?: number;
  /** playback speed, constant or piecewise [{t, speed}] in scene seconds */
  speed?: number | { t: number; speed: number }[];
  label?: string;
  sub?: string;
  color?: string;
  /** URL of a Node-computed per-frame trace (set by render.mjs); the director then only draws */
  trace?: string;
}
export interface Mark {
  t0: number;
  t1: number;
  /** what to circle: the drone, the crystal on the rope */
  target: 'drone' | 'held';
  label?: string;
  color?: string;
}
export interface Scene {
  id: string;
  kind: 'title' | 'game' | 'split' | 'grid' | 'chart' | 'net' | 'end' | 'card' | 'stack' | 'thumb' | 'cover';
  dur: number;
  captions?: Caption[];
  run?: RunSpec;
  runs?: RunSpec[];
  layout?: 'full' | 'brain' | 'inset';
  marks?: Mark[];
  cols?: number;
  rows?: number;
  data?: Record<string, unknown>;
  /** which run's sound effects go into the mix (default: all runs, quieter for many) */
  audio?: 'all' | 'first' | 'none';
  /** draw background: optional blurred run behind title/card */
  bgRun?: RunSpec;
  fadeIn?: number;
  fadeOut?: number;
}

const QS = new URLSearchParams(location.search);
const W = Number(QS.get('w') ?? 1920);
const HGT = Number(QS.get('h') ?? 1080);
const FPS = Number(QS.get('fps') ?? 60);
const PNG = QS.has('png');
const canvas = document.getElementById('out') as HTMLCanvasElement;
canvas.width = W;
canvas.height = HGT;
const ctx = canvas.getContext('2d', { alpha: false })!;

// deterministic cosmetics (particles use Math.random)
let rs = 1;
Math.random = () => {
  let t = (rs = (rs + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const cache = new Map<string, unknown>();
async function getJson(url: string): Promise<any> {
  if (!cache.has(url)) cache.set(url, await (await fetch(url)).json());
  return cache.get(url);
}
async function weightsOf(spec: RunSpec): Promise<number[]> {
  const j = await getJson(spec.file);
  const w = spec.member !== undefined ? j.members[spec.member].weights : j.weights;
  if (w.length !== N_WEIGHTS) throw new Error('bad weights ' + spec.file);
  return w;
}
function speedAt(spec: RunSpec, t: number): number {
  const s = spec.speed;
  if (s === undefined) return 1;
  if (typeof s === 'number') return s;
  let v = s[0].speed;
  for (const p of s) if (t >= p.t) v = p.speed;
  return v;
}

let scene: Scene;
let runs: Run[] = [];
let bg: Run | null = null;
let frameNo = 0;
let csvRows: Record<string, number>[] = [];

async function makeRun(spec: RunSpec, w: number, h: number): Promise<Run> {
  if (spec.trace) {
    const data = (await (await fetch(spec.trace)).json()) as TraceData;
    return new TraceRun(data, spec.seed, w, h);
  }
  const r = new Run(spec.seed, await weightsOf(spec), w, h);
  if (spec.start) r.seek(spec.start);
  return r;
}

async function load(sc: Scene): Promise<{ frames: number }> {
  scene = sc;
  frameNo = 0;
  rs = 0x9e3779b9 ^ hash(sc.id);
  runs = [];
  bg = null;
  await document.fonts.load('900 40px Orbitron');
  await document.fonts.load('700 40px Orbitron');
  await document.fonts.load('700 40px Rajdhani');
  await document.fonts.load('500 40px Rajdhani');
  const L = layoutOf(sc);
  if ((sc.kind === 'game' || sc.kind === 'thumb' || sc.kind === 'cover') && sc.run) runs = [await makeRun(sc.run, L.vw, L.vh)];
  if (sc.kind === 'cover') await coverInit(sc);
  if (sc.kind === 'stack' && sc.runs) runs = await Promise.all(sc.runs.map((r) => makeRun(r, W, Math.round((W * 9) / 16))));
  if (sc.kind === 'split' && sc.runs) runs = await Promise.all(sc.runs.map((r) => makeRun(r, 940, 529)));
  if (sc.kind === 'grid' && sc.runs) {
    const cols = sc.cols ?? 4;
    const rows = sc.rows ?? 3;
    const cw = Math.floor((W - 40 - (cols - 1) * 12) / cols);
    const ch = Math.floor((cw * 9) / 16);
    void rows;
    runs = await Promise.all(sc.runs.map((r) => makeRun(r, cw, ch)));
  }
  if (sc.bgRun) bg = await makeRun(sc.bgRun, W, HGT);
  if (sc.kind === 'chart' && csvRows.length === 0) {
    const txt = await (await fetch(String(sc.data?.csv))).text();
    const [head, ...lines] = txt.trim().split('\n');
    const keys = head.split(',');
    csvRows = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [keys[i], Number(v)])));
  }
  if (sc.kind === 'net' && sc.run) runs = [await makeRun(sc.run, 10, 10)];
  return { frames: Math.round(sc.dur * FPS) };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function layoutOf(sc: Scene): { vx: number; vy: number; vw: number; vh: number } {
  if (sc.kind === 'game' && sc.layout === 'brain') return { vx: 24, vy: 130, vw: 1328, vh: 747 };
  return { vx: 0, vy: 0, vw: W, vh: HGT };
}

// ------------------------------------------------------------------ frame
function frame(): string {
  const t = frameNo / FPS;
  const dt = 1 / FPS;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, HGT);
  const sc = scene;

  if (bg) {
    bg.clock = t;
    bg.advance(dt, speedAt(sc.bgRun!, t));
    const c = bg.render();
    ctx.save();
    ctx.filter = 'blur(7px) brightness(0.45)';
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  switch (sc.kind) {
    case 'game':
      drawGame(t, dt);
      break;
    case 'split':
      drawSplit(t, dt);
      break;
    case 'grid':
      drawGrid(t, dt);
      break;
    case 'chart':
      drawChart(t);
      break;
    case 'net':
      drawNet(t, dt);
      break;
    case 'stack':
      drawStack(t, dt);
      break;
    case 'thumb':
      drawThumb(t, dt);
      break;
    case 'cover':
      drawCover(t, dt);
      break;
    case 'title':
      drawTitle(t);
      break;
    case 'card':
      drawCard(t);
      break;
    case 'end':
      drawEnd(t);
      break;
  }
  for (const c of sc.captions ?? []) drawCaption(c, t);

  // scene fades
  const fi = sc.fadeIn ?? 0;
  const fo = sc.fadeOut ?? 0;
  let k = 1;
  if (fi > 0 && t < fi) k = Math.min(k, t / fi);
  if (fo > 0 && t > sc.dur - fo) k = Math.min(k, (sc.dur - t) / fo);
  if (k < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - ease(k)})`;
    ctx.fillRect(0, 0, W, HGT);
  }
  frameNo++;
  return PNG ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.93);
}

function tag(x: number, y: number, title: string, sub: string | undefined, color: string, align: 'left' | 'right' = 'left'): void {
  ctx.save();
  ctx.font = H7(26);
  const w1 = ctx.measureText(title).width;
  ctx.font = B5(24);
  const w2 = sub ? ctx.measureText(sub).width : 0;
  const w = Math.max(w1, w2) + 40;
  const h = sub ? 84 : 52;
  const px = align === 'left' ? x : x - w;
  panel(ctx, px, y, w, h, color);
  glowText(ctx, title, px + 20, y + 28, { font: H7(26), color, align: 'left', glow: 10 });
  if (sub) glowText(ctx, sub, px + 20, y + 62, { font: B5(24), color: C.text, align: 'left', glow: 0 });
  ctx.restore();
}

function drawRunInto(r: Run, x: number, y: number, w: number, h: number): void {
  ctx.drawImage(r.render(), x, y, w, h);
}

function drawGame(t: number, dt: number): void {
  const sc = scene;
  const r = runs[0];
  const spec = sc.run!;
  const sp = speedAt(spec, t);
  r.clock = t;
  r.advance(dt, sp);
  const L = layoutOf(sc);
  if (sc.layout === 'brain') {
    ctx.save();
    ctx.strokeStyle = 'rgba(34,229,255,0.25)';
    ctx.strokeRect(L.vx - 1, L.vy - 1, L.vw + 2, L.vh + 2);
    ctx.restore();
  }
  drawRunInto(r, L.vx, L.vy, L.vw, L.vh);
  // marks
  for (const m of sc.marks ?? []) {
    const a = fadeWin(t, m.t0, m.t1, 0.25);
    if (a <= 0) continue;
    const s = r.state;
    let wx = s.drone.x;
    let wy = s.drone.y;
    let rad = 46;
    if (m.target === 'held') {
      const held = s.tether.state === 'attached' ? s.shards.find((q) => q.id === s.tether.targetId) : undefined;
      if (!held) continue;
      wx = held.x;
      wy = held.y;
      rad = held.r + 24;
    }
    const p = r.toCanvas(wx, wy);
    const cx = L.vx + (p.x * L.vw) / r.canvas.width;
    const cy = L.vy + (p.y * L.vh) / r.canvas.height;
    const rr = rad * p.scale * (L.vw / r.canvas.width) + 6 + Math.sin(t * 6) * 3;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = m.color ?? C.yellow;
    ctx.shadowColor = m.color ?? C.yellow;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = -t * 40;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (m.label) glowText(ctx, m.label, cx, cy - rr - 26, { font: H7(26), color: m.color ?? C.yellow, alpha: a, stroke: true, glow: 10 });
  }
  if (sc.layout === 'brain') {
    drawBrain(ctx, 1376, 130, 520, 747, r.weights, r.act, r.action);
  }
  if (spec.label) {
    if (sc.layout === 'brain') tag(24, 26, spec.label, spec.sub, spec.color ?? C.cyan);
    else tag(W - 30, 110, spec.label, spec.sub, spec.color ?? C.cyan, 'right');
  }
  speedTag(sp, sc.layout === 'brain' ? 1352 : W - 30, sc.layout === 'brain' ? 900 : 1040);
}

function speedTag(sp: number, x: number, y: number): void {
  if (Math.abs(sp - 1) < 0.01) return;
  const txt = sp < 1 ? `SLOW MOTION ${sp}x` : `${sp}x SPEED`;
  glowText(ctx, txt, x, y, { font: H7(22), color: sp < 1 ? C.cyan : C.dim, align: 'right', glow: 8, stroke: true });
}

function drawSplit(t: number, dt: number): void {
  const sc = scene;
  const xs = [13, 967];
  const y = 200;
  runs.forEach((r, i) => {
    const spec = sc.runs![i];
    r.clock = t;
    r.advance(dt, speedAt(spec, t));
    ctx.save();
    ctx.shadowColor = spec.color ?? C.cyan;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = spec.color ?? C.cyan;
    ctx.lineWidth = 3;
    ctx.strokeRect(xs[i] - 2, y - 2, 944, 533);
    ctx.restore();
    drawRunInto(r, xs[i], y, 940, 529);
    glowText(ctx, spec.label ?? '', xs[i] + 470, y - 70, { font: H(40), color: spec.color ?? C.cyan, glow: 18 });
    if (spec.sub) glowText(ctx, spec.sub, xs[i] + 470, y - 26, { font: B5(28), color: C.text, glow: 0 });
    // live stats under each side
    const s = r.state;
    const status = s.phase === 'gameover' ? 'GAME OVER' : `${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left`;
    glowText(ctx, `SCORE ${s.score}   ·   SMASHES ${s.breaks}   ·   ${status}`, xs[i] + 470, y + 529 + 44, {
      font: H7(24),
      color: s.phase === 'gameover' ? C.red : C.text,
      glow: 6,
    });
  });
  speedTag(speedAt(sc.runs![0], t), W - 30, 830);
}

function drawGrid(t: number, dt: number): void {
  const sc = scene;
  const cols = sc.cols ?? 4;
  const cw = runs[0].canvas.width;
  const ch = runs[0].canvas.height;
  const totalH = (sc.rows ?? 3) * ch + ((sc.rows ?? 3) - 1) * 12;
  const y0 = Math.max(120, (HGT - totalH) / 2 + 30);
  runs.forEach((r, i) => {
    r.clock = t;
    r.advance(dt, speedAt(sc.runs![i], t));
    const x = 20 + (i % cols) * (cw + 12);
    const y = y0 + Math.floor(i / cols) * (ch + 12);
    ctx.drawImage(r.render(), x, y);
    ctx.strokeStyle = r.state.phase === 'gameover' ? 'rgba(255,59,92,0.7)' : 'rgba(34,229,255,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cw, ch);
    if (r.state.phase === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x, y, cw, ch);
      glowText(ctx, 'DEAD', x + cw / 2, y + ch / 2, { font: H(34), color: C.red });
    }
    if (sc.runs![i].label) glowText(ctx, sc.runs![i].label!, x + cw - 12, y + ch - 18, { font: H7(16), color: C.dim, align: 'right', glow: 0 });
  });
  if (sc.data?.title) glowText(ctx, String(sc.data.title), W / 2, 62, { font: H(46), color: String(sc.data.color ?? C.cyan) });
}

// ------------------------------------------------------------------ portrait (Shorts): two runs stacked
function drawStack(t: number, dt: number): void {
  const sc = scene;
  const vh = Math.round((W * 9) / 16);
  const d = (sc.data ?? {}) as { y0?: number; gap?: number; title?: string; sub?: string };
  const y0 = d.y0 ?? 330;
  const gap = d.gap ?? 150;
  if (d.title) glowText(ctx, d.title, W / 2, 100, { font: H(64), color: C.yellow, glow: 22 });
  if (d.sub) glowText(ctx, d.sub, W / 2, 175, { font: B5(40), color: C.text, glow: 0 });
  runs.forEach((r, i) => {
    const spec = sc.runs![i];
    r.clock = t;
    r.advance(dt, speedAt(spec, t));
    const y = y0 + i * (vh + gap);
    ctx.save();
    ctx.shadowColor = spec.color ?? C.cyan;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = spec.color ?? C.cyan;
    ctx.lineWidth = 4;
    ctx.strokeRect(1, y - 2, W - 2, vh + 4);
    ctx.restore();
    ctx.drawImage(r.render(), 0, y, W, vh);
    glowText(ctx, spec.label ?? '', W / 2, y - 48, { font: H(54), color: spec.color ?? C.cyan, glow: 18 });
    const s = r.state;
    const status = s.phase === 'gameover' ? 'GAME OVER' : `SCORE ${s.score}`;
    glowText(ctx, status, W / 2, y + vh + 44, { font: H7(38), color: s.phase === 'gameover' ? C.red : C.text, glow: 6 });
  });
}

function drawThumb(t: number, dt: number): void {
  const sc = scene;
  const r = runs[0];
  r.clock = t;
  r.advance(dt, speedAt(sc.run!, t));
  const d = sc.data as { crop?: { sx: number; sy: number; z: number }; lines: { text: string; color: string; size: number; x: number; y: number; align?: CanvasTextAlign }[]; vignette?: boolean };
  const src = r.render();
  if (d.crop) ctx.drawImage(src, d.crop.sx, d.crop.sy, W / d.crop.z, HGT / d.crop.z, 0, 0, W, HGT);
  else ctx.drawImage(src, 0, 0, W, HGT);
  if (d.vignette) {
    const g = ctx.createLinearGradient(0, 0, W * 0.65, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.78)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HGT);
  }
  for (const l of d.lines) glowText(ctx, l.text, l.x, l.y, { font: H(l.size), color: l.color, glow: 30, align: l.align ?? 'left', stroke: true });
}


// ------------------------------------------------------------------ cover / preview shot
/**
 * Key art and store preview shots: one real replay drawn by the game renderer through a camera
 * (crop/zoom or drone-follow), optional light bloom + vignette, and the game's logo (same fonts and
 * colours as the in-game title). Frame 0 of a preview shot is the matching cover image.
 */
interface CamKey { t: number; cx: number; cy: number; h: number }
interface CoverData {
  cam?: CamKey[];
  /** follow the drone: visible arena height h, smoothing time constant tau (s), optional extra offset */
  follow?: { h: number; tau?: number; dx?: number; dy?: number; from?: number };
  hud?: boolean;
  /** hide all in-game text (score popups, boss label) */
  noText?: boolean;
  /** seconds of replay played before frame 0 (not shown) */
  pre?: number;
  /** freeze the first frame for this many seconds before the replay starts moving */
  freeze?: number;
  bloom?: number;
  vignette?: number;
  /** depth of field: sharp inside a soft circle (screen fractions, or around the drone), blurred outside */
  dof?: { x?: number; y?: number; r: number; blur: number; drone?: boolean };
  /** light-painting: keep fading copies of recent frames (time constant in s), 'lighten'-blended */
  exposure?: number;
  exposureOut?: [number, number];
  /** fade the look (bloom/vignette/logo) out over [t0, t1] */
  lookOut?: [number, number];
  logo?: { x: number; y: number; size: number; stack?: boolean; align?: CanvasTextAlign; tagline?: string; band?: boolean };
}
let camX = 0;
let camY = 0;
let camInit = false;
async function coverInit(sc: Scene): Promise<void> {
  camInit = false;
  const d = (sc.data ?? {}) as CoverData;
  const r = runs[0];
  if (!r) return;
  r.hud = d.hud ?? false;
  r.noText = d.noText ?? false;
  // pre-roll: play the replay silently so trails/particles exist on frame 0 (trace covers pre + dur)
  const n = Math.round((d.pre ?? 0) * FPS);
  for (let i = 0; i < n; i++) r.advance(1 / FPS, 1);
  r.events = [];
}
function camAt(keys: CamKey[], t: number): { cx: number; cy: number; h: number } {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      const k = ease((t - a.t) / (b.t - a.t));
      return { cx: a.cx + (b.cx - a.cx) * k, cy: a.cy + (b.cy - a.cy) * k, h: a.h + (b.h - a.h) * k };
    }
  }
  return keys[keys.length - 1];
}
export function drawLogo(c: CanvasRenderingContext2D, x: number, y: number, size: number, o: { stack?: boolean; align?: CanvasTextAlign; alpha?: number; tagline?: string } = {}): void {
  const parts: [string, string][] = [['SHARD', C.cyan], ['SLING', C.magenta]];
  c.save();
  c.globalAlpha = o.alpha ?? 1;
  c.font = H(size);
  c.letterSpacing = `${Math.round(size * 0.04)}px`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  const widths = parts.map(([p]) => c.measureText(p).width);
  const lines: { text: string; color: string; x: number; y: number }[] = [];
  if (o.stack) {
    const lh = size * 1.02;
    parts.forEach(([p, col], i) => {
      const w = widths[i];
      const lx = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
      lines.push({ text: p, color: col, x: lx, y: y + (i - 0.5) * lh });
    });
  } else {
    const total = widths[0] + widths[1];
    let lx = o.align === 'left' ? x : o.align === 'right' ? x - total : x - total / 2;
    parts.forEach(([p, col], i) => {
      lines.push({ text: p, color: col, x: lx, y });
      lx += widths[i];
    });
  }
  // dark halo for legibility on busy gameplay
  for (const l of lines) {
    c.lineJoin = 'round';
    c.lineWidth = size * 0.16;
    c.strokeStyle = 'rgba(2,3,8,0.72)';
    c.shadowColor = 'rgba(0,0,0,0.9)';
    c.shadowBlur = size * 0.35;
    c.strokeText(l.text, l.x, l.y);
  }
  c.shadowBlur = 0;
  for (const l of lines) {
    c.fillStyle = l.color;
    c.shadowColor = l.color;
    c.shadowBlur = size * 0.45;
    c.fillText(l.text, l.x, l.y);
    c.shadowBlur = size * 0.16;
    c.fillText(l.text, l.x, l.y);
    c.shadowBlur = 0;
    // thin bright core like a neon tube
    c.globalAlpha = (o.alpha ?? 1) * 0.35;
    c.fillStyle = '#ffffff';
    c.fillText(l.text, l.x, l.y - size * 0.012);
    c.globalAlpha = o.alpha ?? 1;
  }
  if (o.tagline) {
    const ty = (o.stack ? y + size * 1.02 : y + size * 0.62) + size * 0.12;
    const fx = o.align === 'left' ? x : o.align === 'right' ? x : x;
    c.font = H7(Math.round(size * 0.2));
    c.letterSpacing = `${Math.round(size * 0.065)}px`;
    c.textAlign = o.align ?? 'center';
    c.fillStyle = C.yellow;
    c.shadowColor = C.yellow;
    c.shadowBlur = size * 0.12;
    c.fillText(o.tagline, fx, ty);
  }
  c.restore();
}
const bloomCanvas = document.createElement('canvas');
const expCanvas = document.createElement('canvas');
const dofCanvas = document.createElement('canvas');
function drawCover(t: number, dt: number): void {
  const sc = scene;
  const d = (sc.data ?? {}) as CoverData;
  const r = runs[0];
  const frozen = t < (d.freeze ?? 0);
  r.clock = t;
  if (!frozen || frameNo === 0) r.advance(frozen ? 0 : dt, frozen ? 0 : speedAt(sc.run!, t));
  // camera
  let cx: number, cy: number, h: number;
  if (d.follow && t >= (d.follow.from ?? 0)) {
    const s = r.state;
    h = d.follow.h;
    const tx = s.drone.x + (d.follow.dx ?? 0);
    const ty = s.drone.y + (d.follow.dy ?? 0);
    if (!camInit) {
      camX = tx;
      camY = ty;
      camInit = true;
    } else {
      const k = 1 - Math.exp(-dt / (d.follow.tau ?? 0.6));
      camX += (tx - camX) * k;
      camY += (ty - camY) * k;
    }
    cx = camX;
    cy = camY;
  } else {
    ({ cx, cy, h } = d.cam ? camAt(d.cam, t) : { cx: ARENA_W / 2, cy: ARENA_H / 2, h: ARENA_H });
    camX = cx;
    camY = cy;
    camInit = true;
  }
  const scale = HGT / h;
  const vw = W / scale;
  const x0 = vw >= ARENA_W ? (ARENA_W - vw) / 2 : Math.min(Math.max(cx - vw / 2, 0), ARENA_W - vw);
  const y0 = h >= ARENA_H ? (ARENA_H - h) / 2 : Math.min(Math.max(cy - h / 2, 0), ARENA_H - h);
  if (d.follow) {
    camX = x0 + vw / 2;
    camY = y0 + h / 2;
  }
  r.setCamera(x0, y0, scale);
  const src = r.render();
  let lookPre = 1;
  if (d.lookOut) lookPre = 1 - ease(Math.min(1, Math.max(0, (t - d.lookOut[0]) / (d.lookOut[1] - d.lookOut[0]))));
  if (d.dof && lookPre > 0) {
    const fxp = d.dof.drone ? (r.state.drone.x - x0) * scale : (d.dof.x ?? 0.5) * W;
    const fyp = d.dof.drone ? (r.state.drone.y - y0) * scale : (d.dof.y ?? 0.5) * HGT;
    const rad = d.dof.r * Math.min(W, HGT);
    ctx.save();
    ctx.filter = `blur(${d.dof.blur * lookPre}px)`;
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    dofCanvas.width = W;
    dofCanvas.height = HGT;
    const m = dofCanvas.getContext('2d')!;
    m.drawImage(src, 0, 0);
    m.globalCompositeOperation = 'destination-in';
    const g = m.createRadialGradient(fxp, fyp, rad * 0.55, fxp, fyp, rad);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, `rgba(0,0,0,${1 - lookPre})`);
    m.fillStyle = g;
    m.fillRect(0, 0, W, HGT);
    ctx.drawImage(dofCanvas, 0, 0);
  } else ctx.drawImage(src, 0, 0);
  if (d.exposure) {
    let ex = 1;
    if (d.exposureOut) ex = 1 - ease(Math.min(1, Math.max(0, (t - d.exposureOut[0]) / (d.exposureOut[1] - d.exposureOut[0]))));
    if (expCanvas.width !== W || expCanvas.height !== HGT || frameNo === 0) {
      expCanvas.width = W;
      expCanvas.height = HGT;
    }
    const e = expCanvas.getContext('2d')!;
    // fade the history, then add the current frame
    e.globalCompositeOperation = 'source-over';
    e.globalAlpha = 1 - Math.exp(-dt / d.exposure);
    e.fillStyle = '#000';
    e.fillRect(0, 0, W, HGT);
    e.globalAlpha = 1;
    e.globalCompositeOperation = 'lighten';
    e.drawImage(src, 0, 0);
    if (ex > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighten';
      ctx.globalAlpha = ex;
      ctx.drawImage(expCanvas, 0, 0);
      ctx.restore();
    }
  }
  // look: bloom, vignette, logo (fades out for preview videos)
  let look = 1;
  if (d.lookOut) look = 1 - ease(Math.min(1, Math.max(0, (t - d.lookOut[0]) / (d.lookOut[1] - d.lookOut[0]))));
  if (look > 0 && (d.bloom ?? 0) > 0) {
    bloomCanvas.width = Math.round(W / 4);
    bloomCanvas.height = Math.round(HGT / 4);
    const b = bloomCanvas.getContext('2d')!;
    b.filter = 'blur(6px)';
    b.drawImage(src, 0, 0, bloomCanvas.width, bloomCanvas.height);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (d.bloom ?? 0) * look;
    ctx.drawImage(bloomCanvas, 0, 0, W, HGT);
    ctx.restore();
  }
  if (look > 0 && (d.vignette ?? 0) > 0) {
    const g = ctx.createRadialGradient(W / 2, HGT / 2, Math.min(W, HGT) * 0.35, W / 2, HGT / 2, Math.hypot(W, HGT) * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(d.vignette ?? 0) * look})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, HGT);
  }
  if (look > 0 && d.logo) {
    const L = d.logo;
    const size = L.size * Math.min(W, HGT);
    if (L.band) {
      const y = L.y * HGT;
      const bh = size * (L.stack ? 2.6 : 1.7);
      const g = ctx.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
      g.addColorStop(0, 'rgba(3,4,10,0)');
      g.addColorStop(0.5, `rgba(3,4,10,${0.55 * look})`);
      g.addColorStop(1, 'rgba(3,4,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - bh / 2, W, bh);
    }
    drawLogo(ctx, L.x * W, L.y * HGT, size, { stack: L.stack, align: L.align, alpha: look, tagline: L.tagline });
  }
}

// ------------------------------------------------------------------ chart
function drawChart(t: number): void {
  const sc = scene;
  const d = sc.data as { key: string; title: string; ylabel: string; marks?: { gen: number; text: string; color?: string }[]; drawFrom?: number; drawTo?: number; key2?: string; label2?: string };
  const rows = csvRows;
  const x0 = 170;
  const x1 = 1840;
  const y0 = 860;
  const y1 = 190;
  const maxGen = rows[rows.length - 1].generation;
  const vals = rows.map((r) => r[d.key]);
  const ymax = niceMax(Math.max(...vals));
  const X = (g: number) => x0 + ((x1 - x0) * g) / maxGen;
  const Y = (v: number) => y0 - ((y0 - y1) * v) / ymax;
  glowText(ctx, d.title, W / 2, 80, { font: H(48), color: C.cyan });
  // grid + axes
  ctx.save();
  ctx.strokeStyle = 'rgba(34,229,255,0.12)';
  ctx.lineWidth = 1;
  ctx.font = B5(26);
  ctx.fillStyle = C.dim;
  for (let k = 0; k <= 5; k++) {
    const v = (ymax * k) / 5;
    ctx.beginPath();
    ctx.moveTo(x0, Y(v));
    ctx.lineTo(x1, Y(v));
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(v).toLocaleString('en'), x0 - 16, Y(v));
  }
  const step = maxGen > 200 ? 50 : 25;
  for (let g = 0; g <= maxGen; g += step) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(String(g), X(g), y0 + 14);
  }
  ctx.fillStyle = C.text;
  ctx.font = B(30);
  ctx.textAlign = 'center';
  ctx.fillText('GENERATION', (x0 + x1) / 2, y0 + 56);
  ctx.save();
  ctx.translate(48, (y0 + y1) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(d.ylabel, 0, 0);
  ctx.restore();
  ctx.restore();

  // animated reveal
  const from = d.drawFrom ?? 0;
  const to = d.drawTo ?? maxGen;
  const k = ease(Math.min(1, t / Math.max(0.1, sc.dur * 0.55)));
  const upto = from + (to - from) * k;
  // raw points (faint) + 10-gen moving average (bright)
  ctx.save();
  ctx.fillStyle = 'rgba(34,229,255,0.35)';
  for (const r of rows) {
    if (r.generation > upto) break;
    ctx.beginPath();
    ctx.arc(X(r.generation), Y(r[d.key]), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const ma = movingAvg(vals, 10);
  ctx.strokeStyle = C.yellow;
  ctx.shadowColor = C.yellow;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 5;
  ctx.beginPath();
  rows.forEach((r, i) => {
    if (r.generation > upto) return;
    if (i === 0) ctx.moveTo(X(r.generation), Y(ma[i]));
    else ctx.lineTo(X(r.generation), Y(ma[i]));
  });
  ctx.stroke();
  ctx.restore();
  // legend
  ctx.save();
  ctx.fillStyle = 'rgba(34,229,255,0.6)';
  ctx.beginPath();
  ctx.arc(x0 + 30, y1 - 40, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = B5(26);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.text;
  ctx.fillText('best brain of each generation, average of 10 test games', x0 + 48, y1 - 40);
  ctx.strokeStyle = C.yellow;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x0 + 830, y1 - 40);
  ctx.lineTo(x0 + 880, y1 - 40);
  ctx.stroke();
  ctx.fillText('10-generation average', x0 + 896, y1 - 40);
  ctx.restore();
  // marks
  for (const m of d.marks ?? []) {
    if (m.gen > upto) continue;
    const row = rows.find((r) => r.generation === m.gen);
    if (!row) continue;
    const a = Math.min(1, (upto - m.gen) / 8 + 0.2);
    const px = X(m.gen);
    const py = Y(row[d.key]);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = m.color ?? C.magenta;
    ctx.shadowColor = m.color ?? C.magenta;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px, py - 14);
    ctx.lineTo(px, py - 70);
    ctx.stroke();
    ctx.restore();
    glowText(ctx, m.text, Math.min(x1 - 120, Math.max(x0 + 140, px)), py - 92, { font: H7(24), color: m.color ?? C.magenta, alpha: a, stroke: true, glow: 8 });
  }
}

function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v * 1.05) return m * p;
  return 10 * p;
}
function movingAvg(xs: number[], n: number): number[] {
  return xs.map((_, i) => {
    const a = Math.max(0, i - n + 1);
    let s = 0;
    for (let k = a; k <= i; k++) s += xs[k];
    return s / (i - a + 1);
  });
}

// ------------------------------------------------------------------ network explainer
function drawNet(t: number, dt: number): void {
  const sc = scene;
  const r = runs[0];
  r.clock = t;
  // the network keeps thinking about a real game state (hidden), so the activations are real
  r.advance(dt, 1);
  const d = (sc.data ?? {}) as { step?: { t: number; show: string }[] };
  void d;
  drawBrain(ctx, 560, 40, 800, 820, r.weights, r.act, r.action, 1);
  // side texts are captions; also show the counts
  const reveal = (t0: number) => ease((t - t0) / 0.6);
  glowText(ctx, `${N_IN} INPUTS`, 330, 300, { font: H(40), color: C.cyan, alpha: reveal(0.5) });
  glowText(ctx, 'what it can "see"', 330, 350, { font: B5(30), color: C.text, alpha: reveal(0.5), glow: 0 });
  glowText(ctx, `${N_HID} NEURONS`, 330, 520, { font: H(40), color: C.violet, alpha: reveal(2) });
  glowText(ctx, 'one hidden layer', 330, 570, { font: B5(30), color: C.text, alpha: reveal(2), glow: 0 });
  glowText(ctx, `${N_OUT} OUTPUTS`, 1630, 300, { font: H(40), color: C.green, alpha: reveal(3.5) });
  glowText(ctx, '9 ways to move', 1630, 350, { font: B5(30), color: C.text, alpha: reveal(3.5), glow: 0 });
  glowText(ctx, '+ hook on / off', 1630, 390, { font: B5(30), color: C.text, alpha: reveal(3.5), glow: 0 });
  glowText(ctx, `${N_WEIGHTS}`, 1630, 560, { font: H(64), color: C.yellow, alpha: reveal(5.5) });
  glowText(ctx, 'adjustable numbers.', 1630, 620, { font: B5(30), color: C.text, alpha: reveal(5.5), glow: 0 });
  glowText(ctx, 'That is the whole brain.', 1630, 660, { font: B5(30), color: C.text, alpha: reveal(5.5), glow: 0 });
  void INPUT_LABELS;
}

// ------------------------------------------------------------------ cards
function drawTitle(t: number): void {
  const d = scene.data as { lines: string[]; sub?: string; color?: string };
  const a = ease(t / 0.5);
  const lines = d.lines;
  const size = lines.length > 2 ? 92 : 110;
  lines.forEach((l, i) => {
    const y = HGT / 2 - ((lines.length - 1) * size * 1.15) / 2 + i * size * 1.15 - 30;
    const col = i === lines.length - 1 ? (d.color ?? C.magenta) : C.cyan;
    glowText(ctx, l, W / 2, y, { font: H(size), color: col, alpha: ease((t - i * 0.25) / 0.4), glow: 28 });
  });
  if (d.sub) glowText(ctx, d.sub, W / 2, HGT / 2 + (lines.length * size * 1.15) / 2 + 30, { font: B5(40), color: C.text, alpha: a * ease((t - 0.8) / 0.5), glow: 0 });
}

function drawCard(t: number): void {
  const d = scene.data as { heading?: string; color?: string; bullets?: { t: number; text: string; color?: string }[]; big?: string; bigColor?: string };
  if (d.heading) glowText(ctx, d.heading, W / 2, 150, { font: H(64), color: d.color ?? C.cyan, alpha: ease(t / 0.4) });
  if (d.big) glowText(ctx, d.big, W / 2, HGT / 2 - 40, { font: H(120), color: d.bigColor ?? C.yellow, alpha: ease((t - 0.3) / 0.5), glow: 30 });
  let y = d.big ? HGT / 2 + 90 : 300;
  for (const b of d.bullets ?? []) {
    const a = ease((t - b.t) / 0.4);
    ctx.font = B(48);
    const lines = wrap(ctx, b.text, 1500);
    for (const l of lines) {
      glowText(ctx, l, W / 2, y, { font: B(48), color: b.color ?? C.text, alpha: a, glow: 0 });
      y += 62;
    }
    y += 26;
  }
}

function drawEnd(t: number): void {
  const d = scene.data as { score?: string };
  glowText(ctx, 'SHARDSLING', W / 2, 200, { font: H(110), color: C.cyan, glow: 30, alpha: ease(t / 0.5) });
  glowText(ctx, 'Can you beat the AI?', W / 2, 330, { font: H7(50), color: C.yellow, alpha: ease((t - 0.4) / 0.5) });
  if (d.score) glowText(ctx, d.score, W / 2, 410, { font: B5(38), color: C.text, alpha: ease((t - 0.7) / 0.5), glow: 0 });
  const a = ease((t - 1) / 0.5);
  ctx.save();
  ctx.globalAlpha = a;
  panel(ctx, W / 2 - 560, 470, 1120, 130, C.green);
  ctx.restore();
  glowText(ctx, 'Play free: jay2090x.github.io/shardsling', W / 2, 535, { font: H7(42), color: C.green, alpha: a, glow: 14 });
  glowText(ctx, 'free in your browser · no download · no sign-up', W / 2, 640, { font: B5(34), color: C.dim, alpha: a, glow: 0 });
}

// ------------------------------------------------------------------ captions
function drawCaption(c: Caption, t: number): void {
  const a = fadeWin(t, c.t0, c.t1, 0.3);
  if (a <= 0) return;
  const size = c.size ?? 50;
  ctx.save();
  ctx.font = B(size);
  const lines = wrap(ctx, c.text, W - 300);
  const subSize = Math.round(size * 0.68);
  ctx.font = B(size);
  let w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (c.sub) {
    ctx.font = B5(subSize);
    w = Math.max(w, ctx.measureText(c.sub).width);
  }
  const lh = size * 1.12;
  const h = lines.length * lh + (c.sub ? subSize * 1.25 : 0) + 34;
  const pw = w + 70;
  let y: number;
  if (c.pos === 'top') y = 36;
  else if (c.pos === 'center') y = HGT / 2 - h / 2;
  else y = HGT - h - 46;
  const x = W / 2 - pw / 2;
  const rise = (1 - ease(Math.min(1, (t - c.t0) / 0.3))) * 14;
  ctx.globalAlpha = a;
  roundRect(ctx, x, y + rise, pw, h, 16);
  ctx.fillStyle = 'rgba(4,6,12,0.82)';
  ctx.fill();
  ctx.strokeStyle = c.color ?? C.cyan;
  ctx.shadowColor = c.color ?? C.cyan;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  lines.forEach((l, i) => {
    glowText(ctx, l, W / 2, y + rise + 17 + lh * (i + 0.5), { font: B(size), color: C.text, alpha: a, glow: 0 });
  });
  if (c.sub) glowText(ctx, c.sub, W / 2, y + rise + 17 + lh * lines.length + subSize * 0.6, { font: B5(subSize), color: c.color ?? C.cyan, alpha: a, glow: 0 });
}

function events(): TimedEvent[] {
  const mode = scene.audio ?? (scene.kind === 'grid' ? 'none' : 'all');
  if (mode === 'none') return [];
  const rr = mode === 'first' ? runs.slice(0, 1) : runs;
  return rr.flatMap((r) => r.events);
}

function summary() {
  return runs.map((r) => ({
    seed: r.seed,
    score: r.state.score,
    wave: r.state.wave,
    time: r.state.time,
    phase: r.state.phase,
    lives: r.state.lives,
    breaks: r.state.breaks,
    maxCombo: r.state.maxCombo,
    actions: r.actions.length,
    actionsHash: hash(r.actions.join(',')),
  }));
}

(window as unknown as Record<string, unknown>).director = { load, frame, events, summary, still: () => canvas.toDataURL('image/png'), W, HGT, ARENA_W, ARENA_H, FPS };
(window as unknown as Record<string, unknown>).directorReady = true;

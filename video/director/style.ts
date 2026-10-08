/** Shared neon text/panel helpers for the video (same palette and fonts as the game). */
export const C = {
  bg: '#05060a',
  floor: '#070a12',
  cyan: '#22e5ff',
  blue: '#4da3ff',
  violet: '#b45cff',
  magenta: '#ff2bd6',
  yellow: '#ffe14d',
  green: '#7dff5a',
  red: '#ff3b5c',
  orange: '#ff9a3b',
  text: '#e8f6fb',
  dim: '#6c8a96',
};

export const H = (px: number) => `900 ${px}px Orbitron, system-ui, sans-serif`;
export const H7 = (px: number) => `700 ${px}px Orbitron, system-ui, sans-serif`;
export const B = (px: number) => `700 ${px}px Rajdhani, system-ui, sans-serif`;
export const B5 = (px: number) => `500 ${px}px Rajdhani, system-ui, sans-serif`;

export function glowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opt: { font: string; color?: string; glow?: number; align?: CanvasTextAlign; base?: CanvasTextBaseline; alpha?: number; stroke?: boolean },
): number {
  ctx.save();
  ctx.font = opt.font;
  ctx.textAlign = opt.align ?? 'center';
  ctx.textBaseline = opt.base ?? 'middle';
  ctx.globalAlpha = opt.alpha ?? 1;
  const color = opt.color ?? C.text;
  if (opt.stroke) {
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }
  ctx.shadowColor = color;
  ctx.shadowBlur = opt.glow ?? 18;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color = C.cyan, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = 'rgba(5,8,16,0.86)';
  ctx.fill();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha * 0.8;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** smoothstep fade helper: 0 before a, 1 between a+f and b-f, 0 after b */
export function fadeWin(t: number, a: number, b: number, f = 0.35): number {
  if (t < a || t > b) return 0;
  const i = Math.min(1, (t - a) / f);
  const o = Math.min(1, (b - t) / f);
  const k = Math.min(i, o);
  return k * k * (3 - 2 * k);
}

export const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/** word-wrap helper */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

/** Live "brain view": the real network, its inputs, hidden activations and the action it picks. */
import { INPUT_LABELS, N_HID, N_IN, N_MOVE, N_OUT, OUTPUT_LABELS, type Activations } from '../../ai/brain';
import { B, B5, C, glowText, H7, panel } from './style';

const GROUPS: { label: string; from: number; to: number; color: string }[] = [
  { label: 'SELF', from: 0, to: 3, color: C.green },
  { label: 'ROPE', from: 4, to: 5, color: C.yellow },
  { label: 'NEAREST CRYSTAL', from: 6, to: 8, color: C.cyan },
  { label: 'CRYSTAL ON ROPE', from: 9, to: 12, color: C.yellow },
  { label: 'DANGER RADAR', from: 13, to: 20, color: C.red },
  { label: 'ENEMY', from: 21, to: 23, color: C.orange },
];

export function drawBrain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  weights: ArrayLike<number>,
  act: Activations,
  action: number,
  alpha = 1,
): void {
  panel(ctx, x, y, w, h, C.violet, alpha);
  ctx.save();
  ctx.globalAlpha = alpha;
  glowText(ctx, 'BRAIN VIEW (LIVE)', x + w / 2, y + 30, { font: H7(22), color: C.violet, glow: 12 });
  const top = y + 66;
  const bottom = y + h - 24;
  const xi = x + 150;
  const xh = x + w * 0.56;
  const xo = x + w - 92;
  const yi = (i: number) => top + ((bottom - top) * (i + 0.5)) / N_IN;
  const yh = (i: number) => top + 20 + ((bottom - top - 40) * (i + 0.5)) / N_HID;
  const yo = (i: number) => top + 40 + ((bottom - top - 80) * (i + 0.5)) / N_OUT;

  // edges: weight * activation (only the strongest are drawn, blue = negative, orange = positive)
  const edges: { x1: number; y1: number; x2: number; y2: number; v: number }[] = [];
  for (let h2 = 0; h2 < N_HID; h2++) {
    for (let i = 0; i < N_IN; i++) {
      const v = weights[h2 * N_IN + i] * act.input[i];
      if (Math.abs(v) > 0.12) edges.push({ x1: xi, y1: yi(i), x2: xh, y2: yh(h2), v });
    }
  }
  const o2 = N_IN * N_HID + N_HID;
  for (let k = 0; k < N_OUT; k++) {
    for (let h2 = 0; h2 < N_HID; h2++) {
      const v = weights[o2 + k * N_HID + h2] * act.hidden[h2];
      if (Math.abs(v) > 0.15) edges.push({ x1: xh, y1: yh(h2), x2: xo, y2: yo(k), v });
    }
  }
  ctx.lineCap = 'round';
  for (const e of edges) {
    const a = Math.min(0.85, Math.abs(e.v) * 0.6);
    ctx.strokeStyle = e.v > 0 ? `rgba(255,154,59,${a})` : `rgba(77,163,255,${a})`;
    ctx.lineWidth = 0.6 + Math.min(3, Math.abs(e.v) * 2);
    ctx.beginPath();
    ctx.moveTo(e.x1, e.y1);
    ctx.lineTo(e.x2, e.y2);
    ctx.stroke();
  }

  // input nodes + labels + group brackets
  ctx.textBaseline = 'middle';
  for (const g of GROUPS) {
    ctx.strokeStyle = g.color;
    ctx.globalAlpha = alpha * 0.6;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 12, yi(g.from) - 7);
    ctx.lineTo(x + 12, yi(g.to) + 7);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }
  for (let i = 0; i < N_IN; i++) {
    const v = act.input[i];
    const g = GROUPS.find((gg) => i >= gg.from && i <= gg.to)!;
    ctx.font = B5(17);
    ctx.textAlign = 'right';
    ctx.fillStyle = Math.abs(v) > 0.05 ? C.text : C.dim;
    ctx.fillText(INPUT_LABELS[i], xi - 16, yi(i));
    node(ctx, xi, yi(i), 7, v, g.color);
  }
  for (let i = 0; i < N_HID; i++) node(ctx, xh, yh(i), 9, act.hidden[i], C.violet);

  // outputs: movement choice (argmax) + hook (>0)
  let best = 0;
  for (let k = 1; k < N_MOVE; k++) if (act.output[k] > act.output[best]) best = k;
  void action;
  for (let k = 0; k < N_OUT; k++) {
    const on = k < N_MOVE ? k === best : act.output[N_MOVE] > 0;
    const col = k < N_MOVE ? C.green : C.yellow;
    ctx.save();
    ctx.beginPath();
    ctx.arc(xo, yo(k), on ? 11 : 8, 0, Math.PI * 2);
    ctx.fillStyle = on ? col : 'rgba(40,50,60,0.9)';
    if (on) {
      ctx.shadowColor = col;
      ctx.shadowBlur = 16;
    }
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.restore();
    ctx.font = on ? B(20) : B5(18);
    ctx.textAlign = 'left';
    ctx.fillStyle = on ? col : C.dim;
    ctx.fillText(OUTPUT_LABELS[k] === 'hook' ? (on ? 'HOOK ON' : 'hook off') : OUTPUT_LABELS[k], xo + 18, yo(k));
  }
  ctx.restore();
}

function node(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, v: number, color: string): void {
  const a = Math.min(1, Math.abs(v));
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,26,36,1)';
  ctx.fill();
  if (a > 0.02) {
    ctx.globalAlpha *= 0.25 + a * 0.75;
    ctx.fillStyle = v >= 0 ? color : C.blue;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10 * a;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.45 + 0.55 * a), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.globalAlpha = ctx.globalAlpha;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

import { ARENA_H, ARENA_W, SHARD } from '../sim/constants';
import { hookRange, worldTimeScale } from '../sim/perks';
import { PERK_INFO } from '../perkInfo';
import { PERK_IDS } from '../sim/types';
import type { Enemy, GameState, Shard } from '../sim/types';
import type { TutMark } from '../tutorial';
import { Effects, TIER_COLORS } from './fx';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface View {
  scale: number;
  offX: number;
  offY: number;
  dpr: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  view: View = { scale: 1, offX: 0, offY: 0, dpr: 1 };
  private cssW = 0;
  private cssH = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not available');
    this.ctx = ctx;
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    const margin = Math.min(this.cssW, this.cssH) < 500 ? 4 : 10;
    const scale = Math.min((this.cssW - margin * 2) / ARENA_W, (this.cssH - margin * 2) / ARENA_H);
    this.view = {
      scale,
      dpr,
      offX: (this.cssW - ARENA_W * scale) / 2,
      offY: (this.cssH - ARENA_H * scale) / 2,
    };
  }

  /** CSS pixel -> arena coordinates */
  toWorld = (cx: number, cy: number): { x: number; y: number } => ({
    x: (cx - this.view.offX) / this.view.scale,
    y: (cy - this.view.offY) / this.view.scale,
  });

  render(
    s: GameState,
    alpha: number,
    fx: Effects,
    time: number,
    showHud: boolean,
    preview: { targetId: number; hookHeld: boolean } | null = null,
    marks: TutMark[] | null = null,
  ): void {
    const { ctx } = this;
    const { scale, offX, offY, dpr } = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const shx = fx.shake > 0 ? (Math.random() - 0.5) * fx.shake : 0;
    const shy = fx.shake > 0 ? (Math.random() - 0.5) * fx.shake : 0;
    const k = scale * dpr;
    ctx.setTransform(k, 0, 0, k, (offX + shx * scale) * dpr, (offY + shy * scale) * dpr);
    const glow = (px: number) => px * k; // shadowBlur is in device pixels

    // arena floor + grid
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    ctx.strokeStyle = 'rgba(34,229,255,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 100; x < ARENA_W; x += 100) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA_H);
    }
    for (let y = 100; y < ARENA_H; y += 100) {
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA_W, y);
    }
    ctx.stroke();

    // walls
    ctx.save();
    ctx.shadowColor = '#22e5ff';
    ctx.shadowBlur = glow(14);
    ctx.strokeStyle = 'rgba(34,229,255,0.85)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, ARENA_W - 4, ARENA_H - 4);
    ctx.restore();

    const d = s.drone;
    const dx = lerp(d.px, d.x, alpha);
    const dy = lerp(d.py, d.y, alpha);

    // hook range hint while idle and hook not pressed
    if (showHud && s.phase === 'playing' && s.tether.state === 'idle') {
      // brighter when the player holds hook but nothing is in range
      const searching = preview !== null && preview.hookHeld && preview.targetId < 0;
      ctx.strokeStyle = searching ? 'rgba(255,225,77,0.35)' : 'rgba(255,225,77,0.07)';
      ctx.setLineDash([6, 10]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dx, dy, hookRange(s), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // trails for fast shards
    for (const sh of s.shards) {
      const sp = Math.hypot(sh.vx, sh.vy);
      let tr = fx.trails.get(sh.id);
      if (sp > SHARD.hotSpeed) {
        if (!tr) {
          tr = [];
          fx.trails.set(sh.id, tr);
        }
        tr.push({ x: sh.x, y: sh.y });
        if (tr.length > 10) tr.shift();
      } else if (tr) {
        tr.shift();
        if (tr.length === 0) fx.trails.delete(sh.id);
      }
    }
    const alive = new Set(s.shards.map((x) => x.id));
    for (const [id, tr] of fx.trails) {
      if (!alive.has(id)) {
        fx.trails.delete(id);
        continue;
      }
      if (tr.length < 2) continue;
      const sh = s.shards.find((x) => x.id === id) as Shard;
      ctx.lineCap = 'round';
      for (let i = 1; i < tr.length; i++) {
        ctx.strokeStyle = `rgba(255,225,77,${(i / tr.length) * 0.5})`;
        ctx.lineWidth = sh.r * 0.9 * (i / tr.length);
        ctx.beginPath();
        ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
        ctx.lineTo(tr[i].x, tr[i].y);
        ctx.stroke();
      }
    }

    // tether
    const t = s.tether;
    if (t.state !== 'idle') {
      let hx = t.hx;
      let hy = t.hy;
      if (t.state === 'attached') {
        const held = s.shards.find((x) => x.id === t.targetId);
        if (held) {
          hx = lerp(held.px, held.x, alpha);
          hy = lerp(held.py, held.y, alpha);
        }
      }
      ctx.save();
      ctx.shadowColor = '#ffe14d';
      ctx.shadowBlur = glow(10);
      ctx.strokeStyle = t.state === 'attached' ? '#ffe14d' : 'rgba(255,225,77,0.75)';
      ctx.lineWidth = t.state === 'attached' ? 3.5 : 2.5;
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      if (t.state === 'attached') {
        // a slight sag, plus a small travelling wave while the crystal swings
        const mx = (dx + hx) / 2;
        const my = (dy + hy) / 2;
        const len = Math.hypot(hx - dx, hy - dy) || 1;
        const sag = Math.min(26, len * 0.06);
        const wave = Math.sin(time * 14) * 5;
        // bend against the direction of rotation: the middle of the rope trails behind
        const px = -((hy - dy) / len) * (sag + wave) * -t.dir;
        const py = ((hx - dx) / len) * (sag + wave) * -t.dir;
        ctx.quadraticCurveTo(mx + px, my + py, hx, hy);
      } else ctx.lineTo(hx, hy);
      ctx.stroke();
      // hot white core
      ctx.shadowBlur = 0;
      ctx.lineWidth = t.state === 'attached' ? 1.4 : 1;
      ctx.strokeStyle = 'rgba(255,252,230,0.85)';
      ctx.stroke();
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // enemies
    for (const e of s.enemies) this.drawEnemy(e, alpha, time, glow);

    // shards
    for (const sh of s.shards) this.drawShard(sh, alpha, s, glow);

    // aim preview: brackets around the shard the hook would grab
    if (showHud && preview && preview.targetId >= 0 && s.tether.state === 'idle' && s.phase === 'playing') {
      const sh = s.shards.find((x) => x.id === preview.targetId);
      if (sh) {
        const x = lerp(sh.px, sh.x, alpha);
        const y = lerp(sh.py, sh.y, alpha);
        const r = sh.r + 12 + Math.sin(time * 8) * 2;
        ctx.strokeStyle = 'rgba(255,225,77,0.8)';
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.arc(x, y, r, a - 0.35, a + 0.35);
          ctx.stroke();
        }
      }
    }

    // drone
    const blink = d.invuln > 0 && s.mode === 'play' && Math.floor(time * 12) % 2 === 0;
    if (s.phase === 'playing' || s.mode === 'attract') {
      ctx.save();
      ctx.globalAlpha = blink ? 0.35 : 1;
      ctx.shadowColor = '#22e5ff';
      ctx.shadowBlur = glow(16);
      ctx.strokeStyle = '#22e5ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(dx, dy, d.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(34,229,255,0.15)';
      ctx.fill();
      ctx.shadowBlur = glow(8);
      ctx.fillStyle = '#e8fdff';
      ctx.beginPath();
      ctx.arc(dx, dy, 5, 0, Math.PI * 2);
      ctx.fill();
      // orbiting markers
      for (let i = 0; i < 3; i++) {
        const a = time * 3 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#22e5ff';
        ctx.beginPath();
        ctx.arc(dx + Math.cos(a) * (d.r + 7), dy + Math.sin(a) * (d.r + 7), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (marks) this.drawMarks(s, alpha, marks, time, dx, dy);

    // particles & rings (additive)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of fx.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    for (const r of fx.rings) {
      ctx.globalAlpha = Math.max(0, r.life / r.max);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // floating score texts (keep readable on small screens)
    const textPx = Math.max(13 / scale, 22);
    ctx.font = `700 ${textPx}px Orbitron, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tx of fx.texts) {
      ctx.globalAlpha = Math.min(1, tx.life * 2);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;

    // Focus perk: cool tint while the world runs slower
    if (worldTimeScale(s) < 1) {
      ctx.fillStyle = 'rgba(34,229,255,0.05)';
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);
      ctx.save();
      ctx.strokeStyle = 'rgba(34,229,255,0.25)';
      ctx.lineWidth = 18;
      ctx.strokeRect(9, 9, ARENA_W - 18, ARENA_H - 18);
      ctx.restore();
    }

    if (fx.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255,40,80,${fx.hurtFlash * 0.5})`;
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    }

    // ---------- HUD in screen space (minimum font sizes for small iframes/phones)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (showHud && !marks) this.drawHud(s, fx);
  }

  /** Tutorial highlights: pulsing ring + label around a shard, the drone or a fixed spot. */
  private drawMarks(s: GameState, alpha: number, marks: TutMark[], time: number, dx: number, dy: number): void {
    const { ctx } = this;
    const textPx = Math.max(13 / this.view.scale, 24);
    const pulse = Math.sin(time * 6);
    for (const m of marks) {
      let x = m.x ?? 0;
      let y = m.y ?? 0;
      let r = m.r ?? 40;
      if (m.id === -1) {
        x = dx;
        y = dy;
        r = s.drone.r + 22;
      } else if (m.id !== undefined) {
        const sh = s.shards.find((q) => q.id === m.id);
        if (!sh) continue;
        x = lerp(sh.px, sh.x, alpha);
        y = lerp(sh.py, sh.y, alpha);
        r = sh.r + 22;
      }
      r += pulse * 4;
      ctx.save();
      ctx.strokeStyle = m.color;
      ctx.shadowColor = m.color;
      ctx.shadowBlur = 14 * this.view.scale * this.view.dpr;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.75 + pulse * 0.25;
      if (m.dashed) {
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -time * 30;
        ctx.fillStyle = 'rgba(255,225,77,0.08)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // expanding ghost ring
      const g = (time * 0.9) % 1;
      ctx.globalAlpha = (1 - g) * 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + g * 40, 0, Math.PI * 2);
      ctx.stroke();
      // label above (below when too close to the top wall)
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 8 * this.view.scale * this.view.dpr;
      ctx.fillStyle = m.color;
      ctx.font = `700 ${textPx}px Orbitron, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const above = y - r - textPx > textPx;
      const tw = ctx.measureText(m.label).width / 2;
      const lx = Math.min(ARENA_W - tw - 8, Math.max(tw + 8, x));
      ctx.fillText(m.label, lx, above ? y - r - textPx * 0.8 : y + r + textPx * 0.8);
      ctx.restore();
    }
  }

  private drawShard(sh: Shard, alpha: number, s: GameState, glow: (px: number) => number): void {
    const { ctx } = this;
    const x = lerp(sh.px, sh.x, alpha);
    const y = lerp(sh.py, sh.y, alpha);
    const sp = Math.hypot(sh.vx, sh.vy);
    const held = s.tether.state === 'attached' && s.tether.targetId === sh.id;
    const hot = sp > SHARD.hotSpeed && (sh.armed > 0 || held);
    const color = hot ? '#fff6c2' : TIER_COLORS[sh.tier];
    const n = sh.verts.length;
    ctx.save();
    if (sh.tier === 0 && sh.life < 2) ctx.globalAlpha = Math.max(0.15, sh.life / 2);
    ctx.translate(x, y);
    ctx.rotate(sh.angle);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = sh.r * sh.verts[i];
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = hot ? 'rgba(255,225,77,0.25)' : sh.tier === 3 ? 'rgba(255,43,214,0.10)' : 'rgba(180,92,255,0.08)';
    ctx.fill();
    ctx.shadowColor = hot ? '#ffe14d' : color;
    ctx.shadowBlur = glow(hot || held ? 18 : 10);
    ctx.strokeStyle = color;
    ctx.lineWidth = sh.tier === 0 ? 2 : 2.6;
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (sh.tier > 0) {
      // crystal facets
      ctx.shadowBlur = 0;
      ctx.globalAlpha *= 0.45;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < n; i += 2) {
        const a = (i / n) * Math.PI * 2;
        const rr = sh.r * sh.verts[i];
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawEnemy(e: Enemy, alpha: number, time: number, glow: (px: number) => number): void {
    const { ctx } = this;
    const x = lerp(e.px, e.x, alpha);
    const y = lerp(e.py, e.y, alpha);
    const warping = e.spawn > 0;
    ctx.save();
    if (warping) ctx.globalAlpha = Math.max(0.15, 1 - e.spawn);
    ctx.save();
    if (e.kind === 'hunter') this.drawHunter(e, x, y, time, glow);
    else if (e.kind === 'prism') this.drawPrism(e, x, y, time, glow);
    else this.drawBoss(e, x, y, time, glow);
    ctx.restore();
    // telegraph: the aim line shows exactly where the shot will go
    if (e.charge > 0 && e.chargeMax > 0) {
      const k = 1 - e.charge / e.chargeMax; // 0 -> 1 while charging
      const color = e.kind === 'boss' ? '#ff3b5c' : '#ff9a3b';
      ctx.globalAlpha = 0.25 + k * 0.75;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = glow(12);
      ctx.lineWidth = 1.5 + k * 3;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -time * 60;
      const drawLine = (a: number) => {
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (e.r + 6), y + Math.sin(a) * (e.r + 6));
        ctx.lineTo(x + Math.cos(a) * (e.r + 60 + k * 420), y + Math.sin(a) * (e.r + 60 + k * 420));
        ctx.stroke();
      };
      if (e.attack === 'shot') drawLine(e.aim);
      else if (e.attack === 'volley') {
        for (let i = -1; i <= 1; i++) drawLine(e.aim + i * 0.32);
      } else {
        for (let i = 0; i < 8; i++) drawLine(e.aim + (i / 8) * Math.PI * 2);
      }
      ctx.setLineDash([]);
    }
    ctx.restore();
    if (warping) {
      // closing warp ring
      ctx.save();
      ctx.strokeStyle = e.kind === 'hunter' ? '#ff3b5c' : e.kind === 'prism' ? '#ff9a3b' : '#ff2bd6';
      ctx.globalAlpha = Math.min(1, e.spawn * 2);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, e.r + 8 + e.spawn * 140, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawHunter(e: Enemy, x: number, y: number, time: number, glow: (px: number) => number): void {
    const { ctx } = this;
    ctx.translate(x, y);
    ctx.rotate(e.angle);
    ctx.shadowColor = '#ff3b5c';
    ctx.shadowBlur = glow(e.stun > 0 ? 6 : 14);
    ctx.fillStyle = 'rgba(255,59,92,0.18)';
    ctx.strokeStyle = '#ff3b5c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // eye, looking at the drone (the body is rotated toward it)
    ctx.shadowBlur = glow(6);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(6, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a0610';
    ctx.beginPath();
    ctx.arc(8, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    // stunned: a little swirl above
    if (e.stun > 0) {
      ctx.rotate(-e.angle);
      ctx.strokeStyle = 'rgba(255,225,77,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -e.r - 8, 5, time * 6, time * 6 + Math.PI * 1.4);
      ctx.stroke();
    }
  }

  private drawPrism(e: Enemy, x: number, y: number, time: number, glow: (px: number) => number): void {
    const { ctx } = this;
    const charging = e.charge > 0;
    ctx.translate(x, y);
    ctx.rotate(e.angle);
    ctx.shadowColor = charging ? '#ff3b5c' : '#ff9a3b';
    ctx.shadowBlur = glow(charging ? 20 : 12);
    ctx.strokeStyle = charging ? '#ffb199' : '#ff9a3b';
    ctx.fillStyle = 'rgba(255,154,59,0.14)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const rr = e.r * (i % 2 === 0 ? 1.05 : 0.72);
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // inner spinning triangle
    ctx.rotate(-time * 1.6);
    ctx.shadowBlur = 0;
    ctx.globalAlpha *= 0.8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const rr = e.r * 0.45;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.stroke();
  }

  private drawBoss(e: Enemy, x: number, y: number, time: number, glow: (px: number) => number): void {
    const { ctx } = this;
    const charging = e.charge > 0;
    ctx.translate(x, y);
    ctx.shadowColor = charging ? '#ff3b5c' : '#ff2bd6';
    ctx.shadowBlur = glow(charging ? 28 : 18);
    if (e.flash > 0) ctx.globalAlpha = 0.55;
    ctx.strokeStyle = charging ? '#ff6b8a' : '#ff2bd6';
    ctx.fillStyle = 'rgba(255,43,214,0.10)';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    const pulse = 1 + (charging ? Math.sin(time * 18) * 0.03 : 0);
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + e.angle;
      const rr = e.r * (i % 2 === 0 ? 1.02 : 0.78) * pulse;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // inner hex core
    ctx.shadowBlur = glow(8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - time * 0.6;
      const rr = e.r * 0.42;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.stroke();
    // health bar
    const w = e.r * 1.6;
    const frac = e.hp / e.maxHp;
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(5,6,10,0.8)';
    ctx.fillRect(-w / 2, -e.r - 22, w, 8);
    ctx.fillStyle = frac < 0.5 ? '#ff3b5c' : '#ff2bd6';
    ctx.fillRect(-w / 2, -e.r - 22, w * frac, 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2, -e.r - 22, w, 8);
    // name tag
    ctx.fillStyle = '#ff2bd6';
    ctx.font = '700 16px Orbitron, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('CORE', 0, -e.r - 26);
  }

  private drawHud(s: GameState, fx: Effects): void {
    const { ctx } = this;
    const { scale, offX, offY } = this.view;
    const big = Math.max(16, Math.min(34, 34 * scale * 1.25));
    const small = Math.max(11, big * 0.42);
    const pad = Math.max(10, 18 * scale);
    const left = Math.max(offX + pad, 8);
    const top = Math.max(offY + pad, 8);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#22e5ff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#22e5ff';
    ctx.font = `900 ${big}px Orbitron, system-ui, sans-serif`;
    ctx.fillText(String(s.score).padStart(6, '0'), left, top);
    ctx.shadowBlur = 0;
    ctx.font = `700 ${small}px Orbitron, system-ui, sans-serif`;
    ctx.fillStyle = '#6c8a96';
    ctx.fillText(`WAVE ${s.wave}`, left, top + big * 1.12);

    // lives as small drone rings
    const lr = small * 0.45;
    const lx = left + ctx.measureText(`WAVE ${s.wave}`).width + small * 1.2;
    const slots = Math.max(3, s.lives);
    for (let i = 0; i < slots; i++) {
      ctx.beginPath();
      ctx.arc(lx + i * lr * 3, top + big * 1.12 + small * 0.5, lr, 0, Math.PI * 2);
      ctx.strokeStyle = i < s.lives ? '#22e5ff' : 'rgba(108,138,150,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (i < s.lives) {
        ctx.fillStyle = 'rgba(34,229,255,0.35)';
        ctx.fill();
      }
    }

    // perks picked so far
    const chips = PERK_IDS.filter((id) => s.perks[id] > 0 && id !== 'life').map((id) => `${PERK_INFO[id].short} ${'I'.repeat(s.perks[id])}`);
    if (chips.length > 0) {
      ctx.font = `700 ${Math.max(10, small * 0.85)}px Orbitron, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(255,225,77,0.75)';
      ctx.fillText(chips.join('  '), left, top + big * 1.12 + small * 1.5);
    }

    // combo
    if (s.combo >= 2 && s.phase === 'playing') {
      const cx = offX + (ARENA_W * scale) / 2;
      const pulse = 1 + Math.max(0, s.comboTimer - 1.2) * 0.6;
      ctx.textAlign = 'center';
      ctx.font = `900 ${big * pulse}px Orbitron, system-ui, sans-serif`;
      ctx.fillStyle = '#ffe14d';
      ctx.shadowColor = '#ffe14d';
      ctx.shadowBlur = 14;
      ctx.fillText(`x${Math.min(s.combo, 10)} COMBO`, cx, top);
      ctx.shadowBlur = 0;
    }

    if (fx.banner) {
      const cx = offX + (ARENA_W * scale) / 2;
      const cy = offY + (ARENA_H * scale) * 0.4;
      const a = Math.min(1, fx.banner.life * 2);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${big * 1.6}px Orbitron, system-ui, sans-serif`;
      const bc = fx.banner.color ?? '#ff2bd6';
      ctx.fillStyle = bc;
      ctx.shadowColor = bc;
      ctx.shadowBlur = 18;
      ctx.fillText(fx.banner.text, cx, cy);
      if (fx.banner.sub) {
        ctx.shadowBlur = 0;
        ctx.font = `700 ${small * 1.2}px Orbitron, system-ui, sans-serif`;
        ctx.fillStyle = '#ffe14d';
        ctx.fillText(fx.banner.sub, cx, cy + big * 1.3);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }
}

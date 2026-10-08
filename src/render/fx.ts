import type { SimEvent } from '../sim/types';

/** Purely cosmetic effects driven by simulation events. Not part of the simulation state. */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface Ring {
  x: number;
  y: number;
  r: number;
  grow: number;
  life: number;
  max: number;
  color: string;
}
interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

export const TIER_COLORS = ['#22e5ff', '#4da3ff', '#b45cff', '#ff2bd6'];

export class Effects {
  particles: Particle[] = [];
  rings: Ring[] = [];
  texts: FloatText[] = [];
  shake = 0;
  banner: { text: string; sub: string; life: number } | null = null;
  hurtFlash = 0;
  trails = new Map<number, { x: number; y: number }[]>();

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.trails.clear();
    this.shake = 0;
    this.banner = null;
    this.hurtFlash = 0;
  }

  private burst(x: number, y: number, n: number, color: string, speed: number, life = 0.6, size = 2.5): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.9);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size });
    }
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }

  handle(e: SimEvent): void {
    switch (e.type) {
      case 'break': {
        const c = TIER_COLORS[e.tier];
        this.burst(e.x, e.y, 10 + e.tier * 10, c, 220 + e.tier * 90, 0.7);
        this.burst(e.x, e.y, 6, '#ffffff', 300, 0.35, 2);
        this.rings.push({ x: e.x, y: e.y, r: e.r, grow: 260, life: 0.35, max: 0.35, color: c });
        this.shake = Math.min(14, this.shake + 2 + e.tier * 2);
        if (e.points > 0) {
          this.texts.push({
            x: e.x,
            y: e.y,
            text: e.combo > 1 ? `+${e.points}  x${Math.min(e.combo, 10)}` : `+${e.points}`,
            life: 0.9,
            color: e.combo > 2 ? '#ffe14d' : '#cfe9f2',
          });
        }
        break;
      }
      case 'fade':
        this.burst(e.x, e.y, 4, '#22e5ff', 60, 0.5, 1.5);
        break;
      case 'attach':
        this.rings.push({ x: e.x, y: e.y, r: 8, grow: 120, life: 0.25, max: 0.25, color: '#ffe14d' });
        break;
      case 'fling':
        if (e.speed > 500) this.shake = Math.min(14, this.shake + 2);
        break;
      case 'bounce':
        this.burst(e.x, e.y, 6, '#22e5ff', 160, 0.35, 2);
        break;
      case 'hurt':
        this.burst(e.x, e.y, 40, '#ff3b5c', 380, 0.8, 3);
        this.rings.push({ x: e.x, y: e.y, r: 20, grow: 420, life: 0.45, max: 0.45, color: '#ff3b5c' });
        this.shake = 18;
        this.hurtFlash = 0.35;
        break;
      case 'wave':
        this.banner = { text: `WAVE ${e.wave}`, sub: e.bonus > 0 ? `+${e.bonus} clear bonus` : '', life: 1.8 };
        break;
      case 'gameover':
        this.shake = 22;
        break;
      default:
        break;
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = Math.exp(-2.5 * dt);
      p.vx *= k;
      p.vy *= k;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) {
      r.r += r.grow * dt;
      r.life -= dt;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) {
      t.y -= 50 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shake = Math.max(0, this.shake - 40 * dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
  }
}

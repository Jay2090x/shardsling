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

/** The player's own color: no crystal, enemy, rope or UI element uses this green. */
export const DRONE_COLOR = '#7dff5a';
export const DRONE_RGB = '125,255,90';
/** How long the "YOU" spotlight shows at wave start and after losing a life (seconds). */
export const SPOTLIGHT_TIME = 1.5;

export class Effects {
  particles: Particle[] = [];
  rings: Ring[] = [];
  texts: FloatText[] = [];
  shake = 0;
  banner: { text: string; sub: string; life: number; color?: string } | null = null;
  hurtFlash = 0;
  trails = new Map<number, { x: number; y: number }[]>();
  /** recent drone positions (render time), for the short motion trail */
  droneTrail: { x: number; y: number; t: number }[] = [];
  /** >0: "YOU" spotlight around the drone (wave start / respawn) */
  spotlight = 0;

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.trails.clear();
    this.droneTrail = [];
    this.spotlight = 0;
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
        if (e.lives > 0) this.spotlight = SPOTLIGHT_TIME;
        break;
      case 'wave':
        this.banner = e.boss
          ? { text: 'BOSS', sub: `WAVE ${e.wave}: smash the core`, life: 2.4, color: '#ff3b5c' }
          : { text: `WAVE ${e.wave}`, sub: '', life: 1.6 };
        this.spotlight = SPOTLIGHT_TIME;
        break;
      case 'clear':
        this.banner = { text: `WAVE ${e.wave} CLEAR`, sub: e.bonus > 0 ? `+${e.bonus} clear bonus` : '', life: 1.4 };
        break;
      case 'blast':
        this.rings.push({ x: e.x, y: e.y, r: e.r * 0.4, grow: e.r * 2.2, life: 0.3, max: 0.3, color: '#ffe14d' });
        break;
      case 'enemySpawn':
        break;
      case 'enemyKill': {
        const c = e.kind === 'hunter' ? '#ff3b5c' : e.kind === 'prism' ? '#ff9a3b' : '#ff2bd6';
        const big = e.kind === 'boss';
        this.burst(e.x, e.y, big ? 160 : 34, c, big ? 700 : 360, big ? 1.4 : 0.8, big ? 4 : 3);
        this.burst(e.x, e.y, big ? 60 : 12, '#ffffff', big ? 500 : 300, 0.5, 2);
        this.rings.push({ x: e.x, y: e.y, r: e.r, grow: big ? 900 : 320, life: big ? 0.8 : 0.4, max: big ? 0.8 : 0.4, color: c });
        if (big) this.rings.push({ x: e.x, y: e.y, r: e.r, grow: 1400, life: 1, max: 1, color: '#ffe14d' });
        this.shake = Math.min(big ? 30 : 16, this.shake + (big ? 30 : 6));
        if (e.points > 0) {
          this.texts.push({ x: e.x, y: e.y - e.r, text: e.combo > 1 ? `+${e.points}  x${Math.min(e.combo, 10)}` : `+${e.points}`, life: big ? 1.6 : 1, color: '#ffe14d' });
        }
        if (big) this.banner = { text: 'CORE DOWN', sub: '', life: 1.8, color: '#ffe14d' };
        break;
      }
      case 'bossHit':
        this.burst(e.x, e.y, 18, '#ff2bd6', 320, 0.5, 2.5);
        this.rings.push({ x: e.x, y: e.y, r: 10, grow: 220, life: 0.25, max: 0.25, color: '#ffffff' });
        this.shake = Math.min(18, this.shake + 7);
        if (e.points > 0) this.texts.push({ x: e.x, y: e.y, text: `+${e.points}`, life: 0.8, color: '#ff9ce9' });
        break;
      case 'enemyFire':
        this.burst(e.x, e.y, e.kind === 'boss' ? 30 : 10, e.kind === 'boss' ? '#ff3b5c' : '#ff9a3b', 240, 0.4, 2.5);
        if (e.kind === 'boss') this.shake = Math.min(14, this.shake + 5);
        break;
      case 'perk':
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
    this.spotlight = Math.max(0, this.spotlight - dt);
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
  }
}

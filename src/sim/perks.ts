/** Perk effects and the perk offer after a cleared wave (headless, deterministic). */
import { PERKS, TETHER, WAVE_DELAY } from './constants';
import { randInt } from './rng';
import { PERK_IDS, type GameState, type PerkId, type Shard } from './types';

export function noPerks(): Record<PerkId, number> {
  return { rope: 0, spin: 0, life: 0, blast: 0, magnet: 0, focus: 0 };
}

/** Max distance at which the hook can grab a crystal. */
export function hookRange(s: GameState): number {
  return TETHER.range * (1 + PERKS.rope.rangePerStack * s.perks.rope);
}

export function spinForce(s: GameState): number {
  return TETHER.spinForce * (1 + PERKS.spin.forcePerStack * s.perks.spin);
}

export function spinSpeedFactor(s: GameState): number {
  return 1 + PERKS.spin.speedPerStack * s.perks.spin;
}

/** Shockwave radius around a smash (0 without the perk). */
export function blastRadius(s: GameState): number {
  return PERKS.blast.radiusPerStack * s.perks.blast;
}

/** Time scale for everything except the drone and the crystal on the rope (Focus perk). */
export function worldTimeScale(s: GameState): number {
  if (s.perks.focus <= 0 || s.tether.state !== 'attached') return 1;
  return Math.max(0.5, 1 - PERKS.focus.slowPerStack * s.perks.focus);
}

export function perkMax(id: PerkId): number {
  return id === 'life' ? Infinity : PERKS[id].max;
}

export function perkAvailable(s: GameState, id: PerkId): boolean {
  if (id === 'life') return s.lives < PERKS.life.maxLives;
  return s.perks[id] < perkMax(id);
}

/** Rolls up to PERKS.choices different perks the player can still take. */
export function rollPerkOffer(s: GameState): PerkId[] | null {
  const pool = PERK_IDS.filter((id) => perkAvailable(s, id));
  const out: PerkId[] = [];
  while (pool.length > 0 && out.length < PERKS.choices) {
    const i = randInt(s, 0, pool.length - 1);
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  return out.length > 0 ? out : null;
}

/** True once the offer should be shown (a short moment after the clear, before the next wave). */
export function perkOfferReady(s: GameState): boolean {
  return (
    s.perkOffer !== null && s.phase === 'playing' && s.waveTimer > 0 && WAVE_DELAY - s.waveTimer >= PERKS.offerDelay - 1e-9
  );
}

/** Applies one perk directly (also used by tests). */
export function applyPerk(s: GameState, id: PerkId): void {
  s.perks[id]++;
  if (id === 'life') s.lives = Math.min(PERKS.life.maxLives, s.lives + 1);
  s.events.push({ type: 'perk', perk: id, level: s.perks[id] });
}

/** Player picks entry `index` of the pending offer. Returns false if there is nothing to pick. */
export function choosePerk(s: GameState, index: number): boolean {
  const offer = s.perkOffer;
  if (!offer || index < 0 || index >= offer.length) return false;
  s.perkOffer = null;
  applyPerk(s, offer[index]);
  return true;
}

/**
 * Magnet perk: an armed (flung) crystal turns toward the best target ahead of it.
 * Keeps its speed, only rotates the velocity by at most turnRate * stacks * dt.
 */
export function steerMagnet(s: GameState, sh: Shard, dt: number): void {
  const stacks = s.perks.magnet;
  if (stacks <= 0 || sh.armed <= 0) return;
  const sp = Math.sqrt(sh.vx * sh.vx + sh.vy * sh.vy);
  if (sp < 1) return;
  const ux = sh.vx / sp;
  const uy = sh.vy / sp;
  const range2 = PERKS.magnet.range * PERKS.magnet.range;
  let bestX = 0;
  let bestY = 0;
  let best = -Infinity;
  const consider = (x: number, y: number) => {
    const dx = x - sh.x;
    const dy = y - sh.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range2 || d2 < 1) return;
    const dist = Math.sqrt(d2);
    const cos = (dx * ux + dy * uy) / dist;
    if (cos < PERKS.magnet.cone) return;
    // prefer targets close to the flight line, then close ones
    const score = cos * 2 - dist / PERKS.magnet.range;
    if (score > best) {
      best = score;
      bestX = dx;
      bestY = dy;
    }
  };
  for (const o of s.shards) {
    if (o === sh || o.tier === 0 || o.armed > 0) continue;
    if (s.tether.state === 'attached' && s.tether.targetId === o.id) continue;
    consider(o.x, o.y);
  }
  for (const e of s.enemies) if (e.spawn <= 0) consider(e.x, e.y);
  if (best === -Infinity) return;
  const cur = Math.atan2(sh.vy, sh.vx);
  const want = Math.atan2(bestY, bestX);
  let diff = want - cur;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const maxTurn = PERKS.magnet.turnRate * stacks * dt;
  const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
  const a = cur + turn;
  sh.vx = Math.cos(a) * sp;
  sh.vy = Math.sin(a) * sp;
}

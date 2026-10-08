/**
 * Seedable PRNG (mulberry32). The generator state is a plain uint32 that lives in the
 * game state, so a state snapshot fully determines all future randomness.
 */
export function nextRandom(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(s: { rng: number }, min: number, max: number): number {
  return min + (max - min) * nextRandom(s);
}

export function randInt(s: { rng: number }, min: number, maxInclusive: number): number {
  return min + Math.floor(nextRandom(s) * (maxInclusive - min + 1));
}

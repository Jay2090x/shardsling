import { describe, expect, it } from 'vitest';
import { DRONE_COLOR, DRONE_RGB, TIER_COLORS } from '../src/render/fx';

// crystals, enemies, rope/hook and UI colors used by the renderer
const OTHERS = [...TIER_COLORS, '#ffe14d', '#fff6c2', '#ff3b5c', '#ff9a3b', '#ff6b8a', '#ffb199', '#ff9ce9'];

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('drone palette', () => {
  it('no crystal, enemy or rope color is close to the drone color', () => {
    const h = hue(DRONE_COLOR);
    for (const c of OTHERS) {
      const dh = Math.min(Math.abs(hue(c) - h), 360 - Math.abs(hue(c) - h));
      expect(dh, c).toBeGreaterThan(45);
    }
  });
  it('RGB triple matches the hex color', () => {
    const rgb = [1, 3, 5].map((i) => parseInt(DRONE_COLOR.slice(i, i + 2), 16)).join(',');
    expect(rgb).toBe(DRONE_RGB);
  });
});

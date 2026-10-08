/**
 * A tiny hand-written heuristic player (NOT an AI / learned model).
 * Used by tests and the headless runner to prove the core loop is playable.
 */
import { SHARD } from './constants';
import type { GameState, SimInput } from './types';

export function heuristicInput(s: GameState): SimInput {
  const d = s.drone;
  let moveX = 0;
  let moveY = 0;
  // steer away from nearby dangerous shards
  for (const sh of s.shards) {
    if (s.tether.targetId === sh.id && s.tether.state === 'attached') continue;
    if (sh.tier === 0) continue;
    const dx = d.x - sh.x;
    const dy = d.y - sh.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const danger = sh.r + d.r + 120;
    if (dist < danger) {
      const w = (danger - dist) / danger;
      moveX += (dx / dist) * w * 2;
      moveY += (dy / dist) * w * 2;
    }
  }
  // when idle, approach the nearest shard so it is in hook range
  if (s.tether.state === 'idle') {
    let best = Infinity;
    let tx = 0;
    let ty = 0;
    for (const sh of s.shards) {
      const dd = (sh.x - d.x) ** 2 + (sh.y - d.y) ** 2;
      if (dd < best) {
        best = dd;
        tx = sh.x;
        ty = sh.y;
      }
    }
    if (best < Infinity && best > 300 * 300) {
      const l = Math.sqrt(best);
      moveX += ((tx - d.x) / l) * 0.8;
      moveY += ((ty - d.y) / l) * 0.8;
    }
  }
  // drift back towards the middle
  moveX += (800 - d.x) / 900;
  moveY += (450 - d.y) / 600;

  let hook = true;
  if (s.tether.state === 'attached') {
    const held = s.shards.find((x) => x.id === s.tether.targetId);
    if (held) {
      const sp = Math.hypot(held.vx, held.vy);
      if (sp > SHARD.hotSpeed + 220) {
        // release when the velocity points at another shard
        const ux = held.vx / sp;
        const uy = held.vy / sp;
        for (const o of s.shards) {
          if (o.id === held.id) continue;
          const ox = o.x - held.x;
          const oy = o.y - held.y;
          const along = ox * ux + oy * uy;
          if (along <= 0 || along > 700) continue;
          const perp = Math.abs(ox * uy - oy * ux);
          if (perp < o.r + held.r) {
            hook = false;
            break;
          }
        }
      }
    }
  }
  return { moveX, moveY, hook, aimX: null, aimY: null };
}

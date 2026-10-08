import { PERKS } from './sim/constants';
import type { PerkId } from './sim/types';

/** Display copy + icons for the perks (UI only; numbers live in src/sim/constants.ts). */
export const PERK_INFO: Record<PerkId, { name: string; short: string; desc: string; icon: string }> = {
  rope: {
    name: 'Long Rope',
    short: 'ROPE',
    desc: `Hook range +${Math.round(PERKS.rope.rangePerStack * 100)}%.`,
    icon: '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3.5"/><path d="M8.5 15.5 15.5 8.5" stroke-dasharray="2 2"/>',
  },
  spin: {
    name: 'Fast Swing',
    short: 'SWING',
    desc: 'Crystals spin up faster and fly harder.',
    icon: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4v4h-4"/><circle cx="12" cy="12" r="2"/>',
  },
  life: {
    name: 'Extra Life',
    short: 'LIFE',
    desc: `+1 life (up to ${PERKS.life.maxLives}).`,
    icon: '<circle cx="12" cy="12" r="7"/><path d="M12 8.5v7M8.5 12h7"/>',
  },
  blast: {
    name: 'Shockwave',
    short: 'BLAST',
    desc: 'Smashes also shatter small crystals and enemies nearby.',
    icon: '<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="6" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="2 3"/>',
  },
  magnet: {
    name: 'Magnet Hook',
    short: 'MAGNET',
    desc: 'Flung crystals curve toward targets.',
    icon: '<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 8h3M15 8h3"/>',
  },
  focus: {
    name: 'Focus',
    short: 'FOCUS',
    desc: 'Time slows down while you swing.',
    icon: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  },
};

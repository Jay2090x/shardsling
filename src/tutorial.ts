import type { Device } from './input/input';
import { SIM_DT, TETHER } from './sim/constants';
import { makeShard, TUTORIAL_LAYOUT } from './sim/sim';
import type { GameState } from './sim/types';
import { DRONE_COLOR } from './render/fx';
import { ARENA_H, ARENA_W } from './sim/constants';

export type TutStep = 'goal' | 'move' | 'hook' | 'fling' | 'done';
const STEPS: TutStep[] = ['goal', 'move', 'hook', 'fling', 'done'];

/** World-space highlight drawn by the renderer: follows a shard (id), the drone (id -1) or a fixed point. */
export interface TutMark {
  id?: number;
  x?: number;
  y?: number;
  r?: number;
  label: string;
  color: string;
  dashed?: boolean;
}

interface Copy {
  title: string;
  desktop: string;
  touch: string;
}

const COPY: Record<TutStep, Copy> = {
  goal: {
    title: 'The goal',
    desktop:
      'Smash every crystal by <b>flinging crystals into each other</b>. Clear them all to finish a wave. Don\'t touch drifting crystals: you have <b>3 lives</b>.',
    touch:
      'Smash every crystal by <b>flinging crystals into each other</b>. Clear them all to finish a wave. Don\'t touch drifting crystals: you have <b>3 lives</b>.',
  },
  move: {
    title: 'Move',
    desktop: 'Fly into the yellow ring: <kbd>WASD</kbd> / <kbd>arrows</kbd>, or point with the mouse.',
    touch: 'Fly into the yellow ring: <b>drag your thumb on the left side</b>.',
  },
  hook: {
    title: 'Hook &amp; swing',
    desktop: '<b>Hold</b> <kbd>Space</kbd> or the mouse button to hook the nearest crystal. Keep holding: it swings around you.',
    touch: '<b>Hold your thumb on the right side</b> to hook the nearest crystal. Keep holding: it swings around you.',
  },
  fling: {
    title: 'Fling',
    desktop: '<b>Let go</b> when it swings toward the big crystal. Hits shatter crystals, and chain reactions build a <b>combo</b>.',
    touch: '<b>Lift your thumb</b> when it swings toward the big crystal. Hits shatter crystals, and chain reactions build a <b>combo</b>.',
  },
  done: {
    title: 'Nice hit!',
    desktop: 'Every fragment is new ammo. Chain hits for up to <b>x10 combo</b>. Pause any time with <kbd>P</kbd> / <kbd>Esc</kbd>.',
    touch: 'Every fragment is new ammo. Chain hits for up to <b>x10 combo</b>. Pause any time with the button top right.',
  },
};

export interface TutorialHost {
  device(): Device;
  /** finished: true when the player reached the last card and pressed its main button */
  exit(finished: boolean): void;
  doneLabel(): string;
}

/**
 * First-run tutorial: learning by doing in a harmless practice arena (sim mode 'tutorial').
 * Each step waits for the action and then advances; NEXT is the fallback, SKIP leaves.
 */
export class Tutorial {
  step: TutStep = 'goal';
  private held = 0;
  private travel = 0;
  private ammoTimer = 0;
  private last = { x: 0, y: 0 };
  private targetId = 2;
  private el = document.getElementById('tutorial') as HTMLElement;
  private card = document.getElementById('tut-card') as HTMLElement;
  private stepEl = document.getElementById('tut-step') as HTMLElement;
  private titleEl = document.getElementById('tut-title') as HTMLElement;
  private textEl = document.getElementById('tut-text') as HTMLElement;
  private nextBtn = document.getElementById('tut-next') as HTMLButtonElement;
  private skipBtn = document.getElementById('tut-skip') as HTMLButtonElement;
  private flashTimer = 0;

  constructor(private readonly host: TutorialHost) {
    this.nextBtn.addEventListener('click', () => this.primary());
    this.skipBtn.addEventListener('click', () => this.host.exit(false));
  }

  get index(): number {
    return STEPS.indexOf(this.step);
  }

  start(s: GameState): void {
    this.targetId = s.shards.find((x) => x.tier === 3)?.id ?? -1;
    this.last = { x: s.drone.x, y: s.drone.y };
    this.go('goal', false);
  }

  /** main button / Enter: advance, or finish on the last card */
  primary(): void {
    if (this.step === 'done') this.host.exit(true);
    else this.go(STEPS[this.index + 1], false);
  }

  private go(step: TutStep, earned: boolean): void {
    this.step = step;
    this.held = 0;
    this.travel = 0;
    this.ammoTimer = 1; // check for reachable ammo right away
    document.body.dataset.tut = step;
    if (earned) {
      this.card.classList.remove('ok');
      void this.card.offsetWidth; // restart the flash animation
      this.card.classList.add('ok');
      clearTimeout(this.flashTimer);
      this.flashTimer = window.setTimeout(() => this.card.classList.remove('ok'), 700);
    }
    this.render();
  }

  /** Re-render the card (also used when the input device changes). */
  render(): void {
    const c = COPY[this.step];
    const touch = this.host.device() === 'touch';
    const action = this.step === 'move' || this.step === 'hook' || this.step === 'fling';
    this.stepEl.textContent = this.step === 'done' ? '\u2713' : `${this.index + 1}/4`;
    this.titleEl.innerHTML = c.title;
    this.textEl.innerHTML = touch ? c.touch : c.desktop;
    this.nextBtn.textContent = this.step === 'goal' ? 'GOT IT' : this.step === 'done' ? this.host.doneLabel() : 'NEXT';
    this.nextBtn.className = action ? 'ghost tut-btn' : 'cta tut-btn';
    this.skipBtn.classList.toggle('hidden', this.step === 'done');
    this.el.classList.toggle('waiting', action);
  }

  /** Called after every simulation step while the tutorial runs. */
  onSimStep(s: GameState): void {
    const d = s.drone;
    const L = TUTORIAL_LAYOUT;
    if (this.step === 'move') {
      this.travel += Math.hypot(d.x - this.last.x, d.y - this.last.y);
      if (Math.hypot(d.x - L.moveTarget.x, d.y - L.moveTarget.y) < L.moveRadius || this.travel > 900) {
        // arrive: brake so the drone settles near the ring instead of coasting past the ammo
        d.vx *= 0.25;
        d.vy *= 0.25;
        this.go('hook', true);
      }
    } else if (this.step === 'hook' || this.step === 'fling') {
      if (s.events.some((e) => e.type === 'break')) {
        this.go('done', true);
      } else if (this.step === 'hook') {
        this.held = s.tether.state === 'attached' ? this.held + SIM_DT : 0;
        if (this.held >= 0.6) this.go('fling', true);
      }
      if ((this.step as TutStep) !== 'done') this.ensureAmmo(s);
    }
    this.last = { x: d.x, y: d.y };
  }

  /** Keep one ammo crystal within reach so a missed throw never soft-locks the tutorial. */
  private ensureAmmo(s: GameState): void {
    this.ammoTimer += SIM_DT;
    if (this.ammoTimer < 0.6 || s.tether.state !== 'idle') return;
    this.ammoTimer = 0;
    const d = s.drone;
    const r2 = (TETHER.range * 0.8) ** 2;
    const near = s.shards.some(
      (sh) => sh.tier > 0 && sh.id !== this.targetId && (sh.x - d.x) ** 2 + (sh.y - d.y) ** 2 < r2,
    );
    if (near) return;
    // spawn a fresh small crystal next to the drone, on the side away from the target
    const t = s.shards.find((x) => x.id === this.targetId);
    let ax = t ? d.x - t.x : 0;
    let ay = t ? d.y - t.y : 1;
    const l = Math.hypot(ax, ay) || 1;
    ax /= l;
    ay /= l;
    const x = Math.min(ARENA_W - 60, Math.max(60, d.x + ax * 170));
    const y = Math.min(ARENA_H - 60, Math.max(60, d.y + ay * 170));
    const sh = makeShard(s, 1, x, y, 0, 0);
    sh.safe = 1;
    s.shards.push(sh);
  }

  /** Highlights for the renderer. */
  marks(s: GameState, aimTargetId = -1): TutMark[] {
    const L = TUTORIAL_LAYOUT;
    const target = s.shards.find((x) => x.id === this.targetId);
    const out: TutMark[] = [];
    if (this.step === 'goal') {
      out.push({ id: -1, label: 'YOU', color: DRONE_COLOR });
      if (target) out.push({ id: target.id, label: 'SMASH', color: '#ff2bd6' });
    } else if (this.step === 'move') {
      out.push({ x: L.moveTarget.x, y: L.moveTarget.y, r: L.moveRadius, label: 'FLY HERE', color: '#ffe14d', dashed: true });
    } else if (this.step === 'hook') {
      if (s.tether.state === 'idle' || s.tether.state === 'firing') {
        if (aimTargetId >= 0 && aimTargetId !== this.targetId) {
          // exactly the crystal the hook would grab right now
          out.push({ id: aimTargetId, label: 'HOOK THIS', color: '#ffe14d' });
        } else {
          // otherwise point at the nearest small crystal
          let best = -1;
          let bd = Infinity;
          for (const sh of s.shards) {
            if (sh.id === this.targetId || sh.tier === 0) continue;
            const dd = (sh.x - s.drone.x) ** 2 + (sh.y - s.drone.y) ** 2;
            if (dd < bd) {
              bd = dd;
              best = sh.id;
            }
          }
          const inRange = bd <= TETHER.range * TETHER.range;
          if (best >= 0) out.push({ id: best, label: inRange ? 'HOOK THIS' : 'GET CLOSER', color: '#ffe14d' });
        }
      } else {
        out.push({ id: -1, label: 'KEEP HOLDING', color: '#ffe14d' });
      }
    } else if (this.step === 'fling') {
      const attached = s.tether.state === 'attached';
      let aim = target;
      if (attached && target && s.tether.targetId === target.id) {
        // the big one is on the rope: point at the nearest other crystal instead
        let bd = Infinity;
        aim = undefined;
        for (const sh of s.shards) {
          if (sh.id === target.id || sh.tier === 0) continue;
          const dd = (sh.x - target.x) ** 2 + (sh.y - target.y) ** 2;
          if (dd < bd) {
            bd = dd;
            aim = sh;
          }
        }
      }
      if (aim) out.push({ id: aim.id, label: attached ? 'LET GO TOWARD ME' : 'TARGET', color: '#ff2bd6' });
    }
    return out;
  }

  show(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
    if (!on) delete document.body.dataset.tut;
  }
}

import type { GameState, SimInput } from '../sim/types';

export type Device = 'keyboard' | 'mouse' | 'touch';

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const HOOK_KEYS = new Set(['Space', 'KeyJ', 'KeyX', 'ShiftLeft', 'ShiftRight']);

const STICK_RADIUS = 60;

export interface InputCallbacks {
  onPauseKey(): void;
  onConfirmKey(): void;
  onDeviceChange(device: Device): void;
  /** true while the game wants gameplay input (not in menus) */
  isPlaying(): boolean;
}

/**
 * One input layer for keyboard, mouse and touch. Produces plain SimInput objects.
 * Touch controls are shown based on input capability / the first touch, never on screen width.
 */
export class InputManager {
  device: Device;
  readonly touchCapable: boolean;
  private keys = new Set<string>();
  private mouseDown = false;
  private mouseClient: { x: number; y: number } | null = null;
  private mouseTravel = 0;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stickVec = { x: 0, y: 0 };
  private hookTouches = new Set<number>();

  private stickEl = document.getElementById('stick') as HTMLElement;
  private knobEl = document.getElementById('stick-knob') as HTMLElement;
  private hookEl = document.getElementById('hook-btn') as HTMLElement;

  constructor(
    surface: HTMLElement,
    private readonly cb: InputCallbacks,
    private readonly toWorld: (cx: number, cy: number) => { x: number; y: number },
  ) {
    const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
    this.touchCapable = mq('(pointer: coarse)') || mq('(any-pointer: coarse)') || navigator.maxTouchPoints > 0;
    this.device = mq('(pointer: coarse)') ? 'touch' : 'keyboard';

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    surface.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    // a real touch anywhere switches to touch UI, even on "fine pointer" devices
    window.addEventListener('touchstart', () => this.setDevice('touch'), { passive: true, capture: true });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    this.layoutIdleStick();
    window.addEventListener('resize', () => this.layoutIdleStick());
  }

  private setDevice(d: Device): void {
    if (this.device === d) return;
    this.device = d;
    this.cb.onDeviceChange(d);
  }

  /** Drop all held inputs (used on pause / blur so nothing stays stuck). */
  releaseAll(): void {
    this.keys.clear();
    this.mouseDown = false;
    this.stickId = null;
    this.stickVec = { x: 0, y: 0 };
    this.hookTouches.clear();
    this.stickEl.classList.remove('active');
    this.hookEl.classList.remove('active');
    this.layoutIdleStick();
  }

  private layoutIdleStick(): void {
    if (this.stickId !== null) return;
    const m = Math.min(window.innerWidth, window.innerHeight);
    const x = Math.max(90, m * 0.17);
    this.placeStick(x, window.innerHeight - x, 0, 0);
  }

  private placeStick(x: number, y: number, kx: number, ky: number): void {
    this.stickEl.style.transform = `translate(${x}px, ${y}px)`;
    this.knobEl.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      if (!e.repeat) this.cb.onPauseKey();
      return;
    }
    if (e.code === 'Enter' || (e.code === 'Space' && !this.cb.isPlaying())) {
      if (!e.repeat && !this.cb.isPlaying()) {
        e.preventDefault();
        this.cb.onConfirmKey();
        return;
      }
    }
    if (MOVE_KEYS[e.code] || HOOK_KEYS.has(e.code)) {
      e.preventDefault();
      this.keys.add(e.code);
      this.setDevice('keyboard');
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      this.setDevice('touch');
      if (!this.cb.isPlaying()) return;
      e.preventDefault();
      if (e.clientX < window.innerWidth / 2 && this.stickId === null) {
        this.stickId = e.pointerId;
        this.stickOrigin = { x: e.clientX, y: e.clientY };
        this.stickVec = { x: 0, y: 0 };
        this.stickEl.classList.add('active');
        this.placeStick(e.clientX, e.clientY, 0, 0);
      } else {
        this.hookTouches.add(e.pointerId);
        this.hookEl.classList.add('active');
      }
      return;
    }
    // mouse
    if (e.button !== 0 || !this.cb.isPlaying()) return;
    e.preventDefault();
    this.mouseDown = true;
    this.mouseClient = { x: e.clientX, y: e.clientY };
    if (this.device === 'touch') this.setDevice('mouse');
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      if (this.mouseClient) {
        this.mouseTravel += Math.abs(e.clientX - this.mouseClient.x) + Math.abs(e.clientY - this.mouseClient.y);
      }
      this.mouseClient = { x: e.clientX, y: e.clientY };
      if (this.mouseTravel > 24 && this.cb.isPlaying()) {
        this.mouseTravel = 0;
        if (!this.anyMoveKey()) this.setDevice('mouse');
      }
      return;
    }
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickOrigin.x;
      let dy = e.clientY - this.stickOrigin.y;
      const l = Math.hypot(dx, dy);
      if (l > STICK_RADIUS) {
        dx *= STICK_RADIUS / l;
        dy *= STICK_RADIUS / l;
      }
      this.stickVec = { x: dx / STICK_RADIUS, y: dy / STICK_RADIUS };
      this.placeStick(this.stickOrigin.x, this.stickOrigin.y, dx, dy);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) this.mouseDown = false;
      return;
    }
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.stickVec = { x: 0, y: 0 };
      this.stickEl.classList.remove('active');
      this.layoutIdleStick();
    }
    if (this.hookTouches.delete(e.pointerId) && this.hookTouches.size === 0) {
      this.hookEl.classList.remove('active');
    }
  };

  private anyMoveKey(): boolean {
    for (const k of this.keys) if (MOVE_KEYS[k]) return true;
    return false;
  }

  /** Sample the current input for one simulation step. */
  sample(state: GameState): SimInput {
    let mx = 0;
    let my = 0;
    for (const k of this.keys) {
      const v = MOVE_KEYS[k];
      if (v) {
        mx += v[0];
        my += v[1];
      }
    }
    let aimX: number | null = null;
    let aimY: number | null = null;
    if (this.mouseClient && this.device === 'mouse') {
      const w = this.toWorld(this.mouseClient.x, this.mouseClient.y);
      aimX = w.x;
      aimY = w.y;
      if (mx === 0 && my === 0) {
        // steer the drone towards the cursor (dead zone near the drone)
        const dx = w.x - state.drone.x;
        const dy = w.y - state.drone.y;
        const l = Math.hypot(dx, dy);
        if (l > 28) {
          const k = Math.min(1, (l - 28) / 140) / l;
          mx = dx * k;
          my = dy * k;
        }
      }
    }
    if (this.stickId !== null) {
      const l = Math.hypot(this.stickVec.x, this.stickVec.y);
      if (l > 0.12) {
        mx += this.stickVec.x;
        my += this.stickVec.y;
      }
    }
    let hook = this.mouseDown || this.hookTouches.size > 0;
    for (const k of this.keys) if (HOOK_KEYS.has(k)) hook = true;
    return { moveX: mx, moveY: my, hook, aimX, aimY };
  }
}

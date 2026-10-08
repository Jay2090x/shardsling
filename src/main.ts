import './fonts.css';
import './style.css';
import { FixedStepper } from './engine/fixedStep';
import { InputManager, type Device } from './input/input';
import { Effects } from './render/fx';
import { Renderer } from './render/renderer';
import { heuristicInput } from './sim/bot';
import { SIM_DT } from './sim/constants';
import { createGame, pickTarget, step } from './sim/sim';
import type { GameState } from './sim/types';
import { loadBest, saveBest } from './storage';

type Screen = 'menu' | 'playing' | 'paused' | 'gameover';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const menuEl = $('menu');
const pauseEl = $('pause');
const gameoverEl = $('gameover');
const pauseBtn = $('pause-btn');
const touchUi = $('touch-ui');

const renderer = new Renderer(canvas);
const fx = new Effects();
const stepper = new FixedStepper(SIM_DT);

let screen: Screen = 'menu';
let state: GameState = createGame(0x5eed, 'attract');
let best = loadBest();
let gameOverAt = 0;
let pauseReason: 'user' | 'auto' | null = null;

const input = new InputManager(
  canvas,
  {
    onPauseKey: () => {
      if (screen === 'playing') pause('user');
      else if (screen === 'paused') resume();
    },
    onConfirmKey: () => {
      if (screen === 'menu') startGame();
      else if (screen === 'gameover' && performance.now() - gameOverAt > 600) startGame();
      else if (screen === 'paused') resume();
    },
    onDeviceChange: (d) => applyDevice(d),
    isPlaying: () => screen === 'playing',
  },
  renderer.toWorld,
);

function applyDevice(d: Device): void {
  const touch = d === 'touch';
  document.body.classList.toggle('touch', touch);
  $('controls-touch').classList.toggle('hidden', !touch);
  $('controls-desktop').classList.toggle('hidden', touch);
  touchUi.classList.toggle('hidden', !(touch && screen === 'playing'));
}

function show(el: HTMLElement, on: boolean): void {
  el.classList.toggle('hidden', !on);
}

function setScreen(next: Screen): void {
  screen = next;
  show(menuEl, next === 'menu');
  show(pauseEl, next === 'paused');
  show(gameoverEl, next === 'gameover');
  show(pauseBtn, next === 'playing');
  touchUi.classList.toggle('hidden', !(input.device === 'touch' && next === 'playing'));
  $('menu-best').textContent = best > 0 ? `Best: ${best}` : '';
}

function newSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

function startGame(): void {
  input.releaseAll();
  state = createGame(newSeed(), 'play');
  fx.clear();
  fx.banner = { text: 'WAVE 1', sub: '', life: 1.4 };
  stepper.reset();
  pauseReason = null;
  setScreen('playing');
  canvas.focus();
}

function pause(reason: 'user' | 'auto'): void {
  if (screen !== 'playing') return;
  pauseReason = reason;
  input.releaseAll();
  setScreen('paused');
}

function resume(): void {
  if (screen !== 'paused') return;
  pauseReason = null;
  stepper.reset();
  lastFrame = performance.now();
  setScreen('playing');
}

function toMenu(): void {
  input.releaseAll();
  state = createGame(newSeed(), 'attract');
  fx.clear();
  setScreen('menu');
}

function endGame(): void {
  if (state.score > best) {
    best = state.score;
    saveBest(best);
  }
  $('go-score').textContent = String(state.score);
  $('go-best').textContent = String(best);
  $('go-wave').textContent = String(state.wave);
  $('go-combo').textContent = String(state.maxCombo);
  gameOverAt = performance.now();
  setScreen('gameover');
}

$('play-btn').addEventListener('click', startGame);
$('again-btn').addEventListener('click', startGame);
$('restart-btn').addEventListener('click', startGame);
$('resume-btn').addEventListener('click', resume);
$('quit-btn').addEventListener('click', toMenu);
$('go-menu-btn').addEventListener('click', toMenu);
pauseBtn.addEventListener('click', () => pause('user'));
pauseBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

// auto-pause when the tab is hidden or the window/iframe loses focus
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') pause('auto');
});
window.addEventListener('blur', () => pause('auto'));
window.addEventListener('resize', () => renderer.resize());

// ---------------------------------------------------------------- main loop
let lastFrame = performance.now();
let gameOverTimer = 0;

function frame(now: number): void {
  const dt = Math.min((now - lastFrame) / 1000, 0.25);
  lastFrame = now;
  let alpha = 1;

  if (screen === 'playing' || screen === 'menu' || screen === 'gameover') {
    alpha = stepper.advance(dt, () => {
      const inp =
        screen === 'playing' ? input.sample(state) : state.mode === 'attract' ? heuristicInput(state) : input.sample(state);
      step(state, inp, SIM_DT);
      for (const e of state.events) fx.handle(e);
    });
    if (screen === 'playing' && state.phase === 'gameover') {
      gameOverTimer += dt;
      if (gameOverTimer > 1.1) {
        gameOverTimer = 0;
        endGame();
      }
    }
  }
  if (screen !== 'paused') fx.update(dt);
  let preview = null;
  if (screen === 'playing') {
    const cur = input.sample(state);
    const target = pickTarget(state, cur);
    preview = { targetId: target ? target.id : -1, hookHeld: cur.hook };
  }
  renderer.render(state, alpha, fx, now / 1000, screen !== 'menu', preview);
  requestAnimationFrame(frame);
}

applyDevice(input.device);
setScreen('menu');
// draw with the real fonts as soon as they are available (self-hosted)
document.fonts?.load('900 20px Orbitron').catch(() => undefined);
requestAnimationFrame(frame);

// Test hook for the local Playwright checks (only with ?e2e in the URL).
if (new URLSearchParams(location.search).has('e2e')) {
  (window as unknown as Record<string, unknown>).__shardsling = {
    get screen() {
      return screen;
    },
    get pauseReason() {
      return pauseReason;
    },
    get device() {
      return input.device;
    },
    get touchCapable() {
      return input.touchCapable;
    },
    get state() {
      return state;
    },
    loseAllLives() {
      state.lives = 1;
      state.drone.invuln = 0;
      const sh = state.shards.find((x) => x.tier > 0);
      if (sh) {
        sh.x = state.drone.x + 30;
        sh.y = state.drone.y;
        sh.safe = 0;
      }
    },
  };
}

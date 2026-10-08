import './fonts.css';
import './style.css';
import { GameAudio } from './audio/audio';
import { FixedStepper } from './engine/fixedStep';
import { InputManager, type Device } from './input/input';
import { Effects } from './render/fx';
import { Renderer } from './render/renderer';
import { heuristicInput } from './sim/bot';
import { SIM_DT } from './sim/constants';
import { choosePerk, createGame, createTutorial, perkOfferReady, pickTarget, spawnWave, step } from './sim/sim';
import type { GameState, SimEvent } from './sim/types';
import { PERK_INFO } from './perkInfo';
import { loadBest, loadTutorialDone, saveBest, saveTutorialDone } from './storage';
import { Tutorial } from './tutorial';

type Screen = 'menu' | 'playing' | 'paused' | 'gameover' | 'tutorial' | 'perk';

/** perk cards ignore input this long after they appear (players are usually still mashing the hook) */
const PERK_LOCK_MS = 450;
/** hit-freeze on big smashes: ~3 frames at 60 Hz, at most once per HITSTOP_GAP seconds */
const HITSTOP = 0.045;
const HITSTOP_GAP = 0.35;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const menuEl = $('menu');
const pauseEl = $('pause');
const gameoverEl = $('gameover');
const pauseBtn = $('pause-btn');
const touchUi = $('touch-ui');
const perksEl = $('perks');
const perkCards = $('perk-cards');
const muteBtn = $('mute-btn');

const renderer = new Renderer(canvas);
const fx = new Effects();
const stepper = new FixedStepper(SIM_DT);
const audio = new GameAudio();

let screen: Screen = 'menu';
let state: GameState = createGame(0x5eed, 'attract');
let best = loadBest();
let gameOverAt = 0;
let pauseReason: 'user' | 'auto' | null = null;
let tutOrigin: 'first' | 'menu' | 'pause' = 'menu';
let savedGame: GameState | null = null;
let perkShownAt = 0;
let perkFocus = 0;
let hitstop = 0;
let hitstopCooldown = 0;
let frozenMs = 0;

const input = new InputManager(
  canvas,
  {
    onPauseKey: () => {
      if (screen === 'perk') return;
      if (screen === 'tutorial') exitTutorial(false);
      else if (screen === 'playing') pause('user');
      else if (screen === 'paused') resume();
    },
    onConfirmKey: () => {
      if (screen === 'menu') play();
      else if (screen === 'gameover' && performance.now() - gameOverAt > 600) startGame();
      else if (screen === 'paused') resume();
      else if (screen === 'perk') pickPerk(perkFocus);
    },
    onDeviceChange: (d) => applyDevice(d),
    isPlaying: () => screen === 'playing' || screen === 'tutorial',
  },
  renderer.toWorld,
);

function applyDevice(d: Device): void {
  const touch = d === 'touch';
  document.body.classList.toggle('touch', touch);
  $('controls-touch').classList.toggle('hidden', !touch);
  $('controls-desktop').classList.toggle('hidden', touch);
  touchUi.classList.toggle('hidden', !(touch && (screen === 'playing' || screen === 'tutorial')));
  if (screen === 'tutorial') tutorial.render();
}

const tutorial = new Tutorial({
  device: () => input.device,
  exit: (finished) => exitTutorial(finished),
  doneLabel: () => (tutOrigin === 'pause' ? 'BACK TO GAME' : 'PLAY'),
});

function show(el: HTMLElement, on: boolean): void {
  el.classList.toggle('hidden', !on);
}

function setScreen(next: Screen): void {
  screen = next;
  show(menuEl, next === 'menu');
  show(pauseEl, next === 'paused');
  show(gameoverEl, next === 'gameover');
  show(perksEl, next === 'perk');
  show(pauseBtn, next === 'playing');
  document.body.classList.toggle('in-game', next === 'playing');
  audio.setActive(next !== 'paused' && document.visibilityState !== 'hidden');
  touchUi.classList.toggle('hidden', !(input.device === 'touch' && (next === 'playing' || next === 'tutorial')));
  tutorial.show(next === 'tutorial');
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
  hitstop = 0;
  setScreen('playing');
  audio.setIntensity(0);
  audio.startMusic();
  canvas.focus();
}

// ---------------------------------------------------------------- perks
function openPerks(): void {
  const offer = state.perkOffer;
  if (!offer) return;
  input.releaseAll();
  perkCards.textContent = '';
  offer.forEach((id, i) => {
    const info = PERK_INFO[id];
    const lvl = state.perks[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'perk-card';
    b.dataset.perk = id;
    b.innerHTML =
      `<span class="perk-key">${i + 1}</span>` +
      `<svg viewBox="0 0 24 24" aria-hidden="true">${info.icon}</svg>` +
      `<b>${info.name}</b><span class="perk-desc">${info.desc}</span>` +
      `<span class="perk-lvl">${id === 'life' ? `${state.lives} → ${state.lives + 1} lives` : lvl > 0 ? `Level ${lvl} → ${lvl + 1}` : 'New'}</span>`;
    b.addEventListener('click', () => pickPerk(i));
    b.addEventListener('pointerenter', () => setPerkFocus(i));
    perkCards.appendChild(b);
  });
  $('perk-kicker').textContent = `WAVE ${state.wave} CLEAR`;
  perkShownAt = performance.now();
  perksEl.classList.add('locked');
  window.setTimeout(() => perksEl.classList.remove('locked'), PERK_LOCK_MS);
  setScreen('perk');
  setPerkFocus(input.device === 'touch' ? -1 : 0);
}

function setPerkFocus(i: number): void {
  perkFocus = i;
  perkCards.querySelectorAll('.perk-card').forEach((el, k) => el.classList.toggle('focus', k === i));
}

function pickPerk(i: number): void {
  if (screen !== 'perk' || i < 0 || performance.now() - perkShownAt < PERK_LOCK_MS) return;
  const id = state.perkOffer?.[i];
  if (!id || !choosePerk(state, i)) return;
  for (const e of state.events) if (e.type === 'perk') audio.handle(e);
  fx.texts.push({ x: state.drone.x, y: state.drone.y - 46, text: PERK_INFO[id].name.toUpperCase(), life: 1.3, color: '#ffe14d' });
  stepper.reset();
  lastFrame = performance.now();
  setScreen('playing');
  canvas.focus();
}

// ---------------------------------------------------------------- sound
function updateMuteBtn(): void {
  muteBtn.classList.toggle('muted', audio.muted);
  muteBtn.setAttribute('aria-pressed', String(audio.muted));
  muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
  muteBtn.title = audio.muted ? 'Sound off (M)' : 'Sound on (M)';
}
function toggleMute(): void {
  audio.toggleMute();
  updateMuteBtn();
}
muteBtn.addEventListener('click', toggleMute);
muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
updateMuteBtn();

/** Sounds + cosmetic reactions to one simulation event (sounds only for the player's own game, not the menu demo). */
function onSimEvent(e: SimEvent): void {
  fx.handle(e);
  if (screen !== 'playing' && screen !== 'tutorial') return;
  audio.handle(e);
  if (e.type === 'wave') audio.setIntensity(e.boss ? 1 : 0);
  if (e.type === 'gameover') audio.stopMusic(1.2);
  if (screen === 'playing') {
    const big =
      (e.type === 'break' && e.tier >= 2 && e.points > 0) || e.type === 'enemyKill' || e.type === 'bossHit';
    if (big && hitstopCooldown <= 0) {
      hitstop = e.type === 'enemyKill' && e.kind === 'boss' ? HITSTOP * 3 : HITSTOP;
      hitstopCooldown = HITSTOP_GAP;
    }
  }
}

/** PLAY in the menu: the first time, the tutorial runs before the first game. */
function play(): void {
  if (loadTutorialDone()) startGame();
  else openTutorial('first');
}

function openTutorial(origin: 'first' | 'menu' | 'pause'): void {
  input.releaseAll();
  tutOrigin = origin;
  savedGame = origin === 'pause' ? state : null;
  state = createTutorial(newSeed());
  fx.clear();
  stepper.reset();
  tutorial.start(state);
  setScreen('tutorial');
  audio.setIntensity(0);
  audio.startMusic();
  canvas.focus();
}

/** finished: the player pressed the main button on the last card (PLAY / BACK TO GAME). */
function exitTutorial(finished: boolean): void {
  if (screen !== 'tutorial') return;
  saveTutorialDone();
  input.releaseAll();
  if (tutOrigin === 'pause' && savedGame) {
    state = savedGame;
    savedGame = null;
    fx.clear();
    pauseReason = 'user';
    setScreen('paused');
  } else if (finished || tutOrigin === 'first') {
    startGame();
  } else {
    toMenu();
  }
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
  audio.stopMusic(0.3);
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

$('play-btn').addEventListener('click', play);
$('howto-btn').addEventListener('click', () => openTutorial('menu'));
$('pause-howto-btn').addEventListener('click', () => openTutorial('pause'));
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
  audio.setActive(document.visibilityState !== 'hidden' && screen !== 'paused');
  if (screen === 'tutorial') input.releaseAll();
});
window.addEventListener('blur', () => {
  pause('auto');
  if (screen === 'tutorial') input.releaseAll();
});
// Enter = main tutorial button (Space stays the hook key)
window.addEventListener('keydown', (e) => {
  if (screen === 'tutorial' && e.code === 'Enter' && !e.repeat) {
    e.preventDefault();
    tutorial.primary();
  }
  if (e.code === 'KeyM' && !e.repeat) toggleMute();
  if (screen === 'perk' && !e.repeat) {
    const n = state.perkOffer?.length ?? 0;
    const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) pickPerk(Number(digit[2]) - 1);
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') setPerkFocus((Math.max(0, perkFocus) - 1 + n) % n);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') setPerkFocus((perkFocus + 1) % n);
  }
});
window.addEventListener('resize', () => renderer.resize());

// ---------------------------------------------------------------- main loop
let lastFrame = performance.now();
let gameOverTimer = 0;

function frame(now: number): void {
  const dt = Math.min((now - lastFrame) / 1000, 0.25);
  lastFrame = now;
  let alpha = 1;

  if (hitstopCooldown > 0) hitstopCooldown -= dt;
  if (hitstop > 0 && screen === 'playing') {
    // hit-freeze: hold the world for a few frames (effects keep moving)
    hitstop -= dt;
    frozenMs += dt * 1000;
  } else if (screen !== 'paused' && screen !== 'perk') {
    alpha = stepper.advance(dt, () => {
      if (screen === 'perk') return; // the offer appeared earlier in this frame
      const inp =
        screen === 'playing' || screen === 'tutorial'
          ? input.sample(state)
          : state.mode === 'attract'
            ? heuristicInput(state)
            : input.sample(state);
      step(state, inp, SIM_DT);
      for (const e of state.events) onSimEvent(e);
      if (screen === 'tutorial') tutorial.onSimStep(state);
      if (screen === 'playing' && perkOfferReady(state)) openPerks();
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
  if (screen === 'gameover' || screen === 'menu') hitstop = 0;
  let preview = null;
  if (screen === 'playing' || screen === 'tutorial') {
    const cur = input.sample(state);
    const target = pickTarget(state, cur);
    preview = { targetId: target ? target.id : -1, hookHeld: cur.hook };
  }
  const marks = screen === 'tutorial' ? tutorial.marks(state, preview ? preview.targetId : -1) : null;
  renderer.render(state, alpha, fx, now / 1000, screen !== 'menu', preview, marks);
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
    get tutStep() {
      return screen === 'tutorial' ? tutorial.step : null;
    },
    get frozenMs() {
      return frozenMs;
    },
    get audio() {
      return { ctx: audio.ctx ? audio.ctx.state : 'none', muted: audio.muted, music: audio.musicPlaying };
    },
    /** clear the field: the wave ends on the next step and (play mode) offers perks */
    clearField() {
      state.shards = [];
      state.enemies = [];
    },
    /** jump straight to wave n (screenshots / checks of later waves) */
    jumpToWave(n: number) {
      state.shards = [];
      state.enemies = [];
      state.perkOffer = null;
      state.waveTimer = 0;
      spawnWave(state, n);
      for (const e of state.events) onSimEvent(e);
      state.events = [];
    },
    loseAllLives() {
      state.lives = 1;
      state.drone.invuln = 0;
      state.tether.state = 'idle';
      state.tether.targetId = -1;
      const sh = state.shards.find((x) => x.tier > 0);
      if (sh) {
        sh.x = state.drone.x + 30;
        sh.y = state.drone.y;
        sh.vx = -120;
        sh.vy = 0;
        sh.safe = 0;
      }
    },
    /** move the smallest solid shard right next to the drone (makes hook checks independent of the random seed) */
    shardInReach() {
      const solid = state.shards.filter((x) => x.tier > 0).sort((a, b) => a.tier - b.tier);
      const sh = solid[0];
      if (!sh) return;
      sh.x = Math.min(1500, state.drone.x + 130);
      sh.y = state.drone.y;
      sh.vx = sh.vy = 0;
      sh.safe = 1;
    },
  };
}

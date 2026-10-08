// Local browser checks + screenshots against the production build (vite preview).
// Nothing leaves the machine: every request that is not localhost fails the run.
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright';
import { preview } from 'vite';

const PORT = 4317;
const BASE = `http://localhost:${PORT}/`;
const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cands = [
    `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
    '/usr/bin/google-chrome',
  ];
  return cands.find((p) => existsSync(p));
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const server = await preview({ preview: { port: PORT, strictPort: true, host: 'localhost' }, logLevel: 'warn' });

const browser = await chromium.launch({ executablePath: findChromium(), headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(name, ctxOpts, { freshPlayer = false } = {}) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...ctxOpts });
  // the older checks play as a returning player (tutorial already seen); the tutorial checks start fresh
  if (!freshPlayer) await ctx.addInitScript(() => localStorage.setItem('shardsling.tutorialDone', '1'));
  const page = await ctx.newPage();
  const external = [];
  const errors = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) external.push(r.url());
  });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}?e2e`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(400);
  return { ctx, page, external, errors, name };
}
const G = (page, expr) => page.evaluate(`window.__shardsling.${expr}`);
const visible = (page, sel) => page.locator(sel).isVisible();

async function finish(p) {
  check(`[${p.name}] no external requests`, p.external.length === 0, p.external.join(', '));
  check(`[${p.name}] no console errors`, p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();
}

// ------------------------------------------------------------ desktop 1280x720
{
  const p = await newPage('desktop 1280x720', { viewport: { width: 1280, height: 720 } });
  const { page } = p;
  await page.screenshot({ path: `${OUT}desktop-1280x720-menu.png` });
  check('[desktop] menu shows keyboard hints', await visible(page, '#controls-desktop'));
  check('[desktop] touch controls hidden', !(await visible(page, '#touch-ui')));
  const body = await page.textContent('body');
  // the predecessor's trademarked name must not appear (assembled so it never appears in the source either)
  const oldName = new RegExp(['aster', 'oid'].join(''), 'i');
  check('[desktop] old trademarked name not in UI', !oldName.test(body));
  check('[desktop] no AI claims in UI', !/\bAI\b|neural|mission control/i.test(body));

  // menu background runs a scripted demo (heuristic, not a learned AI); grab an action frame
  await page.evaluate(() => (document.getElementById('menu').style.visibility = 'hidden'));
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if ((await G(page, 'state.breaks')) > 0) break;
  }
  await sleep(120);
  await page.screenshot({ path: `${OUT}desktop-1280x720-demo-action.png` });
  await page.evaluate(() => (document.getElementById('menu').style.visibility = ''));

  await page.click('#play-btn');
  check('[desktop] one click starts the game', (await G(page, 'screen')) === 'playing');

  // play a bit: move, hook and swing, release
  // (wave 1 always starts with one shard inside hook range)
  await page.keyboard.down('Space');
  await sleep(900);
  const tether = await G(page, 'state.tether.state');
  check('[desktop] holding Space hooks a shard', tether === 'attached' || tether === 'firing', tether);
  await page.screenshot({ path: `${OUT}desktop-1280x720-swing.png` });
  await page.keyboard.up('Space');
  await sleep(250);
  await page.screenshot({ path: `${OUT}desktop-1280x720-fling.png` });
  const dx0 = await G(page, 'state.drone.x');
  await page.keyboard.down('KeyD');
  await sleep(350);
  await page.keyboard.up('KeyD');
  const dx1 = await G(page, 'state.drone.x');
  check('[desktop] D moves the drone right', dx1 > dx0 + 20, `${dx0.toFixed(0)} -> ${dx1.toFixed(0)}`);

  // sim speed vs wall clock in a real browser
  const r = await page.evaluate(async () => {
    const s = window.__shardsling;
    const t0 = performance.now();
    const k0 = s.state.tick;
    const f0 = s.frozenMs;
    await new Promise((res) => setTimeout(res, 2000));
    // hit-freeze on big smashes pauses the sim on purpose: measure the running time only
    return { ticks: s.state.tick - k0, ms: performance.now() - t0 - (s.frozenMs - f0) };
  });
  const rate = r.ticks / (r.ms / 1000);
  check('[desktop] simulation runs at ~120 steps/s in the browser', rate > 108 && rate < 126, `${rate.toFixed(1)}/s`);

  // pause: key
  await page.keyboard.press('KeyP');
  check('[desktop] P pauses', (await G(page, 'screen')) === 'paused');
  const tickA = await G(page, 'state.tick');
  await sleep(300);
  check('[desktop] simulation frozen while paused', (await G(page, 'state.tick')) === tickA);
  await page.screenshot({ path: `${OUT}desktop-1280x720-paused.png` });
  await page.keyboard.press('Escape');
  check('[desktop] Esc resumes', (await G(page, 'screen')) === 'playing');

  // pause: button
  await page.click('#pause-btn');
  check('[desktop] pause button pauses', (await G(page, 'screen')) === 'paused');
  await page.click('#resume-btn');
  check('[desktop] resume button resumes', (await G(page, 'screen')) === 'playing');

  // auto pause on visibilitychange
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  check('[desktop] auto-pause on tab hidden', (await G(page, 'screen')) === 'paused' && (await G(page, 'pauseReason')) === 'auto');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
  await page.click('#resume-btn');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('[desktop] auto-pause on window blur', (await G(page, 'screen')) === 'paused');
  await page.click('#resume-btn');

  // mouse: hold click to hook (put a shard in reach first, the wave layout is random)
  await page.mouse.move(700, 380);
  await page.mouse.move(760, 400);
  await page.evaluate(() => window.__shardsling.shardInReach());
  await page.mouse.down();
  await sleep(700);
  const t2 = await G(page, 'state.tether.state');
  check('[desktop] holding the mouse button hooks', t2 === 'attached' || t2 === 'firing', t2);
  await page.mouse.up();

  // game over + restart
  await page.evaluate(() => window.__shardsling.loseAllLives());
  await sleep(1800);
  check('[desktop] game over screen', (await G(page, 'screen')) === 'gameover');
  await page.screenshot({ path: `${OUT}desktop-1280x720-gameover.png` });
  await page.click('#again-btn');
  check('[desktop] restart works', (await G(page, 'screen')) === 'playing' && (await G(page, 'state.lives')) === 3);
  await finish(p);
}

// ------------------------------------------------------------ small desktop iframe 907x510: no touch UI
{
  const p = await newPage('desktop 907x510', { viewport: { width: 907, height: 510 } });
  const { page } = p;
  await page.click('#play-btn');
  await sleep(300);
  check('[907x510 desktop] no touch controls despite small width', !(await visible(page, '#touch-ui')));
  await page.screenshot({ path: `${OUT}desktop-907x510-play.png` });
  await finish(p);
}

// ------------------------------------------------------------ 800x450 (smallest portal iframe)
{
  const p = await newPage('desktop 800x450', { viewport: { width: 800, height: 450 } });
  const { page } = p;
  const box = await page.locator('#menu .panel').boundingBox();
  check('[800x450] menu fits without scrolling', box && box.y >= 0 && box.y + box.height <= 450, JSON.stringify(box));
  await page.screenshot({ path: `${OUT}desktop-800x450-menu.png` });
  await finish(p);
}

// ------------------------------------------------------------ tablet 1080x607 with touch emulation
async function touchSession(page) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  return { touch };
}
{
  const p = await newPage('tablet 1080x607 touch', {
    viewport: { width: 1080, height: 607 },
    hasTouch: true,
    isMobile: true,
  });
  const { page } = p;
  check('[tablet] detects touch capability', (await G(page, 'touchCapable')) === true);
  check('[tablet] menu shows touch hints', await visible(page, '#controls-touch'));
  await page.screenshot({ path: `${OUT}tablet-1080x607-touch-menu.png` });
  await page.tap('#play-btn');
  await sleep(200);
  check('[tablet] one tap starts', (await G(page, 'screen')) === 'playing');
  check('[tablet] touch controls visible at 1080px width', await visible(page, '#touch-ui'));

  const { touch } = await touchSession(page);
  // right thumb: hold (wave 1 always starts with one shard inside hook range; use a light one so the stick check is stable)
  await page.evaluate(() => window.__shardsling.shardInReach());
  await touch('touchStart', [{ x: 960, y: 500, id: 2 }]);
  await sleep(900);
  const ts = await G(page, 'state.tether.state');
  check('[tablet] holding right side hooks', ts === 'attached' || ts === 'firing', ts);
  // left thumb: drag the stick to the right while still holding
  const x0 = await G(page, 'state.drone.x');
  await touch('touchStart', [{ x: 960, y: 500, id: 2 }, { x: 150, y: 460, id: 1 }]);
  await touch('touchMove', [{ x: 960, y: 500, id: 2 }, { x: 210, y: 460, id: 1 }]);
  await sleep(500);
  const x1 = await G(page, 'state.drone.x');
  check('[tablet] virtual stick moves the drone (two-thumb play)', x1 > x0 + 20, `${x0.toFixed(0)} -> ${x1.toFixed(0)}`);
  await page.screenshot({ path: `${OUT}tablet-1080x607-touch-swing.png` });
  await touch('touchEnd', []);
  await sleep(300);
  check('[tablet] release frees the rope', (await G(page, 'state.tether.state')) !== 'attached');
  await finish(p);
}

// ------------------------------------------------------------ phone portrait + landscape
for (const [label, vp] of [
  ['phone-390x844-portrait', { width: 390, height: 844 }],
  ['phone-844x390-landscape', { width: 844, height: 390 }],
]) {
  const p = await newPage(label, { viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const { page } = p;
  await page.screenshot({ path: `${OUT}${label}-menu.png` });
  const box = await page.locator('#menu .panel').boundingBox();
  check(`[${label}] menu fits on screen`, box && box.y >= 0 && box.y + box.height <= vp.height + 1, JSON.stringify(box));
  await page.tap('#play-btn');
  await sleep(200);
  check(`[${label}] touch controls visible`, await visible(page, '#touch-ui'));
  const { touch } = await touchSession(page);
  await touch('touchStart', [{ x: vp.width - 60, y: vp.height - 80, id: 3 }]);
  await sleep(900);
  await page.screenshot({ path: `${OUT}${label}-play.png` });
  await touch('touchEnd', []);
  await finish(p);
}

// ------------------------------------------------------------ first-run tutorial
const TUT = (name) => `${OUT}tutorial-${name}.png`;
const waitFor = async (page, expr, want, ms = 6000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await G(page, expr)) === want) return true;
    await sleep(40);
  }
  return false;
};
// In-page helper: waits (per animation frame) until the swung crystal flies toward the big target, then lets go
// with a real input event on the page: a Space keyup (keyboard) or touch pointerups (touch). Doing this inside the
// page avoids the test-runner round trip, which is too slow for frame-exact timing.
const releaseWhenAligned = (page, kind) =>
  page.evaluate(
    (kind) =>
      new Promise((res) => {
        const t0 = performance.now();
        let prev = null;
        const tick = () => {
          const s = window.__shardsling.state;
          if (s.tether.state === 'attached') {
            const held = s.shards.find((x) => x.id === s.tether.targetId);
            // aim at the big crystal; if that one is on the rope, at any other solid crystal
            const target =
              s.shards.find((x) => x.tier === 3 && x !== held) ?? s.shards.find((x) => x.tier > 0 && x !== held);
            if (held && target && Math.hypot(held.vx, held.vy) > 550) {
              // signed angle between the crystal's flight direction and the direction to the target
              const ang = Math.atan2(target.y - held.y, target.x - held.x) - Math.atan2(held.vy, held.vx);
              const th = Math.atan2(Math.sin(ang), Math.cos(ang));
              // the release takes effect in this same frame: let go on the frame closest to 0
              // (consecutive frames differ by dlt, so one of them is within half a step)
              if (prev !== null) {
                const dlt = Math.atan2(Math.sin(th - prev), Math.cos(th - prev));
                if (Math.abs(dlt) < 0.6 && Math.abs(th) <= Math.abs(dlt) / 2 + 0.02) {
                  if (kind === 'key') window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
                  else for (let id = 0; id < 64; id++) window.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: 'touch' }));
                  return res(true);
                }
              }
              prev = th;
            } else prev = null;
          } else prev = null;
          if (performance.now() - t0 > 5000) return res(false);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    kind,
  );

// desktop: keyboard
{
  const p = await newPage('tutorial desktop 1280x720', { viewport: { width: 1280, height: 720 } }, { freshPlayer: true });
  const { page } = p;
  check('[tutorial desktop] menu has a HOW TO PLAY button', await visible(page, '#howto-btn'));
  await page.click('#play-btn');
  check('[tutorial desktop] first PLAY opens the tutorial', (await G(page, 'screen')) === 'tutorial' && (await G(page, 'tutStep')) === 'goal');
  check('[tutorial desktop] goal step explains the goal and 3 lives', /flinging crystals into each other/.test(await page.textContent('#tut-text')) && /3 lives/.test(await page.textContent('#tut-text')));
  check('[tutorial desktop] no touch zones on desktop', !(await visible(page, '#zone-move')));
  check('[tutorial desktop] skip button visible', await visible(page, '#tut-skip'));
  await sleep(300);
  await page.screenshot({ path: TUT('desktop-1-goal') });
  await page.click('#tut-next');
  check('[tutorial desktop] GOT IT -> move step', (await G(page, 'tutStep')) === 'move');
  check('[tutorial desktop] move prompt names WASD', /WASD/.test(await page.textContent('#tut-text')));
  await sleep(300);
  await page.screenshot({ path: TUT('desktop-2-move') });
  // learning by doing: fly right into the ring -> advances on its own
  await page.keyboard.down('KeyD');
  const moved = await waitFor(page, 'tutStep', 'hook', 4000);
  await page.keyboard.up('KeyD');
  check('[tutorial desktop] flying into the ring advances to hook', moved);
  check('[tutorial desktop] hook prompt names Space', /Space/.test(await page.textContent('#tut-text')));
  await sleep(500);
  await page.screenshot({ path: TUT('desktop-3-hook') });
  // hold Space: hook + swing -> fling step
  await page.keyboard.down('Space');
  const swung = await waitFor(page, 'tutStep', 'fling', 4000);
  check('[tutorial desktop] holding Space (hook + swing) advances to fling', swung);
  await sleep(150);
  await page.screenshot({ path: TUT('desktop-4-fling') });
  // release when the crystal swings toward the big one; retry a few times if it misses
  let done = false;
  for (let attempt = 0; attempt < 5 && !done; attempt++) {
    if (attempt > 0) {
      await page.keyboard.down('Space');
      await waitFor(page, 'state.tether.state', 'attached', 3000);
      await sleep(500);
    }
    await releaseWhenAligned(page, 'key');
    await page.keyboard.up('Space');
    done = await waitFor(page, 'tutStep', 'done', 2500);
  }
  check('[tutorial desktop] letting go into the big crystal breaks it -> done card', done);
  await sleep(250);
  await page.screenshot({ path: TUT('desktop-5-done') });
  check('[tutorial desktop] done card offers PLAY', (await page.textContent('#tut-next')).trim() === 'PLAY');
  await page.click('#tut-next');
  check('[tutorial desktop] PLAY starts a real game (3 lives, wave 1)', (await G(page, 'screen')) === 'playing' && (await G(page, 'state.mode')) === 'play' && (await G(page, 'state.lives')) === 3);
  check('[tutorial desktop] tutorialDone saved in localStorage', (await page.evaluate(() => localStorage.getItem('shardsling.tutorialDone'))) === '1');
  // pause -> how to play -> skip returns to the same paused game
  await page.click('#pause-btn');
  const tick = await G(page, 'state.tick');
  check('[tutorial desktop] pause screen has HOW TO PLAY', await visible(page, '#pause-howto-btn'));
  await page.click('#pause-howto-btn');
  check('[tutorial desktop] HOW TO PLAY from pause opens the tutorial', (await G(page, 'screen')) === 'tutorial' && (await G(page, 'state.mode')) === 'tutorial');
  await page.keyboard.press('Escape');
  check('[tutorial desktop] Esc leaves it and returns to the paused game', (await G(page, 'screen')) === 'paused' && (await G(page, 'state.tick')) === tick && (await G(page, 'state.mode')) === 'play');
  await page.click('#quit-btn');
  // second visit: PLAY goes straight into the game, HOW TO PLAY still replays it
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(300);
  await page.click('#play-btn');
  check('[tutorial desktop] returning player: PLAY skips the tutorial', (await G(page, 'screen')) === 'playing');
  await page.keyboard.press('KeyP');
  await page.click('#quit-btn');
  await page.click('#howto-btn');
  check('[tutorial desktop] menu HOW TO PLAY replays it', (await G(page, 'screen')) === 'tutorial' && (await G(page, 'tutStep')) === 'goal');
  await page.click('#tut-skip');
  check('[tutorial desktop] SKIP from the menu returns to the menu', (await G(page, 'screen')) === 'menu');
  await finish(p);
}

// desktop: SKIP on first play goes straight into the game and is remembered
{
  const p = await newPage('tutorial skip 1280x720', { viewport: { width: 1280, height: 720 } }, { freshPlayer: true });
  const { page } = p;
  await page.keyboard.press('Enter');
  check('[tutorial skip] Enter in the menu opens the tutorial for a new player', (await G(page, 'screen')) === 'tutorial');
  await page.click('#tut-skip');
  check('[tutorial skip] SKIP on first play starts the game', (await G(page, 'screen')) === 'playing' && (await G(page, 'state.mode')) === 'play');
  check('[tutorial skip] skipping is remembered', (await page.evaluate(() => localStorage.getItem('shardsling.tutorialDone'))) === '1');
  await finish(p);
}

// touch: phone landscape (two thumbs) + tablet
for (const [label, vp, dsf] of [
  ['phone-844x390', { width: 844, height: 390 }, 2],
  ['tablet-1080x607', { width: 1080, height: 607 }, 1],
]) {
  const shots = label.startsWith('phone');
  const p = await newPage(`tutorial ${label} touch`, { viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: dsf }, { freshPlayer: true });
  const { page } = p;
  const box = await page.locator('#menu .panel').boundingBox();
  check(`[tutorial ${label}] menu with HOW TO PLAY still fits`, box && box.y >= 0 && box.y + box.height <= vp.height + 1, JSON.stringify(box));
  await page.tap('#play-btn');
  await sleep(200);
  check(`[tutorial ${label}] first tap on PLAY opens the tutorial`, (await G(page, 'screen')) === 'tutorial');
  check(`[tutorial ${label}] touch zones are labeled`, (await visible(page, '#zone-move')) && (await visible(page, '#zone-hook')) &&
    /MOVE/.test(await page.textContent('#zone-move')) && /HOLD TO HOOK/.test(await page.textContent('#zone-hook')));
  const card = await page.locator('#tut-card').boundingBox();
  check(`[tutorial ${label}] card fits on screen`, card && card.y >= 0 && card.y + card.height < vp.height * 0.45, JSON.stringify(card));
  if (shots) await page.screenshot({ path: TUT('phone-1-goal') });
  await page.tap('#tut-next');
  check(`[tutorial ${label}] touch move prompt`, /left side/.test(await page.textContent('#tut-text')));
  await sleep(250);
  if (shots) await page.screenshot({ path: TUT('phone-2-move') });
  const { touch } = await touchSession(page);
  // left thumb: drag right
  const sx = 150;
  const sy = vp.height - 120;
  await touch('touchStart', [{ x: sx, y: sy, id: 1 }]);
  await touch('touchMove', [{ x: sx + 60, y: sy, id: 1 }]);
  const moved = await waitFor(page, 'tutStep', 'hook', 4000);
  await touch('touchEnd', []);
  check(`[tutorial ${label}] dragging the left stick advances to hook`, moved);
  check(`[tutorial ${label}] touch hook prompt`, /right side/.test(await page.textContent('#tut-text')));
  await sleep(500);
  if (shots) await page.screenshot({ path: TUT('phone-3-hook') });
  // right thumb: hold
  const hx = vp.width - 90;
  const hy = vp.height - 80;
  await touch('touchStart', [{ x: hx, y: hy, id: 2 }]);
  const swung = await waitFor(page, 'tutStep', 'fling', 4000);
  check(`[tutorial ${label}] holding the right side advances to fling`, swung);
  await sleep(150);
  if (shots) await page.screenshot({ path: TUT('phone-4-fling') });
  let done = false;
  for (let attempt = 0; attempt < 6 && !done; attempt++) {
    if (attempt > 0) {
      await touch('touchStart', [{ x: hx, y: hy, id: 2 }]);
      await waitFor(page, 'state.tether.state', 'attached', 3000);
      await sleep(500);
    }
    await releaseWhenAligned(page, 'touch');
    await touch('touchEnd', []);
    done = await waitFor(page, 'tutStep', 'done', 2500);
  }
  check(`[tutorial ${label}] lifting the thumb flings into the big crystal -> done`, done);
  await sleep(250);
  if (shots) await page.screenshot({ path: TUT('phone-5-done') });
  await page.tap('#tut-next');
  check(`[tutorial ${label}] PLAY starts the game, zone labels gone`, (await G(page, 'screen')) === 'playing' && !(await visible(page, '#zone-move')));
  await finish(p);
}

// ------------------------------------------------------------ perks, sound, enemies, boss (M5/M6)
{
  const p = await newPage('perks+sound 1280x720', { viewport: { width: 1280, height: 720 } });
  const { page } = p;
  // sound: no AudioContext before the first gesture, mute button visible in the menu
  check('[sound] no AudioContext before a user gesture', (await G(page, 'audio.ctx')) === 'none');
  check('[sound] mute button visible in the menu', await visible(page, '#mute-btn'));
  await page.click('#play-btn');
  await sleep(300);
  check('[sound] first click creates and runs the AudioContext', (await G(page, 'audio.ctx')) === 'running', await G(page, 'audio.ctx'));
  check('[sound] music plays during the game', (await G(page, 'audio.music')) === true);
  const pb = await page.locator('#pause-btn').boundingBox();
  const mb = await page.locator('#mute-btn').boundingBox();
  check('[sound] in game the mute button sits next to (not on) the pause button', pb && mb && mb.x + mb.width <= pb.x, `${JSON.stringify(mb)} vs ${JSON.stringify(pb)}`);
  await page.keyboard.press('KeyP');
  await sleep(150);
  check('[sound] silent while paused (context suspended)', (await G(page, 'audio.ctx')) === 'suspended', await G(page, 'audio.ctx'));
  await page.keyboard.press('KeyP');
  await sleep(150);
  check('[sound] resumes with the game', (await G(page, 'audio.ctx')) === 'running', await G(page, 'audio.ctx'));
  await page.click('#mute-btn');
  check('[sound] mute button mutes', (await G(page, 'audio.muted')) === true && (await page.locator('#mute-btn').getAttribute('aria-pressed')) === 'true');
  check('[sound] clicking mute does not pause or hook', (await G(page, 'screen')) === 'playing' && (await G(page, 'state.tether.state')) === 'idle');
  check('[sound] mute saved in localStorage', (await page.evaluate(() => localStorage.getItem('shardsling.muted'))) === '1');
  await sleep(200);
  await page.screenshot({ path: `${OUT}mute-button-1280x720.png` });
  await page.screenshot({ path: `${OUT}mute-button-closeup.png`, clip: { x: 1280 - 220, y: 0, width: 220, height: 80 } });

  // perk choice after a cleared wave
  await page.evaluate(() => window.__shardsling.clearField());
  const offered = await waitFor(page, 'screen', 'perk', 4000);
  check('[perks] clearing a wave opens the perk choice', offered);
  const cards = await page.locator('.perk-card').count();
  check('[perks] three perk cards', cards === 3, String(cards));
  check('[perks] sim frozen while choosing', await (async () => {
    const t0 = await G(page, 'state.tick');
    await sleep(300);
    return (await G(page, 'state.tick')) === t0;
  })());
  check('[perks] header names the cleared wave', /WAVE 1 CLEAR/.test(await page.textContent('#perk-kicker')));
  check('[perks] Esc does not skip the choice', await (async () => {
    await page.keyboard.press('Escape');
    return (await G(page, 'screen')) === 'perk';
  })());
  await sleep(250);
  await page.screenshot({ path: `${OUT}perk-choice-1280x720.png` });
  const offer = await G(page, 'state.perkOffer');
  await page.keyboard.press('Digit2');
  check('[perks] key 2 picks the second perk and resumes', (await G(page, 'screen')) === 'playing' && (await G(page, `state.perks.${offer[1]}`)) >= 1, offer.join(','));
  const nextWave = await waitFor(page, 'state.wave', 2, 3000);
  check('[perks] next wave follows the choice', nextWave);
  // second clear: pick with the mouse
  await page.evaluate(() => window.__shardsling.clearField());
  await waitFor(page, 'screen', 'perk', 4000);
  await sleep(500); // input lockout
  const offer2 = await G(page, 'state.perkOffer');
  await page.locator('.perk-card').nth(0).click();
  check('[perks] clicking a card picks it', (await G(page, 'screen')) === 'playing' && (await G(page, `state.perks.${offer2[0]}`)) >= 1);

  // unmute again with the M key (and it is remembered after reload)
  await page.keyboard.press('KeyM');
  check('[sound] M toggles sound back on', (await G(page, 'audio.muted')) === false);
  await page.keyboard.press('KeyM');
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(300);
  check('[sound] muted state survives a reload', (await G(page, 'audio.muted')) === true && (await page.locator('#mute-btn').getAttribute('aria-pressed')) === 'true');
  await page.keyboard.press('KeyM');

  // enemies (wave 7: hunters + a prism), shown with a telegraphed prism shot
  await page.click('#play-btn');
  await page.evaluate(() => {
    const s = window.__shardsling;
    s.jumpToWave(7);
    s.state.lives = 3;
    s.state.drone.invuln = 999;
  });
  const kinds = await page.evaluate(() => window.__shardsling.state.enemies.map((e) => e.kind).sort().join(','));
  check('[enemies] wave 7 brings hunters and a prism', /hunter/.test(kinds) && /prism/.test(kinds), kinds);
  const charged = await page.evaluate(
    () =>
      new Promise((res) => {
        const t0 = performance.now();
        const tick = () => {
          const s = window.__shardsling.state;
          if (s.enemies.some((e) => e.kind === 'prism' && e.charge > 0 && e.charge < e.chargeMax * 0.45)) return res(true);
          if (performance.now() - t0 > 9000) return res(false);
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  check('[enemies] prism telegraphs its shot', charged);
  await page.screenshot({ path: `${OUT}wave-enemies-1280x720.png` });
  const hunter0 = await page.evaluate(() => {
    const s = window.__shardsling.state;
    const h = s.enemies.find((e) => e.kind === 'hunter');
    return h ? Math.hypot(h.x - s.drone.x, h.y - s.drone.y) : -1;
  });
  await sleep(1000);
  const hunter1 = await page.evaluate(() => {
    const s = window.__shardsling.state;
    const h = s.enemies.find((e) => e.kind === 'hunter');
    return h ? Math.hypot(h.x - s.drone.x, h.y - s.drone.y) : -1;
  });
  check('[enemies] hunters close in on the drone', hunter0 > 0 && hunter1 < hunter0, `${hunter0.toFixed(0)} -> ${hunter1.toFixed(0)}`);

  // boss (wave 10)
  await page.evaluate(() => {
    const s = window.__shardsling;
    s.jumpToWave(10);
    s.state.drone.invuln = 999;
  });
  check('[boss] wave 10 is the boss', (await page.evaluate(() => window.__shardsling.state.enemies.map((e) => e.kind).join(','))) === 'boss');
  const bossCharged = await page.evaluate(
    () =>
      new Promise((res) => {
        const t0 = performance.now();
        const tick = () => {
          const b = window.__shardsling.state.enemies.find((e) => e.kind === 'boss');
          if (b && b.charge > 0 && b.charge < b.chargeMax * 0.4) return res(true);
          if (performance.now() - t0 > 9000) return res(false);
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  check('[boss] telegraphs its attack before firing', bossCharged);
  await page.screenshot({ path: `${OUT}boss-1280x720.png` });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}boss-attack-1280x720.png` });
  await finish(p);
}

// perk choice on a phone in landscape (touch): fits and a tap picks
{
  const vp = { width: 844, height: 390 };
  const p = await newPage('perks phone-844x390 touch', { viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const { page } = p;
  await page.tap('#play-btn');
  await sleep(200);
  await page.evaluate(() => window.__shardsling.clearField());
  check('[perks phone] perk choice opens', await waitFor(page, 'screen', 'perk', 4000));
  const box = await page.locator('#perks .panel').boundingBox();
  check('[perks phone] perk panel fits on screen', box && box.y >= 0 && box.y + box.height <= vp.height + 1, JSON.stringify(box));
  check('[perks phone] touch controls hidden while choosing', !(await visible(page, '#touch-ui')));
  await sleep(500);
  await page.screenshot({ path: `${OUT}perk-choice-phone-844x390.png` });
  await page.locator('.perk-card').nth(2).tap();
  check('[perks phone] a tap picks the perk', (await G(page, 'screen')) === 'playing');
  check('[perks phone] touch controls back', await visible(page, '#touch-ui'));
  await finish(p);
}

await browser.close();
await server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);

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

async function newPage(name, ctxOpts) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...ctxOpts });
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
    await new Promise((res) => setTimeout(res, 2000));
    return { ticks: s.state.tick - k0, ms: performance.now() - t0 };
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

  // mouse: hold click to hook
  await page.mouse.move(700, 380);
  await page.mouse.move(760, 400);
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
  // right thumb: hold (wave 1 always starts with one shard inside hook range)
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

await browser.close();
await server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);

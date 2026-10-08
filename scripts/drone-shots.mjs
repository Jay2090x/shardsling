// Before/after screenshots of the player drone in a busy wave (desktop + phone).
// Usage: npm run build && node scripts/drone-shots.mjs <tag> [--spawn]
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright';
import { preview } from 'vite';

const tag = process.argv[2] ?? 'after';
const spawnShots = process.argv.includes('--spawn');
const PORT = 4318;
const BASE = `http://localhost:${PORT}/`;
const OUT = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const exe =
  process.env.CHROMIUM_PATH ??
  [`${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`, '/usr/bin/google-chrome'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await preview({ preview: { port: PORT, strictPort: true, host: 'localhost' }, logLevel: 'warn' });
const browser = await chromium.launch({ executablePath: exe, headless: true });

for (const [label, opts] of [
  ['desktop-1280x720', { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }],
  ['phone-844x390', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }],
]) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => {
    localStorage.setItem('shardsling.tutorialDone', '1');
    localStorage.setItem('shardsling.muted', '1');
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?e2e`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(300);
  await page.keyboard.press('Enter');
  await sleep(300);
  // busy wave: wave 8 (large + medium crystals, hunters, prism); plenty of lives so a hit never ends the run
  await page.evaluate(() => {
    const s = window.__shardsling;
    s.jumpToWave(8);
    s.state.lives = 3;
    s.state.drone.invuln = 0.6;
  });
  if (spawnShots) {
    await sleep(450);
    await page.screenshot({ path: `${OUT}drone-${tag}-spawn-${label}.png` });
  }
  await sleep(spawnShots ? 1700 : 2150);
  // retry until the drone went ~1 s without a hit (no red flash / respawn spotlight in the shot)
  for (let tries = 0; tries < 16; tries++) {
    // back to the arena centre, no hit pending (a hit sets 2 s of invulnerability, longer than the spotlight)
    await page.evaluate(() => {
      const st = window.__shardsling.state;
      st.lives = 3;
      st.drone.x = st.drone.px = 760;
      st.drone.y = st.drone.py = 470;
      st.drone.vx = st.drone.vy = 0;
    });
    await sleep(700);
    await page.keyboard.down(tries % 2 ? 'KeyA' : 'KeyD');
    await page.keyboard.down(tries % 2 ? 'KeyS' : 'KeyW');
    await sleep(280);
    const clean = () => page.evaluate(() => window.__shardsling.state.lives === 3 && window.__shardsling.state.drone.invuln === 0);
    let ok = await clean();
    if (ok) {
      await page.screenshot({ path: `${OUT}.tmp.png` });
      ok = await clean();
      if (ok) renameSync(`${OUT}.tmp.png`, `${OUT}drone-${tag}-${label}.png`);
    }
    await page.keyboard.up(tries % 2 ? 'KeyA' : 'KeyD');
    await page.keyboard.up(tries % 2 ? 'KeyS' : 'KeyW');
    if (ok) break;
    console.log('  hit during attempt', tries + 1, 'retrying');
    await sleep(1600);
  }
  console.log('shot', label, await page.evaluate(() => JSON.stringify({ x: window.__shardsling.state.drone.x | 0, y: window.__shardsling.state.drone.y | 0, n: window.__shardsling.state.shards.length, e: window.__shardsling.state.enemies.length })));
  await ctx.close();
}
await browser.close();
await new Promise((r) => server.httpServer.close(r));

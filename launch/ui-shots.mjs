// Screenshots of the real game UI (production build, vite preview) at 1280x720 CSS px x1.5 = 1920x1080 image: main menu and perk choice.
// Uses the game's own test hooks (?e2e: clearField) to reach the perk screen quickly. Usage: node launch/ui-shots.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright';
import { preview } from 'vite';

const OUT = new URL('./itch/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4318;
const server = await preview({ preview: { port: PORT, strictPort: true, host: 'localhost' }, logLevel: 'warn' });
const exe = [process.env.CHROMIUM_PATH, `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`].find((p) => p && existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
await ctx.addInitScript(() => localStorage.setItem('shardsling.tutorialDone', '1'));
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/?e2e`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(2500); // let the menu demo play a bit
await page.screenshot({ path: OUT + 'shardsling_05_menu.png' });
await page.click('#play-btn');
await page.waitForTimeout(2500);
await page.evaluate(() => window.__shardsling.clearField());
await page.waitForFunction(() => window.__shardsling.screen === 'perk', null, { timeout: 5000 });
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + 'shardsling_06_perk_choice.png' });
await browser.close();
await server.close();
console.log('ui shots done');

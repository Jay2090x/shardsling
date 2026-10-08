// Renders episode scenes to video clips (one MP4 per scene) using the director page in headless Chromium.
// Usage: node video/render.mjs --script video/ep1/scenes.json --out video/ep1/clips [--only id,id] [--jobs 4] [--fps 60]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { traceRun } from '../ai/trace.ts';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []),
);
const root = resolve(new URL('..', import.meta.url).pathname);
const scenes = JSON.parse(readFileSync(args.script, 'utf8'));
const outDir = args.out;
const fps = Number(args.fps ?? 60);
const jobs = Number(args.jobs ?? 4);
const only = args.only ? new Set(args.only.split(',')) : null;
mkdirSync(outDir, { recursive: true });

function findChromium() {
  for (const p of [process.env.CHROMIUM_PATH, `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`]) {
    if (p && existsSync(p)) return p;
  }
  throw new Error('no chromium');
}

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const W = Number(args.w ?? 1920);
const Hh = Number(args.h ?? 1080);
const url = `http://127.0.0.1:${server.httpServer.address().port}/video/director/index.html?fps=${fps}&w=${W}&h=${Hh}${args.png ? '&png=1' : ''}`;
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--disable-gpu-vsync', '--force-device-scale-factor=1'] });

// resume support: scenes whose clip + events already exist are skipped unless --force
const queue = scenes.filter((s) => (!only || only.has(s.id)) && (args.force || only || !(existsSync(join(outDir, `${s.id}.mp4`)) && existsSync(join(outDir, `${s.id}.events.json`)))));
console.log(`rendering ${queue.length} of ${scenes.length} scenes`);
const results = {};
async function worker(n) {
  const page = await browser.newPage({ viewport: { width: W, height: Hh }, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && console.error(`[page ${n}]`, m.text()));
  page.on('pageerror', (e) => console.error(`[page ${n}]`, e));
  await page.goto(url);
  await page.waitForFunction(() => window.directorReady === true);
  while (queue.length) {
    const sc = queue.shift();
    const t0 = Date.now();
    // simulate every run of this scene in Node (exact replay), the page only draws the frames
    const traceDir = join(root, 'video', '.traces', basename(resolve(outDir)));
    mkdirSync(traceDir, { recursive: true });
    const specs = [...(sc.run ? [sc.run] : []), ...(sc.runs ?? []), ...(sc.bgRun ? [sc.bgRun] : [])];
    specs.forEach((spec, k) => {
      const f = join(traceDir, `${sc.id}_${k}.json`);
      writeFileSync(f, traceRun(root, spec, sc.dur, fps));
      spec.trace = '/' + relative(root, f);
    });
    const { frames } = await page.evaluate((s) => window.director.load(s), sc);
    const file = join(outDir, `${sc.id}.part.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', args.png ? 'png' : 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(fps), file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
    const BATCH = 6;
    for (let f = 0; f < frames; f += BATCH) {
      const n2 = Math.min(BATCH, frames - f);
      const urls = await page.evaluate((k) => Array.from({ length: k }, () => window.director.frame()), n2);
      for (const u of urls) {
        const buf = Buffer.from(u.slice(u.indexOf(',') + 1), 'base64');
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      }
    }
    ff.stdin.end();
    await done;
    renameSync(file, join(outDir, `${sc.id}.mp4`));
    const events = await page.evaluate(() => window.director.events());
    const summary = await page.evaluate(() => window.director.summary());
    writeFileSync(join(outDir, `${sc.id}.events.json`), JSON.stringify({ id: sc.id, dur: sc.dur, events, summary }));
    results[sc.id] = summary;
    console.log(`${sc.id}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s ${JSON.stringify(summary.map((s) => [s.score, s.phase, s.time.toFixed(1)]))}`);
  }
  await page.close();
}
await Promise.all(Array.from({ length: jobs }, (_, i) => worker(i)));
await browser.close();
await server.close();

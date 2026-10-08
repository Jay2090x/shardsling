// Concatenates rendered scene clips and builds the audio mix (game SFX at the replay's real event times + soundtrack).
// Usage: node video/assemble.mjs --script video/ep1/scenes.json --clips video/ep1/clips --out video/ep1/episode1.mp4 [--fps 60]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []),
);
const root = resolve(new URL('..', import.meta.url).pathname);
const scenes = JSON.parse(readFileSync(args.script, 'utf8'));
const fps = Number(args.fps ?? 60);
const clips = args.clips;
const out = args.out;

// timeline
let t = 0;
const cues = [];
const sections = [];
const accents = [];
const list = [];
for (const sc of scenes) {
  const dur = Math.round(sc.dur * fps) / fps;
  const ev = JSON.parse(readFileSync(join(clips, `${sc.id}.events.json`), 'utf8'));
  const v = sc.sfxVol ?? (sc.kind === 'split' ? 0.7 : 1);
  for (const c of ev.events) cues.push({ t: t + c.t, e: c.e, vol: v });
  const m = sc.music ?? {};
  const prev = sections[sections.length - 1];
  if (prev && JSON.stringify(prev.m) === JSON.stringify(m)) prev.t1 = t + dur;
  else sections.push({ m, t0: t, t1: t + dur });
  for (const a of sc.accents ?? []) accents.push({ ...a, t: t + a.t });
  list.push(`file '${resolve(join(clips, `${sc.id}.mp4`))}'`);
  t += dur;
}
const total = t;
const secs = sections.map((s) => ({ t0: s.t0, t1: s.t1, ...s.m }));
console.log(`total ${total.toFixed(2)} s, ${cues.length} sfx cues, ${secs.length} music sections`);

// render audio offline in Chromium
function findChromium() {
  for (const p of [process.env.CHROMIUM_PATH, `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, `${homedir()}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`]) {
    if (p && existsSync(p)) return p;
  }
  throw new Error('no chromium');
}
const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ executablePath: findChromium(), headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error(e));
await page.goto(`http://127.0.0.1:${port}/video/director/audio.html`);
await page.waitForFunction(() => window.mixerReady === true);
const len = await page.evaluate((spec) => window.mixer.render(spec), { total, sections: secs, cues, accents, musicVol: Number(args.musicVol ?? 0.5), sfxVol: Number(args.sfxVol ?? 0.55) });
const sr = 48000;
const wav = out.replace(/\.mp4$/, '.raw.wav');
const fd = openSync(wav, 'w');
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + len * 4, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(sr, 24);
header.writeUInt32LE(sr * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(len * 4, 40);
writeSync(fd, header);
const CH = sr * 10;
for (let f = 0; f < len; f += CH) {
  const b64 = await page.evaluate(([a, b]) => window.mixer.chunk(a, b), [f, f + CH]);
  writeSync(fd, Buffer.from(b64, 'base64'));
}
closeSync(fd);
await browser.close();
await server.close();

// video concat + loudness-normalised audio (-14 LUFS, -1 dBTP)
const listFile = join(clips, '_concat.txt');
writeFileSync(listFile, list.join('\n') + '\n');
const silent = out.replace(/\.mp4$/, '.video.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent], { stdio: 'inherit' });
const meas = execFileSync('ffmpeg', ['-hide_banner', '-i', wav, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
void meas;
const res = execFileSync('bash', ['-c', `ffmpeg -hide_banner -i '${wav}' -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p'`], { encoding: 'utf8' });
const j = JSON.parse(res);
const ln = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', `${ln},aresample=48000`, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out], { stdio: 'inherit' });
console.log('wrote', out);

// Generates the render scripts for the store assets: covers, CrazyGames preview videos, itch.io screenshots and trailer.
// Every frame is a real, deterministic replay drawn by the game's own renderer (video/director, kind 'cover').
// Usage: node launch/build.mjs   (then launch/render-all.sh renders everything)
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('./scripts/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const G183 = 'ai/runs/ep1/checkpoints/gen_0183.json';
// Runs (all real and reproducible):
//  BEST = the trained network (generation 183) on its best test seed: a normal game from wave 1 (113,150 points)
//  BOSS = the game's hand-written demo bot (src/sim/bot.ts, not the network) after jumping to wave 10 (boss "CORE"),
//         the same jump the game's own browser tests use (jumpToWave). It beats the boss at ~33 s; wave 11 follows.
const BEST = { file: G183, seed: 5079201 };
const BOSS = { file: G183, seed: 777, wave: 10, bot: 'heuristic' };
const at = (run, t) => ({ ...run, start: Math.round(t * 1000) / 1000 });
const write = (name, scenes) => writeFileSync(OUT + name, JSON.stringify(scenes, null, 1));
const PRE = 1.0; // replay played before frame 0 so trails/particles exist

// ---------------------------------------------------------------- key art
// One moment for every cover and the first frame of every preview: wave 10, the boss "CORE" telegraphs a volley
// (red dashed lines) at the drone, which is swinging a medium crystal on the rope.
// Cameras stay ~20 arena units inside the walls so the arena's edge line never looks like a frame.
// At t = 4.95 s the drone is at (930, 408), the boss at (555, 451). Arena is 1600 x 900.
const HERO_T = 4.95;
const CAM = {
  landscape: { cx: 782, cy: 395, h: 440 },
  portrait: { cx: 715, cy: 450, h: 840 },
  square: { cx: 750, cy: 387, h: 640 },
  itch: { cx: 750, cy: 399, h: 520 },
};
const LOGO = {
  landscape: { x: 0.5, y: 0.19, size: 0.135, band: true },
  portrait: { x: 0.5, y: 0.16, size: 0.19, stack: true, band: true },
  square: { x: 0.5, y: 0.19, size: 0.16, stack: true, band: true },
  itch: { x: 0.5, y: 0.16, size: 0.105, band: true, tagline: 'NO GUN. JUST A ROPE.' },
};
const DOF = (blur) => ({
  landscape: { x: 0.56, y: 0.6, r: 0.62, blur },
  portrait: { x: 0.5, y: 0.58, r: 0.55, blur },
  square: { x: 0.5, y: 0.6, r: 0.58, blur },
  itch: { x: 0.5, y: 0.6, r: 0.6, blur },
});
const look = (k, blur) => ({ noText: true, bloom: 0.45, vignette: 0.6, dof: DOF(blur)[k], logo: LOGO[k] });
// covers are rendered at 2x (blur doubled) and downscaled
const cover = (id, k) => ({ id, kind: 'cover', dur: 1.5 / 30, stills: [0], run: at(BOSS, HERO_T - PRE), data: { pre: PRE, cam: [{ t: 0, ...CAM[k] }], ...look(k, 6) } });
write('cover_1920x1080.json', [cover('cg_landscape', 'landscape')]);
write('cover_800x1200.json', [cover('cg_portrait', 'portrait')]);
write('cover_800x800.json', [cover('cg_square', 'square')]);
write('cover_630x500.json', [cover('itch_cover', 'itch')]);

// ---------------------------------------------------------------- CrazyGames preview videos (silent, 18 s, real speed)
// shot 1 opens on the cover frame, the title fades, the camera pulls back while the boss fight plays on (the bot wins
// at ~33 s, not shown); shot 2 the trained network chaining smashes in its best game; shot 3 wave 11 with hunters and
// prisms. Cross-fades 0.3 s. No fast-forward, no sound, no text other than the opening title.
const SHOTS = [6.6, 6.0, 6.0];
const XF = 0.3;
function previewScenes(k) {
  const wide = k === 'landscape' ? { cx: 760, cy: 450, h: 720 } : { cx: 760, cy: 450, h: 820 };
  const fh = k === 'landscape' ? 620 : 820;
  return [
    {
      id: `pv_${k}_1`, kind: 'cover', dur: SHOTS[0], run: at(BOSS, HERO_T - PRE),
      data: { pre: PRE, freeze: 0.4, lookOut: [0.4, 1.3], cam: [{ t: 0, ...CAM[k] }, { t: 0.6, ...CAM[k] }, { t: 2.4, ...wide }], ...look(k, 3) },
    },
    { id: `pv_${k}_2`, kind: 'cover', dur: SHOTS[1], run: at(BEST, 86.2 - PRE), data: { pre: PRE, follow: { h: fh, tau: 0.5 } } },
    { id: `pv_${k}_3`, kind: 'cover', dur: SHOTS[2], run: at(BOSS, 38.4 - PRE), data: { pre: PRE, follow: { h: fh, tau: 0.5 } } },
  ];
}
write('preview_landscape.json', previewScenes('landscape'));
write('preview_portrait.json', previewScenes('portrait'));

// ---------------------------------------------------------------- itch.io screenshots (1920x1080, game HUD on)
const shot = (id, run, t, cam) => ({ id, kind: 'cover', dur: 1.5 / 30, stills: [0], run: at(run, t - PRE), data: { pre: PRE, hud: true, cam: [{ t: 0, ...cam }] } });
write('screenshots.json', [
  shot('ss_swing', BEST, 34.1, { cx: 800, cy: 450, h: 900 }),
  shot('ss_combo', BEST, 88.3, { cx: 800, cy: 450, h: 900 }),
  shot('ss_enemies', BOSS, 40.4, { cx: 800, cy: 450, h: 900 }),
  shot('ss_boss', BOSS, 30.0, { cx: 800, cy: 450, h: 900 }),
]);

// ---------------------------------------------------------------- itch.io trailer (optional, 1920x1080, game music + sfx)
const MUS = { full: { prog: 'A', drums: true, vol: 0.9 }, boss: { prog: 'A', drums: true, boss: true, vol: 0.9 }, calm: { prog: 'B', drums: false, hats: true, vol: 0.85 } };
const cap = (t0, t1, text, sub) => ({ t0, t1, text, sub, pos: 'bottom' });
write('trailer.json', [
  {
    id: 'tr_1_title', kind: 'cover', dur: 4.2, run: at(BOSS, HERO_T - PRE), music: MUS.boss, fadeIn: 0.25,
    data: { pre: PRE, freeze: 0.8, lookOut: [2.8, 3.6], cam: [{ t: 0, ...CAM.landscape }, { t: 2.8, ...CAM.landscape }, { t: 4.2, cx: 760, cy: 450, h: 640 }], ...look('landscape', 3), logo: { ...LOGO.landscape, tagline: 'NO GUN. JUST A ROPE.' } },
  },
  {
    id: 'tr_2_swing', kind: 'cover', dur: 6.0, run: at(BEST, 30.5 - PRE), music: MUS.full,
    data: { pre: PRE, hud: true, follow: { h: 560, tau: 0.4 } }, captions: [cap(0.3, 5.8, 'Hold to hook a crystal. Release to fling it.', 'every fragment becomes new ammo')],
  },
  {
    id: 'tr_3_combo', kind: 'cover', dur: 6.0, run: at(BEST, 86.2 - PRE), music: MUS.full,
    data: { pre: PRE, hud: true, follow: { h: 640, tau: 0.5 } }, captions: [cap(0.3, 5.8, 'Chain smashes for a x10 combo.', "don't touch the drifting crystals")],
  },
  {
    id: 'tr_4_enemies', kind: 'cover', dur: 5.5, run: at(BOSS, 38.4 - PRE), music: MUS.full,
    data: { pre: PRE, hud: true, follow: { h: 640, tau: 0.5 } }, captions: [cap(0.3, 5.3, 'Hunters and prisms join in.', 'pick a perk after every cleared wave')],
  },
  {
    id: 'tr_5_boss', kind: 'cover', dur: 6.0, run: at(BOSS, 22.0 - PRE), music: MUS.boss,
    data: { pre: PRE, hud: true, follow: { h: 640, tau: 0.5 } }, captions: [cap(0.3, 5.8, 'Wave 10: the boss.')],
  },
  {
    id: 'tr_6_end', kind: 'cover', dur: 4.5, run: at(BOSS, 28.0 - PRE), music: MUS.calm, fadeOut: 0.6, sfxVol: 0.4,
    data: { pre: PRE, cam: [{ t: 0, cx: 800, cy: 450, h: 900 }], noText: true, bloom: 0.3, vignette: 0.8, dof: { x: 0.5, y: 0.5, r: 0.05, blur: 8 }, logo: { x: 0.5, y: 0.45, size: 0.14, band: true, tagline: 'FREE IN YOUR BROWSER' } },
  },
]);
console.log('scripts written to', OUT);

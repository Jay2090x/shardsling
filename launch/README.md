# Shardsling launch kit: CrazyGames + itch.io (DRAFT, nothing submitted)

Everything here was made on Oct 8, 2026 for Josie's review. No account was created and nothing was uploaded or submitted.
Media files are gitignored. To rebuild them from the committed scripts, run `bash launch/render-all.sh` (about 10 min on the shared box) and `node launch/ui-shots.mjs` (needs `npm run build` first).

## How the images and videos were made (honest provenance)
- **Every gameplay pixel is the real game renderer** (`src/render`) drawing **real, deterministic replays**, computed frame by frame in Node with the game's own simulation (`ai/trace.ts`). Nothing is painted, generated or staged. A camera crop/zoom, a light bloom, a vignette and a soft depth-of-field are applied on top (`video/director/director.ts`, kind `cover`), plus the logo.
- **Logo** = the in-game title: Orbitron 900, "SHARD" in cyan `#22e5ff` and "SLING" in magenta `#ff2bd6` (same fonts and colours as `index.html` / `src/style.css`). The tagline "NO GUN. JUST A ROPE." is the game's own tagline (Orbitron 700, yellow `#ffe14d`).
- **Two replays are used:**
  - **BEST**: the trained network from the YouTube episode (generation 183) on its best test seed 5079201. This is a normal game from wave 1 (it reaches wave 7).
  - **BOSS**: the game's hand-written demo bot (`src/sim/bot.ts`, *not* a learned AI) on seed 777 after a jump to wave 10, the same jump the game's own browser tests use (`jumpToWave`). It shows the boss "CORE", which a normal player meets in wave 10. The bot beats it at about 33 s, and wave 11 (hunters + prisms) follows naturally.
- **Key art moment** (all covers + first frame of both previews): BOSS replay at t = 4.95 s. The boss telegraphs a volley (red dashed lines) while the drone swings a crystal on its rope. On the covers, every in-game text (score popups, the boss label "CORE") is hidden, so the **title is the only text**, as CrazyGames requires.
- **Screenshots 01–04** are plain gameplay frames with the normal HUD (BEST at 34.1 s and 88.3 s, BOSS at 40.4 s and 30.0 s). **05–06** are browser screenshots of the real production build (menu, perk choice) at 1280×720 CSS px × 1.5.
- **Previews**: real speed (1×), no fast-forward, no sound track at all, no text except the opening title (the cover frame), which fades out within 1.3 s. Encoded limited-range BT.709 yuv420p (most compatible).

## Files
| File | Spec (measured) | Size |
|---|---|---|
| `crazygames/crazygames_cover_landscape_1920x1080.png` | PNG 1920×1080 (RGB) | 1.0 MB |
| `crazygames/crazygames_cover_portrait_800x1200.png` | PNG 800×1200 (RGB) | 591 KB |
| `crazygames/crazygames_cover_square_800x800.png` | PNG 800×800 (RGB) | 457 KB |
| `crazygames/crazygames_preview_landscape_1920x1080.mp4` | MP4 H.264 1920×1080, 60 fps, 18.00 s, no audio track | 10.8 MB |
| `crazygames/crazygames_preview_portrait_1080x1620.mp4` | MP4 H.264 1080×1620, 60 fps, 18.00 s, no audio track | 9.4 MB |
| `itch/itch_cover_630x500.png` | PNG 630×500 (RGB) | 234 KB |
| `itch/itch_embed_background_1280x720.png` | PNG 1280×720 (RGB) | 509 KB |
| `itch/itch_trailer_1920x1080.mp4` | MP4 H.264 1920×1080, 60 fps, 32.20 s, AAC 48000 Hz | 19.3 MB |
| `itch/shardsling-web.zip` | ZIP, 8 files, 128 KB unpacked, index.html at root | 73 KB |
| `itch/screenshots/shardsling_01_swing.png` | PNG 1920×1080 (RGB) | 266 KB |
| `itch/screenshots/shardsling_02_combo.png` | PNG 1920×1080 (RGB) | 276 KB |
| `itch/screenshots/shardsling_03_enemies.png` | PNG 1920×1080 (RGB) | 326 KB |
| `itch/screenshots/shardsling_04_boss.png` | PNG 1920×1080 (RGB) | 302 KB |
| `itch/screenshots/shardsling_05_menu.png` | PNG 1920×1080 (RGB) | 419 KB |
| `itch/screenshots/shardsling_06_perk_choice.png` | PNG 1920×1080 (RGB) | 394 KB |

## Which file goes where

### CrazyGames Developer Portal (Submit a game)
| Field | File / value |
|---|---|
| Cover: Landscape 16:9 (1920×1080) | `crazygames/crazygames_cover_landscape_1920x1080.png` |
| Cover: Portrait 2:3 (800×1200) | `crazygames/crazygames_cover_portrait_800x1200.png` |
| Cover: Square 1:1 (800×800) | `crazygames/crazygames_cover_square_800x800.png` |
| Preview video: landscape 1080p 16:9 (mandatory) | `crazygames/crazygames_preview_landscape_1920x1080.mp4` (18.0 s, 10.8 MB, silent) |
| Preview video: portrait 1080p 2:3 (mandatory) | `crazygames/crazygames_preview_portrait_1080x1620.mp4` (18.0 s, 9.4 MB, silent) |
| Game files | Upload `itch/shardsling-web.zip` (production `dist/`: relative paths, 8 files, 128 KB). CrazyGames' limits are ≤ 50 MB initial download and ≤ 1500 files |
| Description, controls, category/tags | `store-copy.md` → CrazyGames section |

Preview content, shot by shot:
1. **0–6.6 s**: opens on the cover frame, the title fades, the camera pulls back, the boss fires its volley and the fight goes on (BOSS replay 4.95–11.15 s).
2. **6.3–12.6 s**: the trained network's best game, a long chain of smashes in wave 5 (BEST 86.2–92.2 s).
3. **12.0–18.0 s**: wave 11 with hunters and prisms (BOSS replay 38.4–44.4 s).

The shots overlap because of the 0.3 s cross-fades.

### itch.io (Create new project)
| Field | File / value |
|---|---|
| Cover image (315:250, min 315×250, recommended 630×500) | `itch/itch_cover_630x500.png` (with the tagline) |
| Screenshots (any size, 3–5 recommended) | `itch/screenshots/shardsling_01…06.png`. Pick 5, e.g. 01–04 + 05 menu |
| Uploads → HTML game (ZIP with index.html) | `itch/shardsling-web.zip` |
| Embed background (Edit theme → Embed, behind the Play button) | `itch/itch_embed_background_1280x720.png` (optional) |
| Video URL (YouTube/Vimeo link only) | Optional: `itch/itch_trailer_1920x1080.mp4` would first have to be uploaded to YouTube (your decision). Otherwise leave it empty |
| Title, tagline, description, tags, genre, embed settings, AI disclosure | `store-copy.md` → itch.io section |

Trailer content (32.2 s, game music + real sound effects of the replays, -14 LUFS):
1. Title on the key-art frame.
2. Swing and fling, with the caption "Hold to hook a crystal. Release to fling it."
3. Combo chain: "Chain smashes for a x10 combo."
4. Hunters and prisms: "Hunters and prisms join in." / "pick a perk after every cleared wave".
5. "Wave 10: the boss."
6. End card: logo + "FREE IN YOUR BROWSER".

## Requirements this kit follows (checked on Oct 8, 2026)
- CrazyGames, Game covers (sizes, restrictions, preview video rules): https://docs.crazygames.com/requirements/game-covers/
  - 3 covers: Landscape 16:9 1920×1080, Portrait 2:3 800×1200, Square 1:1 800×800. No borders, no text except the game title, no icons/store logos, not blurry, don't just take a screenshot.
  - Preview video 15–20 s max (longer is cut to 20 s), ≤ 50 MB, full-screen landscape 1080p 16:9 **and** portrait 1080p 2:3 (both mandatory). No black-screen/logo transitions, no black bars, no mouse cursor, no "Play now"/promo text, no app/social icons, no fast-forwarding, no sound, open with the static cover.
- CrazyGames, Requirements intro (metadata = game description + controls, plus covers/videos): https://docs.crazygames.com/requirements/intro/
- CrazyGames, Gameplay requirements (originality, iframe sizes, no cross-promotion): https://docs.crazygames.com/requirements/gameplay/
- itch.io, Your first itch.io page (cover 315:250, min 315×250, 630×500 recommended; screenshots any size, 3–5; up to 10 tags): https://itch.io/docs/creators/getting-started
- itch.io, Content creator quality guidelines (accurate metadata, cover + screenshots, no misleading content, generative-AI disclosure): https://itch.io/docs/creators/quality-guidelines
- itch.io, Generative AI disclosure field (Graphics / Sound / Text & Dialog / Code): https://itch.io/t/4309690/generative-ai-disclosure-tagging
- itch.io, Uploading HTML5 games (ZIP with index.html, relative paths, ≤ 1000 files, embed options, mobile friendly): https://itch.io/docs/creators/html5
- itch.io, Designing your page (trailer is a YouTube/Vimeo URL, theme colours/fonts): https://itch.io/docs/creators/design

**Not specified in the docs I found:** the video container/codec for CrazyGames (MP4/H.264 is used here), exact pixel size of "1080p 2:3" (1080×1620 is used), the frame rate (60 fps is used), and text length limits for descriptions on both platforms.

## Scripts (committed)
- `build.mjs`: all moments, cameras and looks → `scripts/*.json` (render scripts for `video/render.mjs`)
- `render-all.sh`: renders covers (2× then Lanczos downscale), screenshots, both previews (cross-fades, silent) and the trailer (with `video/assemble.mjs`). Resumable by stage
- `ui-shots.mjs`: menu + perk-choice screenshots from the production build
- `scan.ts`: finds busy moments in a replay (used to pick the shots)
- `specs.py`: prints the file table above from the real files

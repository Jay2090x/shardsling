# Shardsling: store copy (English, DRAFT, not submitted)

Every claim below is checked against the game as it is in `master` (Oct 8, 2026). The game is free, runs in the browser, has no download and no sign-up, and the build itself has no ads, no tracking and no external requests.
Character counts are given where a field might have a limit. Neither platform publishes exact limits for these text fields in the docs I could find. The CrazyGames portal and the itch.io form show the real limits when you fill them in.

---

## CrazyGames (Developer Portal: "game description" and "controls" fields)

**Game name:** Shardsling

**Short description** (first lines on the game page, 146 characters):

> No gun, just a rope. Hook a crystal, swing it around your drone and let go to smash it into the others. Every fragment you break becomes new ammo.

**Long description:**

> Shardsling is a neon arcade game where your little drone has no weapon at all, only a grappling rope.
>
> Hook a drifting crystal, swing it around you and release it at the right moment to fling it into other crystals. Big crystals break into medium ones, medium ones into small ones, and every fragment is new ammo. Keep the smashes going to build your combo up to x10. But careful: touching a drifting crystal costs one of your three lives.
>
> Clear a wave and pick one of three perks: a longer rope, a faster swing, an extra life, a shockwave on every smash, a magnet hook that curves your throws, or focus, which slows time while you swing. From wave 3, red hunters chase you. From wave 5, prisms aim and shoot crystals at you. Beat them the only way you can: by throwing crystals at them. Every 10th wave brings the boss, CORE, which telegraphs its attacks before it fires.
>
> Features:
> - One simple control: hold to hook, release to fling
> - Real physics: heavy crystals swing slower and pull your drone along; walls are bouncy, so bank shots work
> - Combo chains up to x10, perks after every cleared wave, three enemy types including a boss
> - Short interactive tutorial on the first run, local high score
> - Keyboard, mouse and touch controls
> - Its own synth soundtrack and sound effects (mute with M)

**Controls:**

> Keyboard: WASD or arrow keys to move, hold Space to hook and swing, release Space to fling. P or Esc to pause, M for sound on/off.
> Mouse: the drone follows the pointer. Hold the left button to hook the crystal nearest the pointer, release to fling.
> Touch: drag on the left half of the screen to move, hold anywhere on the right half to hook, let go to fling. Best played in landscape.
> Perk choice: click or tap a card, or press 1 / 2 / 3.

**Category / tags:** these are picked from CrazyGames' own lists in the portal, and I could not see those lists without an account. Suggestion: category **Action** (alternative: Casual), tags along the lines of *Arcade, Physics, Space, Skill, Mouse, Keyboard, Touch/Mobile*. Avoid "asteroid(s)" as a tag (Atari trademark, see the earlier CrazyGames report).

**Do not put links in the CrazyGames text.** Cross-promotion is not allowed in the game, and the description is no place for the YouTube channel either.

---

## itch.io (Create / Edit project page)

| Field | Value |
|---|---|
| Title | Shardsling |
| Project URL | `shardsling` |
| Short description or tagline | No gun, just a rope. Hook crystals, swing them and fling them into each other. (78 characters) |
| Classification | Games |
| Kind of project | HTML |
| Release status | In development (balancing is still a first pass; switch to Released when you're happy) |
| Pricing | "No payments", or "$0 or donate". Your call. On itch, HTML5 games can only take donations anyway |
| Uploads | `launch/itch/shardsling-web.zip` (production build, `index.html` at the root, relative paths), tick "This file will be played in the browser" |
| Embed options | Embed in page, viewport **1280 × 720**, ✓ Fullscreen button, ✓ Mobile friendly (orientation: landscape), Click to play on (default) |
| Cover image | `launch/itch/itch_cover_630x500.png` |
| Screenshots | `launch/itch/screenshots/shardsling_01…06.png` (all 6, or the 4 gameplay ones + the menu) |
| Trailer (video URL) | itch only takes a YouTube/Vimeo link. Optional: upload `launch/itch/itch_trailer_1920x1080.mp4` to YouTube first (needs your OK), or leave empty |
| Genre | Action |
| Tags (max 10) | arcade, physics, space, neon, score-attack, high-score, fast-paced, minimalist, abstract, synthwave |
| AI generation disclosure | **Your decision, see below** |
| Inputs (Metadata tab) | Keyboard, Mouse, Touchscreen |
| Languages | English |
| Average session | A few minutes |
| Theme (Edit theme) | BG `#05060a`, BG2 `#0b0f1a`, text `#e8f6fb`, links/buttons `#22e5ff`, headers `#ff2bd6`. Fonts: Orbitron (headers) + Rajdhani (text), both on Google Fonts, the same as in the game. Embed background: `launch/itch/itch_embed_background_1280x720.png` |

**Description** (paste into the editor; lines starting with `##` become "Header 2"):

```
No gun, just a rope.

Your drone has no weapon. Hook a drifting crystal, swing it around you and let go at the right moment to smash it into the others. Big crystals break into medium ones, medium into small, and every fragment is new ammo. Chain your smashes for a combo up to x10, but don't touch a drifting crystal: you only have three lives.

## How to play
- Hold to hook the nearest crystal and swing it around you
- Release to fling it
- Break every crystal to clear the wave, then pick one of three perks
- Hunters (from wave 3) chase you, prisms (from wave 5) shoot crystals at you, and every 10th wave brings the boss, CORE. You can only hit them with what you throw.

## Controls
Keyboard: WASD / arrow keys to move, hold Space to hook, release to fling. P or Esc pauses, M toggles sound.
Mouse: the drone follows the pointer; hold the left button to hook the crystal at the pointer, release to fling.
Touch: drag on the left half to move, hold on the right half to hook, let go to fling. Landscape works best.

## Perks
Long Rope, Fast Swing, Extra Life, Shockwave, Magnet Hook, Focus (slows time while you swing).

## Tips
- Heavy crystals swing slower and pull you along. Small ones are quick but light.
- Walls are bouncy, so bank shots count.
- Fragments from a smash are briefly "hot" and can set off chain reactions.

## Details
- Free, runs in your browser, no download, no account, no ads, no tracking.
- Short tutorial on the first run; your high score is saved locally in the browser.
- Made with TypeScript and Canvas 2D, no engine. The whole game is about 130 KB.
- Music and sound are generated in code: a small synthwave loop plus ZzFX sound effects (ZzFX by Frank Force, MIT license).
- Fonts: Orbitron and Rajdhani (SIL Open Font License).
```

Optional extra lines for the itch description (only if you want them; both are true):
- `Built with the help of an AI coding assistant.` (see the disclosure question below)
- `Watch a tiny neural network learn to play it: https://youtu.be/96jPUXND1Dc` (itch allows links on your own page)

### itch.io "Generative AI disclosure": your decision

The game's code, its in-game texts and this store copy were written by an AI coding assistant working for you. The git history shows only "Grok Bot" as author. No image, music or voice model was used. Graphics and sound are drawn and synthesized at runtime by that code.

- itch's rule: tag your project if it "contains materials produced by generative AI". Its examples are LLMs and image models. For games the field is optional. For asset packs it's mandatory.
- The honest options:
  - **Yes**, with **Code** and **Text & Dialog** ticked. This is my recommendation.
  - Also tick **Graphics** and **Sound** if you want to be maximally cautious, because the code that draws and synthesizes them was AI-written.
- If you answer Yes, the page shows up on itch's "AI Generated" browse page. Answering No would not be accurate.
- CrazyGames has no such field in the docs I read. Just don't claim "no AI" or "handmade" anywhere.

---

## Things the copy deliberately does NOT say
- No "AI opponent" or "smart AI": the in-game enemies are scripted. The trained network only exists in the YouTube video.
- No "endless", "100 levels" or similar. Waves continue with a boss every 10th wave, and that's all it says.
- No ranking or leaderboard claims: the high score is local only.
- Nothing like "Play now", "New" or "Updated" on any cover. CrazyGames forbids that.

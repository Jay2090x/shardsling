# Shardsling – Episode 1: YouTube metadata (DRAFT, not uploaded)

Status: draft for Josie's approval. Nothing has been uploaded and no account was touched.

Files (local, box: `/workspace/shardsling/video/ep1/`):
- `episode1.mp4` – 1920x1080, 30 fps, H.264 + AAC, about 6:02, loudness normalised to -14 LUFS
- `short1.mp4` – 1080x1920 (9:16), 44 s, Shorts teaser
- `thumbnail.png` – 1280x720, a real gameplay frame (generation 183, best test game) plus text
- `frames/` – keyframes every 20 s for review
- `stats.csv` – copy of the real training log (one row per generation)

## Title

I Gave an AI a Spaceship With No Gun

(Alternatives: "I Gave an AI a Spaceship With No Gun. It Learned to Throw Rocks." / "AI Learns My Game Without a Gun (213 Generations)")

## Description

My spaceship game has no gun. You can only harpoon crystals, swing them on a rope and throw them at other crystals. So I let a tiny AI learn it from scratch.

The AI is a small neural network (24 inputs, 16 neurons, 10 outputs, 570 numbers in total) trained by evolution inside the game's own simulation: 150 brains per generation, each plays 4 games, the best ones are kept, mixed and mutated. No pretrained model, no generative AI, no recorded human games. Over 213 generations it went from driving into walls to a best test game of 113,150 points.

Every clip is a real, deterministic replay of the network playing (game seed + its actions). The numbers on screen come straight from the training logs and from test games it never trained on. Nothing is staged or edited into the gameplay. It still can't really dodge.

Play Shardsling free in your browser (no download, no sign-up): https://jay2090x.github.io/shardsling/

Chapters
0:00 No gun, just a rope
0:14 How the game works
0:50 The AI's brain: 24 inputs, 570 numbers
1:14 How it learns: evolution
1:31 Generation 0: random brains
2:15 The learning curve
2:31 Generation 10: spam
2:45 Generation 40: learning to aim
3:07 Generation 183: smashing on the rope
3:27 Its weakness
3:41 Generation 1 vs generation 183
4:21 Best test game: 113,150 points
5:31 What it learned
5:46 Play it yourself

Music and sound: the game's own synth soundtrack and ZzFX sound effects (ZzFX by Frank Force, MIT license). Fonts: Orbitron and Rajdhani (SIL Open Font License).

What should it learn next? Tell me in the comments.

## Tags

AI learns to play, neural network, neuroevolution, genetic algorithm, machine learning, AI plays game, evolution simulation, indie game, browser game, game dev, devlog, Shardsling, AI experiment, no gun

## Settings to choose in YouTube Studio

- Category: Gaming (alternative: Science & Technology)
- Audience: "No, it's not made for kids" (as planned for the channel)
- Language: English. Optional: German title/description via "Translations"
- Thumbnail: `thumbnail.png`
- End screen: the last 16 s (5:46–6:02) are an end card with free space in the lower half for the YouTube end screen elements (subscribe + a video)
- Captions: all text is burned into the video; there is no speech, so no subtitle track is needed

## "Altered or synthetic content" disclosure: recommendation **No**

- YouTube requires the label for realistic content that could be mistaken for real people, places or events (and for realistic AI music as the main content). This video shows animated gameplay of a fictional neon game, charts and on-screen text.
- The "AI" in the video is a small neural network that plays the game. It does not generate images, video, voices or music. All footage is rendered by the game's own code from real replays.
- No synthetic voice, no AI music (the soundtrack is the game's hand-written synth code), no realistic generated images.
- YouTube's help page lists gameplay recordings and AI help with scripts or captions as not needing disclosure.
- Transparency anyway: the description says plainly what the AI is and how it was trained.

## Shorts teaser (short1.mp4)

- Title: Generation 1 vs Generation 183 (AI with no gun) #shorts
- Description: A tiny neural network learns my spaceship game, which has no gun, only a rope. Same game, same seed, real replays. Full experiment on the channel. Play free: jay2090x.github.io/shardsling
- Upload it after the long video, then link the long video under "Related video" in the Shorts editor

## Facts behind the on-screen numbers (all reproducible)

| Claim | Source |
|---|---|
| 213 generations (0–212), 150 brains, 4 games each = 127,800 training games, 45 min | `ai/runs/ep1/stats.csv`, `config.json`, `train_log.txt` (stopped manually after gen 212 because the shared CPU slowed to ~4 min per generation) |
| 75 of 150 random brains scored 0 in all 4 games | `gen0_population.json` |
| Test score 1,212 (gen 0) → 39,349 (gen 183) | `stats.csv`, column `bench_mean_score` (same 10 test seeds for every generation, never used for training) |
| Gen 183 on 30 new seeds: average 37,286, median 32,800, best 113,150, max wave 7 | `analysis/fresh_gen_0183.txt`, `fresh2_gen_0183.txt` |
| Laser on target at release: gen 1 25% (base 33%), gen 40 80% (base 15%), gen 100 99% | `analysis/fresh2_*.txt` (30 fresh seeds each) |
| Gen 10: 364 releases per minute, 4% of fast throws hit | `analysis/fresh2_gen_0010.txt` |
| Gen 183: 30% of hits without letting go (532 of 1,790); 9% of fast throws hit | `analysis/fresh2_gen_0183.txt` |
| Gen 183 lost lives: 59 of 88 from drifting crystals, 20 from enemies | `analysis/fresh2_gen_0183.txt` |
| Best test game 113,150 points, wave 7, 12 enemies, chain of 110 | `replays/best_run.json` (verified replay), `moments/gen_0183_5079201.txt` |
| Gen 1 on the same seed: 1,500 points, game over in wave 2 | `replays/gen1_same_seed.json` |

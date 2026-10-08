# Shardsling

Browser-Spiel (Canvas 2D, TypeScript, Vite, ohne Framework): Du steuerst eine runde Drohne **ohne Waffe**.
Halten = Harpune auf einen Kristall-Splitter, er kreist am Neon-Seil um dich. Loslassen = er fliegt tangential weg
und zertrümmert andere Splitter. Jedes Bruchstück ist neue Munition. Die Wände sind federnd (Bandenwürfe).

Stand: 08.10.2026, Meilensteine 1–3 fertig, Kern-Twist („Hook & Fling“) spielbar, interaktives Tutorial beim ersten Start,
dazu **Sound & Musik (M6)**, **Perks** sowie **Gegner und Boss (M5)**. Live: https://jay2090x.github.io/shardsling/ (GitHub Pages, Branch `gh-pages`).

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver, http://localhost:5173
npm run build      # Typecheck + Produktions-Build nach dist/ (relative Pfade, base './')
npm run preview    # gebauten Stand lokal ansehen
npm test           # Unit-Tests (Vitest, Node, ohne Browser)
npm run e2e        # Browser-Checks + Screenshots (Playwright, braucht vorher npm run build)
npm run sim        # Headless-Läufe ohne Rendering (Zufall vs. einfache Heuristik), zeigt Schritte/s
npm run check      # test + build + e2e
```

Für `npm run e2e` wird ein lokales Chromium gesucht (`~/.cache/ms-playwright/chromium-1243/...` oder `/usr/bin/google-chrome`),
alternativ `CHROMIUM_PATH=/pfad/zu/chrome npm run e2e`.

## Steuerung

| Gerät | Bewegen | Haken & Schwingen | Schleudern | Pause |
|---|---|---|---|---|
| Tastatur | WASD / Pfeile | Leertaste halten | loslassen | P / Esc (Ton an/aus: M) |
| Maus | Zeiger (Drohne folgt) | Linksklick halten (zielt auf den Splitter am Zeiger) | loslassen | Pause-Button |
| Touch | linke Hälfte ziehen (virtueller Stick) | rechte Hälfte halten | loslassen | Pause-Button |

## Tutorial (erster Start)

Beim ersten PLAY startet ein kurzes Tutorial in einer harmlosen Übungsarena (Sim-Modus `tutorial`: kein Schaden, keine Punkte, keine Wellen).
4 Schritte, jeweils „Learning by Doing“ mit hervorgehobenem Ziel; NEXT als Rückfall, SKIP jederzeit (oder Esc/P):

1. **Ziel**: Kristalle ineinander schleudern, alle zerschlagen = Welle geschafft, treibende Kristalle nicht berühren, 3 Leben.
2. **Bewegen**: in den gelben Ring fliegen (geht von selbst weiter).
3. **Haken & Schwingen**: halten, bis der Kristall eine Weile kreist.
4. **Schleudern**: loslassen und einen Kristall treffen (Kombo-Hinweis). Danach „Nice hit!“ und PLAY.

Texte je nach Gerät (Tastatur/Maus oder Touch). Auf Touch sind die beiden Hälften währenddessen beschriftet („MOVE“ / „HOLD TO HOOK“).
Gespeichert wird `shardsling.tutorialDone` in localStorage (auch beim Überspringen). Wiederholen: „HOW TO PLAY“ im Menü und im Pause-Screen
(aus der Pause zurück ins pausierte Spiel). Logik in `src/tutorial.ts`, Layout der Übungsarena in `src/sim/sim.ts` (`createTutorial`).

Die Touch-Steuerung erscheint nach **Eingabegerät** (`pointer: coarse` bzw. erste echte Touch-Berührung), nicht nach Bildschirmbreite.
Das Menü zeigt je nach Gerät die passenden Hinweise. Start mit genau einem Klick/Tap (oder Enter/Leertaste).

## Drohne (Spielerfarbe)

Die eigene Drohne hat eine Farbe, die sonst nichts im Spiel nutzt: **Grün `#7dff5a`** (`DRONE_COLOR` in `src/render/fx.ts`)
mit weißem Kern. Form: runder Körper mit weißer Nase (zeigt in Flugrichtung) und zwei seitlichen Triebwerken mit Flamme,
dazu ein pulsierender Leuchtring und eine kurze grüne Bewegungsspur. Bei Wellenstart und nach einem verlorenen Leben
erscheint 1,5 s ein „YOU“-Spotlight (wachsende Ringe + Schrift unter der Drohne). Während der Unverwundbarkeit
blinkt nur der Körper leicht, Kern, Nase und ein gestrichelter Schildring bleiben voll sichtbar. Auch die Leben-Anzeige
im HUD ist grün. Nur Rendering, die Simulation ist unverändert. `test/palette.test.ts` prüft, dass keine Kristall-,
Gegner- oder Seilfarbe im Farbton nah an der Drohne liegt. Vorher/Nachher-Screenshots: `node scripts/drone-shots.mjs <tag> [--spawn]`.

## Sound (M6)

- Effekte mit **ZzFX** (Frank Force, MIT): Haken, Treffer am Kristall, Schleudern, Zerschlagen (Tonhöhe nach Größe und Kombo),
  Leben verloren, Welle geschafft (Akkord-Arpeggio), Game Over, Perk gewählt, Gegner zerstört, Boss-Treffer/-Angriff/-Ende.
  Nur der Sample-Generator `buildSamples` ist übernommen (`src/audio/zzfx.ts`, Lizenztext im Kopf; bitgleich mit dem npm-Paket 1.4.0 geprüft),
  die Wiedergabe läuft über einen eigenen AudioContext. Keine Audio-Dateien, keine externen Requests.
- **Musik**: eigene kleine Synthwave-Schleife (`src/audio/music.ts`, Web-Audio-Oszillatoren): 8 Takte A-Moll, 112 BPM,
  Saw-Bass mit Oktavsprüngen, Pad, Arpeggio mit Echo, Kick/Hats. Im Boss-Kampf durchgehende Kick und schnellere Hats.
- **Ton an/aus**: Button oben rechts (im Spiel links neben Pause) oder Taste **M**; gespeichert als `shardsling.muted` in localStorage.
- Browser-Regeln: Der AudioContext entsteht erst bei der ersten Geste (pointerdown/keydown/touchend, iOS-tauglich mit stillem Puffer).
  Pause und verstecktes Tab → `suspend()` (komplett still), weiter → `resume()`. Das Menü-Demo bleibt stumm.
- Alles liegt außerhalb von `src/sim/` (`src/audio/`); der Sound hört nur auf Sim-Events.

## Perks (M5 Teil 1)

Nach jeder **geschafften** Welle (nicht bei Zeitablauf) wird das Spiel kurz eingefroren und es gibt **1 von 3** Perks
(Zufall aus dem seedbaren Generator, ausgereizte Perks werden nicht angeboten). Wahl per Klick/Tap, Tasten 1/2/3 oder ←/→ + Enter;
die Karten sind die ersten 0,45 s gesperrt (gegen versehentliches Wählen beim Weiterdrücken). Werte in `src/sim/constants.ts` (`PERKS`).

| Perk | Wirkung | max. |
|---|---|---|
| Long Rope | Haken-Reichweite +15 % pro Stufe | 3 |
| Fast Swing | Kristall dreht schneller auf (+22 % Kraft) und fliegt schneller (+10 % Höchsttempo) | 3 |
| Extra Life | +1 Leben (höchstens 5) | – |
| Shockwave | Jeder Treffer zerschlägt auch kleine Kristalle/Staub und Jäger/Prismen im Umkreis (+55 px pro Stufe), ohne Kettenreaktion von Schockwellen | 3 |
| Magnet Hook | Geschleuderte Kristalle lenken leicht auf Ziele vor ihnen (max. 2,2 rad/s pro Stufe, nur in einem Kegel von ±37°) | 2 |
| Focus | Solange ein Kristall am Seil hängt, läuft der Rest der Welt 20 % pro Stufe langsamer (blauer Rand) | 2 |

Im Sim: `state.perkOffer`, `perkOfferReady(s)` (0,6 s nach dem Clear), `choosePerk(s, i)`. Headless blockiert nichts:
ein unbeantwortetes Angebot verfällt, wenn die nächste Welle kommt (wichtig für Training/Replays).

## Gegner und Boss (M5 Teil 2)

Alle werden wie Kristalle besiegt: einen Kristall **hineinschleudern** (oder schnell hineinschwingen). Alles, was Gegner verschießen,
sind normale kleine Kristalle, also gefährlich bei Berührung, aber auch neue Munition. Jeder Gegner erscheint mit 1 s
„Warp“-Ring, währenddessen harmlos. Werte in `src/sim/constants.ts` (`ENEMY`), Logik in `src/sim/enemies.ts`.

- **Hunter** (rot, mit Auge) ab Welle 3 (1 → max. 4): treibt langsam auf die Drohne zu (75–115 px/s, Drohne: 560).
  Nach einer Berührung zieht er sich kurz zurück. 150 Punkte.
- **Prism** (orange) ab Welle 5 (1 → max. 3): treibt umher und schießt alle 5 s **einen** Kristall genau entlang einer vorher
  1 s lang angezeigten Ziellinie. Zerschlagen: platzt in 5 scharfe Splitter (Kettenreaktion), die die Drohne kurz nicht verletzen. 200 Punkte.
- **Boss „CORE“** in Welle 10 (und jeder weiteren 10.): groß, 14 LP (+6 je weiterem Boss), Treffer mit klein/mittel/groß = 1/2/3 Schaden,
  der Wurfkristall zerspringt an der Panzerung (Splitter = Munition). Wechselt zwischen gezielter 3er-Salve und 8er-Ring,
  jeweils 1,1–1,3 s angekündigt (gestrichelte Linien, Pulsieren); unter halber Energie häufiger. Bleibt beim Ankündigen stehen.
  Besiegt: 2500 Punkte, das ganze Feld zerspringt, Welle geschafft. Boss-Wellen laufen nie auf Zeit ab.
- Solange Gegner leben und weniger als 3 Kristalle im Feld sind, treibt alle 2,5 s ein mittlerer Kristall herein (keine Munitionsnot).
- Eine Welle gilt erst als geschafft, wenn auch alle Gegner weg sind.

## Feinschliff

- Seil: leichter Durchhang gegen die Drehrichtung, kleine Schwingung, heller Kern.
- **Hit-Freeze**: bei großen Treffern, Gegner-Kills und Boss-Treffern friert die Welt ~3 Frames ein (45 ms, höchstens alle 0,35 s;
  beim Boss-Ende länger). Reine Darstellungssache in `main.ts`, die Simulation bleibt deterministisch.

## Was erledigt ist

**M1 Fundament**
- Vite 7 + TypeScript + Canvas 2D, kein React (JS-Bundle ≈ 67 KB, ≈ 24 KB gzip, inkl. Sound, Musik, Gegner).
- `base: './'` (relative Pfade), Schriften Orbitron/Rajdhani selbst gehostet (nur woff2, latin, SIL OFL – Lizenzen in `src/assets/fonts/`). Keine CDNs, keine externen Requests (per Browser-Test geprüft).
- `user-select: none`, `touch-action: none`, kein Tap-Highlight. Kein Tracking, keine Werbung, keine KI-Behauptungen im Spiel, der alte Markenname kommt nirgends vor.
- Neon-Look wie beim Vorgänger: schwarz, Cyan/Magenta/Gelb, Glow.

**M2 Engine-Kern**
- `src/sim/` ist ein reiner Simulationskern ohne DOM: `step(state, input, dt)` (schnell, in-place) und `stepPure(...)` (gibt neuen Zustand zurück). Zufall nur über einen seedbaren Generator (mulberry32) im Zustand.
- Feste Zeitschrittweite: 120 Schritte/s mit Akkumulator (`src/engine/fixedStep.ts`), Rendering interpoliert dazwischen. Schutz gegen „Spiral of Death“ nach Rucklern.
- Automatischer Test: Seed + Eingabe-Log ergibt bei 30/60/144/165/240 Hz und auch bei unregelmäßigen Frame-Zeiten **bit-identische** Spielzustände; nach 20 s sind es überall exakt 2.400 Schritte. Im echten Browser gemessen: ≈ 120 Schritte/s.
- Pause per P/Esc und Button; automatische Pause bei Tab-Wechsel (`visibilitychange`) und Fokusverlust (`blur`). Beim Pausieren werden alle gedrückten Eingaben gelöst.
- Headless lauffähig: `npm run sim` spielt Episoden ohne Rendering (mehrere hunderttausend Schritte/s), Grundlage für späteres KI-Training (M8).

**M3 Steuerung**: Tastatur, Maus und Touch über eine Eingabeschicht (`src/input/input.ts`), Zwei-Daumen-Touch (Stick + Halten) getestet.

**Kern-Twist (erste spielbare Version)**
- Harpune mit Zielvorschau (gelbe Klammern), Seil als harte Längenbedingung mit Massengewichtung (schwere Splitter ziehen die Drohne mit und drehen langsamer auf).
- Schleudern, Splitter-gegen-Splitter-Kollisionen, Zerbrechen in 2–3 Teile (groß → mittel → klein → Staub), Bruchstücke kurz „scharf“ (Kettenreaktionen), Kombo-Multiplikator bis x10.
- Wellen (nächste Welle, wenn das Feld fast leer ist oder spätestens nach 55 s), Welle 1 startet immer mit einem Splitter in Reichweite.
- 3 Leben, Unverwundbarkeit nach Treffer, Game-Over-Screen, Neustart, lokaler Highscore (localStorage, hinter einem kleinen Adapter).
- Im Menü-Hintergrund läuft eine Demo mit einer **handgeschriebenen Heuristik** (kein gelerntes Netz, wird auch nicht als KI bezeichnet).

## Tests

- `npm test`: 41 Unit-Tests (Zeitschritt/Determinismus, Wände, Haken→Schleudern→Zerbrechen, Leben/Game Over, Wellen, Spielbarkeit, Tutorial-Arena,
  **Perk-Angebot und jede Perk-Wirkung**, **Gegner-Wellen, Hunter, Prism-Telegraph/Splitter, Boss-Angriffe/Schaden/Ende**, Determinismus mit Gegnern).
- `npm run e2e`: 128 Browser-Checks in 1280×720, 907×510, 800×450, 1080×607 (Touch-Emulation), 390×844 und 844×390 (Handy),
  inkl. komplettem Tutorial-Durchlauf mit Tastatur und mit Touch, Perk-Auswahl (Taste, Maus, Tap am Handy), Ton aus/an (Button, M, Reload),
  AudioContext erst nach Geste und still in der Pause, Gegner und Boss. Die Messung „≈120 Schritte/s“ zieht den Hit-Freeze ab.
  Screenshots landen in `screenshots/` (u. a. `perk-choice-*.png`, `wave-enemies-1280x720.png`, `boss-*.png`, `mute-button-*.png`).
  Test-Hooks nur mit `?e2e`: `clearField()`, `jumpToWave(n)`.

## Ordner

```
src/sim/      Simulationskern (headless): constants, types, rng, sim, shared, perks, enemies, bot (Heuristik), headless runner
src/audio/    ZzFX-Generator (MIT), Musik-Schleife, Sound-Manager (Mute, Suspend, Gesten-Unlock)
src/engine/   FixedStepper (Akkumulator)
src/render/   Canvas-Renderer + rein kosmetische Effekte (Partikel, Shake, Trails)
src/input/    Tastatur/Maus/Touch
src/main.ts   Spielablauf, Menüs, Pause, Highscore
src/tutorial.ts  Tutorial-Schritte, Texte, Hervorhebungen
src/perkInfo.ts  Namen, Texte und Icons der Perks (UI)
test/         Vitest
scripts/      e2e.mjs (Playwright), headless.ts
```

## Bekannte Punkte / offen

- Balancing ist ein erster Wurf (Seil-Länge, Spin-Kraft, Bruch-Geschwindigkeit, Perks, Gegner stehen in `src/sim/constants.ts`). Braucht echtes Anspielen,
  besonders Welle 5–10 und der Boss (Heuristik-Bot schafft ihn headless in ~50 s, ein Mensch sollte schneller sein).
- Sounds und Musik sind nur technisch geprüft (Länge/Pegel, bitgleich mit ZzFX), nicht mit Ohren abgestimmt.
- Hochformat am Handy: die Arena ist fest 16:9 und wird klein, deshalb ein Hinweis „Gerät drehen“.
- Maus-Steuerung: Sobald die Maus bewegt wird (ohne gedrückte Bewegungstaste), folgt die Drohne dem Zeiger. Wer mit Tastatur spielt und die Maus anstößt, merkt das kurz.
- Die Determinismus-Garantie gilt innerhalb derselben JS-Engine (Math.exp/sqrt können sich zwischen Engines im letzten Bit unterscheiden). Für Replays im Video reicht das, weil Training und Aufnahme in Chromium/Node (V8) laufen.

## Nächste Schritte (Meilenstein 4+)

1. **M4 Feinschliff des Twists**: Anspielen und tunen, Bandenwurf-Bonus (Seil-Kurve und Hit-Freeze sind schon drin).
2. **M5/M6 Feinschliff**: Perks/Gegner/Boss nach Anspielen tunen, evtl. weitere Perks (Doppelhaken, explosive Würfe), Sound nach Gehör abmischen.
4. **M7 Fortschritt**: Tages-Seed („Daily Sling“), freischaltbare Farben.
5. **M8 KI-Harness**: Beobachtungen + Aktionen (9 Richtungen × Haken) auf `src/sim`, Neuroevolution-Trainer, Replay-Recorder/-Player (`?replay=`).
6. **M9/M10**: Cover, Preview-Videos, itch.io/CrazyGames – jeweils erst nach Freigabe.

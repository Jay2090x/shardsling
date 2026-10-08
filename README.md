# Shardsling

Browser-Spiel (Canvas 2D, TypeScript, Vite, ohne Framework): Du steuerst eine runde Drohne **ohne Waffe**.
Halten = Harpune auf einen Kristall-Splitter, er kreist am Neon-Seil um dich. Loslassen = er fliegt tangential weg
und zertrümmert andere Splitter. Jedes Bruchstück ist neue Munition. Die Wände sind federnd (Bandenwürfe).

Stand: 08.10.2026, Meilensteine 1–3 fertig plus eine erste spielbare Version des Kern-Twists („Hook & Fling“).
Nur lokal: nichts deployed, nichts gepusht, keine Accounts.

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
| Tastatur | WASD / Pfeile | Leertaste halten | loslassen | P / Esc |
| Maus | Zeiger (Drohne folgt) | Linksklick halten (zielt auf den Splitter am Zeiger) | loslassen | Pause-Button |
| Touch | linke Hälfte ziehen (virtueller Stick) | rechte Hälfte halten | loslassen | Pause-Button |

Die Touch-Steuerung erscheint nach **Eingabegerät** (`pointer: coarse` bzw. erste echte Touch-Berührung), nicht nach Bildschirmbreite.
Das Menü zeigt je nach Gerät die passenden Hinweise. Start mit genau einem Klick/Tap (oder Enter/Leertaste).

## Was erledigt ist

**M1 Fundament**
- Vite 7 + TypeScript + Canvas 2D, kein React (JS-Bundle ≈ 28 KB, ≈ 10,5 KB gzip).
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

- `npm test`: 14 Unit-Tests (Zeitschritt/Determinismus, Wände, Haken→Schleudern→Zerbrechen, Leben/Game Over, Wellen, Spielbarkeit).
- `npm run e2e`: 43 Browser-Checks in 1280×720, 907×510, 800×450, 1080×607 (Touch-Emulation), 390×844 und 844×390 (Handy).
  Screenshots landen in `screenshots/`.

## Ordner

```
src/sim/      Simulationskern (headless): constants, types, rng, sim, bot (Heuristik), headless runner
src/engine/   FixedStepper (Akkumulator)
src/render/   Canvas-Renderer + rein kosmetische Effekte (Partikel, Shake, Trails)
src/input/    Tastatur/Maus/Touch
src/main.ts   Spielablauf, Menüs, Pause, Highscore
test/         Vitest
scripts/      e2e.mjs (Playwright), headless.ts
```

## Bekannte Punkte / offen

- Balancing ist ein erster Wurf (Seil-Länge, Spin-Kraft, Bruch-Geschwindigkeit stehen in `src/sim/constants.ts`). Braucht echtes Anspielen.
- Kein Sound (M6), keine Perks/Gegner (M5), kein Onboarding-Geisterhinweis.
- Hochformat am Handy: die Arena ist fest 16:9 und wird klein, deshalb ein Hinweis „Gerät drehen“.
- Maus-Steuerung: Sobald die Maus bewegt wird (ohne gedrückte Bewegungstaste), folgt die Drohne dem Zeiger. Wer mit Tastatur spielt und die Maus anstößt, merkt das kurz.
- Die Determinismus-Garantie gilt innerhalb derselben JS-Engine (Math.exp/sqrt können sich zwischen Engines im letzten Bit unterscheiden). Für Replays im Video reicht das, weil Training und Aufnahme in Chromium/Node (V8) laufen.

## Nächste Schritte (Meilenstein 4+)

1. **M4 Feinschliff des Twists**: Anspielen und tunen, Seil-Optik (leichte Kurve/Verlet), Bandenwurf-Bonus, Treffer-Feedback (Hitstop).
2. **M5 Spielschleife**: 1 von 3 Perks nach jeder Welle (längeres Seil, Doppelhaken, explosive Würfe, Magnet-Seil), Gegner (Jäger, „Prisma“), Boss in Welle 10, Geister-Tutorial.
3. **M6 Sound**: ZzFX/ZzFXM (MIT), Mute-Schalter, stumm bei Pause, AudioContext-Resume (iOS).
4. **M7 Fortschritt**: Tages-Seed („Daily Sling“), freischaltbare Farben.
5. **M8 KI-Harness**: Beobachtungen + Aktionen (9 Richtungen × Haken) auf `src/sim`, Neuroevolution-Trainer, Replay-Recorder/-Player (`?replay=`).
6. **M9/M10**: Cover, Preview-Videos, itch.io/CrazyGames – jeweils erst nach Freigabe.

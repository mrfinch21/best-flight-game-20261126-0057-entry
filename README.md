# best-flight-game-20261126-0057-entry

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/mrfinch21/best-flight-game-20261126-0057-entry/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/mrfinch21/best-flight-game-20261126-0057-entry/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Skylark Valley** — a valley courier flight game for make.fun's "Make the best flight game" bounty. Fly a little prop plane through a river valley from a chase camera: thread glowing rings, carry the mail the length of the valley, and put her down on a short grass strip in a storm. Throttle discipline matters — full power climbs fast but drinks fuel, and fuel is the only clock that matters. Landings are judged: sink gently, on the strip, gear down, nose straight, or it is a crash.

## Run it

```sh
node serve.ts            # play at http://localhost:8080/
```

Keyboard: ↑ ↓ pitch, ← → bank, W / S throttle, F flaps, G gear, P pause, M mute, R restart. Mouse: click a sortie card, or the buttons on the briefing and result screens. 1 / 2 / 3 pick a sortie from the title screen.

## The three sorties

1. **Ring Run** — thread all 6 rings along the valley at dawn, 4:20 on the clock.
2. **Valley Mail** — scoop the parcel at the low beacon over Miller's Crossing, then carry it the length of the valley and land on South Strip.
3. **Storm Rescue** — fly the beacon ring through fog and gusts, then land on the short grass strip beside the hut. No second chances.

Scoring: rings 100 each, parcel 150, a landing 250 plus 100 for a gentle one, and bonuses for fuel and time left.

## Hand it in

```sh
MAKEFUN_OUTPUT_DIR=./output node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory and writes `dossier.json` with the kit's vendored library. Screenshots are real renders of the game's own code, staged by `game/src/shots.js` (`?shot=cover|rings|landing|rescue&seed=1`). Every mission is completable — an autopilot in `game/src/autopilot.js` flies all three to a landing with fuel to spare.

## Layout

- `game/index.html` — the page shell and canvas.
- `game/src/config.js` — tuning, palette, the three sorties, airfields, rings.
- `game/src/random.js` — the seeded generator (mulberry32, one seed, one flight).
- `game/src/terrain.js` — the valley: ground height, fields, forest, river, road, strips.
- `game/src/flight.js` — the physics: throttle, bank, pitch, stall, fuel, damage, landings, crashes.
- `game/src/missions.js` — the sortie state machine, events, scoring.
- `game/src/autopilot.js` — the controller that flies the staged shots and proves the sorties.
- `game/src/render.js` — everything drawn on the canvas: sky, ground, aircraft, HUD, screens.
- `game/src/particles.js` — ring bursts, touchdown smoke, crash debris.
- `game/src/audio.js` — WebAudio sound effects, synthesised, no files.
- `game/src/input.js` — keyboard and mouse.
- `game/src/shots.js` — deterministic screenshot scenes.
- `game/src/main.js` — the state, the fixed-step loop, and the world the stager drives.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

---

<sub>Entered on [make.fun](https://make.fun/r/yppeq605) · AI agents build software for cash rewards</sub>

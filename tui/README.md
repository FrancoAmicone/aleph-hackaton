# 🃏 Gran Truco Argentino

> Truco Argentino for the terminal — running on [Bare](https://github.com/holepunchto/bare), delivered and updated **peer-to-peer** with [Pear](https://docs.pears.com/).

No app store, no CDN, no server. You install it from a `pear://` link, and when a new
version is staged it arrives over the swarm from whoever is seeding it.

```sh
pear install pear://izkyzf8cdezbqb6hxqxnmg8584y1c5o5aj5c47x5ui7fdo5zd5co
```

On macOS that installs `truco.app`; run the game with:

```sh
truco.app/Contents/MacOS/truco
```

<details>
<summary>If <code>pear install</code> cannot reach a peer</summary>

Nothing can be fetched unless someone is seeding the link. If installing hangs, make sure a
seeder is up (`pear seed pear://izky…`), then retry with a longer timeout — the download is
~140MB:

```sh
pear install --timeout 300 pear://izkyzf8cdezbqb6hxqxnmg8584y1c5o5aj5c47x5ui7fdo5zd5co
```

You can also pull the raw binary instead of installing:

```sh
pear dump pear://izkyzf8cdezbqb6hxqxnmg8584y1c5o5aj5c47x5ui7fdo5zd5co ./truco-dl
./truco-dl/by-arch/darwin-arm64/app/truco        # or darwin-x64 / linux-x64
```

</details>

<!-- Add a terminal recording here for the submission -->

---

## What it is

A full implementation of **Truco Argentino** — the real game, not a card-comparison toy:

- **40-card Spanish deck** (1–7, 10, 11, 12 — no 8s, no 9s) with the true ranking,
  from the ancho de espada down to the cuatros, including the _falsos_.
- **Envido**, **Real Envido**, **Falta Envido**, with the proper accept/refuse
  values and the falta scaled to what the leading team still needs.
- **Truco → Retruco → Vale Cuatro**, where refusing pays the level below.
- **Flor** and **Contraflor** (switchable off from the menu).
- **"El envido está primero"** — answer a truco in the first trick with an
  envido and it settles first, with the truco still on the table afterwards.
- Correct **parda** resolution across all three tricks, including the
  three-pardas-mano case.
- **2 vs 2** with a partner and turn order around the table, or a **1 vs 1** duel.
- Three levels of AI that bluff, fold, and know not to burn an ancho when their
  partner already holds the trick.

Game to 30 points. Malas 0–14, buenas 15–29.

## Playing

| Key         |                                     |
| ----------- | ----------------------------------- |
| `←` `→`     | pick a card                         |
| `ENTER`     | play it                             |
| `1` `2` `3` | play that card directly             |
| `T`         | truco / retruco / vale cuatro       |
| `E` `R` `A` | envido / real envido / falta envido |
| `F` `C`     | flor / contraflor                   |
| `Q` `N`     | quiero / no quiero                  |
| `M`         | irse al mazo                        |
| `ESC`       | back to the menu                    |

The hint bar under the table is generated from the engine's own list of legal
moves, so it can never offer you something the rules do not allow.

### Flags

```sh
truco --duelo              # 1 vs 1 instead of 2 vs 2
truco --nivel duro         # facil | normal | duro
truco --sin-flor           # play without flor
truco --jugar              # skip the menu and deal
truco --no-updates         # disable OTA updates for this run
truco --storage <dir>      # use a specific storage directory
```

## Running from source

Requires [Node.js](https://nodejs.org/) (for npm and the build scripts) and
[Pear](https://docs.pears.com/) (`npm i -g pear`).

```sh
npm install
npm start          # dev mode — updates disabled so your build is not swapped mid-hand
npm test           # 139 tests
```

## How it is built

Based on [`hello-pear-bare`](https://github.com/holepunchto/hello-pear-bare),
branch **`tui`** — the variant that ships `lib/tea`, a Bubble Tea-style Elm
Architecture runtime for Bare terminals, and `lib/pear-cli.js`, which wires up
pear-runtime, the OTA updater, swarm replication and teardown.

`lib/tea` is used untouched. Everything under `lib/truco` and `lib/ui` is this
game. `lib/pear-cli.js` needed three changes, described [below](#changes-to-the-template).

```
bin.js                  entrypoint — wires pear-cli to the game model
lib/
  pear-cli.js           template: runtime, updater, swarm, teardown
  tea/                  template: the TUI framework (untouched)
  truco/
    deck.js             Spanish deck + Truco ranking
    envido.js           envido / flor arithmetic
    engine.js           the rules — a pure state machine
    ai.js               the rivals
  ui/
    canvas.js           the fixed 120x38 canvas, its three columns, centring
    palette.js          the colour ramp, as ANSI-256 indices
    cards.js            drawing cards
    bars.js             the animated glitch bars on the title screen
    screen.js           the table dashboard: mesa, panels, chat
    menu.js             title screen and rules card
    app.js              the root model: menu → table → result
scripts/
  make.js               template: pick the build target for this host
  deploy.js             assemble the deployment folder pear stage expects
test/                   engine, AI, and headless UI tests
```

Two design decisions worth calling out:

**The engine knows the rules; nothing else does.** `game.legalActions(seat)`
returns every move available, and both the UI and the AI choose from that list.
The AI cannot cheat, the hint bar cannot drift out of sync, and the whole game
is testable with no terminal attached.

**One fixed canvas, never reflowed.** Every screen is drawn at exactly
120×38 and centred in the terminal; a window too small to hold it is asked to
grow rather than served a second, reflowed layout. That is what keeps the render
functions free of width thresholds and adaptive branches — there is one layout
and it is always the same one. It needs a terminal of at least 120×38.

**Updater output never reaches the screen directly.** A stray `console.log`
during a hand would tear the alt-screen, so `lib/pear-cli.js` routes the
wrapper's logs into the model as Msgs, and `bin.js` turns updater events into a
status line in the top-right corner.

### Changes to the template

`lib/pear-cli.js` is otherwise the template's, with three edits:

1. **Argument parsing was off by one in built binaries.** It sliced a fixed
   `Bare.argv.slice(2)`, which is right for `bare bin.js …` but wrong for a
   standalone build invoked as `truco --duelo` — the first flag was silently
   swallowed, and `--storage <dir>` aborted with `UNKNOWN_ARG`. Now it slices
   based on whether it is running under `bare`.
2. **A late swarm connection could kill the app.** The `connection` handler
   called `store.replicate()` unguarded; if a connection landed after the store
   began closing — during teardown, or when a second copy loses the race for the
   same storage directory — Corestore threw `Corestore is closed` as an uncaught
   rejection. Late connections are now dropped.
3. **Platform-aware artifact naming**, so a copy installed as `truco.app` asks
   the updater for the bundle and swaps the bundle directory, while a plain
   binary keeps updating as a plain binary.

### Tests

```
npm test    # 139 tests, 577 assertions
```

Beyond the rule-by-rule unit tests, two of them carry most of the weight:

- **Fuzz** — 400 complete games (four-handed and duels, all three AI levels) are
  played to 30 points. Every action the AI picks is checked against the engine's
  own legal-move list, and every game must terminate with a valid score. This is
  what proves the canto state machine has no deadlock.
- **Frame invariants** — frames are rendered at several terminal sizes and
  through a whole played-out hand, asserting no line is ever wider than the
  screen and no frame taller. An overflowing line tears the alt-screen, and you
  cannot see that in a unit test of a component.

## Platforms

| Target      | Ships                 | Status                  |
| ----------- | --------------------- | ----------------------- |
| macOS arm64 | `truco` + `truco.app` | built and run here      |
| macOS x64   | `truco` + `truco.app` | cross-compiled, not run |
| Linux x64   | `truco`               | cross-compiled, not run |

Windows is buildable (`npm run make:win32-x64`) but is not part of this release.

## Deploying it peer-to-peer

The `upgrade` field in `package.json` is the drive this app updates itself from.
It was created with `pear touch`.

```sh
npm run make:darwin-arm64      # or make:darwin-x64 / make:linux-x64
npm run deploy                 # assemble deploy/ in the layout Pear expects
pear stage pear://izkyzf8cdezbqb6hxqxnmg8584y1c5o5aj5c47x5ui7fdo5zd5co ./deploy
pear seed  pear://izkyzf8cdezbqb6hxqxnmg8584y1c5o5aj5c47x5ui7fdo5zd5co
```

`npm run deploy` builds what the updater and the installer each need:

```
deploy/
  package.json                                # its `version` is what the updater compares
  by-arch/
    darwin-arm64/app/truco                    # plain binary — what a dump/direct install runs
    darwin-arm64/app/truco.app/               # bundle — the only shape `pear install` accepts
        Contents/MacOS/truco
        Contents/Info.plist
    linux-x64/app/truco
```

Both macOS artifacts ship side by side so either install style finds its own,
and a running copy asks the updater for whichever one it was started as.

> `pear seed` must be running for anyone to install or update. It runs until you
> stop it.

### Shipping an update

With a copy running and someone seeding, an update is four commands:

```sh
npm version patch     # 1.0.3 -> 1.0.4
npm run make:darwin-arm64
npm run deploy
pear stage pear://izkyzf8c... ./deploy
```

Every running copy on a lower version pulls the new artifact over the swarm and
shows it in the corner:

```
⇣ bajando actualización…
⇣ actualizando…
✓ nueva versión lista — reiniciá para jugarla
```

The download happens while you play — the hand in progress is never interrupted,
and the new build takes over on the next start.

This was verified end to end for both install styles: a v1.0.2 copy running while
v1.0.3 was staged pulled the new build over the swarm, replaced itself on disk
(hash-identical to the fresh build), and restarted reporting v1.0.3.

## Built on

[Bare](https://github.com/holepunchto/bare) ·
[Pear](https://docs.pears.com/) ·
[pear-runtime](https://github.com/holepunchto/pear-runtime) ·
[Hyperswarm](https://github.com/holepunchto/hyperswarm) ·
[Corestore](https://github.com/holepunchto/corestore) ·
[hello-pear-bare](https://github.com/holepunchto/hello-pear-bare)

## License

Apache-2.0 — the `hello-pear-bare` template and `lib/tea` are © Holepunch Inc.

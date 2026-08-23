# 🍐 The Great Pear

> UNO for the terminal, played with pears — running on [Bare](https://github.com/holepunchto/bare), delivered and updated **peer-to-peer** with [Pear](https://docs.pears.com/).

No app store, no CDN, no server. You install it from a `pear://` link, and when a new
version is staged it arrives over the swarm from whoever is seeding it.

```sh
pear install pear://izkyzf8cdezbqb6hxqxnmg8584y1c5o5aj5c47x5ui7fdo5zd5co
```

On macOS that installs `pear-game.app`; run the game with:

```sh
pear-game.app/Contents/MacOS/pear-game
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
pear dump pear://izkyzf8cdezbqb6hxqxnmg8584y1c5o5aj5c47x5ui7fdo5zd5co ./pear-dl
./pear-dl/by-arch/darwin-arm64/app/pear-game        # or darwin-x64 / linux-x64
```

</details>

<!-- Add a terminal recording here for the submission -->

---

## What it is

UNO for the terminal, played against three AI rivals, with a deck trimmed to
**numbers, +2 and +4** — no Skip, no Reverse, no plain Wild. Five cards each,
first to 500 points takes it.

- **88 cards**: 0-9 in four colours (one 0, two of each 1-9), two +2 per
  colour, four +4. A number card shows its value as **pears** laid out like the
  pips on a playing card — you read it by counting, not by reading a digit.
- **Matching** by colour or by number. A +4 is always playable and its player
  names the colour that continues.
- **Stacking**: a +2 is answered with another +2 and a +4 with another +4 — the
  count grows until somebody cannot answer and eats the lot.
- **Draw and play**: with nothing playable you draw one, and if it fits you may
  play it on the spot.
- **¡UNO!**: down to one card you must call it. Anyone who catches you quiet
  makes you draw two — and the rivals will, depending on how hard you set them.
- **Scoring** the real way: the player who goes out banks what everyone else
  still holds, numbers at face value, +2 worth 20 and +4 worth 50.

Because play only ever moves one way round the table — there is no Reverse in
this deck — the engine needs no direction state at all.

## Playing

| Key             |                                               |
| --------------- | --------------------------------------------- |
| `←` `→`         | pick a card                                   |
| `ENTER`         | play it                                       |
| `1`–`9`         | play that card directly                       |
| `D`             | draw — or eat the stack when one is owed      |
| `P`             | pass, after drawing an unplayable card        |
| `U`             | shout ¡UNO! — or catch a rival who went quiet |
| `R` `A` `V` `Z` | name the colour after a +4                    |
| `ESC`           | back to the menu                              |

The command line under your hand is generated from the engine's own list of
legal moves, so it can never offer you something the rules do not allow.

### Flags

```sh
pear-game --jugadores 3          # 2, 3 or 4 at the table
pear-game --nivel duro           # facil | normal | duro
pear-game --meta 200             # points to win: 200, 300 or 500
pear-game --jugar                # skip the menu and deal
pear-game --no-updates           # disable OTA updates for this run
pear-game --storage <dir>        # use a specific storage directory
```

## Running from source

Requires [Node.js](https://nodejs.org/) (for npm and the build scripts) and
[Pear](https://docs.pears.com/) (`npm i -g pear`).

```sh
npm install
npm start          # dev mode — updates disabled so your build is not swapped mid-hand
npm test           # 130 tests
```

## How it is built

Based on [`hello-pear-bare`](https://github.com/holepunchto/hello-pear-bare),
branch **`tui`** — the variant that ships `lib/tea`, a Bubble Tea-style Elm
Architecture runtime for Bare terminals, and `lib/pear-cli.js`, which wires up
pear-runtime, the OTA updater, swarm replication and teardown.

`lib/tea` is used untouched. Everything under `lib/uno` and `lib/ui` is this
game. `lib/pear-cli.js` needed three changes, described [below](#changes-to-the-template).

```
bin.js                  entrypoint — wires pear-cli to the game model
lib/
  pear-cli.js           template: runtime, updater, swarm, teardown
  tea/                  template: the TUI framework (untouched)
  uno/
    deck.js             the 88-card deck and what matches what
    engine.js           the rules — a pure state machine
    ai.js               the rivals
  ui/
    canvas.js           the fixed 120x38 canvas, its three columns, centring
    palette.js          the colour ramp, as ANSI-256 indices
    cards.js            drawing cards
    bars.js             the animated glitch bars on the title screen
    screen.js           the table: felt, panels, hand, command line
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
   standalone build invoked as `pear-game --jugadores 3` — the first flag was silently
   swallowed, and `--storage <dir>` aborted with `UNKNOWN_ARG`. Now it slices
   based on whether it is running under `bare`.
2. **A late swarm connection could kill the app.** The `connection` handler
   called `store.replicate()` unguarded; if a connection landed after the store
   began closing — during teardown, or when a second copy loses the race for the
   same storage directory — Corestore threw `Corestore is closed` as an uncaught
   rejection. Late connections are now dropped.
3. **Platform-aware artifact naming**, so a copy installed as `uno.app` asks
   the updater for the bundle and swaps the bundle directory, while a plain
   binary keeps updating as a plain binary.

### Tests

```
npm test    # 130 tests, 680 assertions
```

Beyond the rule-by-rule unit tests, two of them carry most of the weight:

- **Fuzz** — 200 complete games (all three AI levels) are played to 500 points.
  Every action the AI picks is checked against the engine's own legal-move list,
  every game must terminate with a valid score, and a separate run asserts the
  88 cards are conserved across hands, draw pile and discard at every step —
  which is what catches a card being lost in a reshuffle or duplicated by a
  stack.
- **Frame invariants** — frames are rendered at several terminal sizes and
  through a whole played-out hand, asserting no line is ever wider than the
  screen and no frame taller. An overflowing line tears the alt-screen, and you
  cannot see that in a unit test of a component.

## Platforms

| Target      | Ships                         | Status                  |
| ----------- | ----------------------------- | ----------------------- |
| macOS arm64 | `uno` + `uno.app`             | built and run here      |
| macOS x64   | `pear-game` + `pear-game.app` | cross-compiled, not run |
| Linux x64   | `pear-game`                   | cross-compiled, not run |

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
    darwin-arm64/app/pear-game                      # plain binary — what a dump/direct install runs
    darwin-arm64/app/pear-game.app/                 # bundle — the only shape `pear install` accepts
        Contents/MacOS/pear-game
        Contents/Info.plist
    linux-x64/app/pear-game
```

Both macOS artifacts ship side by side so either install style finds its own,
and a running copy asks the updater for whichever one it was started as.

> `pear seed` must be running for anyone to install or update. It runs until you
> stop it.

> The binaries are named after `productName`, which changed from `truco` to
> `pear-game` when the game did. Anything installed from an older stage looks for the
> old name and will not find an update — re-stage before demoing.

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

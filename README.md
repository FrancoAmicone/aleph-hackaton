# 🍐 The Great Pear

> UNO for the terminal — running on [Bare](https://github.com/holepunchto/bare), delivered and updated **peer-to-peer** with [Pear](https://docs.pears.com/).

No app store, no CDN, no server. You install it from a `pear://` link, and when a new
version is staged it arrives over the swarm from whoever is seeding it.

```sh
pear install pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
```

That drops a single binary on your `PATH`. Run it by name:

```sh
the-great-pear
```

> **Reinstalling takes two steps.** `pear install` refuses to overwrite an existing
> binary, so remove it first: `rm -f ~/.local/bin/the-great-pear` (on Windows, delete
> the `.exe`). Skip that and the install fails and you silently stay on the old version.
>
> **A seeder has to be up.** With nobody seeding the link there is nothing to download
> and the install ends in `Network Timeout 30s`.

<details>
<summary>If <code>pear install</code> cannot reach a peer</summary>

Nothing can be fetched unless someone is seeding the link. If installing hangs, make sure a
seeder is up (`pear seed pear://u9y7…`), then retry with a longer timeout — the download is
~140MB:

```sh
pear install --timeout 300 pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
```

You can also pull the raw binary instead of installing:

```sh
pear dump pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o ./pear-dl
./pear-dl/by-arch/darwin-arm64/app/the-great-pear        # or darwin-x64 / linux-x64
```

</details>

<!-- Add a terminal recording here for the submission -->

---

## What it is

UNO for the terminal — **up to four humans over the internet**, or on your own
against three bots. The deck is trimmed to
**numbers, +2 and +4** — no Skip, no Reverse, no plain Wild. Five cards each, and
**one hand is the whole game** — going out wins it.

- **88 cards**: 0-9 in four colours (one 0, two of each 1-9), two +2 per
  colour, four +4.
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

## Multiplayer

Two to four people, each on their own machine, on their own network. No server,
no port forwarding, no accounts: peers find each other on the
[HyperDHT](https://docs.pears.com/building-blocks/hyperdht) by hashing the room
name, and hole-punch a direct encrypted connection.

```sh
the-great-pear --room aleph --name franco      # then press CREATE ROOM
the-great-pear --room aleph --name gino        # then press JOIN ROOM
```

Everyone must type **the same `--room`**. The room name is hashed into the DHT
topic, so `aleph` and `Aleph` are different rooms and the peers never meet.

**Give it up to 60 seconds.** Discovery takes 6–15s when it goes well and fails
outright maybe a third of the time on the first attempt, so the room re-announces
every 5 seconds until somebody turns up. The screen says `looking for players…`
the whole time — that is not a hang.

When the connected players appear, **the host presses ENTER** to deal.

### How the game stays in sync

Lockstep with a shared seed. The host draws a random seed and hands it out with
the seating; every peer builds **the same deck** from it. After that only actions
travel over the wire — `{ type, seat, card }`, the engine's own vocabulary — and
each peer replays them on an identical state machine. No game state is ever
serialised, and there is nothing to reconcile.

Measured across three player counts, ~400 random actions each: **states stay
byte-identical**.

### When somebody drops

Hyperswarm runs over UDX, which is UDP — closing a laptop lid sends no reset and
the other side would wait forever. So peers ping every 2s and call a silent peer
dead after 6. With no AI to take over an empty seat, the honest move is to stop:
everyone is told who left and returns to the menu.

### Watching the network

`--log <file>` writes every message crossing the wire, which is the only way to
see what is happening — the TUI owns the whole screen, so a `console.log` is
either invisible or corrupts the render.

```sh
the-great-pear --room aleph --name franco --log ~/red.log
tail -F ~/red.log      # -F, not -f: the file is truncated at startup
```

```
>> what the UI asks of the network      << what comes back
++ the updater                          !! an error
```

| Last line you see | Where it is stuck |
| --- | --- |
| just the header | nobody pressed CREATE/JOIN yet |
| `looking`, nothing more | the swarm never came up |
| `announced`, never `peers` | discovery: the peers cannot find each other |
| `peers` but never `seats` | connected, but the handshake did not cross |
| `seats` and no `start` | the host has not pressed ENTER |

Compare the `topic` in both logs: if they differ, the room names were not
identical.

## Playing

| Key             |                                               |
| --------------- | --------------------------------------------- |
| `←` `→`         | pick a card                                   |
| `ENTER`         | play it                                       |
| `1`–`9`         | play that card directly                       |
| `D`             | draw — or eat the stack when one is owed      |
| `P`             | pass, after drawing an unplayable card        |
| `U`             | shout ¡UNO! — or catch a rival who went quiet |
| `R` `Y` `G` `B` | name the colour after a +4                    |
| `ESC`           | back to the menu                              |

The command line under your hand is generated from the engine's own list of
legal moves, so it can never offer you something the rules do not allow.

### Flags

```sh
the-great-pear --room <name>          # the online room to join
the-great-pear --name <name>          # your name at the table
the-great-pear --log <file>           # write the network log, to follow with tail -F
the-great-pear --level hard           # bot difficulty: easy | normal | hard
the-great-pear --play                 # skip the menu and deal a local hand
the-great-pear --no-updates           # disable OTA updates for this run
the-great-pear --version              # print the version and exit
the-great-pear --help                 # the flag list
```

`--room` and `--name` only carry values; **the menu button decides your role** —
CREATE ROOM makes you the host, JOIN ROOM makes you a guest.

> `--play` deals a **local** hand against bots and never reaches the menu, so it
> cannot be combined with `--room`.

## Running from source

Requires [Node.js](https://nodejs.org/) (for npm and the build scripts) and
[Pear](https://docs.pears.com/) (`npm i -g pear`).

```sh
cd tui
npm install
npm start          # dev mode — updates disabled so your build is not swapped mid-hand
npm test           # 138 tests
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
   standalone build invoked as `the-great-pear --jugadores 3` — the first flag was silently
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
npm test    # 130 tests, 675 assertions
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

All five are cross-compiled **from a single macOS arm64 machine**. The official
docs say to build each target on a matching host; in practice one machine does
the lot.

| Target        | Status                                    |
| ------------- | ----------------------------------------- |
| macOS arm64   | built and played                          |
| macOS x64     | cross-compiled                            |
| Linux x64     | cross-compiled, **installed and played**  |
| Linux arm64   | cross-compiled                            |
| Windows x64   | cross-compiled, **installed and played**  |

## Deploying it peer-to-peer

The `upgrade` field in `package.json` is the drive this app updates itself from.
It was created with `pear touch`.

```sh
npm version patch

npm run make:darwin-arm64      # all five, from this one machine
npm run make:darwin-x64
npm run make:linux-x64
npm run make:linux-arm64
npm run make:win32-x64

pear build --package=./package.json \
  --darwin-arm64-app ./out/darwin-arm64/the-great-pear \
  --darwin-x64-app   ./out/darwin-x64/the-great-pear \
  --linux-x64-app    ./out/linux-x64/the-great-pear \
  --linux-arm64-app  ./out/linux-arm64/the-great-pear \
  --win32-x64-app    ./out/win32-x64/the-great-pear.exe \
  --target ./deploy

pear stage --dry-run pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o ./deploy
pear stage           pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o ./deploy
pear seed            pear://u9y7y9xqggifyeihhi9i1cswyqdrtdjbg75y6obxxy6hwe6uu66o
```

> **`pear build` is not optional, and never stage `out/` directly.** `out/` is in
> `.gitignore` and `pear stage` honours gitignore, so staging it publishes
> everything **except the binaries** — silently. The dry run has to list all five
> under `/by-arch/`. If it does not, do not stage.

`pear build` lays the deploy folder out the way Pear expects:

```
deploy/
  package.json                                 # its `version` is what the updater compares
  by-arch/
    darwin-arm64/app/the-great-pear
    darwin-x64/app/the-great-pear
    linux-x64/app/the-great-pear
    linux-arm64/app/the-great-pear
    win32-x64/app/the-great-pear.exe
```

Every platform ships in the same stage, so one `pear://` link serves all of them
and a running copy pulls the artifact matching the host it is on.

> `pear seed` must be running for anyone to install or update. It runs until you
> stop it.

> The binaries are named after `productName`, which also decides the storage
> directory — so it cannot change once anyone has installed. Anything installed
> from a stage with a different `productName` looks for the old name and will
> never find an update.

### Shipping an update

With a copy running and someone seeding, an update is four commands:

```sh
npm version patch
npm run make:darwin-arm64      # …and the other four
pear build --package=./package.json --darwin-arm64-app ./out/darwin-arm64/the-great-pear ... --target ./deploy
pear stage pear://u9y7y9xq... ./deploy
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

Verified end to end, repeatedly: a copy running while the next version was staged
pulled it over the swarm, replaced itself on disk and reported the new version —
no reinstall, no download link, no store.

> **The updater's own behaviour only changes from the version after the one you
> fix it in.** An installed copy runs its own code, so a fix to the update path
> has to ship *before* the release you want to demo.

> **Do not judge progress by storage size.** The corestore reuses blocks, so it can
> sit flat while an update applies perfectly. `the-great-pear --version` is the only
> reliable check.

## Built on

[Bare](https://github.com/holepunchto/bare) ·
[Pear](https://docs.pears.com/) ·
[pear-runtime](https://github.com/holepunchto/pear-runtime) ·
[Hyperswarm](https://github.com/holepunchto/hyperswarm) ·
[Corestore](https://github.com/holepunchto/corestore) ·
[hello-pear-bare](https://github.com/holepunchto/hello-pear-bare)

## License

Apache-2.0 — the `hello-pear-bare` template and `lib/tea` are © Holepunch Inc.

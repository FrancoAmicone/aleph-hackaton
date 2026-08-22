// The interface. Two things matter here and both are checked without a
// terminal: that a frame never overflows the screen it was drawn for (an
// overflowing line tears the alt-screen), and that keys drive the model the way
// the on-screen hints promise.
const { test } = require('brittle')
const { PassThrough, Writable } = require('bare-stream')
const { Program, KeyMsg, style } = require('../lib/tea')
const { stripAnsi } = require('../lib/tea/style')
const { Game } = require('../lib/truco/engine')
const { decide } = require('../lib/truco/ai')
const {
  renderGame,
  panel,
  commandLines,
  partidaLines,
  mazoLines,
  chatLines
} = require('../lib/ui/screen')
const { titleBlock } = require('../lib/ui/menu')
const { bars, block, GLYPHS } = require('../lib/ui/bars')
const { renderMesa } = require('../lib/ui/screen')
const { CANVAS, COLUMNS } = require('../lib/ui/canvas')
const palette = require('../lib/ui/palette')
const cardsUi = require('../lib/ui/cards')
const App = require('../lib/ui/app')

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

// A key press as the decoder delivers it: matching is done on `name`.
const press = (name) => new KeyMsg({ name, sequence: name })

function app(opts = {}) {
  const model = new App({
    version: '1.0.0',
    flags: opts.flags || {},
    rng: opts.rng || seeded(2024),
    think: { canto: 0, play: 0, say: 0 }
  })
  model.update({
    type: 'resize',
    width: opts.width || CANVAS.width,
    height: opts.height || CANVAS.height
  })
  return model
}

// Feed a Msg in and run whatever Cmd comes back, so AI turns actually happen.
async function step(model, msg) {
  const [, cmd] = model.update(msg)
  await runCmd(model, cmd)
  return model
}

async function runCmd(model, cmd) {
  if (!cmd) return
  const cmds = Array.isArray(cmd) ? cmd : [cmd]
  for (const c of cmds) {
    if (!c) continue
    const msg = await c()
    if (msg && msg.type !== 'quit') {
      const [, next] = model.update(msg)
      await runCmd(model, next)
    }
  }
}

const lines = (frame) => frame.split('\n')
const widest = (frame) => Math.max(...lines(frame).map(style.width))

test('every screen is drawn at exactly the canvas size', (t) => {
  const model = app()

  for (const [name, prepare] of [
    ['menu', () => {}],
    ['rules', () => (model.screen = 'rules')],
    ['table', () => model.startGame()]
  ]) {
    prepare()
    const frame = lines(model.view())
    t.is(frame.length, CANVAS.height, `${name} is ${CANVAS.height} rows`)
    t.is(widest(frame.join('\n')), CANVAS.width, `${name} is ${CANVAS.width} columns`)
  }
})

test('the canvas is centred in a larger terminal', (t) => {
  const model = app({ width: CANVAS.width + 20, height: CANVAS.height + 6 })
  const frame = lines(model.view())

  t.is(frame.length, CANVAS.height + 3, 'padded down by half the spare rows')
  t.ok(
    frame.slice(3).every((line) => line.startsWith(' '.repeat(10))),
    'and indented by half the spare columns'
  )
})

test('a terminal too small for the canvas is asked to grow', (t) => {
  const model = app({ width: 80, height: 24 })
  const frame = stripAnsi(model.view())

  t.ok(frame.includes('muy chica'), 'says the window is too small')
  t.ok(frame.includes(`${CANVAS.width}×${CANVAS.height}`), 'names the size it needs')
  t.ok(frame.includes('80×24'), 'and the size it has')
})

test('the canvas holds its size through a whole played-out hand', async (t) => {
  const model = app()
  model.startGame()

  const rng = seeded(77)
  let guard = 0

  while (model.game && !model.game.isOver() && guard++ < 300) {
    const frame = model.view()
    if (widest(frame) !== CANVAS.width || lines(frame).length !== CANVAS.height) {
      t.fail(`canvas changed size: ${widest(frame)}x${lines(frame).length}`)
      return
    }

    const game = model.game
    if (game.phase === 'hand-over') {
      await step(model, press('enter'))
      continue
    }
    if (game.currentActor() !== 0) {
      await step(model, { type: 'ai' })
      continue
    }

    // Drive the human seat with the AI so the hand keeps moving.
    const action = decide(game, 0, rng)
    if (action.type === 'play') {
      const index = game.hands[0].findIndex(
        (c) => c.rank === action.card.rank && c.suit === action.card.suit
      )
      await step(model, press(String(index + 1)))
    } else if (action.type === 'quiero') {
      await step(model, press('q'))
    } else if (action.type === 'no-quiero') {
      await step(model, press('n'))
    } else if (action.type === 'canto') {
      const chord = {
        truco: 't',
        retruco: 't',
        'vale-cuatro': 't',
        envido: 'e',
        'real-envido': 'r',
        'falta-envido': 'a',
        flor: 'f',
        contraflor: 'c',
        'contraflor-al-resto': 'v'
      }[action.canto]
      await step(model, press(chord))
    } else {
      await step(model, press('m'))
    }
  }

  t.ok(guard < 300, 'the hand progressed rather than stalling')
  t.ok(model.game.handNumber >= 1, 'at least one hand was dealt')
})

test('number keys play that card', async (t) => {
  const model = app()
  model.startGame()
  const before = model.game.hands[0].slice()

  await step(model, press('2'))

  t.is(model.game.hands[0].length, 2, 'a card left the hand')
  t.absent(
    model.game.hands[0].some((c) => c.rank === before[1].rank && c.suit === before[1].suit),
    'and it was the second one'
  )
})

test('arrow keys move the selection and wrap around', (t) => {
  const model = app()
  model.startGame()

  t.is(model.selected, 0, 'starts on the first card')
  model.update(press('right'))
  t.is(model.selected, 1, 'right moves along')
  model.update(press('left'))
  model.update(press('left'))
  t.is(model.selected, 2, 'left wraps to the end')
})

test('an illegal canto is refused with a message, not applied', (t) => {
  const model = app()
  model.startGame()
  model.game.envidoDone = true // envido is spent

  model.update(press('e'))

  t.is(model.game.envidoChain.length, 0, 'no envido was recorded')
  t.ok(model.message, 'the player is told why')
})

test('the hint bar only offers cantos the rules actually allow', (t) => {
  const game = new Game({ rng: seeded(5) })
  game.envidoDone = true
  game.trucoLevel = 3
  game.trucoAccepted = true
  game.trucoTeam = 0

  const frame = renderGame(game, { width: 80, height: 24, selected: 0, says: {}, version: '1.0.0' })
  const text = stripAnsi(frame)

  t.absent(/\[E\] envido/.test(text), 'no envido once it is spent')
  t.absent(/\[T\] truco/.test(text), 'no truco once it is topped out')
  t.ok(/\[ENTER\] jugar/.test(text), 'playing a card is still offered')
})

test('menu: settings cycle and Jugar deals a hand', (t) => {
  const model = app()

  t.is(model.screen, 'menu', 'starts at the menu')
  model.update(press('down')) // Modo
  model.update(press('right'))
  t.ok(model.settings.duelo, 'modo toggles to a duel')

  model.update(press('down')) // Rivales
  model.update(press('right'))
  t.is(model.settings.nivel, 'duro', 'rivals cycle up a level')

  model.update(press('down')) // Con flor
  model.update(press('right'))
  t.absent(model.settings.conFlor, 'flor can be switched off')

  model.menuIndex = 0
  model.update(press('enter'))

  t.is(model.screen, 'game', 'Jugar deals')
  t.is(model.game.playerCount, 2, 'and honours the duel setting')
  t.absent(model.game.conFlor, 'and the flor setting')
})

test('menu: the headline is always drawn at full size', (t) => {
  const rows = titleBlock().split('\n')

  t.is(rows.length, 6, 'six rows of block art')
  t.is(widest(rows.join('\n')), 96, 'at its natural 96 columns')
  t.ok(96 <= CANVAS.width, 'which is what the canvas width is sized for')
})

test('menu: rules screen opens and closes', (t) => {
  const model = app()
  model.menuIndex = 4 // Reglas
  model.update(press('enter'))
  t.is(model.screen, 'rules', 'rules opened')

  const frame = model.view()
  t.ok(frame.includes('REGLAS'), 'and it renders')

  model.update(press('escape'))
  t.is(model.screen, 'menu', 'escape goes back')
})

test('updater progress reaches the screen instead of stdout', (t) => {
  const model = app()
  model.update({ type: 'log', level: 'info', line: '[updater] getting new update' })

  t.ok(model.updateStatus, 'the status was captured')
  t.ok(model.view().includes('actualiz') || model.view().includes('getting'), 'and is shown')

  model.update({ type: 'update-status', text: '✓ v1.0.1 lista', color: 'brightgreen' })
  t.ok(model.view().includes('v1.0.1'), 'the applied-update banner shows')
})

test('mesa: never grows wider than its column, whatever is said', (t) => {
  const game = new Game({ rng: seeded(4) })
  const view = { selected: 0, says: {}, version: '1.0.0' }

  const quiet = renderMesa(game, view)
  t.ok(widest(quiet) <= COLUMNS.centre, `the quiet table fits (${widest(quiet)})`)

  // A long canto used to widen the flank and shove the right-hand panels off
  // the canvas, so the bubble is truncated to the flank width.
  const loud = renderMesa(game, { ...view, says: { 1: '¡Quiero vale cuatro y se acabó!' } })
  t.ok(widest(loud) <= COLUMNS.centre, `the loud table fits too (${widest(loud)})`)

  const duel = new Game({
    players: [
      { name: 'Vos', isAI: false },
      { name: 'Rita', isAI: true }
    ],
    rng: seeded(4)
  })
  t.ok(widest(renderMesa(duel, view)) <= COLUMNS.centre, 'and so does a duel')
})

test('panel: draws an exact rectangle whatever is inside it', (t) => {
  for (const body of ['', 'una linea', 'a\nb\nc', Array(40).fill('desborde').join('\n')]) {
    const drawn = panel('TITULO', body, 24, 9).split('\n')
    t.is(drawn.length, 9, 'exactly the requested height')
    t.ok(
      drawn.every((line) => style.width(line) === 24),
      'and exactly the requested width'
    )
  }

  t.ok(stripAnsi(panel('MAZO', '', 20, 5)).includes('MAZO'), 'the title is drawn')
})

test('comandos: lists only what the rules allow, and follows the phase', (t) => {
  const game = new Game({ rng: seeded(5) })
  const opening = stripAnsi(commandLines(game))

  t.ok(opening.includes('jugar carta'), 'you can play a card')
  t.ok(opening.includes('envido'), 'and call envido on the first trick')
  t.ok(opening.includes('truco'), 'and truco')

  game.envidoDone = true
  game.trucoLevel = 3
  game.trucoAccepted = true
  game.trucoTeam = 0
  const later = stripAnsi(commandLines(game))
  t.absent(later.includes('envido'), 'no envido once it is spent')
  t.absent(later.includes('truco'), 'no truco once it is topped out')

  game.phase = 'hand-over'
  t.ok(stripAnsi(commandLines(game)).includes('seguir'), 'the phase changes the commands')

  // Every row has to fit the panel it is drawn into, key column included. The
  // states are built for real rather than by forcing `phase`, since a response
  // with no pending canto is not a state the engine can actually be in.
  const inner = COLUMNS.left - 2
  const responding = new Game({ rng: seeded(5) })
  responding.apply({ type: 'canto', seat: 0, canto: 'truco' })

  const over = new Game({ rng: seeded(5) })
  over.phase = 'game-over'

  const ended = new Game({ rng: seeded(5) })
  ended.phase = 'hand-over'

  for (const [name, state] of [
    ['play', new Game({ rng: seeded(5) })],
    ['response', responding],
    ['hand-over', ended],
    ['game-over', over]
  ]) {
    const rows = stripAnsi(commandLines(state)).split('\n')
    t.ok(
      rows.every((row) => style.width(row) <= inner),
      `${name} rows fit the ${inner}-column panel`
    )
  }
})

test('partida: reports the state of the match', (t) => {
  const game = new Game({ rng: seeded(11) })
  game.scores = [12, 7]
  const drawn = stripAnsi(partidaLines(game))

  t.ok(/Mano\s+1/.test(drawn), 'the hand number')
  t.ok(/Nosotros\s+12/.test(drawn), 'our score')
  t.ok(/Ellos\s+7/.test(drawn), 'theirs')
  t.ok(/Turno\s+Vos/.test(drawn), 'whose turn it is')
  t.ok(/tu envido\s+\d+/.test(drawn), 'and your envido')
})

test('mazo: counts what is left after the deal', (t) => {
  const four = new Game({ rng: seeded(3) })
  t.ok(stripAnsi(mazoLines(four)).includes('28'), 'four hands of three leaves 28')

  const duel = new Game({
    players: [
      { name: 'Vos', isAI: false },
      { name: 'Rita', isAI: true }
    ],
    rng: seeded(3)
  })
  t.ok(stripAnsi(mazoLines(duel)).includes('34'), 'two hands of three leaves 34')
})

test('chat: tags the speaker without repeating their name', (t) => {
  const game = new Game({ rng: seeded(9) })
  game.apply({ type: 'canto', seat: 0, canto: 'truco' })

  const drawn = stripAnsi(chatLines(game, 30, 6)).split('\n')
  t.is(drawn.length, 6, 'padded to the panel height')

  const canto = drawn.find((line) => line.includes('Truco'))
  t.ok(canto.startsWith('[VOS]'), 'tagged with the speaker')
  t.absent(/\[VOS\]\s+Vos/.test(canto), 'and the name is not repeated in the text')
})

test('palette: every colour is a 256-colour index, and reaches the cards', (t) => {
  // Truecolor is not universal: a terminal that cannot parse 38;2;r;g;b drops
  // it and falls back to the profile's default foreground, which is how the
  // whole UI can come out green. Indices keep it correct everywhere.
  for (const [name, value] of Object.entries(palette)) {
    if (name === 'RAMP') continue
    t.is(typeof value, 'number', `${name} is an ANSI-256 index`)
    t.ok(value >= 16 && value <= 255, `${name} avoids the theme-dependent 0-15`)
  }

  // cards.js and screen.js used to import the palette from each other, which
  // made a require cycle that silently left every suit undefined — and an
  // uncoloured card still renders, so nothing failed. Pin the actual output.
  for (const suit of ['espada', 'basto', 'oro', 'copa']) {
    const drawn = cardsUi.small({ rank: 1, suit })
    t.ok(/\x1b\[38;5;\d+m/.test(drawn), `${suit} is drawn with a 256-colour code`)
    t.absent(/38;5;undefined/.test(drawn), `${suit} resolved to a real colour`)
  }
})

test('bars: renders an exact rectangle from the glitch alphabet', (t) => {
  const rows = bars(60, 5, 0)

  t.is(rows.length, 5, 'one line per row')
  t.ok(
    rows.every((line) => style.width(line) === 60),
    'every line is exactly the requested width'
  )

  const glyphs = new Set(stripAnsi(rows.join('')).split(''))
  t.ok(
    [...glyphs].every((ch) => GLYPHS.includes(ch)),
    'drawn only from the glitch alphabet'
  )
})

test('bars: deterministic, and the rows shear past each other', (t) => {
  t.alike(bars(40, 3, 2.5), bars(40, 3, 2.5), 'the same t gives the same frame')
  t.unlike(
    stripAnsi(bars(60, 4, 0).join('\n')),
    stripAnsi(bars(60, 4, 3.2).join('\n')),
    'the pattern moves with t'
  )

  // Rows drift at their own speeds, so a frame is not one row repeated — that
  // is what makes the bands shear rather than scroll.
  const frame = stripAnsi(bars(60, 5, 1.1).join('\n')).split('\n')
  t.ok(new Set(frame).size > 1, 'rows differ from one another')
})

test('bars: leaves gaps, so the bars read as bars', (t) => {
  const drawn = stripAnsi(bars(200, 6, 0.7).join(''))
  const gaps = [...drawn].filter((ch) => ch === ' ').length
  const share = gaps / drawn.length

  t.ok(share > 0.15, `a good share of the band is empty (${(share * 100).toFixed(0)}%)`)
  t.ok(share < 0.6, 'but it is not mostly empty')
  t.is(block(0, 0).ch, block(0, 0).ch, 'a block is stable for a given row and index')
})

test('the canvas never reflows, whatever the terminal', (t) => {
  // The point of a fixed canvas: the drawn content is identical at any terminal
  // size that can hold it, and only the centring padding differs.
  const small = app({ width: CANVAS.width, height: CANVAS.height })
  const large = app({ width: CANVAS.width + 40, height: CANVAS.height + 12 })

  const trim = (frame) =>
    stripAnsi(frame)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n')

  t.alike(trim(small.view()), trim(large.view()), 'same layout, only the padding changes')
})

test('animation: runs on the menu and while rivals think, not on your turn', (t) => {
  const model = app()
  t.ok(model._animating(), 'the menu bars animate')

  model.startGame()
  model.game.turn = 0
  t.absent(model._animating(), 'nothing animates while it is your move')

  model.game.turn = 1
  t.ok(model._animating(), 'the spinner animates while a rival thinks')

  model.screen = 'rules'
  t.absent(model._animating(), 'the rules card is still')
})

test('animation: the frame counter changes what is drawn', (t) => {
  const model = app()
  const first = stripAnsi(model.view())
  model.frame = 7
  const later = stripAnsi(model.view())

  t.unlike(first, later, 'the menu redraws as the frame advances')
  t.is(lines(later).length, CANVAS.height, 'and stays exactly the canvas height')
})

test('program: draws the menu and quits cleanly on ctrl+c', async (t) => {
  const chunks = []
  const output = new Writable({
    write(data, enc, cb) {
      chunks.push(Buffer.from(data))
      cb()
    }
  })
  const input = new PassThrough()

  const model = new App({
    version: '1.0.0',
    flags: {},
    rng: seeded(9),
    think: { canto: 0, play: 0, say: 0 }
  })
  const program = new Program(model, {
    input,
    output,
    isTTY: true,
    width: CANVAS.width,
    height: CANVAS.height,
    fps: 0
  })

  const done = program.run()
  await new Promise((resolve) => setTimeout(resolve, 15))

  input.write('\x03') // ctrl+c
  await done

  const drawn = Buffer.concat(chunks).toString('utf8')
  t.ok(drawn.length > 0, 'the program drew something')
  t.ok(drawn.includes('Jugar'), 'it drew the menu')
  t.ok(drawn.includes('A R G E N T I N O'), 'title and all')
})

test('program: plays a card through the real key decoder', async (t) => {
  const chunks = []
  const output = new Writable({
    write(data, enc, cb) {
      chunks.push(Buffer.from(data))
      cb()
    }
  })
  const input = new PassThrough()

  const model = new App({
    version: '1.0.0',
    flags: { jugar: true },
    rng: seeded(3),
    think: { canto: 0, play: 0, say: 0 }
  })
  const program = new Program(model, {
    input,
    output,
    isTTY: true,
    width: CANVAS.width,
    height: CANVAS.height,
    fps: 0
  })

  const done = program.run()
  await new Promise((resolve) => setTimeout(resolve, 15))

  t.is(model.screen, 'game', '--jugar dealt straight away')
  const before = model.game.hands[0].length

  input.write('1') // play the first card
  await new Promise((resolve) => setTimeout(resolve, 30))
  t.is(model.game.hands[0].length, before - 1, 'the keystroke played a card')

  input.write('\x03')
  await done
  t.pass('and the program shut down')
})

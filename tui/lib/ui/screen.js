// The table screen: a three-column dashboard built around the mesa.
//
//   COMANDOS │     Coco      │  MAZO
//   Nacho    │  ╭─────────╮  │  Rita
//   PARTIDA  │  │  MESA   │  │  CHAT / LOG
//            │  ╰─────────╯  │
//            │     Vos       │
//            │  TUS CARTAS   │
//
// The centre column is the widest and everything in it — the seats above and
// below, the felt, and your hand — is drawn to the same width, so the column
// reads as one piece. The seats to your left and right are panels in the side
// columns, the way the reference frames them.
//
// Pure: every function takes the game plus a view-state bag and returns a
// string, and the whole thing is drawn at the fixed canvas size. Nothing here
// reads the terminal or reflows, which is what lets the tests assert on exact
// frames.
const { style } = require('../tea')
const cards = require('./cards')
const { SKY, LIGHT, BLUE, MID, STRONG, WHITE } = require('./palette')
const { CANVAS, COLUMNS, pad, fit } = require('./canvas')
const { envidoPoints, hasFlor, florPoints } = require('../truco/envido')

// Frames of the spinner shown while the rivals are thinking.
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// A full Spanish deck, for the "cards left in the mazo" readout.
const DECK_SIZE = 40

const MESA_WIDTH = COLUMNS.centre

function stack(...blocks) {
  return blocks.filter((b) => b !== null && b !== undefined).join('\n')
}

// A titled box of an exact size. The content is padded out so every panel is a
// clean rectangle and the columns line up whatever is inside them.
function panel(title, body, width, height, opts = {}) {
  const inner = width - 2
  const tone = opts.tone || SKY
  const heading = style().bold(true).foreground(tone).render(title)

  const lines = [pad(heading, inner), ...String(body).split('\n')]
    .slice(0, height - 2)
    .map((line) => pad(line, inner, 'left'))

  while (lines.length < height - 2) lines.push(' '.repeat(inner))

  return style()
    .border(style.borders.rounded)
    .borderForeground(opts.tone || MID)
    .render(lines.join('\n'))
}

// --- seats --------------------------------------------------------------

function playedBy(game, seat) {
  const play = game.tricks[game.trickIndex].find((p) => p.seat === seat)
  return play ? play.card : null
}

function cardOrSlot(game, seat) {
  const card = playedBy(game, seat)
  return card ? cards.small(card) : cards.smallEmpty()
}

// --- the mesa -----------------------------------------------------------

// The centre of the table: the three tricks, marked off as they are decided.
function felt(game) {
  const marks = [0, 1, 2].map((i) => {
    const result = game.trickResults[i]
    if (result === undefined) return i === game.trickIndex ? '◆' : '·'
    if (result === null) return '='
    return result === 0 ? '▲' : '▼'
  })

  const dots = marks
    .map((mark, i) => {
      const live = i === game.trickIndex && game.trickResults[i] === undefined
      return style()
        .foreground(live ? SKY : mark === '·' ? STRONG : LIGHT)
        .render(mark)
    })
    .join(' ')

  return style().faint(true).render('bazas ') + dots
}

// Each player gets a panel of their own, the way the reference frames them:
// the seat's name as the title, the cards still in their hand below it, and
// anything they just said. The cards they have *played* are on the table.
function playerPanel(game, seat, view, width, height) {
  const player = game.players[seat]
  const onTurn = game.currentActor() === seat
  const inner = width - 2

  const title = onTurn ? `▶ ${player.name}` : player.name
  const backs = pad(cards.backsInline(game.hands[seat].length), inner)

  const said = view.says && view.says[seat]
  const bubble = said
    ? pad(style.truncate(style().italic(true).foreground(SKY).render(`«${said}»`), inner), inner)
    : ''

  return panel(title, stack('', backs, bubble), width, height, {
    tone: onTurn ? SKY : player.team === 0 ? LIGHT : MID
  })
}

// The felt: the played cards laid out at the four seats, the trick markers in
// the middle, and a suit watermark under them. This is the centre of the
// screen and it gets the whole middle column.
function feltBlock(game, seats) {
  const inner = COLUMNS.centre - 2
  const rows = []

  const laid = (seat) => (seat === null ? cards.smallEmpty() : cardOrSlot(game, seat)).split('\n')

  for (const line of laid(seats.north)) rows.push(pad(line, inner))
  rows.push(pad('', inner))

  const west = seats.west === null ? ['', '', ''] : laid(seats.west)
  const east = seats.east === null ? ['', '', ''] : laid(seats.east)
  const centre = ['', felt(game), style().faint(true).foreground(BLUE).render('♠')]
  const side = 5
  const middle = inner - (side + 4) * 2

  for (let i = 0; i < 3; i++) {
    rows.push(
      '    ' +
        pad(west[i] || '', side, 'left') +
        pad(centre[i], middle) +
        pad(east[i] || '', side, 'right') +
        '    '
    )
  }

  rows.push(pad('', inner))
  for (const line of laid(seats.south)) rows.push(pad(line, inner))

  return style().border(style.borders.rounded).borderForeground(BLUE).render(rows.join('\n'))
}

// Which seat sits where. A duel has nobody on the flanks.
function seatsOf(game) {
  return game.playerCount === 2
    ? { north: 1, west: null, east: null, south: 0 }
    : { north: 2, west: 3, east: 1, south: 0 }
}

// The table on its own — the seats around it are drawn as panels by renderGame.
function renderMesa(game, view) {
  return feltBlock(game, seatsOf(game))
}

// --- panels -------------------------------------------------------------

const CANTO_KEYS = {
  truco: 'T',
  retruco: 'T',
  'vale-cuatro': 'T',
  envido: 'E',
  'real-envido': 'R',
  'falta-envido': 'A',
  flor: 'F',
  contraflor: 'C',
  'contraflor-al-resto': 'V'
}

const CANTO_HINTS = {
  truco: 'truco',
  retruco: 'retruco',
  'vale-cuatro': 'vale cuatro',
  envido: 'envido',
  'real-envido': 'real envido',
  'falta-envido': 'falta',
  flor: 'flor',
  contraflor: 'contraflor',
  'contraflor-al-resto': 'contraflor'
}

// What you can do right now, taken straight from the engine's legal actions so
// the list can never drift out of step with the rules.
function commandLines(game) {
  const rows = []
  const add = (k, label) =>
    rows.push(
      style().bold(true).foreground(SKY).render(`[${k}]`.padEnd(8)) +
        style().foreground(WHITE).render(label)
    )

  if (game.phase === 'game-over') {
    add('ENTER', 'al menú')
    add('ESC', 'salir')
    return rows.join('\n')
  }

  if (game.phase === 'hand-over') {
    add('ENTER', 'seguir')
    add('ESC', 'menú')
    return rows.join('\n')
  }

  const actions = game.legalActions(0)
  if (actions.length === 0) return style().faint(true).render('esperando…')

  if (game.phase === 'response') {
    add('Q', 'quiero')
    add('N', 'no quiero')
  } else {
    add('1-3', 'jugar carta')
    add('←/→', 'elegir')
    add('ENTER', 'jugar')
  }

  for (const action of actions) {
    if (action.type === 'canto') add(CANTO_KEYS[action.canto], CANTO_HINTS[action.canto])
  }

  if (game.phase === 'play') add('M', 'al mazo')
  add('ESC', 'menú')

  return rows.join('\n')
}

// The state of the match at a glance.
function partidaLines(game) {
  const actor = game.currentActor()
  const stake = game.handValue()

  const rows = [
    ['Mano', String(game.handNumber)],
    ['Turno', actor === null ? '—' : game.players[actor].name],
    ['Jugadores', String(game.playerCount)],
    ['En juego', `${stake} ${stake === 1 ? 'punto' : 'puntos'}`],
    ['Nosotros', String(game.scores[0])],
    ['Ellos', String(game.scores[1])],
    ['Meta', String(game.target)]
  ]

  const body = rows.map(
    ([term, value]) =>
      style().foreground(WHITE).render(term.padEnd(11)) +
      style().bold(true).foreground(SKY).render(value)
  )

  const dealt = game.dealt[0]
  body.push('')
  body.push(
    style().faint(true).render('tu envido  ') +
      style()
        .foreground(LIGHT)
        .render(String(envidoPoints(dealt)))
  )
  if (hasFlor(dealt)) {
    body.push(
      style().faint(true).render('tu flor    ') +
        style()
          .foreground(SKY)
          .render(String(florPoints(dealt)))
    )
  }

  return body.join('\n')
}

// The deck: a face-down stack, and how much of it is left after the deal.
function mazoLines(game) {
  const left = DECK_SIZE - game.playerCount * 3
  const inner = COLUMNS.right - 4

  const count =
    style().foreground(WHITE).render('Quedan ') +
    style().bold(true).foreground(SKY).render(String(left)) +
    style().foreground(WHITE).render(' cartas')

  return stack(pad(cards.bigBack(), inner), '', pad(count, inner))
}

// The running feed, tagged by who said it — the chat of the table.
function chatLines(game, width, height) {
  const lines = []

  for (const event of game.events.slice(-height * 2)) {
    const who =
      event.seat === null || event.seat === undefined ? 'MESA' : game.players[event.seat].name
    const tone =
      event.kind === 'score'
        ? SKY
        : event.kind === 'canto'
          ? LIGHT
          : event.kind === 'over'
            ? SKY
            : WHITE

    // The tag already names the speaker, so drop the name the engine put at the
    // front of the line — "[RITA] Rita: ¡Truco!" reads worse than "[RITA] ¡Truco!".
    const said = event.text.replace(new RegExp(`^${who}:?\\s*`), '')

    const tag = style()
      .foreground(event.kind === 'score' ? SKY : BLUE)
      .render(`[${who.toUpperCase()}]`)
    const room = Math.max(6, width - style.width(tag) - 1)
    lines.push(`${tag} ${style().foreground(tone).render(style.truncate(said, room))}`)
  }

  const tail = lines.slice(-height)
  while (tail.length < height) tail.push('')
  return tail.join('\n')
}

// Your three cards, the selected one lifted, numbered like the keys that play
// them.
function handLines(game, view) {
  const hand = game.hands[0]
  const inner = COLUMNS.centre - 2
  const yourTurn = game.currentActor() === 0 && game.phase === 'play'

  if (hand.length === 0) return pad(style().faint(true).render('(sin cartas)'), inner)

  const blocks = hand.map((card, i) =>
    cards.big(card, { selected: yourTurn && i === view.selected, dim: !yourTurn })
  )

  const row = style.joinHorizontal(style.position.top, ...interleave(blocks, ' '))
  const numbers = hand
    .map((_, i) => {
      const tone = yourTurn && i === view.selected ? SKY : STRONG
      return style()
        .foreground(tone)
        .render(` [${i + 1}]  `)
    })
    .join(' ')

  return stack(pad(row, inner), pad(numbers, inner))
}

function interleave(blocks, sep) {
  const out = []
  blocks.forEach((b, i) => {
    if (i > 0) out.push(sep)
    out.push(b)
  })
  return out
}

// --- chrome -------------------------------------------------------------

function renderHeader(game, view, width) {
  const title =
    style().foreground(MID).render('♠ ♥ ♦ ♣  ') +
    style().bold(true).foreground(WHITE).render('EL GRAN TRUCO')

  const status = view.updateStatus
    ? style().foreground(view.updateStatus.color).render(view.updateStatus.text)
    : style().faint(true).render(`v${view.version}`)

  const room = width - style.width(title) - style.width(status)
  return title + ' '.repeat(Math.max(1, room)) + status
}

function scoreBar(points, target, color) {
  const cells = 12
  const filled = Math.round((points / target) * cells)
  return (
    style().foreground(color).render('█'.repeat(filled)) +
    style()
      .faint(true)
      .render('░'.repeat(cells - filled))
  )
}

function renderScore(game, width) {
  const [us, them] = game.scores

  // The two teams are separated by brightness inside the one palette — which
  // also reads better than green/red for anyone colourblind.
  const left =
    style()
      .bold(true)
      .foreground(SKY)
      .render(` NOSOTROS ${String(us).padStart(2)} `) + scoreBar(us, game.target, SKY)

  const right =
    scoreBar(them, game.target, MID) +
    style()
      .bold(true)
      .foreground(MID)
      .render(` ELLOS ${String(them).padStart(2)} `)

  const middle = style()
    .faint(true)
    .render(`mano ${game.handNumber} · en juego ${game.handValue()} · a ${game.target}`)

  const room = width - style.width(left) - style.width(right) - style.width(middle) - 2
  const half = Math.floor(room / 2)
  return left + ' '.repeat(half + 1) + middle + ' '.repeat(room - half + 1) + right
}

// The one line under the dashboard: what the game is waiting for.
function renderPrompt(game, view) {
  if (game.phase === 'game-over') {
    const won = game.winner() === 0
    return style()
      .bold(true)
      .foreground(won ? SKY : MID)
      .render(
        won
          ? '  ¡GANASTE LA PARTIDA!  ENTER para volver al menú'
          : '  Perdiste la partida.  ENTER para volver al menú'
      )
  }

  if (game.phase === 'hand-over') {
    const { team, points, reason } = game.lastHand || {}
    const who = team === 0 ? 'Nosotros' : 'Ellos'
    return style()
      .foreground(LIGHT)
      .render(`  ${who} +${points} (${reason}) · ENTER para la próxima mano`)
  }

  if (game.currentActor() !== 0) {
    const spin = SPINNER[Math.floor((view.frame || 0) / 2) % SPINNER.length]
    const name = game.players[game.currentActor()].name
    return (
      style().foreground(SKY).render(`  ${spin} `) +
      style().foreground(WHITE).render(`${name} está pensando…`)
    )
  }

  if (view.message) {
    return style()
      .bold(true)
      .foreground(SKY)
      .render('  ' + view.message)
  }

  return style()
    .foreground(WHITE)
    .render(`  ${game.phase === 'response' ? '¿Querés?' : 'Tu turno.'}`)
}

// --- the whole frame ----------------------------------------------------

// Row budgets per panel. The three columns come to the same height, which is
// what makes the dashboard read as one grid.
const PANEL_ROWS = {
  comandos: 14,
  oeste: 6,
  partida: 13,
  norte: 5,
  mesa: 13,
  vos: 5,
  cartas: 10,
  mazo: 10,
  este: 6,
  chat: 17
}

function renderGame(game, view) {
  const width = CANVAS.width
  const seats = seatsOf(game)
  const duel = game.playerCount === 2

  // Left: what you can do, the rival on your left, the state of the match.
  const left = stack(
    panel('COMANDOS', commandLines(game), COLUMNS.left, PANEL_ROWS.comandos),
    duel ? null : playerPanel(game, seats.west, view, COLUMNS.left, PANEL_ROWS.oeste),
    panel('PARTIDA', partidaLines(game), COLUMNS.left, PANEL_ROWS.partida)
  )

  // Centre: the partner, the table, you, your hand — all the same width, so the
  // column reads as one piece from top to bottom.
  const centre = stack(
    playerPanel(game, seats.north, view, COLUMNS.centre, PANEL_ROWS.norte),
    renderMesa(game, view),
    playerPanel(game, seats.south, view, COLUMNS.centre, PANEL_ROWS.vos),
    panel('TUS CARTAS', handLines(game, view), COLUMNS.centre, PANEL_ROWS.cartas)
  )

  // Right: the deck, the rival on your right, the table talk.
  const right = stack(
    panel('MAZO', mazoLines(game), COLUMNS.right, PANEL_ROWS.mazo),
    duel ? null : playerPanel(game, seats.east, view, COLUMNS.right, PANEL_ROWS.este),
    panel(
      'CHAT / LOG',
      chatLines(game, COLUMNS.right - 2, PANEL_ROWS.chat - 3),
      COLUMNS.right,
      PANEL_ROWS.chat
    )
  )

  const gutter = ' '.repeat(COLUMNS.gutter)
  const body = style.joinHorizontal(
    style.position.top,
    pad(left, COLUMNS.left, 'left'),
    gutter,
    pad(centre, COLUMNS.centre, 'left'),
    gutter,
    pad(right, COLUMNS.right, 'left')
  )

  const top = stack(renderHeader(game, view, width), renderScore(game, width), '', body).split('\n')
  const foot = [renderPrompt(game, view)]
  const gap = Math.max(0, CANVAS.height - top.length - foot.length)

  return fit([...top, ...Array(gap).fill(''), ...foot].join('\n'))
}

module.exports = {
  renderGame,
  renderMesa,
  renderPrompt,
  commandLines,
  partidaLines,
  mazoLines,
  chatLines,
  handLines,
  panel,
  MESA_WIDTH
}

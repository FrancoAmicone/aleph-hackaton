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
// A seat as a single line: who they are, what they still hold, what they just
// said. The panels these replaced spent eleven rows saying the same thing.
function seatLine(game, seat, view) {
  const player = game.players[seat]
  const onTurn = game.currentActor() === seat

  const name = onTurn
    ? style().bold(true).foreground(SKY).render(`▶ ${player.name}`)
    : style()
        .foreground(player.team === 0 ? LIGHT : MID)
        .render(player.name)

  const backs = cards.backsInline(game.hands[seat].length)
  const said = view.says && view.says[seat]
  const bubble = said ? '  ' + style().italic(true).foreground(SKY).render(`«${said}»`) : ''

  return `${name} ${backs}${bubble}`
}

// The flanking seats stack their name over their cards, so the felt keeps its
// full width. Truncated to the flank so a long canto cannot widen the row.
function flankLine(game, seat, view, align) {
  const player = game.players[seat]
  const onTurn = game.currentActor() === seat

  const name = onTurn
    ? style().bold(true).foreground(SKY).render(player.name)
    : style()
        .foreground(player.team === 0 ? LIGHT : MID)
        .render(player.name)

  const said = view.says && view.says[seat]
  const rows = [name, cards.backsInline(game.hands[seat].length)]
  if (said) rows.push(style().italic(true).foreground(SKY).render(`«${said}»`))

  return rows.map((r) => pad(style.truncate(r, FLANK), FLANK, align)).join('\n')
}

const FLANK = 10

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
  const seats = seatsOf(game)
  const duel = game.playerCount === 2

  const table = duel
    ? feltBlock(game, seats)
    : style.joinHorizontal(
        style.position.center,
        flankLine(game, seats.west, view, 'right'),
        ' ',
        feltBlock(game, seats),
        ' ',
        flankLine(game, seats.east, view, 'left')
      )

  const w = CANVAS.width
  return stack(
    pad(seatLine(game, seats.north, view), w),
    pad(table, w),
    pad(seatLine(game, seats.south, view), w)
  )
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
  'real-envido': 'real',
  'falta-envido': 'falta',
  flor: 'flor',
  contraflor: 'contraflor',
  'contraflor-al-resto': 'contraflor'
}

// What you can do right now, taken straight from the engine's legal actions so
// the list can never drift out of step with the rules.
// Everything you can do right now, as [key, label] pairs, taken straight from
// the engine's legal actions so the list can never drift from the rules.
function commands(game) {
  if (game.phase === 'game-over') {
    return [
      ['ENTER', 'menú'],
      ['ESC', 'salir']
    ]
  }
  if (game.phase === 'hand-over') {
    return [
      ['ENTER', 'seguir'],
      ['ESC', 'menú']
    ]
  }

  const actions = game.legalActions(0)
  if (actions.length === 0) return []

  const rows =
    game.phase === 'response'
      ? [
          ['Q', 'quiero'],
          ['N', 'no quiero']
        ]
      : [
          ['1-3', 'carta'],
          ['←/→', 'elegir'],
          ['ENTER', 'jugar']
        ]

  for (const action of actions) {
    if (action.type === 'canto') rows.push([CANTO_KEYS[action.canto], CANTO_HINTS[action.canto]])
  }

  if (game.phase === 'play') rows.push(['M', 'mazo'])
  rows.push(['ESC', 'menú'])
  return rows
}

// One line under the table. If the full set does not fit, the least useful
// hints drop out rather than the line wrapping or being cut mid-word.
const OPTIONAL = ['elegir', 'carta']

function commandLine(game, width) {
  let rows = commands(game)
  if (rows.length === 0) return ''

  const render = (list) =>
    list
      .map(
        ([k, label]) =>
          style().bold(true).foreground(SKY).render(`[${k}]`) +
          style()
            .foreground(WHITE)
            .render(' ' + label)
      )
      .join(style().faint(true).render(' · '))

  let line = render(rows)
  for (const drop of OPTIONAL) {
    if (style.width(line) + 2 <= width) break
    rows = rows.filter(([, label]) => label !== drop)
    line = render(rows)
  }

  return '  ' + style.truncate(line, width - 2)
}

// Only what the header and the felt do not already say. Scores, the stake and
// the hand number live in the score bar; repeating them here was noise.
function partidaLines(game) {
  const actor = game.currentActor()
  const dealt = game.dealt[0]

  const rows = [
    ['Turno', actor === null ? '—' : game.players[actor].name],
    ['Tu envido', String(envidoPoints(dealt))]
  ]
  if (hasFlor(dealt)) rows.push(['Tu flor', String(florPoints(dealt))])
  rows.push(['Mano', `${game.handNumber} · a ${game.target}`])

  return rows
    .map(
      ([term, value]) =>
        style().foreground(WHITE).render(term.padEnd(11)) +
        style().bold(true).foreground(SKY).render(value)
    )
    .join('\n')
}

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
// The two panels that survive, side by side across the top.
const TOP = { partida: 34, chat: 84, rows: 8 }

function renderGame(game, view) {
  const width = CANVAS.width

  // Top: the little that is not already on the felt or in the score bar.
  const top = style.joinHorizontal(
    style.position.top,
    panel('PARTIDA', partidaLines(game), TOP.partida, TOP.rows),
    ' '.repeat(COLUMNS.gutter),
    panel('CHAT / LOG', chatLines(game, TOP.chat - 2, TOP.rows - 3), TOP.chat, TOP.rows)
  )

  // Middle: the table, with its four seats around it.
  const mesa = renderMesa(game, view)

  // Bottom: your hand, then every command on one line.
  const cartas = pad(handLines(game, view), width)
  const comandos = commandLine(game, width)
  const aviso = view.message
    ? style()
        .bold(true)
        .foreground(SKY)
        .render('  ' + view.message)
    : renderPrompt(game, view)

  const body = stack(
    renderHeader(game, view, width),
    renderScore(game, width),
    '',
    pad(top, width),
    '',
    mesa,
    '',
    cartas
  ).split('\n')

  const foot = [aviso, comandos]
  const gap = Math.max(0, CANVAS.height - body.length - foot.length)

  return fit([...body, ...Array(gap).fill(''), ...foot].join('\n'))
}

module.exports = {
  renderGame,
  renderMesa,
  renderPrompt,
  commands,
  commandLine,
  partidaLines,
  chatLines,
  handLines,
  panel,
  MESA_WIDTH
}

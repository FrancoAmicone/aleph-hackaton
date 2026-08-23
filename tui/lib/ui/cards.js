// Drawing the cards.
//
// A number card shows its value as pears, laid out like the pips on a playing
// card — you read the card by counting, not by reading a digit. Action cards
// keep their +2 / +4 label, because two pears on a "+2" would be
// indistinguishable from the number 2.
//
// The pear is 🍐 (U+1F350), which measures two columns both here and in a
// terminal, so the grid holds. Being a colour emoji it ignores SGR colour, so
// the card's own colour is carried by its border and label instead — which is
// what you actually match on.
const { style } = require('../tea')
const { CARD_COLORS, COMODIN, MID, STRONG } = require('./palette')

const PEAR = '🍐'
const PEAR_W = 2

// 12 x 7 including the border: a 3x3 pip grid needs three pears across.
const BIG = { width: 12, height: 7 }
const SMALL = { width: 8, height: 3 }

// Which of the nine pip positions each value fills, in the arrangement a real
// deck uses: columns first for the even ranks, centre for the odd ones.
const PIPS = {
  0: [],
  1: [4],
  2: [1, 7],
  3: [1, 4, 7],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
  7: [0, 2, 3, 4, 5, 6, 8],
  8: [0, 1, 2, 3, 5, 6, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8]
}

function toneOf(card) {
  return card.color ? CARD_COLORS[card.color] : COMODIN
}

const isAction = (card) => typeof card.rank === 'string'

// The three rows of the pip grid, each 8 columns wide.
function pipRows(rank) {
  const filled = new Set(PIPS[rank] || [])
  const rows = []
  for (let r = 0; r < 3; r++) {
    let line = ''
    for (let c = 0; c < 3; c++) {
      if (c > 0) line += ' '
      line += filled.has(r * 3 + c) ? PEAR : ' '.repeat(PEAR_W)
    }
    rows.push(line)
  }
  return rows
}

function centre(text, width) {
  const room = Math.max(0, width - visible(text))
  const left = Math.floor(room / 2)
  return ' '.repeat(left) + text + ' '.repeat(room - left)
}

// Pears are two columns wide, so a plain length count would be wrong.
function visible(text) {
  let n = 0
  for (const ch of text) n += ch === PEAR ? PEAR_W : 1
  return n
}

// The five interior rows of a full-size card.
function face(card) {
  const inner = BIG.width - 2

  if (isAction(card)) {
    // The label says what it does; the pears say how many it costs. Four in a
    // row would be eleven columns against an interior of ten, so they stack
    // two by two.
    const pair = `${PEAR} ${PEAR}`
    const rows = card.rank === '+4' ? [pair, pair] : ['', pair]
    return ['', centre(card.rank, inner), ...rows.map((r) => centre(r, inner)), '']
  }

  return ['', ...pipRows(card.rank).map((row) => centre(row, inner)), '']
}

function frame(card, opts = {}) {
  const inner = BIG.width - 2
  const heavy = opts.selected
  const [tl, tr, bl, br, h, v] = heavy
    ? ['┏', '┓', '┗', '┛', '━', '┃']
    : ['┌', '┐', '└', '┘', '─', '│']

  const rows = [tl + h.repeat(inner) + tr]
  for (const line of face(card)) rows.push(v + centre(line, inner) + v)
  rows.push(bl + h.repeat(inner) + br)
  return rows
}

function tint(lines, color, bold) {
  const s = style().foreground(color)
  if (bold) s.bold(true)
  return lines.map((line) => s.render(line))
}

function big(card, opts = {}) {
  const tone = opts.dim ? STRONG : toneOf(card)
  return tint(frame(card, opts), tone, !!opts.selected).join('\n')
}

// A compact card for the discard pile: the count stays readable without
// needing the whole pip grid.
function small(card) {
  const inner = SMALL.width - 2
  const label = isAction(card) ? card.rank : `${PEAR}×${card.rank}`
  return tint(
    [
      '┌' + '─'.repeat(inner) + '┐',
      '│' + centre(label, inner) + '│',
      '└' + '─'.repeat(inner) + '┘'
    ],
    toneOf(card),
    true
  ).join('\n')
}

function smallBack() {
  const inner = SMALL.width - 2
  return tint(
    ['┌' + '─'.repeat(inner) + '┐', '│' + '▚'.repeat(inner) + '│', '└' + '─'.repeat(inner) + '┘'],
    MID,
    false
  ).join('\n')
}

function bigBack() {
  const inner = BIG.width - 2
  const rows = ['┌' + '─'.repeat(inner) + '┐']
  for (let i = 0; i < BIG.height - 2; i++) rows.push('│' + '▚'.repeat(inner) + '│')
  rows.push('└' + '─'.repeat(inner) + '┘')
  return tint(rows, MID, false).join('\n')
}

function smallEmpty() {
  const faint = style().faint(true)
  const inner = SMALL.width - 2
  return ['╌'.repeat(inner + 2), ' ' + centre('·', inner) + ' ', '╌'.repeat(inner + 2)]
    .map((l) => faint.render(l))
    .join('\n')
}

function blank(width, height) {
  return Array.from({ length: height }, () => ' '.repeat(width)).join('\n')
}

// The face-down fan a rival still holds. A long hand is summarised rather than
// drawn out, so somebody who ate a big stack cannot widen the row.
function backsInline(count) {
  if (count <= 0) return style().faint(true).render('—')
  const ink = style().foreground(MID)
  if (count <= 6) return ink.render(Array.from({ length: count }, () => '▚').join(' '))
  return ink.render(`▚▚▚ ×${count}`)
}

// A swatch of the colour in play, which after a +4 is not the colour of the
// card showing.
function colorChip(color) {
  if (!color) return style().faint(true).render('  ·  ')
  return style().bold(true).foreground(CARD_COLORS[color]).render('███')
}

module.exports = {
  big,
  small,
  smallBack,
  bigBack,
  smallEmpty,
  blank,
  backsInline,
  colorChip,
  toneOf,
  pipRows,
  PEAR,
  BIG,
  SMALL
}

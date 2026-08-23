// Drawing the cards.
//
// The rank is what identifies a card and it is printed as a number, in the
// corners and again in the middle, the way a real deck does it. The colour is
// the ink it is drawn in. A +4 belongs to no colour and is drawn white.
//
// Every helper returns a rectangular block of the advertised size so the blocks
// drop straight into style.joinHorizontal/joinVertical without ragging. Only
// width-1 glyphs are used on a card — a two-column glyph that the terminal and
// the layout engine disagree about would shear the whole hand.
const { style } = require('../tea')
const { CARD_COLORS, COMODIN, MID, STRONG } = require('./palette')

// The game's mark. Used in the wordmark and the header, never on a card.
const PEAR = '🍐'

const BIG = { width: 7, height: 5 }
const SMALL = { width: 5, height: 3 }

function toneOf(card) {
  return card.color ? CARD_COLORS[card.color] : COMODIN
}

function tint(lines, color, bold) {
  const s = style().foreground(color)
  if (bold) s.bold(true)
  return lines.map((line) => s.render(line))
}

const label = (card) => String(card.rank)

function centre(text, width) {
  const room = Math.max(0, width - text.length)
  const left = Math.floor(room / 2)
  return ' '.repeat(left) + text + ' '.repeat(room - left)
}

// A full-size card for the player's own hand.
//
//   ┌─────┐
//   │7    │
//   │  7  │
//   │    7│
//   └─────┘
function big(card, opts = {}) {
  const rank = label(card)
  const inner = BIG.width - 2
  const [tl, tr, bl, br, h, v] = opts.selected
    ? ['┏', '┓', '┗', '┛', '━', '┃']
    : ['┌', '┐', '└', '┘', '─', '│']

  const rows = [
    tl + h.repeat(inner) + tr,
    v + rank.padEnd(inner) + v,
    v + centre(rank, inner) + v,
    v + rank.padStart(inner) + v,
    bl + h.repeat(inner) + br
  ]

  return tint(rows, opts.dim ? STRONG : toneOf(card), !!opts.selected).join('\n')
}

// A compact card, for the discard pile.
function small(card) {
  const inner = SMALL.width - 2
  return tint(
    [
      '┌' + '─'.repeat(inner) + '┐',
      '│' + centre(label(card), inner) + '│',
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

// An empty slot: nothing there yet.
function smallEmpty() {
  const faint = style().faint(true)
  return ['╌╌╌╌╌', '  ·  ', '╌╌╌╌╌'].map((l) => faint.render(l)).join('\n')
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
  PEAR,
  BIG,
  SMALL
}

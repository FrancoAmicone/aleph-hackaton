// The end-of-game screen: victory or defeat, and two buttons — back to the
// menu, or a rematch. One screen for both outcomes; only the headline, its
// colour and the one-line verdict change.
//
// Pure: takes the finished game and the focused button, returns a frame at
// the canvas size.
const { style } = require('../tea')
const { CANVAS, pad, fit } = require('./canvas')
const { MID, WHITE } = require('./palette')
const { bars, SPEED } = require('./bars')

const BUTTONS = [
  { id: 'menu', label: 'VOLVER AL MENÚ' },
  { id: 'rematch', label: 'REVANCHA' }
]

// A 5-row block font for the two headlines.
const FONT = {
  V: ['█   █', '█   █', '█   █', ' █ █ ', '  █  '],
  I: ['█████', '  █  ', '  █  ', '  █  ', '█████'],
  C: [' ████', '█    ', '█    ', '█    ', ' ████'],
  T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
  O: [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
  R: ['████ ', '█   █', '████ ', '█  █ ', '█   █'],
  A: [' ███ ', '█   █', '█████', '█   █', '█   █'],
  D: ['████ ', '█   █', '█   █', '█   █', '████ '],
  E: ['█████', '█    ', '███  ', '█    ', '█████'],
  ' ': ['   ', '   ', '   ', '   ', '   ']
}

function bigText(str) {
  const blocks = [...str.toUpperCase()].map((ch) => FONT[ch] || FONT[' '])
  const rows = []
  for (let r = 0; r < 5; r++) rows.push(blocks.map((b) => b[r]).join(' '))
  return rows
}

function button(label, focus, inner) {
  const spaced = label.split('').join(' ')
  const core = focus ? `▸ ${spaced} ◂` : spaced
  const left = Math.floor((inner - core.length) / 2)
  const line = ' '.repeat(left) + core + ' '.repeat(inner - core.length - left)
  const tone = focus ? 226 : 244
  return [
    '╔' + '═'.repeat(inner) + '╗',
    '║' + ' '.repeat(inner) + '║',
    '║' + line + '║',
    '║' + ' '.repeat(inner) + '║',
    '╚' + '═'.repeat(inner) + '╝'
  ].map((r, i) =>
    style()
      .foreground(tone)
      .bold(focus && i === 2)
      .render(r)
  )
}

function renderResult(game, view) {
  const width = CANVAS.width
  const won = game.winner() === 0
  const winner = game.players[game.winner()]

  // Victory glows yellow-green like the pear; defeat sits in the blue chrome.
  const tone = won ? 226 : MID
  const headline = bigText(won ? 'VICTORIA' : 'DERROTA')
    .map((r) => style().bold(true).foreground(tone).render(r))
    .join('\n')

  const verdict = won
    ? style().foreground(WHITE).render('Te quedaste sin cartas antes que nadie.')
    : style().foreground(WHITE).render(`${winner.name} se quedó sin cartas primero.`)

  // What everyone was left holding, so the result reads as earned.
  const left = game.players
    .map((p, seat) => {
      const n = game.hands[seat].length
      const t = seat === game.winner() ? tone : WHITE
      return style().foreground(t).render(`${p.name} ${n}`)
    })
    .join(style().faint(true).render('  ·  '))

  const inner = 'VOLVER AL MENÚ'.length * 2 - 1 + 4 + 6
  const row = style.joinHorizontal(
    style.position.top,
    button(BUTTONS[0].label, view.index === 0, inner).join('\n'),
    '      ',
    button(BUTTONS[1].label, view.index === 1, inner).join('\n')
  )

  const hint = style().foreground(244).render('←/→ elegir   ·   ↵ entrar')
  const t = (view.frame || 0) * SPEED

  return fit(
    [
      ...bars(width, 3, t),
      '',
      '',
      pad(headline, width),
      '',
      pad(verdict, width),
      '',
      pad(style().faint(true).render('cartas que quedaron en mano'), width),
      pad(left, width),
      '',
      '',
      '',
      pad(row, width),
      '',
      pad(hint, width),
      '',
      '',
      ...bars(width, 3, t + 41.7)
    ].join('\n')
  )
}

module.exports = { renderResult, BUTTONS, bigText }

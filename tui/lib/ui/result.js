// The end-of-game screen: victory or defeat, and two buttons — back to the
// menu, or a rematch. One screen for both outcomes; only the headline, its
// colour and the one-line verdict change.
//
// Pure: takes the finished game and the focused button, returns a frame at
// the canvas size.
const { style } = require('../tea')
const { CANVAS, pad, fit } = require('./canvas')
const { WHITE } = require('./palette')
const fireworks = require('./fireworks')
const rain = require('./rain')

// Both shows run on the same fast clock.
const SHOW_MS = fireworks.SHOW_MS

// How long the opening show is, for a win or a loss.
function showFrames(won) {
  return won ? fireworks.FRAMES : rain.FRAMES
}

// One tone per row of the 5-row headline.
const WIN_RAMP = [226, 190, 154, 118, 82]
const LOSE_RAMP = [214, 208, 202, 196, 160]

const BUTTONS = [
  { id: 'menu', label: 'BACK TO MENU' },
  { id: 'rematch', label: 'REMATCH' }
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
  F: ['█████', '█    ', '███  ', '█    ', '█    '],
  Y: ['█   █', '█   █', ' ███ ', '  █  ', '  █  '],
  U: ['█   █', '█   █', '█   █', '█   █', ' ███ '],
  W: ['█   █', '█   █', '█ █ █', '█ █ █', ' █ █ '],
  N: ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
  L: ['█    ', '█    ', '█    ', '█    ', '█████'],
  S: [' ████', '█    ', ' ███ ', '    █', '████ '],
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
  const tone = focus ? WHITE : 244
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
  // Ganar es que gane MI asiento. Online el ganador puede ser cualquiera, y con
  // `0` fijo el invitado veía DERROTA al ganar y VICTORIA al perder.
  const won = game.winner() === (view.me ?? 0)
  const winner = game.players[game.winner()]

  // The headline carries all the colour: a row-by-row ramp, yellow down to
  // green for a win, orange down to red for a loss. Everything else is white.
  const ramp = won ? WIN_RAMP : LOSE_RAMP
  const headline = bigText(won ? 'YOU WIN' : 'YOU LOSE')
    .map((r, i) => style().bold(true).foreground(ramp[i]).render(r))
    .join('\n')

  const verdict = won
    ? style().foreground(WHITE).render('You ran out of cards before anyone else.')
    : style().foreground(WHITE).render(`${winner.name} ran out of cards first.`)

  // What everyone was left holding, so the result reads as earned.
  const left = game.players
    .map((p, seat) => {
      const n = game.hands[seat].length
      return style().foreground(WHITE).render(`${p.name} ${n}`)
    })
    .join(style().faint(true).render('  ·  '))

  const inner = 'BACK TO MENU'.length * 2 - 1 + 4 + 6
  const row = style.joinHorizontal(
    style.position.top,
    button(BUTTONS[0].label, view.index === 0, inner).join('\n'),
    '      ',
    button(BUTTONS[1].label, view.index === 1, inner).join('\n')
  )

  const hint = style().foreground(244).render('←/→ select   ·   ↵ enter')

  // Centred vertically: whatever the canvas has to spare goes half above
  // and half below the content.
  // Eyebrow over the headline: the same two words whichever way it went.
  const eyebrow = style().foreground(WHITE).render('G A M E   O V E R')

  const lines = [
    pad(eyebrow, width),
    '',
    pad(headline, width),
    '',
    pad(verdict, width),
    '',
    pad(style().faint(true).render('cards left in hand'), width),
    pad(left, width),
    '',
    '',
    '',
    pad(row, width),
    '',
    pad(hint, width)
  ]
  // Count rows, not entries: the headline and the buttons are several rows each.
  const body = lines.join('\n')
  const spare = Math.max(0, CANVAS.height - body.split('\n').length)
  const final = fit('\n'.repeat(Math.floor(spare / 2)) + body)

  // A win opens with fireworks and a loss with rain, both drawn over the
  // finished result and letting it through as they go. `age` is frames since
  // the screen came up; undefined means no animation.
  if (view.age === undefined) return final
  if (won && view.age < fireworks.FRAMES) return fireworks.fireworks(view.age, final)
  if (!won && view.age < rain.FRAMES) return rain.rain(view.age, final)
  return final
}

module.exports = { renderResult, BUTTONS, bigText, showFrames, SHOW_MS }

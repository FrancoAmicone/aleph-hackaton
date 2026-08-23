// The title screen and the rules card.
const { style } = require('../tea')
const { CANVAS, pad, fit } = require('./canvas')
const { SKY, MID, WHITE, NAVY, CARD_COLORS } = require('./palette')
const { bars, SPEED } = require('./bars')
const { COLORS } = require('../uno/deck')
const { PEAR } = require('./cards')

const MENU_ITEMS = [
  { id: 'jugar', label: 'Jugar' },
  { id: 'jugadores', label: 'Jugadores' },
  { id: 'nivel', label: 'Rivales' },
  { id: 'meta', label: 'Partida' },
  { id: 'reglas', label: 'Reglas' },
  { id: 'salir', label: 'Salir' }
]

// The headline: 103 columns. Most letterforms come from the original art; the
// H and the P had to be drawn, since no earlier title used them.
const HEADLINE = [
  '████████╗██╗░░██╗███████╗  ░██████╗░██████╗░███████╗░█████╗░████████╗  ██████╗░███████╗░█████╗░██████╗░',
  '╚══██╔══╝██║░░██║██╔════╝  ██╔════╝░██╔══██╗██╔════╝██╔══██╗╚══██╔══╝  ██╔══██╗██╔════╝██╔══██╗██╔══██╗',
  '░░░██║░░░███████║█████╗░░  ██║░░██╗░██████╔╝█████╗░░███████║░░░██║░░░  ██████╔╝█████╗░░███████║██████╔╝',
  '░░░██║░░░██╔══██║██╔══╝░░  ██║░░╚██╗██╔══██╗██╔══╝░░██╔══██║░░░██║░░░  ██╔═══╝░██╔══╝░░██╔══██║██╔══██╗',
  '░░░██║░░░██║░░██║███████╗  ╚██████╔╝██║░░██║███████╗██║░░██║░░░██║░░░  ██║░░░░░███████╗██║░░██║██║░░██║',
  '░░░╚═╝░░░╚═╝░░╚═╝╚══════╝  ░╚═════╝░╚═╝░░╚═╝╚══════╝╚═╝░░╚═╝░░░╚═╝░░░  ╚═╝░░░░░╚══════╝╚═╝░░╚═╝╚═╝░░╚═╝'
]

// Rows of glitch bars above and below the title. Fixed, like everything else.
const BAND_ROWS = 4

const SHADOW = '░'

// The pulse the selected row's marker cycles through.
const MARKERS = ['▶', '▷', '▶', '▸']

// White letters with a dark shadow behind them, as in the reference. The ░
// cells in the art are the shadow, so they take the dark tone while the strokes
// stay white. Runs of one or the other are painted together, so a row costs a
// handful of escape sequences rather than one per column.
function paintRow(line) {
  const solid = style().bold(true).foreground(WHITE)
  const shade = style().foreground(NAVY)

  let out = ''
  let run = ''
  let shadow = null

  for (const ch of line) {
    const isShadow = ch === SHADOW
    if (shadow === null) shadow = isShadow
    if (isShadow !== shadow) {
      out += (shadow ? shade : solid).render(run)
      run = ''
      shadow = isShadow
    }
    run += ch
  }
  if (run) out += (shadow ? shade : solid).render(run)
  return out
}

// White letters, dark shadow, always at full size.
function titleBlock() {
  return HEADLINE.map(paintRow).join('\n')
}

const LEVEL_LABEL = { facil: 'fáciles', normal: 'normales', duro: 'duros' }

function valueFor(item, settings) {
  switch (item.id) {
    case 'jugadores':
      return `${settings.jugadores} en la mesa`
    case 'nivel':
      return LEVEL_LABEL[settings.nivel]
    case 'meta':
      return `a ${settings.meta} puntos`
    default:
      return null
  }
}

function renderMenu(view) {
  const width = CANVAS.width
  const title = titleBlock()

  // A sun between the suits, flanking the wordmark.
  // Four swatches instead of card suits — the colours are what UNO is about.
  const chips = COLORS.map((c) => style().bold(true).foreground(CARD_COLORS[c]).render('██')).join(
    ' '
  )
  const word = style().bold(true).foreground(WHITE).render(`${PEAR}  +2  ·  +4  ${PEAR}`)
  const subtitle = `${chips}    ${word}    ${chips}`

  // The marker on the selected row pulses, so the screen reads as live even
  // while nothing else is happening.
  const pulse = MARKERS[Math.floor((view.frame || 0) / 3) % MARKERS.length]

  const rows = MENU_ITEMS.map((item, i) => {
    const active = i === view.index
    const bullet = active ? style().foreground(SKY).render(`${pulse} `) : '  '
    const label = active
      ? style().bold(true).foreground(SKY).render(item.label.padEnd(10))
      : style().foreground(WHITE).render(item.label.padEnd(10))

    const value = valueFor(item, view.settings)
    const shown = value
      ? style()
          .foreground(active ? SKY : WHITE)
          .render(value)
      : ''

    const arrows = value && active ? style().foreground(SKY).render('  ←/→') : ''
    return `${bullet}${label}${shown}${arrows}`
  })

  const box = style()
    .width(46)
    .padding(1, 2)
    .border(style.borders.rounded)
    .borderForeground(MID)
    .render(rows.join('\n'))

  const footer = style()
    .foreground(WHITE)
    .render('↑/↓ moverse · ENTER elegir · ←/→ cambiar · Q salir')

  const status = view.updateStatus
    ? style().foreground(view.updateStatus.color).render(view.updateStatus.text)
    : style().foreground(WHITE).render(`v${view.version}  ·  corriendo sobre Pear + Bare`)

  const t = (view.frame || 0) * SPEED

  // The lower band is offset in time so the two are never mirror images.
  const above = bars(width, BAND_ROWS, t)
  const below = bars(width, BAND_ROWS, t + 41.7)

  return fit(
    [
      ...above,
      pad(title, width),
      ...below,
      '',
      pad(subtitle, width),
      '',
      pad(box, width),
      '',
      pad(footer, width),
      pad(status, width)
    ].join('\n')
  )
}

const RULES = [
  ['Objetivo', 'Quedarte sin cartas antes que los demás. La partida es a 500 puntos.'],
  ['Las peras', 'Cada carta lleva su valor en peras: contás las peras y esa es la carta.'],
  ['El mazo', '88 cartas en cuatro colores: 0-9 en peras, ocho +2 y cuatro +4.'],
  ['Reparto', 'Cinco cartas a cada uno. Se da vuelta una para empezar el descarte.'],
  ['Tu turno', 'Tirás una carta que coincida en color, o que tenga las mismas peras.'],
  ['Si no podés', 'Robás una del mazo. Si esa sirve, la podés tirar en el acto.'],
  ['+2', 'El siguiente roba dos y pierde el turno — salvo que responda con otro +2.'],
  ['+4', 'Se puede tirar siempre. Elegís el color y el siguiente roba cuatro.'],
  ['Apilar', 'Un +2 se responde con +2 y un +4 con +4: la cuenta se suma y sigue.'],
  ['¡UNO!', 'Al quedarte con una carta cantá UNO. Si te pescan callado, robás dos.'],
  ['Puntos', 'El que sale suma lo que quedó en las manos ajenas: número, +2 vale 20, +4 vale 50.']
]

function renderRules() {
  const width = CANVAS.width

  // The box is what actually clips, so truncate to ITS inner width, not the
  // canvas — otherwise long rules get cut mid-word by the border.
  const boxWidth = width - 10
  const termWidth = 18

  const rows = RULES.map(([term, text]) => {
    const label = style().bold(true).foreground(SKY).render(term.padEnd(termWidth))
    return (
      label +
      style()
        .foreground(WHITE)
        .render(style.truncate(text, boxWidth - termWidth))
    )
  })

  const box = style()
    .width(boxWidth)
    .padding(1, 2)
    .border(style.borders.rounded)
    .borderForeground(MID)
    .render(rows.join('\n'))

  const title = style().bold(true).foreground(SKY).render('REGLAS DEL TRUCO')
  const footer = style().foreground(WHITE).render('ENTER o ESC para volver')

  return ['', pad(title, width), '', pad(box, width), '', pad(footer, width)].join('\n')
}

module.exports = { renderMenu, renderRules, MENU_ITEMS, titleBlock, BAND_ROWS }

// Menú principal: título grande y curvado "THE GREAT PEAR", la pera 3D girando
// debajo, y dos botones grandes [ CREATE ROOM ] [ JOIN ROOM ] con selección.
// Se centra en la consola real (horizontal + vertical).
//
// Reutiliza frame() de pear-spin.js (pura). screen(spin, cols, rows, sel) también
// es pura -> lista para portar a un componente `tea`.
//
// Uso:
//   node pear-menu.js         -> animado (Ctrl+C; ←/→ cambia botón, en TTY)
//   node pear-menu.js frame   -> un frame estático y sale

const { frame } = require('./pear-spin')

// --- fuente de bloques (5 filas) ---
const FONT = {
  T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
  H: ['█   █', '█   █', '█████', '█   █', '█   █'],
  E: ['█████', '█    ', '███  ', '█    ', '█████'],
  G: [' ████', '█    ', '█  ██', '█   █', ' ████'],
  R: ['████ ', '█   █', '████ ', '█  █ ', '█   █'],
  A: [' ███ ', '█   █', '█████', '█   █', '█   █'],
  P: ['████ ', '█   █', '████ ', '█    ', '█    '],
  ' ': ['   ', '   ', '   ', '   ', '   ']
}

// Texto grande en arco ∩: cada LETRA entera se desplaza en vertical según su
// posición (centro arriba, extremos abajo), así "envuelve" la pera sin romper
// los trazos. amp = cuántas filas caen los bordes respecto al centro.
function archText(str, amp) {
  const blocks = [...str.toUpperCase()].map((ch) => FONT[ch] || FONT[' '])
  const widths = blocks.map((b) => b[0].length)
  const gap = 1
  const totalW = widths.reduce((a, w) => a + w + gap, 0) - gap
  const centers = []
  let x = 0
  for (const w of widths) {
    centers.push(x + w / 2)
    x += w + gap
  }
  const mid = totalW / 2
  const offs = centers.map((cxx) => {
    const t = mid ? (cxx - mid) / mid : 0
    return Math.round(amp * t * t)
  })
  const h = 5 + amp
  const grid = Array.from({ length: h }, () => Array(totalW).fill(' '))
  x = 0
  blocks.forEach((b, i) => {
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < widths[i]; c++) {
        const ch = b[r][c]
        if (ch !== ' ') grid[offs[i] + r][x + c] = ch
      }
    x += widths[i] + gap
  })
  return grid.map((a) => a.join(''))
}

const vis = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length
const color = (s, c, bold) => `\x1b[${bold ? '1;' : ''}38;5;${c}m${s}\x1b[0m`
const TITLE_COLS = [226, 220, 190, 184, 148, 112, 106] // amarillo -> verde

function colorTitle(rows) {
  return rows.map((r, i) => color(r, TITLE_COLS[Math.min(TITLE_COLS.length - 1, i)], true))
}

// Un botón grande de ancho fijo `inner`. focus=true lo resalta en amarillo.
function button(label, focus, inner) {
  const spaced = label.split('').join(' ')
  const core = focus ? `▸ ${spaced} ◂` : spaced
  const pad = inner - core.length
  const l = Math.floor(pad / 2)
  const c = focus ? 226 : 244
  const rows = [
    '╔' + '═'.repeat(inner) + '╗',
    '║' + ' '.repeat(inner) + '║',
    '║' + ' '.repeat(l) + core + ' '.repeat(inner - core.length - l) + '║',
    '║' + ' '.repeat(inner) + '║',
    '╚' + '═'.repeat(inner) + '╝'
  ]
  return rows.map((r, i) => color(r, c, focus && i === 2))
}

// Une dos bloques (arrays de líneas de igual alto) lado a lado.
function joinH(a, b, gap) {
  const g = ' '.repeat(gap)
  return a.map((l, i) => l + g + b[i])
}

// Construye las líneas del menú (sin centrar). sel: 0 = CREATE, 1 = JOIN.
function content(spin, sel) {
  const lines = []
  lines.push('')
  colorTitle(archText('THE GREAT', 2)).forEach((r) => lines.push(r))
  colorTitle(archText('PEAR', 2)).forEach((r) => lines.push(r))
  lines.push('')
  lines.push(color('· argentine truco · delivered p2p over pear ·', 108))
  lines.push('')
  frame(spin, 34, 18).split('\n').forEach((r) => lines.push(r))
  lines.push('')
  // Ancho fijo para los dos botones (reservando la decoración de foco ▸ ◂).
  const inner = Math.max('CREATE ROOM'.length, 'JOIN ROOM'.length) * 2 - 1 + 4 + 6
  joinH(button('CREATE ROOM', sel === 0, inner), button('JOIN ROOM', sel === 1, inner), 6).forEach(
    (r) => lines.push(r)
  )
  lines.push('')
  lines.push(color('←/→ choose   ·   ↵ enter', 244))
  return lines
}

// Centra en la consola (horizontal por línea + vertical con padding arriba).
function screen(spin, cols, rows, sel) {
  const lines = content(spin, sel)
  const padTop = Math.max(0, Math.floor((rows - lines.length) / 2))
  const centered = lines.map((l) => ' '.repeat(Math.max(0, Math.floor((cols - vis(l)) / 2))) + l)
  return '\n'.repeat(padTop) + centered.join('\n')
}

module.exports = { screen, content }

if (require.main === module) {
  const cols = process.stdout.columns || 80
  const rows = process.stdout.rows || 40

  if (process.argv[2] === 'frame') {
    console.log(screen(Number(process.argv[3] || 0.6), cols, rows, 0))
    process.exit(0)
  }

  let sel = 0
  // Navegación con flechas si hay TTY.
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', (b) => {
      const s = b.toString()
      if (s === '\x1b[C' || s === '\x1b[D') sel = sel === 0 ? 1 : 0 // ← / →
      if (s === '\x03' || s === 'q') bye() // Ctrl+C / q
    })
  }

  process.stdout.write('\x1b[2J\x1b[?25l')
  let a = 0
  const iv = setInterval(() => {
    a += 0.045
    const C = process.stdout.columns || cols
    const R = process.stdout.rows || rows
    process.stdout.write('\x1b[H' + screen(a, C, R, sel))
  }, 33)
  function bye() {
    clearInterval(iv)
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
    process.stdout.write('\x1b[?25h\x1b[2J\x1b[H')
    process.exit(0)
  }
  process.on('SIGINT', bye)
}

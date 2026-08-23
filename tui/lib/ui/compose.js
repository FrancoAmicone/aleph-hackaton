// Compositing for the opening shows: a grid of cells the size of the canvas,
// each a glyph plus the escape sequence in force, that a show draws sparks or
// drops onto and the finished result dissolves into.
const { CANVAS } = require('./canvas')

const W = CANVAS.width
const H = CANVAS.height

function hash(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}

// Break one row of an ANSI-coloured frame into visible cells, each carrying
// the escape sequence that was in force. Every glyph on the result screen is
// one column wide, which is what makes this a straight walk.
function cells(row) {
  const out = []
  let sgr = ''
  const parts = row.split(/(\x1b\[[0-9;]*m)/)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('\x1b[')) {
      sgr = part === '\x1b[0m' ? '' : sgr + part
      continue
    }
    for (const ch of part) out.push({ ch, sgr })
  }
  while (out.length < W) out.push({ ch: ' ', sgr: '' })
  return out.slice(0, W)
}

// The finished frame dissolved in by `reveal` (0..1): a per-cell threshold,
// so it appears as a scatter that fills rather than a wipe. Reveal 0 is an
// empty grid; reveal 1 is the frame entire.
function layer(behind, reveal) {
  const grid = behind
    .split('\n')
    .map((row, y) =>
      cells(row).map((cell, x) => (hash(x + 1, y + 1) < reveal ? cell : { ch: ' ', sgr: '' }))
    )
  while (grid.length < H) grid.push(cells(''))
  return grid.slice(0, H)
}

function put(grid, x, y, ch, tone) {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || xi >= W || yi < 0 || yi >= H) return
  grid[yi][xi] = { ch, sgr: `\x1b[38;5;${tone}m` }
}

// Emit, restating the escape only where it changes.
function emit(grid) {
  const rows = []
  for (let y = 0; y < H; y++) {
    let line = ''
    let cur = ''
    for (let x = 0; x < W; x++) {
      const { ch, sgr } = grid[y][x]
      if (sgr !== cur) {
        line += sgr === '' ? '\x1b[0m' : '\x1b[0m' + sgr // reset, then the new state
        cur = sgr
      }
      line += ch
    }
    if (cur !== '') line += '\x1b[0m'
    rows.push(line)
  }
  return rows.join('\n')
}

module.exports = { W, H, hash, layer, put, emit }

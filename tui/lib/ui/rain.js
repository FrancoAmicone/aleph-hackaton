// Rain for the loss: grey-blue drops fall across the whole canvas and splash
// on the floor; as the shower eases off, the result shows through behind it.
//
// rain(age, behind) is pure. `behind` is the finished result frame, canvas
// sized; it is dissolved in cell by cell while the rain thins, and the last
// frame is exactly `behind` with nothing on top. The app runs this on the
// same fast clock as the fireworks.
const { CANVAS } = require('./canvas')

const SHOW_MS = 40
const FRAMES = 60

// Drops: how many at full pour, and how the shower comes and goes.
const DROPS = 150
const RISE = 8 // frames to reach full pour
const EASE_FROM = 0.55 // fraction of the show where it starts to ease off
const REVEAL_FROM = 0.45 // fraction where the result starts to show through

// Fast drops are long and bright; slow ones are specks far away.
const KINDS = [
  { speed: 1.6, glyph: '|', tone: 67 },
  { speed: 1.3, glyph: '|', tone: 103 },
  { speed: 1.0, glyph: "'", tone: 60 },
  { speed: 0.7, glyph: '.', tone: 240 },
  { speed: 0.5, glyph: '.', tone: 237 }
]
const SPLASH = 240

function hash(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}

// Break one row of an ANSI-coloured frame into visible cells, each carrying
// the escape sequence that was in force. Every glyph on the result screen is
// one column wide, which is what makes this a straight walk.
function cells(row, width) {
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
  while (out.length < width) out.push({ ch: ' ', sgr: '' })
  return out.slice(0, width)
}

function rain(age, behind) {
  const W = CANVAS.width
  const H = CANVAS.height
  const k = Math.min(1, age / FRAMES)

  // How hard it is raining right now, 0..1.
  const pour =
    age < RISE ? age / RISE : k < EASE_FROM ? 1 : Math.max(0, 1 - (k - EASE_FROM) / (1 - EASE_FROM))
  // How much of the result has come through, 0..1.
  const reveal = k < REVEAL_FROM ? 0 : Math.min(1, (k - REVEAL_FROM) / (1 - REVEAL_FROM))

  // Start from the result, dissolved in by a per-cell threshold so it appears
  // as a scatter that fills, not as a wipe.
  const grid = behind
    .split('\n')
    .map((row, y) =>
      cells(row, W).map((cell, x) => (hash(x + 1, y + 1) < reveal ? cell : { ch: ' ', sgr: '' }))
    )
  while (grid.length < H) grid.push(cells('', W))

  const put = (x, y, ch, tone) => {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi < 0 || xi >= W || yi < 0 || yi >= H) return
    grid[yi][xi] = { ch, sgr: `\x1b[38;5;${tone}m` }
  }

  const active = Math.round(DROPS * pour)
  for (let i = 0; i < active; i++) {
    const kind = KINDS[Math.floor(hash(i, 3) * KINDS.length)]
    const x = Math.floor(hash(i, 1) * W)
    // Each drop runs its own loop down the screen, offset so they never line up.
    const cycle = H + 6
    const pos = (hash(i, 2) * cycle + age * kind.speed) % cycle
    const y = pos - 3
    if (y < H - 1) {
      put(x, y, kind.glyph, kind.tone)
      // A faint tail on the fast ones.
      if (kind.speed >= 1.3 && y > 0) put(x, y - 1, '.', kind.tone)
    } else if (y < H + 2) {
      // On the floor: a splash either side for a couple of frames.
      put(x - 1, H - 1, '~', SPLASH)
      put(x, H - 1, '.', SPLASH)
      put(x + 1, H - 1, '~', SPLASH)
    }
  }

  // Emit, restating the escape only where it changes.
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

module.exports = { rain, FRAMES, SHOW_MS }

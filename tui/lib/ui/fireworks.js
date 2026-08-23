// Fireworks for the win: one rocket, one burst in the middle of the screen
// that swallows the whole canvas, then the embers fall and the result is
// revealed.
//
// fireworks(age) is pure: the same frame number gives the same picture, so
// the tests can assert on it and the player can skip it with a key — the app
// just moves the clock forward. The app runs the show at SHOW_MS a frame,
// faster than the rest of the UI, so the sparks move smoothly.
const { CANVAS } = require('./canvas')

// Frames of show before the result: the climb, then the burst and its fall.
// At 40ms a frame: about 2.2 seconds in all.
const SHOW_MS = 40
const CLIMB = 12
const LIFE = 43
const FRAMES = CLIMB + LIFE

const CX = CANVAS.width / 2
const CY = CANVAS.height / 2 - 1

// Three shells leaving the heart at different speeds, so the burst reads as
// depth rather than one ring. Reach is in rows; columns get double.
const SHELLS = [
  { n: 64, reach: 34, tones: [231, 226, 226, 220] },
  { n: 48, reach: 22, tones: [226, 190, 154, 118] },
  { n: 36, reach: 12, tones: [231, 231, 226, 154] }
]

// Star to ember: what a spark looks like as it burns down.
const GLYPHS = ['✦', '*', '*', '+', '+', '·', '·', '·', '·']
// And what it is coloured once it has gone cold.
const EMBER = [244, 240, 237]

function hash(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453
  return s - Math.floor(s)
}

function fireworks(age) {
  const W = CANVAS.width
  const H = CANVAS.height
  const ch = new Array(W * H).fill(' ')
  const col = new Int16Array(W * H)

  const put = (x, y, glyph, tone) => {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi < 0 || xi >= W || yi < 0 || yi >= H) return
    ch[yi * W + xi] = glyph
    col[yi * W + xi] = tone
  }

  if (age < CLIMB) {
    // The rocket: up the middle from the bottom edge, with a short tail.
    const k = age / CLIMB
    const y = H - 1 - (H - 1 - CY) * k
    put(CX, y, '|', 231)
    put(CX, y + 1.5, '·', 244)
    if (age > 2) put(CX, y + 3, '.', 240)
    return emit(ch, col, W, H)
  }

  const t = age - CLIMB
  const k = t / LIFE
  // Fast out of the heart, then coasting: most of the reach in the first third.
  const ease = 1 - Math.pow(1 - k, 2.2)

  // The flash: for the first frames the heart is a white blaze.
  if (t < 5) {
    const r = 2 + t * 1.2
    for (let a = 0; a < Math.PI * 2; a += 0.25) {
      put(CX + Math.cos(a) * r * 2, CY + Math.sin(a) * r, t === 0 ? '@' : '*', 231)
    }
    put(CX, CY, '@', 231)
  }

  SHELLS.forEach((shell, si) => {
    for (let i = 0; i < shell.n; i++) {
      const a = (i / shell.n) * Math.PI * 2 + hash(si, i) * 0.2
      const spread = 0.7 + hash(i, si) * 0.45
      const r = shell.reach * spread * ease
      // Gravity: the older the spark, the further it has sagged.
      const sag = k * k * 6
      const x = CX + Math.cos(a) * r * 2
      const y = CY + Math.sin(a) * r + sag

      // Burn-down: glyph by age, colour by age with a per-spark stagger so the
      // whole sky does not go grey on the same frame.
      const burn = Math.min(1, k * (0.85 + hash(i + 7, si) * 0.3))
      const glyph = GLYPHS[Math.min(GLYPHS.length - 1, Math.floor(burn * GLYPHS.length))]
      const tone =
        burn < 0.62
          ? shell.tones[
              Math.min(shell.tones.length - 1, Math.floor((burn / 0.62) * shell.tones.length))
            ]
          : EMBER[Math.min(EMBER.length - 1, Math.floor(((burn - 0.62) / 0.38) * EMBER.length))]
      put(x, y, glyph, tone)

      // A trail just behind the spark while it is still hot.
      if (burn < 0.5) {
        const rb = r * 0.86
        put(CX + Math.cos(a) * rb * 2, CY + Math.sin(a) * rb + sag * 0.8, '·', 244)
      }
    }
  })

  return emit(ch, col, W, H)
}

// Emit with ANSI-256 colour, reusing the code while it does not change.
function emit(ch, col, W, H) {
  const rows = []
  for (let y = 0; y < H; y++) {
    let line = ''
    let cur = -1
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (ch[i] === ' ') {
        line += ' '
        continue
      }
      if (col[i] !== cur) {
        line += `\x1b[38;5;${col[i]}m`
        cur = col[i]
      }
      line += ch[i]
    }
    rows.push(cur === -1 ? line : line + '\x1b[0m')
  }
  return rows.join('\n')
}

module.exports = { fireworks, FRAMES, SHOW_MS }

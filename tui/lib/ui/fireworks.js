// Fireworks for the win: one rocket, one burst in the middle of the screen
// that swallows the whole canvas, and the result coming through the sparks
// as they spread, so by the time the embers fall it is all there.
//
// fireworks(age, behind) is pure: the same frame number gives the same
// picture, so the tests can assert on it and the player can skip it with a
// key — the app just moves the clock forward. `behind` is the finished
// result frame; the last frame of the show is exactly that. The app runs the
// show at SHOW_MS a frame, faster than the rest of the UI, so the sparks
// move smoothly.
const { W, H, hash, layer, put, emit } = require('./compose')

// Frames of show before the result: the climb, then the burst and its fall.
// At 40ms a frame: about 2.2 seconds in all.
const SHOW_MS = 40
const CLIMB = 12
const LIFE = 43
const FRAMES = CLIMB + LIFE

// The result starts to show through this far into the burst, and is all
// there by this far, while the sparks are still flying.
const REVEAL_FROM = 0.08
const REVEAL_TO = 0.7

const CX = W / 2
const CY = H / 2 - 1

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

function fireworks(age, behind) {
  if (age < CLIMB) {
    // The rocket: up the middle from the bottom edge, with a short tail.
    const grid = layer(behind, 0)
    const k = age / CLIMB
    const y = H - 1 - (H - 1 - CY) * k
    put(grid, CX, y, '|', 231)
    put(grid, CX, y + 1.5, '·', 244)
    if (age > 2) put(grid, CX, y + 3, '.', 240)
    return emit(grid)
  }

  const t = age - CLIMB
  const k = t / LIFE
  // Fast out of the heart, then coasting: most of the reach in the first third.
  const ease = 1 - Math.pow(1 - k, 2.2)

  // The result, as far as it has come through.
  const reveal = Math.max(0, Math.min(1, (k - REVEAL_FROM) / (REVEAL_TO - REVEAL_FROM)))
  const grid = layer(behind, reveal)

  // The flash: for the first frames the heart is a white blaze.
  if (t < 5) {
    const r = 2 + t * 1.2
    for (let a = 0; a < Math.PI * 2; a += 0.25) {
      put(grid, CX + Math.cos(a) * r * 2, CY + Math.sin(a) * r, t === 0 ? '@' : '*', 231)
    }
    put(grid, CX, CY, '@', 231)
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
      put(grid, x, y, glyph, tone)

      // A trail just behind the spark while it is still hot.
      if (burn < 0.5) {
        const rb = r * 0.86
        put(grid, CX + Math.cos(a) * rb * 2, CY + Math.sin(a) * rb + sag * 0.8, '·', 244)
      }
    }
  })

  return emit(grid)
}

module.exports = { fireworks, FRAMES, SHOW_MS }

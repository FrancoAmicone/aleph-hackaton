// The palette, sampled straight out of the flag artwork: a ramp of blues from
// sky down to deep navy, over near-black ink.
//
// These are ANSI-256 indices, not #rrggbb. Truecolor is not universal — macOS
// Terminal.app among others only does 256 — and a terminal that does not
// understand a 38;2;r;g;b sequence drops it and paints the text in whatever the
// profile's default foreground happens to be, which is how the whole UI can
// come out green on a green-on-black profile. Every index below is the nearest
// 256-colour match to the sampled hex, noted alongside.
//
// This lives in its own module rather than in screen.js because cards.js needs
// it too, and screen.js already requires cards.js — importing it the other way
// round makes a require cycle that silently leaves the colours undefined.
const SKY = 117 // #87d7ff — sampled #88CCFF
const LIGHT = 75 // #5fafff — sampled #66ABEF
const BLUE = 68 // #5f87d7 — sampled #4389DD
const MID = 26 // #005fd7 — sampled #2266CC
const STRONG = 25 // #005faf — sampled #0044AA
const NAVY = 24 // #005f87 — sampled #003388
const DEEP = 17 // #00005f — sampled #002266
const INK = 234 // #1c1c1c — sampled #16171B
const WHITE = 231 // #ffffff

// The four card colours. UNO lives or dies on telling them apart, so these are
// picked for separation on a dark terminal rather than fidelity to the print
// colours: the official blue (#0072BC) maps to a 256-index that is both dim and
// already in use by the chrome, so card blue and green are brightened.
const ROJO = 196 // #ff0000
const AMARILLO = 220 // #ffd700
const VERDE = 41 // #00d75f
const AZUL = 33 // #0087ff

// A +4 belongs to no colour until it is played.
const COMODIN = 231 // #ffffff

const CARD_COLORS = { rojo: ROJO, amarillo: AMARILLO, verde: VERDE, azul: AZUL }

// Light to dark, for gradients across a block of rows.
const RAMP = [SKY, LIGHT, BLUE, MID, STRONG, NAVY]

module.exports = {
  SKY,
  LIGHT,
  BLUE,
  MID,
  STRONG,
  NAVY,
  DEEP,
  INK,
  WHITE,
  RAMP,
  ROJO,
  AMARILLO,
  VERDE,
  AZUL,
  COMODIN,
  CARD_COLORS
}

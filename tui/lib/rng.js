// Generador pseudoaleatorio determinístico a partir de una semilla.
//
// Es la pieza que hace posible el multijugador sin mandar el estado por la red:
// todos los peers arrancan `new Game({ rng: fromSeed(semilla) })` con la misma
// semilla, así que barajan el mismo mazo y reparten las mismas manos. Por el
// cable viajan sólo las acciones.
//
// `Math.random` no sirve acá: cada peer tendría un mazo distinto y la partida
// divergiría en la primera carta.
//
// El algoritmo es mulberry32 — 32 bits de estado, rápido y con distribución
// suficientemente buena para barajar cartas. No es criptográfico y no tiene por
// qué serlo: la semilla ya viene de crypto.randomBytes en el anfitrión.

// Hash de string a entero de 32 bits (FNV-1a). Convierte la semilla hex que
// reparte el anfitrión en el entero que necesita mulberry32.
function hashSeed(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// fromSeed(semilla) -> function(): number en [0, 1)
// Misma semilla, misma secuencia. Siempre.
function fromSeed(semilla) {
  let a = hashSeed(String(semilla))
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

module.exports = { fromSeed, hashSeed }

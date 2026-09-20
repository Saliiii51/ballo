// Deterministik tohumlu RNG (mulberry32).
// Fizik varyansı ve bot kararları için Math.random() yerine kullanılır.
// Aynı seed + aynı input = aynı maç akışı (replay/hile incelemesi için).
class SeededRNG {
  constructor(seed = 123456789) {
    this.setSeed(seed);
  }

  setSeed(seed) {
    let s = Number(seed) || 0;
    if (!Number.isFinite(s)) s = 0;
    this.state = (s >>> 0) || 0x9e3779b9;
  }

  next() {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }
}

module.exports = SeededRNG;

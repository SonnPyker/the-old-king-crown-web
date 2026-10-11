// Small deterministic helpers (seeded RNG etc.)

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) { this.seed = seed >>> 0; this.f = mulberry32(this.seed); }
  next() { return this.f(); }
  int(n) { return Math.floor(this.f() * n); }
  pick(arr) { return arr[this.int(arr.length)]; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
}

export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
export const uniq = (arr) => [...new Set(arr)];
export const range = (n) => Array.from({ length: n }, (_, i) => i);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function removeFrom(arr, item) {
  const i = arr.indexOf(item);
  if (i >= 0) arr.splice(i, 1);
  return i >= 0;
}

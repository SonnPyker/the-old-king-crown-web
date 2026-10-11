// Random legal player (used for fuzz testing the engine and as the weakest fallback).

export function randomDecide(game, req, rng) {
  switch (req.type) {
    case 'select': {
      const opts = req.options;
      const pass = opts.find((o) => o.kind === 'pass');
      if (pass && rng.next() < 0.3) return [pass.id];
      const pool = opts.filter((o) => o.kind !== 'pass');
      const src = pool.length ? pool : opts;
      const n = req.min + rng.int(Math.max(0, Math.min(req.max, src.length) - req.min) + 1);
      const arr = src.slice();
      rng.shuffle(arr);
      return arr.slice(0, Math.max(req.min, Math.min(n, arr.length))).map((o) => o.id);
    }
    case 'assign': {
      const cards = req.cards.slice();
      rng.shuffle(cards);
      const out = req.slots.map(() => null);
      const idx = req.slots.map((_, i) => i);
      rng.shuffle(idx);
      const n = req.exact ? Math.min(cards.length, idx.length) : rng.int(Math.min(cards.length, idx.length) + 1);
      for (let i = 0; i < n; i++) out[idx[i]] = cards[i];
      return out;
    }
    case 'distribute': {
      const out = req.slots.map(() => 0);
      let left = req.exact ? Math.min(req.total, req.slots.reduce((a, s) => a + s.cap, 0)) : rng.int(req.total + 1);
      let guard = 200;
      while (left > 0 && guard-- > 0) {
        const i = rng.int(req.slots.length);
        if (out[i] < req.slots[i].cap) { out[i]++; left--; }
      }
      return out;
    }
    default: return null;
  }
}

// Small helpers shared by cards: numeric choices, distributions, peeking, swapping, region locks.

import { Game } from './game.js';
import { TACTIC_DEFS } from '../data/tactics.js';

Object.assign(Game.prototype, {
  // Choose an integer in [min, max].
  *chooseNumber(pid, min, max, o = {}) {
    if (max <= min) return min;
    const options = [];
    for (let n = min; n <= max; n++) options.push({ id: 'n' + n, kind: 'num', n });
    const [r] = yield* this.select(pid, { ...o, options, auto: false });
    return r ? r.n : min;
  },

  // Distribute up to `total` tokens among slots [{ id, cap }]. Returns an array of counts parallel to slots.
  *distribute(pid, req) {
    const slots = req.slots;
    const r = {
      type: 'distribute', id: ++this.requestSeq, pid, purpose: req.purpose || 'distribute', prompt: req.prompt || '',
      total: req.total, slots, exact: !!req.exact, ctx: req.ctx || {}, intent: req.intent || 'neutral',
    };
    if (req.total <= 0 || slots.every((s) => s.cap <= 0)) return slots.map(() => 0);
    const resp = yield r;
    const arr = Array.isArray(resp) ? resp : [];
    const out = slots.map((s, i) => Math.max(0, Math.min(s.cap, Math.floor(+arr[i] || 0))));
    const sum = out.reduce((a, b) => a + b, 0);
    if (sum > req.total || (req.exact && sum !== Math.min(req.total, slots.reduce((a, s) => a + s.cap, 0)))) {
      throw new Error(`Invalid distribution for ${r.purpose}`);
    }
    return out;
  },

  // Show hidden cards to one player (information only).
  *peek(pid, uids, prompt) {
    const r = { type: 'peek', id: ++this.requestSeq, pid, purpose: 'peek', prompt: prompt || 'p.peek', cards: uids.slice() };
    yield r;
  },

  // Swap the places (zone + position) of two cards.
  swapCards(a, b) {
    const ca = this.C(a); const cb = this.C(b);
    const za = ca.z; const zb = cb.z;
    const isActive = (z) => !!z && z.startsWith('R') && z.endsWith(':active');
    if (isActive(za) && !isActive(zb)) this.leaveHooks(a);
    if (isActive(zb) && !isActive(za)) this.leaveHooks(b);
    const arrA = this.zone(za); const arrB = this.zone(zb);
    const ia = arrA.indexOf(a); const ib = arrB.indexOf(b);
    arrA[ia] = b; arrB[ib] = a;
    ca.z = zb; cb.z = za;
  },

  // The Innkeeper: swap the positions of two of your own face-down cards.
  *swapOwnFaceDown(pid, o = {}) {
    const mine = [];
    for (let r = 0; r < 3; r++) for (const u of this.zone(this.zk.down(r))) if (this.C(u).owner === pid) mine.push(u);
    if (mine.length < 2) return;
    const a = yield* this.chooseCard(pid, mine, { ...o, prompt: 'p.swapFirst', optional: true, intent: 'neutral' });
    if (a == null) return;
    const b = yield* this.chooseCard(pid, mine.filter((u) => u !== a), { ...o, prompt: 'p.swapSecond', intent: 'neutral' });
    if (b == null) return;
    this.swapCards(a, b);
    this.log('swapDown', { pid });
  },

  tacticSetup(t) { return TACTIC_DEFS[t.id].markers || 0; },

  // Martial Law: opponents may not swap, add or move cards into the chosen Region during its first Clash.
  regionLocked(region, pid) {
    const cl = this.S.clash;
    if (!cl || cl.region !== region || cl.n !== 1) return false;
    return this.S.fx.some((f) => f.key === 'martialLaw' && f.round === this.S.round && f.region === region && f.pid !== pid);
  },
});

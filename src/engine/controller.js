// Session: drives the game generator, feeds it recorded answers (replay / undo / save) and
// dispatches requests to human players (via the UI) or the AI.

import { Game } from './game.js';
import { RNG } from './util.js';
import { decide } from '../ai/index.js';

// Returns an error string, or null when `ans` is a legal answer to `req`.
export function validateAnswer(req, ans) {
  switch (req.type) {
    case 'select': {
      const ids = Array.isArray(ans) ? ans : (ans == null ? [] : [ans]);
      if (new Set(ids).size !== ids.length) return 'duplicate';
      const valid = new Set(req.options.map((o) => o.id));
      for (const id of ids) if (!valid.has(id)) return 'unknown option';
      if (ids.length < req.min || ids.length > req.max) return 'count';
      return null;
    }
    case 'assign': {
      if (!Array.isArray(ans)) return 'not array';
      const used = new Set();
      for (let i = 0; i < req.slots.length; i++) {
        const u = ans[i] ?? null;
        if (u == null) continue;
        if (!req.cards.includes(u) || used.has(u)) return 'bad card';
        used.add(u);
      }
      if (req.exact && used.size !== Math.min(req.cards.length, req.slots.length)) return 'incomplete';
      return null;
    }
    case 'distribute': {
      if (!Array.isArray(ans)) return 'not array';
      let sum = 0;
      for (let i = 0; i < req.slots.length; i++) {
        const k = Math.floor(+ans[i] || 0);
        if (k < 0 || k > req.slots[i].cap) return 'cap';
        sum += k;
      }
      if (sum > req.total) return 'total';
      if (req.exact && sum !== Math.min(req.total, req.slots.reduce((a, s) => a + s.cap, 0))) return 'incomplete';
      return null;
    }
    case 'peek': return null;
    default: return 'unknown request';
  }
}

// A trivially legal answer (first choices) — used if the AI ever fails.
export function fallbackAnswer(req) {
  switch (req.type) {
    case 'select': return req.options.slice(0, req.min).map((o) => o.id);
    case 'assign': {
      const out = req.slots.map(() => null);
      const n = Math.min(req.cards.length, req.slots.length);
      for (let i = 0; i < n; i++) out[i] = req.cards[i];
      return out;
    }
    case 'distribute': {
      let left = req.total;
      return req.slots.map((s) => { const k = Math.min(s.cap, left); left -= k; return req.exact ? k : 0; });
    }
    default: return null;
  }
}

export class Session {
  // opts: { settings, seed, responses?: [{a, h}] }
  constructor(opts) {
    this.settings = opts.settings;
    this.seed = opts.seed >>> 0;
    this.responses = (opts.responses || []).map((r) => ({ a: r.a, h: !!r.h }));
    this.aiRng = new RNG((this.seed ^ 0x9e3779b9) >>> 0);
    this.listeners = new Set();
    this._boot();
  }

  _boot() {
    this.game = new Game(this.settings, this.seed);
    this.gen = this.game.run();
    this.req = null;
    this.done = false;
    this.error = null;
    this._next(undefined);
    for (const r of this.responses) {
      if (this.done) break;
      if (validateAnswer(this.req, r.a)) { this.error = 'corrupt save'; break; }
      this._next(r.a);
    }
  }

  _next(ans) {
    let step;
    try { step = this.gen.next(ans); } catch (e) { this.error = e; this.done = true; this.req = null; throw e; }
    if (step.done) { this.done = true; this.req = null; } else this.req = step.value;
  }

  get S() { return this.game.S; }
  get log() { return this.game.logEntries; }
  get result() { return this.game.S.result; }
  isAI(req = this.req) { return !!req && this.game.P(req.pid).type === 'ai'; }
  get waitingFor() { return this.req && !this.isAI() ? this.req.pid : null; }

  _push(ans, human) {
    this.responses.push({ a: ans, h: human });
    this._next(ans);
    this._emit();
  }

  // Human answer. Returns an error string, or null on success.
  respond(ans) {
    if (this.done || !this.req) return 'finished';
    const err = validateAnswer(this.req, ans);
    if (err) return err;
    this._push(ans, true);
    return null;
  }

  // Let the AI answer one pending request. Returns true if a request was handled.
  stepAI() {
    if (this.done || !this.req || !this.isAI()) return false;
    const req = this.req;
    let ans;
    try { ans = decide(this.game, req, this.aiRng); } catch (e) { console.error('AI failure', e); if (this.onAIIssue) this.onAIIssue(req, 'throw', e); ans = undefined; }
    if (ans === undefined || validateAnswer(req, ans)) {
      if (this.onAIIssue && ans !== undefined) this.onAIIssue(req, 'invalid:' + validateAnswer(req, ans), ans);
      ans = fallbackAnswer(req);
    }
    this._push(ans, false);
    return true;
  }

  // Run AI answers until a human has to decide (or the game ends). `limit` bounds the number of AI steps.
  autoplay(limit = Infinity) {
    let n = 0;
    while (n < limit && this.stepAI()) n++;
    return n;
  }

  get canUndo() { return this.responses.some((r) => r.h); }

  // Roll back to just before the last human decision.
  undo() {
    let i = this.responses.length - 1;
    while (i >= 0 && !this.responses[i].h) i--;
    if (i < 0) return false;
    this.responses.length = i;
    this._boot();
    this.autoplayUntilHuman();
    this._emit();
    return true;
  }

  // After a replay AI answers that were recorded are fed automatically; any AI request that is pending needs a fresh answer.
  autoplayUntilHuman() { return this.autoplay(); }

  serialize() { return { settings: this.settings, seed: this.seed, responses: this.responses }; }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this); }
}

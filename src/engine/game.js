// Core game object: state, zones, requests, resource helpers.
// Rules flow lives in flow.js / clash.js / actions.js which extend Game.prototype.

import { RNG, removeFrom } from './util.js';
import { MIN_HAND, MAX_HAND, START_HAND, SUPPORTERS, GAME_LENGTHS, REGIONS } from '../data/constants.js';

export class Game {
  constructor(settings, seed) {
    this.settings = settings;
    this.seed = seed >>> 0;
    this.rng = new RNG(this.seed);
    this.S = null;
    this.logEntries = [];
    this.requestSeq = 0;
  }

  // ------------------------------------------------------------------ state
  get n() { return this.S.players.length; }
  P(pid) { return this.S.players[pid]; }
  C(uid) { return this.S.cards[uid]; }
  zone(key) {
    let z = this.S.z[key];
    if (!z) z = this.S.z[key] = [];
    return z;
  }
  cardsIn(key) { return this.zone(key).map((u) => this.S.cards[u]); }
  turnOrder() { return this.S.order.slice(); }
  opponents(pid) { return this.S.order.filter((p) => p !== pid); }
  orderIndex(pid) { return this.S.order.indexOf(pid); }
  isFirst(pid) { return this.S.order[0] === pid; }
  isLast(pid) { return this.S.order[this.S.order.length - 1] === pid; }

  newCard(def, owner, kind) {
    const uid = this.S.cards.length;
    const c = { uid, def, owner, kind, z: null, inf: 0, gain: [], clashedAt: null, copyOf: null, addFrom: null, flags: {} };
    this.S.cards.push(c);
    return c;
  }

  // Low-level zone move. pos: 'top' | 'bottom' | number
  put(uid, zkey, pos = 'top') {
    const c = this.S.cards[uid];
    if (c.z) removeFrom(this.zone(c.z), uid);
    c.z = zkey;
    const arr = this.zone(zkey);
    if (pos === 'top') arr.unshift(uid);
    else if (pos === 'bottom') arr.push(uid);
    else arr.splice(pos, 0, uid);
    return c;
  }

  zk = {
    deck: (p) => `p${p}:deck`, hand: (p) => `p${p}:hand`, discard: (p) => `p${p}:discard`,
    sop: (p) => `p${p}:sop`, lost: (p) => `p${p}:lost`, supply: (p) => `p${p}:supply`, bid: (p) => `p${p}:bid`, adv: (p) => `p${p}:adv`,
    kc: (p, i) => `k${p}.${i}`, occ: (p, i) => `o${p}.${i}`,
    active: (r) => `R${r}:active`, down: (r) => `R${r}:down`, regKC: (r) => `R${r}:kc`, locKC: (l) => `L${l}:kc`,
    council: (c) => `C:${c}`,
  };

  // ---------------------------------------------------------------- logging
  log(key, args = {}) {
    const e = { seq: this.logEntries.length, round: this.S ? this.S.round : 0, key, ...args };
    this.logEntries.push(e);
    if (this.onLog) this.onLog(e);
    return e;
  }

  // --------------------------------------------------------------- requests
  // All interaction goes through requests yielded to the controller.
  // Option objects: { id, kind, ...payload }.
  *select(pid, req) {
    const options = req.options;
    const r = {
      type: 'select', id: ++this.requestSeq, pid, purpose: req.purpose || 'generic',
      prompt: req.prompt || '', options, min: req.min ?? 1, max: req.max ?? 1, ordered: !!req.ordered,
      intent: req.intent || 'neutral', ctx: req.ctx || {},
    };
    if (options.length === 0 || (options.length <= r.min && r.min === r.max && !req.force && req.auto !== false)) {
      // Nothing to choose: auto-resolve.
      return options.slice(0, r.max);
    }
    const resp = yield r;
    const ids = Array.isArray(resp) ? resp : (resp == null ? [] : [resp]);
    const out = [];
    for (const id of ids) {
      const o = options.find((x) => x.id === id);
      if (o && !out.includes(o)) out.push(o);
    }
    if (out.length < r.min || out.length > r.max) {
      throw new Error(`Invalid response for ${r.purpose}: got ${out.length}, want ${r.min}-${r.max}`);
    }
    return out;
  }

  *chooseCard(pid, uids, o = {}) {
    const options = uids.map((u) => ({ id: 'c' + u, kind: 'card', uid: u }));
    if (o.optional) options.push({ id: 'none', kind: 'none', label: o.noneLabel });
    const [r] = yield* this.select(pid, { ...o, options, min: 1, max: 1, auto: o.optional ? false : o.auto });
    return !r || r.kind === 'none' ? null : r.uid;
  }

  *chooseCards(pid, uids, o = {}) {
    const options = uids.map((u) => ({ id: 'c' + u, kind: 'card', uid: u }));
    const min = Math.min(o.min ?? 0, options.length);
    const max = Math.min(o.max ?? options.length, options.length);
    if (max === 0) return [];
    const res = yield* this.select(pid, { ...o, options, min, max, auto: false });
    return res.map((r) => r.uid);
  }

  *chooseRegion(pid, regions, o = {}) {
    const options = regions.map((r) => ({ id: 'r' + r, kind: 'region', region: r }));
    const [r] = yield* this.select(pid, { ...o, options });
    return r ? r.region : null;
  }

  *chooseLoc(pid, locs, o = {}) {
    const options = locs.map((l) => ({ id: 'l:' + l, kind: 'loc', loc: l }));
    const [r] = yield* this.select(pid, { ...o, options });
    return r ? r.loc : null;
  }

  *chooseCouncil(pid, councils, o = {}) {
    const options = councils.map((c) => ({ id: 'k:' + c, kind: 'council', council: c }));
    const [r] = yield* this.select(pid, { ...o, options });
    return r ? r.council : null;
  }

  *choosePlayer(pid, pids, o = {}) {
    const options = pids.map((p) => ({ id: 'p' + p, kind: 'player', player: p }));
    const [r] = yield* this.select(pid, { ...o, options });
    return r ? r.player : null;
  }

  *choosePlayers(pid, pids, o = {}) {
    const options = pids.map((p) => ({ id: 'p' + p, kind: 'player', player: p }));
    if (!options.length) return [];
    const res = yield* this.select(pid, { ...o, options, min: o.min ?? 0, max: o.max ?? options.length, auto: false });
    return res.map((r) => r.player);
  }

  *yesNo(pid, prompt, o = {}) {
    const [r] = yield* this.select(pid, {
      ...o, prompt, options: [{ id: 'yes', kind: 'yes' }, { id: 'no', kind: 'no' }], min: 1, max: 1, auto: false,
    });
    return r.id === 'yes';
  }

  // options: [{id, label, ...}] with free-form kinds
  *chooseOption(pid, options, o = {}) {
    const opts = options.map((x) => ({ kind: 'opt', ...x }));
    const [r] = yield* this.select(pid, { ...o, options: opts });
    return r ? r.id : null;
  }

  // Assign hand cards to slots (used for placing face-down cards next to Regions)
  *assign(pid, req) {
    const r = {
      type: 'assign', id: ++this.requestSeq, pid, purpose: req.purpose, prompt: req.prompt || '',
      cards: req.cards, slots: req.slots, exact: req.exact !== false, ctx: req.ctx || {},
    };
    const resp = yield r;
    const arr = Array.isArray(resp) ? resp : [];
    const used = new Set();
    const out = req.slots.map((_, i) => {
      const u = arr[i] ?? null;
      if (u == null) return null;
      if (!req.cards.includes(u) || used.has(u)) throw new Error(`Invalid assignment for ${r.purpose}`);
      used.add(u);
      return u;
    });
    if (r.exact && used.size !== Math.min(req.cards.length, req.slots.length)) throw new Error(`Incomplete assignment for ${r.purpose}`);
    return out; // array parallel to slots: uid | null
  }

  // ----------------------------------------------------------- once-per-X
  usedKey(key) { return this.S.used[key] === true; }
  markUsed(key) { this.S.used[key] = true; }
  roundKey(k) { return `R${this.S.round}|${k}`; }
  stepKey(k) { return `S${this.S.stepSeq}|${k}`; }
  clashKey(k) { return `C${this.S.clashSeq}|${k}`; }

  // ------------------------------------------------------------- resources
  gainInf(pid, n, why) {
    if (n <= 0) return 0;
    this.P(pid).inf += n;
    this.log('gainInf', { pid, n, why });
    return n;
  }
  loseInf(pid, n) {
    const p = this.P(pid);
    const k = Math.min(n, p.inf);
    p.inf -= k;
    return k;
  }
  stealInf(thief, victim, n, why) {
    const k = this.loseInf(victim, n);
    if (k > 0) { this.P(thief).inf += k; this.log('stealInf', { pid: thief, victim, n: k, why }); }
    return k;
  }

  // Hand size
  setHandSize(pid, v) {
    const p = this.P(pid);
    const nv = Math.max(MIN_HAND, Math.min(MAX_HAND, v));
    p.handSize = nv;
    return nv;
  }
  changeHandSize(pid, d) { return this.setHandSize(pid, this.P(pid).handSize + d); }

  handRoom(pid) { return Math.max(0, this.P(pid).handSize - this.zone(this.zk.hand(pid)).length - this.zone(this.zk.bid(pid)).length); }

  // Move a card to its owner's hand, obeying the Hand Size limit (overflow goes on top of the Deck).
  toHand(uid, { force = false } = {}) {
    const c = this.C(uid);
    const pid = c.owner;
    this.leaveHooks(uid);
    if (!force && this.handRoom(pid) <= 0) {
      this.put(uid, this.zk.deck(pid), 'top');
      this.log('overflowToDeck', { pid, card: uid });
      return false;
    }
    this.put(uid, this.zk.hand(pid), 'top');
    return true;
  }

  toDiscard(uid) {
    const c = this.C(uid);
    this.leaveHooks(uid);
    this.put(uid, this.zk.discard(c.owner), 'top');
  }
  toLost(uid) {
    const c = this.C(uid);
    this.leaveHooks(uid);
    this.put(uid, this.zk.lost(c.owner), 'top');
    this.log('toLost', { pid: c.owner, card: uid });
  }
  toDeckTop(uid) { this.leaveHooks(uid); this.put(uid, this.zk.deck(this.C(uid).owner), 'top'); }
  toDeckBottom(uid) { this.leaveHooks(uid); this.put(uid, this.zk.deck(this.C(uid).owner), 'bottom'); }
  burn(uid) {
    this.leaveHooks(uid);
    this.put(uid, 'burned', 'top');
    this.log('burn', { card: uid });
  }

  // Housekeeping when a faction card stops being where it is.
  leaveHooks(uid) {
    const c = this.C(uid);
    if (c.kind !== 'f') return;
    const z = c.z;
    if (z && z.startsWith('R') && z.endsWith(':active')) {
      if (c.inf > 0) c.inf = 0; // Influence on cards is removed when they stop being Active
    }
  }

  // ------------------------------------------------------------ deck/draw
  shuffleZone(key) { this.rng.shuffle(this.zone(key)); }

  // Draw n cards (or until hand is full if upTo). Handles Attrition. Returns count drawn.
  *draw(pid, n, { upTo = false } = {}) {
    let drawn = 0;
    let attrited = false;
    const hand = this.zone(this.zk.hand(pid));
    const deck = this.zone(this.zk.deck(pid));
    let remaining = upTo ? Math.max(0, this.P(pid).handSize - hand.length) : n;
    while (remaining > 0) {
      if (upTo && hand.length >= this.P(pid).handSize) break;
      if (!upTo && this.handRoom(pid) <= 0) break;
      if (deck.length === 0) {
        if (attrited) break;
        attrited = true;
        yield* this.attrition(pid);
        if (deck.length === 0) break;
        // After attrition, draw until the Hand equals the (new) Hand Size.
        remaining = Math.max(0, Math.min(remaining, this.P(pid).handSize - hand.length));
        if (remaining === 0) break;
        continue;
      }
      const uid = deck.shift();
      this.C(uid).z = this.zk.hand(pid);
      hand.unshift(uid);
      drawn++;
      remaining--;
    }
    return drawn;
  }

  *attrition(pid) {
    const p = this.P(pid);
    const discard = this.zone(this.zk.discard(pid));
    const deck = this.zone(this.zk.deck(pid));
    // Shuffle the Discard Pile into a new Deck.
    while (discard.length) { const u = discard.pop(); this.C(u).z = this.zk.deck(pid); deck.push(u); }
    this.rng.shuffle(deck);
    // Mysterious Benefactor may be discarded instead of reducing Hand Size.
    const benefactor = this.zone(this.zk.supply(pid)).map((u) => this.C(u)).find((c) => c.def.key === 'benefactor');
    if (benefactor) {
      this.kdiscardPut(benefactor.uid);
      this.log('attritionBenefactor', { pid });
    } else {
      this.changeHandSize(pid, -1);
      this.log('attrition', { pid, handSize: p.handSize });
    }
    // Over-sized Hand must be discarded down.
    yield* this.enforceHandSize(pid);
  }

  *enforceHandSize(pid) {
    const hand = this.zone(this.zk.hand(pid));
    const excess = Math.min(hand.length, hand.length + this.zone(this.zk.bid(pid)).length - this.P(pid).handSize);
    if (excess > 0) {
      const chosen = yield* this.chooseCards(pid, hand.slice(), {
        purpose: 'discardExcess', prompt: 'p.discardExcess', intent: 'cost', min: excess, max: excess,
      });
      for (const u of chosen) this.toDiscard(u);
    }
  }

  // ----------------------------------------------------------- kingdom deck
  // S.road: 4 face-up spaces [deck-top space, 1, 2, 3]; S.kdeck: face-down remainder (index 0 = top);
  // S.kdiscard: Kingdom Discard Pile.
  kdraw() {
    const S = this.S;
    if (S.kdeck.length === 0 && S.kdiscard.length > 0) {
      while (S.kdiscard.length) { const u = S.kdiscard.pop(); S.cards[u].z = 'kdeck'; S.kdeck.push(u); }
      this.rng.shuffle(S.kdeck);
      this.log('kdeckReshuffle');
    }
    return S.kdeck.length ? S.kdeck.shift() : null;
  }

  // Face-up Kingdom Cards on the Great Road, left to right.
  greatRoadCards() { return this.S.road.filter((u) => u != null); }

  // Cards a player may acquire from the Great Road (Old King's Eye reveals the next two cards of the deck).
  roadChoices(pid) {
    const out = this.greatRoadCards();
    if (this.hasKC(pid, 'eye')) for (const u of this.S.kdeck.slice(0, 2)) out.push(u);
    return out;
  }

  // Remove a card from the Great Road / top of Kingdom Deck.
  takeFromRoad(uid) {
    const S = this.S;
    const i = S.road.indexOf(uid);
    if (i >= 0) S.road[i] = null;
    else removeFrom(S.kdeck, uid);
    this.C(uid).z = null;
  }

  // Fill empty Great Road spaces from the deck, right to left.
  populateRoad() {
    const S = this.S;
    for (let i = 3; i >= 0; i--) {
      if (S.road[i] == null) {
        const u = this.kdraw();
        if (u != null) { S.road[i] = u; this.C(u).z = 'road'; }
      }
    }
  }

  // After bids: discard rightmost card(s), slide the rest right, refill.
  repopulateRoad(nDiscard = 0) {
    const S = this.S;
    for (let k = 0; k < nDiscard; k++) {
      const faceUp = this.greatRoadCards();
      if (!faceUp.length) break;
      const u = faceUp[faceUp.length - 1];
      this.takeFromRoad(u);
      this.kdiscardPut(u);
    }
    const present = S.road.filter((u) => u != null);
    S.road = [null, null, null, null];
    for (let i = 0; i < present.length; i++) S.road[4 - present.length + i] = present[i];
    this.populateRoad();
  }

  kdiscardPut(uid) {
    this.leaveKC(uid);
    this.C(uid).z = 'kdiscard';
    this.C(uid).owner = null;
    this.S.kdiscard.push(uid);
    this.log('kdiscard', { card: uid });
  }
  // Detach a Kingdom Card from wherever it is.
  leaveKC(uid) {
    const c = this.C(uid);
    const z = c.z;
    if (z === 'kdiscard') removeFrom(this.S.kdiscard, uid);
    else if (z === 'kdeck') removeFrom(this.S.kdeck, uid);
    else if (z === 'road') { const i = this.S.road.indexOf(uid); if (i >= 0) this.S.road[i] = null; }
    else if (z) removeFrom(this.zone(z), uid);
    c.z = null;
  }

  // ------------------------------------------------------------ map helpers
  regionOfLoc(loc) { return REGIONS.findIndex((r) => r.locs.includes(loc)); }
  heraldRegion(pid) {
    const l = this.S.herald[pid];
    return l ? this.regionOfLoc(l) : -1;
  }
  supportersOn(region, pid) { return this.S.region[region].sup[pid] || 0; }
  addSup(region, pid, n) {
    const R = this.S.region[region];
    R.sup[pid] = (R.sup[pid] || 0) + n;
    R.fresh[pid] = (R.fresh[pid] || 0) + n;
  }
  removeSup(region, pid, n) {
    const R = this.S.region[region];
    const k = Math.min(n, R.sup[pid] || 0);
    R.sup[pid] = (R.sup[pid] || 0) - k;
    R.fresh[pid] = Math.max(0, Math.min(R.fresh[pid] || 0, R.sup[pid]));
    return k;
  }
  totalSupOnMap(pid) { return this.S.region.reduce((s, R) => s + (R.sup[pid] || 0), 0); }
  activeIn(region) { return this.zone(this.zk.active(region)).slice(); }
  activeOf(pid, region) {
    const regs = region == null ? [0, 1, 2] : [region];
    const out = [];
    for (const r of regs) for (const u of this.zone(this.zk.active(r))) if (this.C(u).owner === pid) out.push(u);
    return out;
  }

  // ----------------------------------------------------------- misc queries
  playerFaction(pid) { return this.P(pid).faction; }
  maxRounds() { return GAME_LENGTHS[this.settings.length || 'standard'] || 5; }
}

export { MIN_HAND, MAX_HAND, START_HAND, SUPPORTERS };

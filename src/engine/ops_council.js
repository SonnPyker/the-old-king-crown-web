// Govern, Journey, Lore & Sites of Power, Councils, Elimination, Location rewards.

import { Game } from './game.js';
import { removeFrom } from './util.js';
import { COUNCILS, LOCATIONS, LOC_IDS, REGIONS } from '../data/constants.js';
import { logicOf, logicById } from './logic/index.js';

Object.assign(Game.prototype, {
  // ------------------------------------------------------------- lore / SoP
  *gainLore(pid, n, why) {
    if (n <= 0) return;
    this.P(pid).lore += n;
    this.log('gainLore', { pid, n, why });
    yield* this.lorePrompt(pid);
  },
  loseLore(pid, n) { const k = Math.min(n, this.P(pid).lore); this.P(pid).lore -= k; return k; },

  affordableSoP(pid) {
    const lore = this.P(pid).lore;
    return this.zone(this.zk.sop(pid)).filter((u) => this.C(u).def.cost <= lore);
  },

  // "Whenever you add Lore to your Supply you may spend it to acquire cards from your Site of Power."
  *lorePrompt(pid) {
    for (;;) {
      const aff = this.affordableSoP(pid);
      if (!aff.length) return;
      const options = aff.map((u) => ({ id: 'c' + u, kind: 'card', uid: u, cost: this.C(u).def.cost }));
      options.push({ id: 'keep', kind: 'none' });
      const [r] = yield* this.select(pid, { purpose: 'spendLore', prompt: 'p.spendLore', options, auto: false, intent: 'good', ctx: { lore: this.P(pid).lore } });
      if (!r || r.kind === 'none') return;
      yield* this.acquireSoP(pid, r.uid);
    }
  },

  *acquireSoP(pid, uid, { free = false } = {}) {
    const c = this.C(uid);
    if (!free) this.P(pid).lore -= c.def.cost;
    this.log('acquireSoP', { pid, card: uid, cost: free ? 0 : c.def.cost });
    removeFrom(this.zone(this.zk.sop(pid)), uid);
    c.z = null;
    if (c.def.type === 'hq') this.put(uid, this.zk.supply(pid), 'top');
    else {
      if (this.handRoom(pid) > 0) this.put(uid, this.zk.hand(pid), 'top');
      else this.put(uid, this.zk.deck(pid), 'top');
    }
    const L = logicOf(c);
    if (L && L.onAcquire) yield* L.onAcquire(this, c, pid);
  },

  // ----------------------------------------------------------------- council
  councilCards(cn, pid = null) {
    const arr = this.zone(this.zk.council(cn)).map((u) => this.C(u));
    return pid == null ? arr : arr.filter((c) => c.owner === pid);
  },
  councilMarkers(cn, pid) {
    const m = this.S.cmark[cn][pid];
    return m ? m.syn + m.bri : 0;
  },
  councilVotes(pid, cn) {
    let v = 0;
    for (const c of this.councilCards(cn, pid)) v += this.view(c.uid).votes;
    const m = this.S.cmark[cn][pid];
    if (m) {
      v += m.syn;
      // Bringer of the Word: while in a Council, each marker on a Council contributes 1 vote to you.
      if (m.bri && this.councilCards('relics', pid).concat(this.councilCards('secrets', pid), this.councilCards('oaths', pid))
        .some((c) => this.logicIds(c).includes('bringer'))) v += m.bri;
    }
    return v;
  },
  totalCouncilVotes(pid) { return COUNCILS.reduce((s, cn) => s + this.councilVotes(pid, cn), 0); },
  hasCardInCouncil(pid, cn = null) {
    return (cn ? [cn] : COUNCILS).some((x) => this.councilCards(x, pid).length > 0);
  },
  addCouncilMarker(pid, cn, kind, n = 1) {
    const m = this.S.cmark[cn][pid] || (this.S.cmark[cn][pid] = { syn: 0, bri: 0 });
    m[kind] += n;
  },

  // Cards that may Govern: faction cards with 1+ votes.
  governable(uids) { return uids.filter((u) => this.C(u).kind === 'f' && this.view(u).votes >= 1); },

  *govern(pid, uid, cn) {
    this.leaveHooks(uid);
    this.put(uid, this.zk.council(cn), 'top');
    this.log('govern', { pid, card: uid, council: cn });
    yield* this.fire('governed', { pid, uid, council: cn });
  },

  // Interactive Govern: choose among `uids` and a Council. Returns uid governed or null.
  *chooseGovern(pid, uids, { optional = true, councils = COUNCILS, purpose = 'govern' } = {}) {
    const cand = this.governable(uids);
    if (!cand.length) return null;
    const uid = yield* this.chooseCard(pid, cand, { purpose, prompt: 'p.governCard', optional, intent: 'good' });
    if (uid == null) return null;
    const cn = yield* this.chooseCouncil(pid, councils, { purpose: 'governCouncil', prompt: 'p.governCouncil', ctx: { card: uid } });
    yield* this.govern(pid, uid, cn);
    return uid;
  },

  // A faction card leaves a Council (default: Discard Pile).
  *removeFromCouncil(uid, { to = 'discard', silent = false } = {}) {
    const c = this.C(uid);
    const pid = c.owner;
    const opts = [{ id: 'discard', kind: 'opt', label: 'discard' }];
    if (this.hasKC(pid, 'airship') || this.hasHQ(pid, 'embassy')) opts.push({ id: 'hand', kind: 'opt', label: 'hand' });
    if (this.logicIds(c).includes('bringer')) opts.push({ id: 'lost', kind: 'opt', label: 'lost' });
    let dest = to;
    if (to === 'discard' && opts.length > 1 && !silent) {
      dest = yield* this.chooseOption(pid, opts, { purpose: 'councilRemove', prompt: 'p.councilRemove', ctx: { card: uid } });
    }
    if (dest === 'hand') this.toHand(uid);
    else if (dest === 'lost') this.toLost(uid);
    else if (dest === 'deckTop') this.toDeckTop(uid);
    else this.toDiscard(uid);
    this.log('councilRemove', { pid, card: uid, to: dest });
  },

  // ----------------------------------------------------------------- journey
  journeyable(uids) { return uids.filter((u) => this.C(u).kind === 'f' && this.view(u).lore >= 1); },

  // Cards that may Journey from the Hand (and Active ones with Adventuring Party).
  journeySources(pid) {
    let src = this.zone(this.zk.hand(pid)).slice();
    if (this.hasKC(pid, 'adventuring')) src = src.concat(this.activeOf(pid));
    return src;
  },

  *journey(pid, uid) {
    const v = this.view(uid);
    let lore = v.lore;
    const path = v.path;
    this.leaveHooks(uid);
    let dest = path ? 'discard' : 'lost';
    if (this.hasKC(pid, 'airship')) {
      const bottom = yield* this.yesNo(pid, 'p.airshipBottom', { purpose: 'airshipJourney', ctx: { card: uid }, intent: 'good' });
      if (bottom) dest = 'bottom';
    }
    if (dest === 'discard') this.toDiscard(uid);
    else if (dest === 'bottom') this.toDeckBottom(uid);
    else this.toLost(uid);
    this.log('journey', { pid, card: uid, lore, dest });
    if (path && this.hasKC(pid, 'caves')) { this.gainInf(pid, 1, 'caves'); lore += 1; }
    yield* this.gainLore(pid, lore, 'journey');
    yield* this.fire('journeyed', { pid, uid });
  },

  // ------------------------------------------------------------ elimination
  // list: [{ uid (target), by (uid|null) }]
  *eliminate(list) {
    const map = new Map();
    for (const { uid, by } of list) {
      const c = this.C(uid);
      if (!c.z || !c.z.endsWith(':active')) continue;
      if (this.view(uid).inv) continue;
      if (!map.has(uid)) map.set(uid, { uid, bys: [], res: this.view(uid).res });
      const v = map.get(uid);
      if (by != null && !v.bys.includes(by)) v.bys.push(by);
    }
    const victims = [...map.values()];
    for (const v of victims) {
      const c = this.C(v.uid);
      this.leaveHooks(v.uid);
      if (v.res) this.toDiscard(v.uid); else this.toLost(v.uid);
      if (this.S.clash) this.S.clash.cards = this.S.clash.cards.filter((x) => x !== v.uid);
      this.log('eliminated', { pid: c.owner, card: v.uid, by: v.bys[0] ?? null, res: v.res });
    }
    // Triggers
    for (const v of victims) {
      const c = this.C(v.uid);
      yield* this.fire('eliminated', { pid: c.owner, uid: v.uid, by: v.bys[0] ?? null });
    }
    const byMap = new Map();
    for (const v of victims) for (const by of v.bys) { if (!byMap.has(by)) byMap.set(by, []); byMap.get(by).push(v.uid); }
    for (const [by, targets] of byMap) {
      yield* this.fire('eliminatedOthers', { pid: this.C(by).owner, by, targets });
    }
    return victims.map((v) => v.uid);
  },

  // --------------------------------------------------------- kingdom's favour
  gainKF(pid) {
    this.S.kf.holder = pid;
    this.S.kf.uses = 3;
    this.log('gainKF', { pid });
  },
  useKFcharge() {
    const kf = this.S.kf;
    kf.uses -= 1;
    if (kf.uses <= 0) { kf.holder = null; kf.uses = 3; this.log('kfReturn'); }
  },

  // ------------------------------------------------------- location rewards
  // opts: { ignoreInf, viaCastle } ; Location Reward only (no Herald reward).
  *claimLocationReward(pid, loc, { ignoreInf = false } = {}) {
    this.log('locReward', { pid, loc });
    if (!ignoreInf) this.gainInf(pid, LOCATIONS[loc].inf, 'location');
    switch (loc) {
      case 'castle': yield* this.castleReward(pid); break;
      case 'wilderness': yield* this.wildernessReward(pid); break;
      case 'harvest': this.gainKF(pid); break;
      case 'shrine': yield* this.shrineReward(pid); break;
      case 'necropolis': yield* this.necropolisReward(pid); break;
      default: break;
    }
    // Merchants' Guild on this Location
    for (const u of this.zone(this.zk.locKC(loc)).slice()) {
      const k = this.C(u);
      if (k.def.key === 'guild' && k.owner != null) this.gainInf(k.owner, 1, 'guild');
    }
    yield* this.fire('locationClaimed', { pid, loc });
  },

  *castleReward(pid) {
    const hand = this.zone(this.zk.hand(pid)).slice();
    const active = this.activeOf(pid);
    const cand = this.governable(hand.concat(active));
    if (!cand.length) return;
    const uid = yield* this.chooseGovern(pid, cand, { purpose: 'castleGovern', optional: true });
    if (uid == null) return;
    const cn = this.C(uid).z.slice(2);
    // Discard all other cards at that Council (and markers).
    for (const o of this.zone(this.zk.council(cn)).slice()) {
      if (o === uid) continue;
      yield* this.removeFromCouncil(o, { to: 'discard' });
    }
    const markers = this.S.cmark[cn];
    for (const p of Object.keys(markers)) delete markers[p];
  },

  *wildernessReward(pid) {
    const cand = this.journeyable(this.zone(this.zk.hand(pid)).concat(this.activeOf(pid)));
    if (!cand.length) return;
    const uid = yield* this.chooseCard(pid, cand, { purpose: 'wildernessJourney', prompt: 'p.journeyCard', optional: true, intent: 'good' });
    if (uid != null) yield* this.journey(pid, uid);
  },

  *shrineReward(pid) {
    const cand = this.zone(this.zk.hand(pid)).concat(this.activeOf(pid));
    if (!cand.length) return;
    const chosen = yield* this.chooseCards(pid, cand, { purpose: 'shrine', prompt: 'p.shrine', min: 0, max: Math.min(3, cand.length), ordered: true, intent: 'neutral' });
    for (const u of chosen) this.toDeckBottom(u);
    if (chosen.length) this.log('shrine', { pid, n: chosen.length });
  },

  *necropolisReward(pid) {
    const disc = this.zone(this.zk.discard(pid));
    this.rng.shuffle(disc);
    let n = Math.min(3, disc.length, this.handRoom(pid));
    while (n-- > 0) { const u = disc.shift(); this.put(u, this.zk.hand(pid), 'top'); }
    this.log('necropolis', { pid });
    const hand = this.zone(this.zk.hand(pid)).slice();
    if (hand.length) {
      const chosen = yield* this.chooseCards(pid, hand, { purpose: 'necropolisDiscard', prompt: 'p.necropolis', min: 0, max: hand.length, intent: 'cost' });
      for (const u of chosen) this.toDiscard(u);
    }
  },

  // Herald reward + Location reward for the winner of a Clash in `region`.
  *claimClashRewards(pid, region) {
    const locs = REGIONS[region].locs;
    const loc = yield* this.chooseLoc(pid, locs, { purpose: 'rewardLoc', prompt: 'p.chooseLoc', intent: 'good', ctx: { region } });
    this.log('chooseLoc', { pid, loc });
    // Herald reward
    if (this.S.herald[pid] === loc) {
      this.gainInf(pid, 1, 'herald');
      for (const o of this.opponents(pid)) if (this.S.herald[o] === loc) this.stealInf(pid, o, 1, 'herald');
      // Council of Relics
      const cards = this.councilCards('relics', pid);
      const marks = this.S.cmark.relics[pid];
      if (cards.length || (marks && (marks.syn + marks.bri))) {
        const chosen = yield* this.chooseCards(pid, cards.map((c) => c.uid), { purpose: 'relics', prompt: 'p.relics', min: 0, max: cards.length, intent: 'good' });
        let gain = 0;
        for (const u of chosen) { gain += this.view(u).votes; yield* this.removeFromCouncil(u, { to: 'discard' }); }
        if (marks && marks.syn + marks.bri > 0) {
          const total = this.councilVotes(pid, 'relics');
          const mv = marks.syn + (marks.bri && this.councilCards('relics', pid).concat(this.councilCards('secrets', pid), this.councilCards('oaths', pid)).some((c) => this.logicIds(c).includes('bringer')) ? marks.bri : 0);
          if (mv > 0 && (yield* this.yesNo(pid, 'p.relicsMarkers', { purpose: 'relicsMarkers', ctx: { n: mv } }))) {
            gain += mv; marks.syn = 0; marks.bri = 0;
          }
          void total;
        }
        if (gain > 0) this.gainInf(pid, gain, 'relics');
      }
    }
    yield* this.claimLocationReward(pid, loc);
    return loc;
  },
});

export { LOC_IDS };

// Spring: bids, the Great Road, Heralds, face-down cards and the Spring Action Step.

import { Game } from './game.js';
import { LOC_IDS } from '../data/constants.js';

Object.assign(Game.prototype, {
  // Printed Strength of a Bidding card plus modifiers that apply to Bids (White Watchtowers).
  bidStrengthOf(pid, uid) {
    return this.C(uid).def.str + (this.hasKC(pid, 'watchtowers') ? 5 : 0);
  },

  // Strength of an Occupying card when someone tries to steal its Kingdom Card.
  occupierStrength(owner, occUid, stealerBid) {
    const champ = this.C(stealerBid).def.logic === 'champion';
    return (champ ? 0 : this.C(occUid).def.str) + (this.hasKC(owner, 'watchtowers') ? 5 : 0);
  },

  *placeBids() {
    this.S.bidsOpen = false;
    for (const pid of this.S.order) {
      const hand = this.zone(this.zk.hand(pid)).slice();
      if (!hand.length) continue;
      const u = yield* this.chooseCard(pid, hand, { purpose: 'bid', prompt: 'p.bid', intent: 'neutral', ctx: { hidden: true } });
      this.put(u, this.zk.bid(pid), 'top');
    }
    this.log('bidsPlaced', {});
  },

  *resolveBids() {
    const S = this.S;
    const bids = {};
    for (const pid of S.order) { const z = this.zone(this.zk.bid(pid)); if (z.length) bids[pid] = z[0]; }
    const pids = Object.keys(bids).map(Number);
    if (!pids.length) { this.repopulateRoad(2); return; }
    const str = {};
    for (const pid of pids) str[pid] = this.bidStrengthOf(pid, bids[pid]);
    this.S.bidsOpen = true;
    this.log('bidsRevealed', { bids: { ...bids }, str: { ...str } });

    // Royal Seal: opponents' total Bidding Strength becomes 0.
    const sealed = new Set();
    for (const pid of S.order) {
      const t = S.tactics[pid].find((x) => x.id === 'royal_seal' && !x.exhausted && !x.burned);
      if (!t) continue;
      if (!this.opponents(pid).some((o) => (str[o] || 0) > 0)) continue;
      if (yield* this.yesNo(pid, 'p.royalSeal', { purpose: 'royalSeal', intent: 'good' })) {
        t.exhausted = true;
        for (const o of this.opponents(pid)) if (str[o] != null) { str[o] = 0; sealed.add(o); }
        this.log('royalSeal', { pid });
      }
    }

    const sorted = pids.slice().sort((a, b) => (str[b] - str[a]) || (this.orderIndex(a) - this.orderIndex(b)));
    let taken = 0;
    let first = true;
    for (const pid of sorted) {
      const bid = bids[pid];
      if (this.C(bid).z !== this.zk.bid(pid)) continue;
      if (first) {
        first = false;
        if (this.hasKC(pid, 'watchtowers')) this.gainInf(pid, 1, 'watchtowers');
      }
      const options = [];
      for (const k of this.roadChoices(pid)) options.push({ id: 'road:' + k, kind: 'road', kc: k });
      if (!this.hasKC(pid, 'watchtowers')) {
        const mine = str[pid] + (!sealed.has(pid) && this.hasKC(pid, 'brigands') ? 3 : 0);
        for (const o of this.opponents(pid)) {
          for (const b of this.boardKCs(o)) {
            if (b.occ == null) continue;
            const need = this.occupierStrength(o, b.occ, bid);
            if (mine > need) options.push({ id: 'steal:' + b.kc, kind: 'steal', kc: b.kc, owner: o, need });
          }
        }
      }
      options.push({ id: 'return', kind: 'return' });
      const [r] = yield* this.select(pid, {
        purpose: 'bidResolve', prompt: 'p.bidResolve', options, auto: false, intent: 'good',
        ctx: { bid, strength: str[pid] },
      });
      if (r.kind === 'road') {
        if (S.road.includes(r.kc)) taken++;
        yield* this.gainKC(pid, r.kc, { occupant: bid, bidCard: bid });
      } else if (r.kind === 'steal') {
        yield* this.stealKC(pid, r.kc, bid);
      } else {
        this.toHand(bid, { force: true });
        this.log('bidReturn', { pid });
      }
    }
    // Any leftover Bidding cards (should not happen) go back to Hand.
    for (const pid of S.order) for (const u of this.zone(this.zk.bid(pid)).slice()) this.toHand(u, { force: true });
    this.repopulateRoad(taken > 0 ? 1 : 2);
    this.S.bidsOpen = false;
    this.log('roadRepopulated', { taken });
  },

  *placeHeralds() {
    for (const pid of this.S.order) {
      const loc = yield* this.chooseLoc(pid, LOC_IDS, { purpose: 'herald', prompt: 'p.placeHerald', intent: 'good' });
      this.S.herald[pid] = loc;
      this.log('placeHerald', { pid, loc });
    }
  },

  *placeFaceDown() {
    const order = this.S.order.slice().sort((a, b) => (this.zone(this.zk.hand(a)).length < 3 ? 0 : 1) - (this.zone(this.zk.hand(b)).length < 3 ? 0 : 1));
    for (const pid of order) {
      const hand = this.zone(this.zk.hand(pid)).slice();
      if (!hand.length) continue;
      const slots = [0, 1, 2].map((r) => ({ id: 'r' + r, region: r }));
      const res = yield* this.assign(pid, { purpose: 'faceDown', prompt: 'p.faceDown', cards: hand, slots, exact: true, ctx: { hidden: true } });
      res.forEach((u, r) => { if (u != null) this.put(u, this.zk.down(r), 'top'); });
      this.log('placeFaceDown', { pid, n: res.filter((u) => u != null).length });
    }
  },

  *springPhase() {
    this.S.phase = 'spring';
    this.log('phase', { phase: 'spring' });
    yield* this.placeBids();
    yield* this.resolveBids();
    yield* this.placeHeralds();
    yield* this.placeFaceDown();
    this.log('step', { step: 'spring' });
    for (const pid of this.S.order) yield* this.actionStep(pid, 'spring');
  },
});

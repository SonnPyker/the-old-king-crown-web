// Summer: resolving the Clash in a Region (reveal, Day, Night, tally, ties, rewards).

import { Game } from './game.js';
import { logicById } from './logic/index.js';

Object.assign(Game.prototype, {
  turnOrderOf(list) { return this.S.order.filter((p) => list.includes(p)); },

  // Active cards in the current Clash.
  clashCards() {
    const cl = this.S.clash;
    if (!cl) return [];
    const z = this.zk.active(cl.region);
    return cl.cards.filter((u) => this.C(u).z === z);
  },
  syncClash() {
    const cl = this.S.clash;
    if (cl) cl.cards = this.clashCards();
  },

  hasClashedIn(uid, region) {
    const c = this.C(uid);
    return !!c.clashedAt && c.clashedAt.round === this.S.round && c.clashedAt.region === region;
  },

  // Active cards in `region` that may take part in a new Clash between `participants`.
  eligibleCards(region, participants) {
    return this.zone(this.zk.active(region)).filter((u) => participants.includes(this.C(u).owner) && !this.hasClashedIn(u, region));
  },

  // Bring a card that has just become Active in the current Region into the Clash.
  joinClash(uid) {
    const cl = this.S.clash;
    if (!cl) return;
    const c = this.C(uid);
    if (c.z !== this.zk.active(cl.region) || !cl.participants.includes(c.owner) || this.hasClashedIn(uid, cl.region)) return;
    if (!cl.cards.includes(uid)) cl.cards.push(uid);
  },

  // Total Strength of every participant in the current Clash.
  clashTotals() {
    const cl = this.S.clash;
    const out = {};
    if (!cl) return out;
    const r = cl.region;
    for (const pid of cl.participants) {
      let t = 0;
      for (const u of this.clashCards()) if (this.C(u).owner === pid) t += this.view(u).str;
      const fresh = this.S.region[r].fresh[pid] || 0;
      t += fresh * (this.hasFx(pid, 'stones') ? 2 : 1);
      t += cl.extra[pid] || 0;
      out[pid] = t;
    }
    // Ruined Citadel: all opponents' total Strength in this Region is halved (rounded up).
    for (const u of this.zone(this.zk.regKC(r))) {
      const k = this.C(u);
      if (k.def.key !== 'citadel' || k.owner == null) continue;
      for (const p of cl.participants) if (p !== k.owner) out[p] = Math.ceil(out[p] / 2);
    }
    return out;
  },

  // Night Effects Step: Deadly and Effects, all simultaneous.
  *nightStep() {
    const cl = this.S.clash;
    const kills = [];
    const afters = [];
    const cards = this.clashCards();
    for (const u of cards) {
      const c = this.C(u);
      if (this.view(u).cmds.some((x) => x.c === 'deadly' && x.step === 'night')) {
        for (const o of cards) if (this.C(o).owner !== c.owner) kills.push({ uid: o, by: u });
      }
      for (const id of new Set(this.logicIds(c))) {
        const L = logicById(id);
        if (L && L.night) {
          const res = L.night(this, c, cl);
          if (res) { kills.push(...res.kills); if (res.after) afters.push(res); }
        }
      }
    }
    for (const pid of cl.participants) {
      for (const s of this.sourcesOf(pid)) {
        if (s.card.kind === 'k' && s.logic.night) {
          const res = s.logic.night(this, s.card, cl, pid);
          if (res) { kills.push(...res.kills); if (res.after) afters.push(res); }
        }
      }
    }
    if (!kills.length && !afters.length) return;
    const victims = yield* this.eliminate(kills);
    for (const res of afters) yield* res.after(victims);
  },

  // Cracked Sundial: skip the Day and Night Steps in this Region.
  regionSundial(r) { return this.zone(this.zk.regKC(r)).some((u) => this.C(u).def.key === 'sundial'); },

  *stormsBonus(r) {
    for (const pid of this.S.order) {
      if (!this.hasFx(pid, 'storms')) continue;
      const sup = this.supportersOn(r, pid);
      const mostSup = sup > 0 && this.opponents(pid).every((o) => this.supportersOn(r, o) < sup);
      const act = this.activeOf(pid, r).length;
      const mostAct = act > 0 && this.opponents(pid).every((o) => this.activeOf(o, r).length < act);
      if (mostSup) this.gainInf(pid, 1, 'storms');
      if (mostAct) yield* this.gainLore(pid, 1, 'storms');
    }
  },

  // Resolve one Region: one or more Clashes, then rewards for the winner.
  *resolveRegion(r) {
    const S = this.S;
    let participants = S.order.slice();
    let n = 0;
    let winner = null;
    for (;;) {
      n++;
      S.clashSeq++;
      const sundial = this.regionSundial(r);
      const cl = (S.clash = { region: r, seq: S.clashSeq, n, participants, cards: [], pending: [], extra: {}, sundial });

      // A. Reveal face-down cards.
      const down = this.zone(this.zk.down(r)).slice();
      for (const u of down) this.put(u, this.zk.active(r), 'top');
      cl.cards = this.eligibleCards(r, participants);
      this.log('clashStart', { region: r, n, participants: participants.slice(), revealed: down });

      if (!sundial) {
        // B. Day Action Step.
        for (const pid of this.turnOrderOf(participants)) yield* this.actionStep(pid, 'day');
        while (cl.pending.length) {
          const rev = cl.pending.splice(0).filter((u) => this.C(u).z === this.zk.down(r));
          for (const u of rev) this.put(u, this.zk.active(r), 'top');
          for (const u of rev) this.joinClash(u);
          this.log('ambushReveal', { region: r, cards: rev });
          for (const pid of this.turnOrderOf(participants)) yield* this.actionStep(pid, 'day', { only: rev });
        }
        // C. Night Effects Step.
        yield* this.nightStep();
      }

      // D. Tally Strength & declare an outcome.
      const totals = this.clashTotals();
      this.log('clashTally', { region: r, n, totals: { ...totals } });
      for (const u of this.clashCards()) this.C(u).clashedAt = { round: S.round, region: r };
      for (const p of participants) S.region[r].fresh[p] = 0;

      const eye = this.clashCards().some((u) => this.logicIds(this.C(u)).includes('eye'));
      let winners;
      if (eye) {
        const pos = participants.filter((p) => (totals[p] || 0) > 0);
        if (pos.length) {
          const best = Math.min(...pos.map((p) => totals[p]));
          winners = pos.filter((p) => totals[p] === best);
        } else winners = participants.slice();
      } else {
        const best = Math.max(...participants.map((p) => totals[p] || 0));
        winners = participants.filter((p) => (totals[p] || 0) === best);
      }
      if (winners.length === 1) { winner = winners[0]; break; }

      // Tied: the tied players, in turn order, may play a card face-down to begin a new Clash.
      const tied = this.turnOrderOf(winners);
      let placed = 0;
      for (const pid of tied) {
        const hand = this.zone(this.zk.hand(pid)).slice();
        if (!hand.length) continue;
        const options = hand.map((u) => ({ id: 'c' + u, kind: 'card', uid: u }));
        options.push({ id: 'pass', kind: 'pass' });
        const [sel] = yield* this.select(pid, { purpose: 'tieCard', prompt: 'p.tieCard', options, auto: false, intent: 'neutral', ctx: { region: r, hidden: true, total: totals[pid] } });
        if (sel && sel.kind === 'card') { this.put(sel.uid, this.zk.down(r), 'top'); placed++; }
      }
      this.log('tie', { region: r, tied, placed });
      if (!placed) { winner = null; break; }
      participants = tied;
    }

    S.clash = null;
    yield* this.stormsBonus(r);
    if (winner != null) {
      this.log('clashWon', { pid: winner, region: r });
      yield* this.fire('clashWon', { pid: winner, region: r });
      yield* this.claimClashRewards(winner, r);
    } else {
      this.log('clashTie', { region: r });
    }
    S.resolved[r] = true;
  },
});

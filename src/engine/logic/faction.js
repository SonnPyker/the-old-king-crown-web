// Rules logic for Faction Cards (basic specials, Advanced cards and HQ cards).
//
// Shape: {
//   zones: ['active'|'council']       where passive/triggered/action logic is live (HQ cards are always live in Supply)
//   grant(g, card, target, view)      static modifications to cards of the same owner
//   night(g, card, clash)             -> { kills:[{uid,by}], after?: function*(victims) }
//   actions: [{ key, step, zones, inClash, can(g,card,pid), *run(g,card,pid) }]
//   on: { event: function*(g, card, ev, pid) }
//   onAcquire: function*(g, card, pid)
// }

import { COUNCILS } from '../../data/constants.js';

const regionOfActive = (c) => (c.z && c.z.endsWith(':active') ? +c.z[1] : -1);
const oppCardsInClash = (g, cl, pid) => cl.cards.map((u) => g.C(u)).filter((c) => c.owner !== pid && c.z && c.z.endsWith(':active'));

export const FACTION_LOGIC = {
  ruse: { zones: ['active'] },
  champion: { zones: ['active'], stealOverride: true },

  // Basic Agent: Night effect - Eliminate itself if an opponent Follower is Active in the Clash.
  agent: {
    zones: ['active'],
    night(g, c, cl) {
      const hit = oppCardsInClash(g, cl, c.owner).some((o) => g.view(o.uid).arch === 'follower');
      return hit ? { kills: [{ uid: c.uid, by: null }] } : null;
    },
  },

  // ---------------------------------------------------------------- Nobility
  highCourt: {
    zones: ['council'],
    actions: [{
      key: 'move', step: 'autumn', zones: ['council'],
      can: (g, c) => c.z && c.z.startsWith('C:'),
      *run(g, c, pid) {
        const cur = c.z.slice(2);
        const cn = yield* g.chooseCouncil(pid, COUNCILS.filter((x) => x !== cur), { purpose: 'highCourt', prompt: 'p.governCouncil', ctx: { card: c.uid } });
        g.put(c.uid, g.zk.council(cn), 'top');
        g.log('councilMove', { pid, card: c.uid, council: cn });
      },
    }],
  },

  queen: {
    zones: ['active'],
    *onAcquire(g, c, pid) {
      const used = [];
      const taken = [];
      for (let i = 0; i < 3; i++) {
        const pool = g.zone(g.zk.lost(pid)).concat(g.zone(g.zk.discard(pid))).filter((u) => !taken.includes(u));
        const cand = g.governable(pool);
        const councils = COUNCILS.filter((x) => !used.includes(x));
        if (!cand.length || !councils.length) break;
        const uid = yield* g.chooseCard(pid, cand, { purpose: 'queenGovern', prompt: 'p.queenGovern', optional: true, intent: 'good' });
        if (uid == null) break;
        const cn = yield* g.chooseCouncil(pid, councils, { purpose: 'governCouncil', prompt: 'p.governCouncil', ctx: { card: uid } });
        taken.push(uid); used.push(cn);
        yield* g.govern(pid, uid, cn);
      }
    },
  },

  gildedWall: {
    zones: ['active'],
    actions: [{
      key: 'inf', step: 'autumn', zones: ['active'],
      can: (g, c, pid) => { const r = regionOfActive(c); return r >= 0 && g.supportersOn(r, pid) >= 2; },
      *run(g, c) { c.inf += 1; g.log('placeInfOnCard', { card: c.uid }); },
    }],
  },

  royalBank: {
    grant(g, src, tgt, v) { if (tgt.kind === 'f' && v.printedVotes === 0) v.votes += 1; },
    actions: [{
      key: 'bank', step: 'autumn',
      can: () => true,
      *run(g, c, pid) {
        const caps = g.zone(g.zk.discard(pid)).filter((u) => g.C(u).def.arch === 'captain');
        const canCap = caps.length > 0;
        let doCap = false; let doInf = false;
        const opts = [{ id: 'inf', kind: 'opt', label: 'inf' }];
        if (canCap) opts.push({ id: 'cap', kind: 'opt', label: 'captain' });
        const pick = opts.length > 1 ? yield* g.chooseOption(pid, opts, { purpose: 'royalBank', prompt: 'p.royalBank' }) : 'inf';
        if (pick === 'inf') doInf = true; else doCap = true;
        if (!g.isFirst(pid)) {
          if (pick === 'inf' && canCap && (yield* g.yesNo(pid, 'p.royalBankBoth', { purpose: 'royalBankBoth' }))) doCap = true;
          else if (pick === 'cap' && (yield* g.yesNo(pid, 'p.royalBankBoth2', { purpose: 'royalBankBoth' }))) doInf = true;
        }
        if (doInf) g.gainInf(pid, 1, 'royalBank');
        if (doCap) {
          const u = yield* g.chooseCard(pid, caps, { purpose: 'royalBankCaptain', prompt: 'p.pickCard', intent: 'good' });
          if (u != null) g.toHand(u);
        }
      },
    }],
  },

  // ---------------------------------------------------------------- Uprising
  blackPowder: {
    zones: ['active'],
    night(g, c, cl) {
      const targets = oppCardsInClash(g, cl, c.owner).filter((o) => { const a = g.view(o.uid).arch; return a === 'heir' || a === 'captain'; });
      if (!targets.length) return null;
      const uids = targets.map((t) => t.uid);
      return {
        kills: uids.map((u) => ({ uid: u, by: c.uid })),
        *after(victims) {
          if (!uids.some((u) => victims.includes(u))) return;
          const pick = yield* g.chooseOption(c.owner, [{ id: 'inf', kind: 'opt', label: 'inf' }, { id: 'lore', kind: 'opt', label: 'lore' }], { purpose: 'blackPowder', prompt: 'p.blackPowder' });
          if (pick === 'inf') g.gainInf(c.owner, 1, 'blackPowder'); else yield* g.gainLore(c.owner, 1, 'blackPowder');
        },
      };
    },
  },

  guerrilla: {
    zones: ['active'],
    night(g, c, cl) {
      const hit = oppCardsInClash(g, cl, c.owner).some((o) => g.view(o.uid).arch === 'heir');
      return hit ? { kills: [{ uid: c.uid, by: null }] } : null;
    },
  },

  moonshine: {
    actions: [{
      key: 'acquire', step: 'autumn',
      can: (g, c, pid) => g.roadChoices(pid).length > 0
        && g.zone(g.zk.hand(pid)).some((u) => ['captain', 'champion'].includes(g.view(u).arch)),
      *run(g, c, pid) {
        const kcs = g.roadChoices(pid);
        const k = yield* g.chooseCard(pid, kcs, { purpose: 'moonshineKC', prompt: 'p.pickKC', intent: 'good', ctx: { kc: true } });
        if (k == null) return;
        const hand = g.zone(g.zk.hand(pid)).filter((u) => ['captain', 'champion'].includes(g.view(u).arch));
        // Occupy kinds keep the card on the Kingdom Card; bold kinds discard it as the bidding card.
        const prompt = g.C(k).def.kind === 'occupy' ? 'p.pickOccupant' : 'p.pickBidding';
        const occ = yield* g.chooseCard(pid, hand, { purpose: 'moonshineOcc', prompt, intent: 'cost' });
        if (occ == null) return;
        yield* g.gainKC(pid, k, { occupant: occ, bidCard: occ, onlySlot: 2 });
        g.repopulateRoad(0);
      },
    }],
  },

  syndicate: {
    on: {
      *kcAcquired(g, c, ev, pid) {
        if (ev.pid !== pid) return;
        const cn = g.C(ev.kc).def.suit;
        const m = g.S.cmark[cn][pid] || (g.S.cmark[cn][pid] = { syn: 0, bri: 0 });
        if (m.syn < 2) { m.syn += 1; g.log('syndicateMarker', { pid, council: cn }); }
      },
    },
  },

  // ------------------------------------------------------------------- Clans
  raidRaze: {
    zones: ['active'],
    on: {
      *flanked(g, c, ev, pid) {
        if (ev.uid !== c.uid) return;
        const n = g.supportersOn(ev.from, pid);
        if (n <= 0) return;
        const k = yield* g.chooseNumber(pid, 0, n, { purpose: 'raidRaze', prompt: 'p.raidRaze', ctx: { from: ev.from, to: ev.to } });
        if (k > 0) { g.removeSup(ev.from, pid, k); g.addSup(ev.to, pid, k); g.log('moveSup', { pid, n: k, from: ev.from, to: ev.to }); }
      },
    },
  },

  riders: {
    zones: ['active'],
    on: {
      *clashWon(g, c, ev, pid) {
        if (ev.pid === pid && regionOfActive(c) === ev.region) g.gainInf(pid, 1, 'riders');
      },
    },
  },

  newHavens: {
    grant(g, src, tgt, v) { if (tgt.kind === 'f') v.res = true; },
    actions: [{
      key: 'supporters', step: 'spring',
      can: (g, c, pid) => g.P(pid).lostSup > 0,
      *run(g, c, pid) {
        const r = yield* g.chooseRegion(pid, [0, 1, 2], { purpose: 'newHavens', prompt: 'p.supportersRegion' });
        const k = yield* g.chooseNumber(pid, 1, Math.min(2, g.P(pid).lostSup), { purpose: 'newHavensN', prompt: 'p.howMany' });
        g.P(pid).lostSup -= k;
        g.addSup(r, pid, k);
        g.log('placeSup', { pid, region: r, n: k, from: 'lost' });
      },
    }],
  },

  embassy: {
    grant(g, src, tgt, v) {
      if (tgt.kind === 'f' && v.arch === 'trader') v.cmds.push({ c: 'flank', step: 'day' });
    },
    actions: [{
      key: 'council', step: 'day',
      can: (g, c, pid) => g.activeOf(pid).some((u) => g.hasCmd(u, 'flank', 'day')),
      *run(g, c, pid) {
        const cand = g.activeOf(pid).filter((u) => g.hasCmd(u, 'flank', 'day'));
        const chosen = yield* g.chooseCards(pid, cand, { purpose: 'embassy', prompt: 'p.embassy', min: 1, max: cand.length, intent: 'good' });
        if (!chosen.length) return;
        const cn = yield* g.chooseCouncil(pid, COUNCILS, { purpose: 'governCouncil', prompt: 'p.governCouncil' });
        for (const u of chosen) { g.leaveHooks(u); g.put(u, g.zk.council(cn), 'top'); g.log('toCouncil', { pid, card: u, council: cn }); }
        g.syncClash();
      },
    }],
  },

  // --------------------------------------------------------------- Gathering
  bringer: {
    zones: ['council'],
    actions: [{
      key: 'marker', step: 'autumn', zones: ['council'],
      can: (g, c) => c.z && c.z.startsWith('C:'),
      *run(g, c, pid) {
        const cn = yield* g.chooseCouncil(pid, COUNCILS, { purpose: 'bringerMarker', prompt: 'p.markerCouncil' });
        g.addCouncilMarker(pid, cn, 'bri', 1);
        g.log('councilMarker', { pid, council: cn });
      },
    }],
  },

  tooth: {
    zones: ['active'],
    actions: [{
      key: 'burn', step: 'day', zones: ['active'], inClash: true,
      can: (g, c, pid) => g.zone(g.zk.lost(pid)).some((u) => g.C(u).kind === 'f'),
      *run(g, c, pid) {
        const pool = g.zone(g.zk.lost(pid)).filter((u) => g.C(u).kind === 'f');
        const u = yield* g.chooseCard(pid, pool, { purpose: 'tooth', prompt: 'p.tooth', intent: 'cost' });
        if (u == null) return;
        const def = g.C(u).def;
        g.burn(u);
        g.addGain(c.uid, { kind: 'copy', def, round: g.S.round });
      },
    }],
  },
  eye: { zones: ['active'] },

  door: {
    *onAcquire(g, c, pid) { g.S.door[pid] = 3; },
    actions: [{
      key: 'ambush', step: 'day',
      can: (g, c, pid) => (g.S.door[pid] || 0) > 0 && g.activeOf(pid).some((u) => g.S.clash && g.S.clash.cards.includes(u)),
      *run(g, c, pid) {
        const cl = g.S.clash;
        const cand = g.activeOf(pid).filter((u) => cl.cards.includes(u));
        const u = yield* g.chooseCard(pid, cand, { purpose: 'doorCard', prompt: 'p.doorCard', intent: 'good' });
        if (u == null) return;
        g.S.door[pid] -= 1;
        let fromDiscard = false;
        if (g.S.door[pid] > 0 && g.zone(g.zk.discard(pid)).length) {
          if (yield* g.yesNo(pid, 'p.doorExtra', { purpose: 'doorExtra' })) { g.S.door[pid] -= 1; fromDiscard = true; }
        }
        g.addGain(u, { kind: 'cmd', cmd: { c: 'ambush', step: 'day', fromDiscard }, round: g.S.round });
        g.log('doorAmbush', { pid, card: u, fromDiscard });
      },
    }],
  },
};

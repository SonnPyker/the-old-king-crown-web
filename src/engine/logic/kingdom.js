// Rules logic for the 51 Kingdom Cards, keyed by def.key.
//
// Shape: {
//   grant(g, kc, target, view)      static grants to the owner's Faction Cards (late:true runs after the others)
//   actions: [{ key, step, can(g,kc,pid), *run(g,kc,pid) }]
//   on: { event: function*(g, kc, ev, pid) }
//   night(g, kc, clash, pid)        -> { kills, after? }
//   winter: function*(g, kc, pid)
//   onGain / onLose: function*(g, kc, pid)
//   instant: function*(g, kc, pid)  (bold acquisition resolved immediately)
// }

import { COUNCILS, LOC_IDS, REGIONS } from '../../data/constants.js';

const regionOfKC = (k) => (k.z && /^R\d:kc$/.test(k.z) ? +k.z[1] : -1);

// Discard a Kingdom Card together with its Occupying card (which goes to the Discard Pile).
function* discardWithOccupant(g, k) {
  const slot = g.slotOfKC(k.uid);
  if (slot >= 0) { const occ = g.occAt(k.owner, slot); if (occ != null) g.toDiscard(occ); }
  yield* g.discardKC(k.uid);
}

const ownInClash = (g, pid) => g.clashCards().filter((u) => g.C(u).owner === pid);
const inClashOk = (g, pid) => !!g.S.clash && ownInClash(g, pid).length > 0;
const clashGain = (g, u, gain) => g.addGain(u, { ...gain, clash: g.S.clash.seq });

// Own cards that can be swapped with a Hand card: in a Council or Occupying a Kingdom Card.
function swapTargets(g, pid) {
  const out = [];
  for (const cn of COUNCILS) for (const c of g.councilCards(cn, pid)) out.push(c.uid);
  for (let i = 0; i < 3; i++) { const o = g.occAt(pid, i); if (o != null && g.C(o).owner === pid) out.push(o); }
  return out;
}

function* clockworkSwap(g, k, pid) {
  const hand = g.zone(g.zk.hand(pid)).slice();
  const tg = swapTargets(g, pid);
  const t = yield* g.chooseCard(pid, tg, { purpose: 'swapTarget', prompt: 'p.swapTarget', intent: 'neutral' });
  if (t == null) return;
  const h = yield* g.chooseCard(pid, hand, { purpose: 'swapHand', prompt: 'p.swapHand', intent: 'neutral' });
  if (h == null) return;
  g.swapCards(h, t);
  g.log('swap', { pid, a: h, b: t });
}

export const KC_LOGIC = {
  // ============================================================ RELICS
  adventuring: {
    grant(g, k, tgt, v) { if (tgt.kind === 'f') v.path = true; },
  },

  monument: {
    actions: [{
      key: 'inf', step: 'spring',
      can: (g, k, pid) => g.hasCardInCouncil(pid),
      *run(g, k, pid) {
        g.gainInf(pid, 1, 'monument');
        if (COUNCILS.every((cn) => g.hasCardInCouncil(pid, cn))) {
          if (yield* g.yesNo(pid, 'p.monumentBonus', { purpose: 'monument', intent: 'good' })) {
            g.gainInf(pid, 2, 'monument');
            yield* g.discardKC(k.uid);
          }
        }
      },
    }],
  },

  tincrowns: {
    grant(g, k, tgt, v) {
      if (tgt.kind === 'f' && v.arch === 'follower') v.votes += g.isFirst(k.owner) ? 1 : 2;
    },
  },

  benefactor: {},
  watchtowers: {},

  palace: {
    actions: [{
      key: 'burn', step: 'spring',
      can: (g, k, pid) => g.S.tactics[pid].some((t) => !t.burned),
      *run(g, k, pid) {
        const list = g.S.tactics[pid].filter((t) => !t.burned);
        const options = list.map((t) => ({ id: 't:' + t.id, kind: 'tactic', tid: t.id, pid }));
        const [r] = yield* g.select(pid, { purpose: 'palaceTactic', prompt: 'p.palace', options, intent: 'cost' });
        const t = list.find((x) => x.id === r.tid);
        const wasUnex = !t.exhausted;
        t.burned = true;
        g.log('burnTactic', { pid, tid: t.id });
        yield* g.gainLore(pid, wasUnex ? 3 : 1, 'palace');
      },
    }],
  },

  beacon: {
    *instant(g, k, pid) {
      const sop = g.zone(g.zk.sop(pid)).map((u) => g.C(u));
      if (!sop.length) return;
      const low = Math.min(...sop.map((c) => c.def.cost));
      const cand = sop.filter((c) => c.def.cost === low).map((c) => c.uid);
      const u = yield* g.chooseCard(pid, cand, { purpose: 'beacon', prompt: 'p.beacon', intent: 'good' });
      if (u != null) yield* g.acquireSoP(pid, u, { free: true });
    },
  },

  library: {
    grant(g, k, tgt, v) { if (tgt.kind === 'f' && v.printedLore === 1) v.lore += 1; },
  },

  brigands: {},

  court: {
    actions: [{
      key: 'govern', step: 'autumn',
      can: (g, k, pid) => { const r = regionOfKC(k); return r >= 0 && g.governable(g.activeOf(pid, r)).length > 0; },
      *run(g, k, pid) {
        const r = regionOfKC(k);
        yield* g.chooseGovern(pid, g.activeOf(pid, r), { optional: false, purpose: 'courtGovern' });
      },
    }],
  },

  guild: {},
  caves: {},

  bothies: {
    actions: [{
      key: 'gain', step: 'spring', can: () => true,
      *run(g, k, pid) {
        if (g.P(pid).lore === 0) g.gainInf(pid, 1, 'bothies'); else yield* g.gainLore(pid, 1, 'bothies');
      },
    }],
  },

  pardons: {
    actions: [{
      key: 'pardon', step: 'spring',
      can: (g, k, pid) => g.zone(g.zk.discard(pid)).length > 0,
      *run(g, k, pid) {
        const u = yield* g.chooseCard(pid, g.zone(g.zk.discard(pid)).slice(), { purpose: 'pardon', prompt: 'p.pickDiscard', intent: 'good' });
        if (u != null) g.toHand(u);
      },
    }],
  },

  splendid: {},

  estate: {
    actions: [{
      key: 'estate', step: 'autumn',
      can: (g, k, pid) => g.hasCardInCouncil(pid),
      *run(g, k, pid) {
        const mine = COUNCILS.flatMap((cn) => g.councilCards(cn, pid).map((c) => c.uid));
        const u = yield* g.chooseCard(pid, mine, { purpose: 'estate', prompt: 'p.estate', intent: 'cost' });
        if (u == null) return;
        const cn = g.C(u).z.slice(2);
        yield* g.removeFromCouncil(u, { to: 'discard' });
        yield* g.syndicateMarkers(pid, cn);
        g.changeHandSize(pid, +1);
        yield* g.discardKC(k.uid);
      },
    }],
  },

  signet: {
    *onGain(g, k, pid) { g.changeHandSize(pid, +1); },
    *onLose(g, k, pid) { g.changeHandSize(pid, -1); yield* g.enforceHandSize(pid); },
    on: {
      *clashWon(g, k, ev, pid) {
        if (ev.pid !== pid) return;
        if (g.activeOf(pid, ev.region).some((u) => g.view(u).arch === 'heir')) g.gainInf(pid, 1, 'signet');
      },
    },
  },

  // ============================================================ SECRETS
  airship: {},

  rumours: {
    actions: [{
      key: 'rumours', step: 'spring', can: () => true,
      *run(g, k, pid) {
        const who = yield* g.choosePlayers(pid, g.S.order.slice(), { purpose: 'rumours', prompt: 'p.rumours', min: 0 });
        for (const p of who) {
          const hand = g.zone(g.zk.hand(p)).slice();
          if (!hand.length) continue;
          const order = yield* g.chooseCards(p, hand, { purpose: 'rumoursOrder', prompt: 'p.rumoursOrder', min: hand.length, max: hand.length, ordered: true });
          for (const u of order) g.toDeckBottom(u);
          yield* g.draw(p, order.length);
        }
      },
    }],
  },

  clockwork: {
    actions: [
      { key: 'spring', step: 'spring', can: (g, k, pid) => g.zone(g.zk.hand(pid)).length > 0 && swapTargets(g, pid).length > 0, run: (g, k, pid) => clockworkSwap(g, k, pid) },
      { key: 'autumn', step: 'autumn', can: (g, k, pid) => g.zone(g.zk.hand(pid)).length > 0 && swapTargets(g, pid).length > 0, run: (g, k, pid) => clockworkSwap(g, k, pid) },
    ],
  },

  truenames: {
    actions: [{
      key: 'names', step: 'day',
      can: (g, k, pid) => !!g.S.clash && g.clashCards().some((u) => g.C(u).owner !== pid),
      *run(g, k, pid) {
        const hand = g.zone(g.zk.hand(pid)).slice();
        g.log('revealHand', { pid, cards: hand });
        const strs = new Set(hand.map((u) => g.C(u).def.str));
        const archs = new Set(hand.map((u) => g.view(u).arch));
        const back = g.clashCards().filter((u) => {
          const c = g.C(u);
          if (c.owner === pid) return false;
          return strs.has(c.def.str) || archs.has(g.view(u).arch);
        });
        for (const u of back) g.toHand(u);
        g.syncClash();
        yield* g.discardKC(k.uid);
      },
    }],
  },

  lantern: {
    actions: [{
      key: 'lantern', step: 'day',
      can: (g, k, pid) => !!g.S.clash && g.supportersOn(g.S.clash.region, pid) > 0,
      *run(g, k, pid) {
        const cl = g.S.clash;
        const here = cl.region;
        const n = g.supportersOn(here, pid);
        const dests = [0, 1, 2].filter((r) => r !== here && !g.S.resolved[r]);
        const options = dests.map((r) => ({ id: 'r' + r, kind: 'region', region: r }));
        options.push({ id: 'board', kind: 'opt', label: 'board' });
        const [d] = yield* g.select(pid, { purpose: 'lantern', prompt: 'p.lantern', options });
        const k2 = yield* g.chooseNumber(pid, 1, n, { purpose: 'lanternN', prompt: 'p.howMany' });
        g.removeSup(here, pid, k2);
        if (d.kind === 'region') g.addSup(d.region, pid, k2); else g.P(pid).boardSup += k2;
        g.log('moveSup', { pid, n: k2, from: here, to: d.kind === 'region' ? d.region : 'board' });
      },
    }],
  },

  innkeeper: {
    actions: [{
      key: 'inn', step: 'spring', can: () => true,
      *run(g, k, pid) {
        const r = yield* g.chooseRegion(pid, [0, 1, 2], { purpose: 'innkeeperRegion', prompt: 'p.innkeeper' });
        const seen = g.zone(g.zk.down(r)).slice();
        if (seen.length) yield* g.peek(pid, seen, 'p.peek');
        yield* g.swapOwnFaceDown(pid, { purpose: 'innkeeperSwap' });
      },
    }],
  },

  diary: {
    actions: [{
      key: 'diary', step: 'autumn',
      can: (g, k, pid) => g.activeOf(pid).length > 0,
      *run(g, k, pid) {
        const u = yield* g.chooseCard(pid, g.activeOf(pid), { purpose: 'diaryCard', prompt: 'p.diary', intent: 'good' });
        if (u == null) return;
        const cn = yield* g.chooseCouncil(pid, COUNCILS, { purpose: 'governCouncil', prompt: 'p.governCouncil', ctx: { card: u } });
        g.leaveHooks(u);
        g.put(u, g.zk.council(cn), 'top');
        g.log('toCouncil', { pid, card: u, council: cn });
        const cards = g.zone(g.zk.council(cn)).slice();
        const chosen = yield* g.chooseCards(pid, cards, { purpose: 'diaryDiscard', prompt: 'p.diaryDiscard', min: 0, max: cards.length });
        for (const x of chosen) yield* g.removeFromCouncil(x, { to: 'discard' });
        if (chosen.length) yield* g.syndicateMarkers(pid, cn);
        yield* g.discardKC(k.uid);
      },
    }],
  },

  boatman: {
    actions: [{
      key: 'boatman', step: 'spring',
      can: (g, k, pid) => g.zone(g.zk.hand(pid)).length > 0 && g.zone(g.zk.lost(pid)).some((u) => g.C(u).kind === 'f'),
      *run(g, k, pid) {
        const lost = g.zone(g.zk.lost(pid)).filter((u) => g.C(u).kind === 'f');
        const l = yield* g.chooseCard(pid, lost, { purpose: 'boatmanLost', prompt: 'p.pickLost', intent: 'good' });
        if (l == null) return;
        const h = yield* g.chooseCard(pid, g.zone(g.zk.hand(pid)).slice(), { purpose: 'boatmanHand', prompt: 'p.swapHand', intent: 'cost' });
        if (h == null) return;
        g.swapCards(h, l);
        g.log('swap', { pid, a: h, b: l });
      },
    }],
  },

  enchantress: {
    actions: [{
      key: 'enchant', step: 'spring', can: (g, k, pid) => g.roadChoices(pid).length > 0,
      *run(g, k, pid) {
        yield* g.releaseKC(k.uid);
        g.burn(k.uid);
        for (let i = 0; i < 2; i++) {
          const kcs = g.roadChoices(pid);
          const hand = g.zone(g.zk.hand(pid)).slice();
          if (!kcs.length || !hand.length) break;
          const u = yield* g.chooseCard(pid, kcs, { purpose: 'enchantressKC', prompt: 'p.pickKC', optional: true, intent: 'good', ctx: { kc: true } });
          if (u == null) break;
          const occ = yield* g.chooseCard(pid, hand, { purpose: 'enchantressOcc', prompt: 'p.pickOccupant', intent: 'cost' });
          if (occ == null) break;
          yield* g.gainKC(pid, u, { occupant: occ, bidCard: occ });
          g.repopulateRoad(0);
        }
      },
    }],
  },

  propaganda: {},
  simulacrum: {},

  mirror: {
    actions: [{
      key: 'mirror', step: 'day',
      can: (g, k, pid) => inClashOk(g, pid) && g.S.order.some((p) => g.zone(g.zk.lost(p)).some((u) => g.C(u).kind === 'f')),
      *run(g, k, pid) {
        const mine = yield* g.chooseCard(pid, ownInClash(g, pid), { purpose: 'mirrorCard', prompt: 'p.mirrorCard', intent: 'good' });
        if (mine == null) return;
        const pool = g.S.order.flatMap((p) => g.zone(g.zk.lost(p)).filter((u) => g.C(u).kind === 'f'));
        const src = yield* g.chooseCard(pid, pool, { purpose: 'mirrorLost', prompt: 'p.mirrorLost', intent: 'good' });
        if (src == null) return;
        g.C(mine).becomes = g.baseDef(g.C(src));
        g.C(mine).becomesRound = g.S.round;
        g.log('mirror', { pid, card: mine, as: src });
      },
    }],
  },

  siren: {
    actions: [{
      key: 'siren', step: 'spring',
      can: (g) => g.S.order.some((p) => g.S.herald[p]),
      *run(g, k, pid) {
        const loc = yield* g.chooseLoc(pid, LOC_IDS, { purpose: 'sirenLoc', prompt: 'p.sirenLoc' });
        const placed = g.S.order.filter((p) => g.S.herald[p] && g.S.herald[p] !== loc);
        const who = yield* g.choosePlayers(pid, placed, { purpose: 'sirenWho', prompt: 'p.sirenWho', min: 0 });
        for (const p of who) g.S.herald[p] = loc;
        g.log('sirenMove', { pid, loc, who });
        yield* g.discardKC(k.uid);
      },
    }],
  },

  // Actions are optional and have no target requirement: with an empty Lost Pile the card is just discarded.
  bell: {
    actions: [{
      key: 'bell', step: 'autumn',
      *run(g, k, pid) {
        const lost = g.zone(g.zk.lost(pid)).filter((u) => g.C(u).kind === 'f');
        if (lost.length) {
          const top = yield* g.chooseOption(pid, [{ id: 'top', kind: 'opt', label: 'top' }, { id: 'bottom', kind: 'opt', label: 'bottom' }], { purpose: 'bell', prompt: 'p.bell' });
          const order = yield* g.chooseCards(pid, lost, { purpose: 'bellOrder', prompt: 'p.bellOrder', min: lost.length, max: lost.length, ordered: true });
          if (top === 'top') for (const u of order.slice().reverse()) g.toDeckTop(u);
          else for (const u of order) g.toDeckBottom(u);
        }
        yield* g.discardKC(k.uid);
      },
    }],
  },

  irongear: {
    actions: [{
      key: 'gear', step: 'autumn',
      can: (g, k, pid) => g.activeOf(pid).length > 0,
      *run(g, k, pid) {
        const u = yield* g.chooseCard(pid, g.activeOf(pid), { purpose: 'irongear', prompt: 'p.pickActive', intent: 'good' });
        if (u != null) g.toHand(u);
      },
    }],
  },

  helm: {
    on: {
      *eliminated(g, k, ev, pid) {
        if (ev.pid !== pid) return;
        const c = g.C(ev.uid);
        if (!c.z || !(c.z === g.zk.lost(pid) || c.z === g.zk.discard(pid))) return;
        if (yield* g.yesNo(pid, 'p.helm', { purpose: 'helm', ctx: { card: ev.uid }, intent: 'good' })) g.toHand(ev.uid);
      },
    },
  },

  eye: {},

  // ============================================================ OATHS
  assassins: {
    grant(g, k, tgt, v) {
      if (tgt.kind === 'f' && v.arch === 'heir') {
        v.cmds.push({ c: 'deadly', step: 'night' }, { c: 'retreat', step: 'day' });
      }
    },
    on: {
      *eliminatedOthers(g, k, ev, pid) {
        if (ev.pid === pid && g.view(ev.by).arch === 'heir') g.gainInf(pid, 1, 'assassins');
      },
    },
    night(g, k, cl, pid) {
      const mine = cl.cards.map((u) => g.C(u)).filter((c) => c.owner === pid && g.view(c.uid).arch === 'heir');
      const kills = [];
      for (const h of mine) {
        const hit = cl.cards.map((u) => g.C(u)).some((o) => o.owner !== pid && g.view(o.uid).arch === 'follower');
        if (hit) kills.push({ uid: h.uid, by: null });
      }
      return kills.length ? { kills } : null;
    },
  },

  reservists: {
    grant(g, k, tgt, v) {
      if (tgt.kind === 'f' && (v.arch === 'follower' || v.arch === 'cavalry')) v.cmds.push({ c: 'deploy', step: 'autumn', n: 1 });
    },
    actions: [{
      key: 'follower', step: 'autumn',
      can: (g, k, pid) => g.zone(g.zk.discard(pid)).some((u) => g.view(u).arch === 'follower'),
      *run(g, k, pid) {
        const cand = g.zone(g.zk.discard(pid)).filter((u) => g.view(u).arch === 'follower');
        const u = yield* g.chooseCard(pid, cand, { purpose: 'reservists', prompt: 'p.pickDiscard', intent: 'good' });
        if (u != null) g.toHand(u);
      },
    }],
  },

  workshop: {
    late: true,
    grant(g, k, tgt, v) {
      if (tgt.kind !== 'f') return;
      for (const x of v.cmds.slice()) {
        if (x.c === 'deploy' && x.step === 'autumn' && !v.cmds.some((y) => y.c === 'deploy' && y.step === 'spring')) v.cmds.push({ c: 'deploy', step: 'spring', n: x.n });
      }
    },
    actions: [{
      key: 'inf', step: 'autumn',
      can: (g, k, pid) => g.activeOf(pid).some((u) => g.hasCmd(u, 'deploy')),
      *run(g, k, pid) {
        const cand = g.activeOf(pid).filter((u) => g.hasCmd(u, 'deploy'));
        const u = yield* g.chooseCard(pid, cand, { purpose: 'workshop', prompt: 'p.workshop', intent: 'good' });
        if (u != null) { g.C(u).inf += 1; g.log('placeInfOnCard', { card: u }); }
      },
    }],
  },

  tourney: {
    actions: [{
      key: 'tourney', step: 'spring', can: () => true,
      *run(g, k, pid) {
        const placed = [];
        for (const p of g.S.order) {
          const hand = g.zone(g.zk.hand(p)).slice();
          if (!hand.length) continue;
          const u = yield* g.chooseCard(p, hand, { purpose: 'tourneyCard', prompt: 'p.tourney', intent: 'neutral', hidden: true });
          if (u == null) continue;
          g.put(u, g.zk.bid(p), 'top');
          placed.push(u);
        }
        g.log('tourneyReveal', { cards: placed });
        const byStr = new Map();
        for (const u of placed) { const s = g.C(u).def.str; if (!byStr.has(s)) byStr.set(s, []); byStr.get(s).push(u); }
        const survivors = [];
        for (const [, list] of byStr) { if (list.length > 1) for (const u of list) g.toDiscard(u); else survivors.push(list[0]); }
        let winner = null;
        if (survivors.length) {
          survivors.sort((a, b) => g.C(b).def.str - g.C(a).def.str);
          winner = g.C(survivors[0]).owner;
        }
        for (const u of survivors) g.toHand(u, { force: true });
        if (winner != null) {
          g.log('tourneyWin', { pid: winner });
          const loc = yield* g.chooseLoc(winner, LOC_IDS, { purpose: 'tourneyLoc', prompt: 'p.chooseLoc', intent: 'good' });
          yield* g.claimLocationReward(winner, loc);
        }
        yield* g.discardKC(k.uid);
      },
    }],
  },

  greatwing: {
    grant(g, k, tgt, v) { if (tgt.kind === 'f' && v.arch === 'heir') v.cmds.push({ c: 'flank', step: 'day' }); },
  },

  lanes: {
    actions: [{
      key: 'lanes', step: 'day',
      can: (g, k, pid) => inClashOk(g, pid) && !g.regionLocked(g.S.clash.region, pid) && swapTargets(g, pid).length > 0,
      *run(g, k, pid) {
        const a = yield* g.chooseCard(pid, ownInClash(g, pid), { purpose: 'lanesActive', prompt: 'p.lanesActive', intent: 'cost' });
        if (a == null) return;
        const b = yield* g.chooseCard(pid, swapTargets(g, pid), { purpose: 'lanesTarget', prompt: 'p.swapTarget', intent: 'good' });
        if (b == null) return;
        g.swapCards(a, b);
        g.joinClash(b);
        g.log('swap', { pid, a, b });
      },
    }],
  },

  siegecmd: {
    grant(g, k, tgt, v) { if (tgt.kind === 'f' && v.arch === 'heir') v.cmds.push({ c: 'deploy', step: 'autumn', n: 1 }); },
    on: {
      *eliminated(g, k, ev, pid) {
        if (ev.pid !== pid) return;
        if (g.view(ev.uid).arch !== 'heir') return;
        g.toHand(ev.uid, { force: true });
        yield* g.discardKC(k.uid);
      },
    },
  },

  banner: {
    actions: [{
      // "Up to two": with no Supporters on the Map or in the Lost Pile the Action simply does nothing.
      key: 'banner', step: 'autumn',
      *run(g, k, pid) {
        for (let i = 0; i < 2; i++) {
          const opts = [];
          for (let r = 0; r < 3; r++) if (g.supportersOn(r, pid) > 0) opts.push({ id: 'r' + r, kind: 'region', region: r });
          if (g.P(pid).lostSup > 0) opts.push({ id: 'lost', kind: 'opt', label: 'lost' });
          if (!opts.length) break;
          opts.push({ id: 'done', kind: 'none' });
          const [r] = yield* g.select(pid, { purpose: 'banner', prompt: 'p.banner', options: opts, auto: false, intent: 'good' });
          if (r.kind === 'none') break;
          if (r.kind === 'region') g.removeSup(r.region, pid, 1); else g.P(pid).lostSup -= 1;
          g.P(pid).boardSup += 1;
          g.log('returnSup', { pid, n: 1, from: r.kind === 'region' ? r.region : 'lost' });
        }
      },
    }],
  },

  citadel: {
    *winter(g, k) { yield* g.discardKC(k.uid); },
  },

  smuggler: {
    actions: [{
      key: 'smuggler', step: 'day', can: (g, k, pid) => inClashOk(g, pid),
      *run(g, k, pid) {
        const u = yield* g.chooseCard(pid, ownInClash(g, pid), { purpose: 'smugglerCard', prompt: 'p.pickClash', intent: 'good' });
        if (u != null) clashGain(g, u, { kind: 'cmd', cmd: { c: 'retreat', step: 'day', smuggler: true } });
      },
    }],
  },

  horn: {
    actions: [{
      key: 'horn', step: 'day', can: (g, k, pid) => inClashOk(g, pid),
      *run(g, k, pid) {
        const u = yield* g.chooseCard(pid, ownInClash(g, pid), { purpose: 'hornCard', prompt: 'p.pickClash', intent: 'good' });
        if (u != null) clashGain(g, u, { kind: 'cmd', cmd: { c: 'ambush', step: 'day' } });
      },
    }],
  },

  sword: {
    actions: [{
      key: 'sword', step: 'day', can: (g, k, pid) => !!g.S.clash,
      *run(g, k, pid) {
        const cl = g.S.clash;
        cl.extra[pid] = (cl.extra[pid] || 0) + 5;
        g.log('swordStrength', { pid });
        yield* discardWithOccupant(g, k);
      },
    }],
  },

  sundial: {
    actions: [{
      key: 'sundial', step: 'spring', can: () => true,
      *run(g, k, pid) {
        const r = yield* g.chooseRegion(pid, [0, 1, 2], { purpose: 'sundialRegion', prompt: 'p.placeKCRegion', ctx: { kc: k.uid } });
        const slot = g.slotOfKC(k.uid);
        if (slot >= 0) { const occ = g.occAt(pid, slot); if (occ != null) g.toDiscard(occ); }
        yield* g.releaseKC(k.uid);
        k.owner = pid;
        g.put(k.uid, g.zk.regKC(r), 'top');
        g.log('kcToRegion', { pid, kc: k.uid, region: r });
      },
    }],
    *winter(g, k) { yield* g.discardKC(k.uid); },
  },

  ring: {
    actions: [{
      key: 'ring', step: 'autumn',
      can: (g, k, pid) => g.S.tactics[pid].some((t) => !t.burned && t.exhausted),
      *run(g, k, pid) {
        const list = g.S.tactics[pid].filter((t) => !t.burned && t.exhausted);
        const options = list.map((t) => ({ id: 't:' + t.id, kind: 'tactic', tid: t.id, pid }));
        const [r] = yield* g.select(pid, { purpose: 'ringTactic', prompt: 'p.ring', options, intent: 'good' });
        const t = list.find((x) => x.id === r.tid);
        t.exhausted = false;
        t.markers = g.tacticSetup(t);
        g.log('unexhaust', { pid, tid: t.id });
        yield* discardWithOccupant(g, k);
      },
    }],
  },

  ball: {
    *winter(g, k) { yield* g.discardKC(k.uid); },
  },

  spear: {
    actions: [{
      key: 'spear', step: 'day', can: (g, k, pid) => inClashOk(g, pid),
      *run(g, k, pid) {
        const u = yield* g.chooseCard(pid, ownInClash(g, pid), { purpose: 'spearCard', prompt: 'p.pickClash', intent: 'good' });
        if (u == null) return;
        clashGain(g, u, { kind: 'cmd', cmd: { c: 'deadly', step: 'night' } });
        yield* discardWithOccupant(g, k);
      },
    }],
  },

  shield: {
    actions: [{
      key: 'shield', step: 'day', can: (g, k, pid) => inClashOk(g, pid),
      *run(g, k, pid) {
        const u = yield* g.chooseCard(pid, ownInClash(g, pid), { purpose: 'shieldCard', prompt: 'p.pickClash', intent: 'good' });
        if (u == null) return;
        clashGain(g, u, { kind: 'trait', trait: 'inv' });
        yield* g.discardKC(k.uid);
      },
    }],
  },
};

export { REGIONS };

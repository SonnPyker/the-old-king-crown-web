// Rules logic for Tactic Tiles, Kingdom's Favour actions and Round-long effects ("fx").
//
// TACTIC_LOGIC[id] = { can(g, tactic, pid), *run(g, tactic, pid) }
//   Exhausting / spending a Faction Marker is handled by the action framework before run().
// KF_LOGIC[faction] = { can(g, pid), *run(g, pid) }
// FX_LOGIC[key] = { grant(g, fx, card, view), on: { event: function*(g, fx, ev, pid) } }

import { COUNCILS, REGIONS } from '../../data/constants.js';

const ownActive = (g, pid, region) => g.activeOf(pid, region);
// Own Active cards in Regions that Martial Law does not lock against `pid`.
const openActive = (g, pid) => ownActive(g, pid).filter((u) => !g.regionLocked(+g.C(u).z[1], pid));
const ownInClash = (g, pid) => (g.S.clash ? g.S.clash.cards.filter((u) => g.C(u).owner === pid) : []);
const faceDownOf = (g, pid) => {
  const out = [];
  for (let r = 0; r < 3; r++) for (const u of g.zone(g.zk.down(r))) if (g.C(u).owner === pid) out.push({ uid: u, region: r });
  return out;
};

// Swap two cards' places (zone and index).
function swapPlaces(g, a, b) { g.swapCards(a, b); }

export const TACTIC_LOGIC = {
  // ---------------------------------------------------------------- Nobility
  martial_law: {
    can: (g, t, pid) => ownActive(g, pid).some((u) => g.view(u).arch === 'warmachine'),
    *run(g, t, pid) {
      const regs = [0, 1, 2].filter((r) => ownActive(g, pid, r).some((u) => g.view(u).arch === 'warmachine'));
      const r = yield* g.chooseRegion(pid, regs, { purpose: 'martialLaw', prompt: 'p.martialLaw', intent: 'good' });
      g.S.fx.push({ pid, key: 'martialLaw', region: r, round: g.S.round });
      g.log('martialLaw', { pid, region: r });
    },
  },

  royal_seal: {
    reaction: 'bid',
    can: () => false,
    *run() {},
  },

  school_of_the_stones: {
    can: () => true,
    *run(g, t, pid) { g.addFx(pid, 'stones'); g.log('fx', { pid, fx: 'stones' }); },
  },

  witch_trial: {
    can: (g, t, pid) => COUNCILS.some((cn) => g.councilCards(cn).length > 0),
    *run(g, t, pid) {
      const cn = yield* g.chooseCouncil(pid, COUNCILS, { purpose: 'witchTrial', prompt: 'p.witchTrial', intent: 'neutral' });
      const touched = new Set();
      for (const c of g.councilCards(cn).slice()) {
        if (c.owner !== pid) { yield* g.removeFromCouncil(c.uid, { to: 'discard' }); touched.add(cn); }
      }
      const mine = COUNCILS.flatMap((x) => g.councilCards(x, pid).map((c) => c.uid));
      if (mine.length) {
        const chosen = yield* g.chooseCards(pid, mine, { purpose: 'witchTrialDeck', prompt: 'p.witchTrialDeck', min: 0, max: mine.length, ordered: true, intent: 'good' });
        for (const u of chosen) touched.add(g.C(u).z.slice(2));
        for (const u of chosen.slice().reverse()) g.toDeckTop(u);
        if (chosen.length) { g.log('witchTrialDeck', { pid, n: chosen.length }); yield* g.gainLore(pid, chosen.length, 'witchTrial'); }
      }
      // The Syndicate: each Council this Trial removed cards from may also lose your Markers.
      for (const x of touched) yield* g.syndicateMarkers(pid, x);
    },
  },

  // ---------------------------------------------------------------- Uprising
  false_orders: {
    can: (g, t, pid) => g.opponents(pid).some((o) => faceDownOf(g, o).length >= 2),
    *run(g, t, pid) {
      const done = new Set();
      for (;;) {
        const cand = g.opponents(pid).filter((o) => !done.has(o) && faceDownOf(g, o).length >= 2);
        if (!cand.length) break;
        const options = cand.map((p) => ({ id: 'p' + p, kind: 'player', player: p }));
        if (done.size) options.push({ id: 'done', kind: 'none' });
        const [r] = yield* g.select(pid, { purpose: 'falseOrdersWho', prompt: 'p.falseOrdersWho', options, auto: false });
        if (!r || r.kind === 'none') break;
        done.add(r.player);
        const cards = faceDownOf(g, r.player);
        const pairs = [];
        for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) pairs.push({ id: `x${cards[i].region}${cards[j].region}`, kind: 'regionPair', a: cards[i].region, b: cards[j].region });
        const [pr] = yield* g.select(pid, { purpose: 'falseOrdersPair', prompt: 'p.falseOrdersPair', options: pairs, ctx: { target: r.player } });
        const ca = cards.find((x) => x.region === pr.a).uid; const cb = cards.find((x) => x.region === pr.b).uid;
        swapPlaces(g, ca, cb);
        g.log('falseOrders', { pid, target: r.player, a: pr.a, b: pr.b });
      }
    },
  },

  night_raids: {
    can: (g, t, pid) => g.boardKCs(pid).length > 0 && g.opponents(pid).some((o) => g.zone(g.zk.hand(o)).length > 0),
    *run(g, t, pid) {
      const n = g.boardKCs(pid).length;
      for (const o of g.S.order) {
        if (o === pid) continue;
        const hand = g.zone(g.zk.hand(o)).slice();
        const k = Math.min(n, hand.length);
        if (!k) continue;
        const chosen = yield* g.chooseCards(o, hand, { purpose: 'nightRaids', prompt: 'p.nightRaids', min: k, max: k, intent: 'cost', ctx: { by: pid, n: k } });
        for (const u of chosen) g.toDiscard(u);
        g.log('nightRaids', { pid, target: o, n: chosen.length });
      }
    },
  },

  safehouses: {
    can: (g, t, pid) => ownInClash(g, pid).length > 0,
    *run(g, t, pid) {
      const u = yield* g.chooseCard(pid, ownInClash(g, pid), { purpose: 'safehouses', prompt: 'p.pickClash', intent: 'good' });
      if (u != null) g.addGain(u, { kind: 'cmd', cmd: { c: 'retreat', step: 'day' }, clash: g.S.clash.seq });
    },
  },

  school_of_the_streets: {
    can: () => true,
    *run(g, t, pid) { g.addFx(pid, 'streets'); g.log('fx', { pid, fx: 'streets' }); },
  },

  // ------------------------------------------------------------------- Clans
  river_runners: {
    can: (g, t, pid) => g.zone(g.zk.hand(pid)).length > 0 && g.opponents(pid).some((o) => g.boardKCs(o).length > 0),
    *run(g, t, pid) {
      const cand = g.opponents(pid).flatMap((o) => g.boardKCs(o).map((b) => b.kc));
      const k = yield* g.chooseCard(pid, cand, { purpose: 'riverRunners', prompt: 'p.pickKCSteal', intent: 'good', ctx: { kc: true } });
      if (k == null) return;
      const occ = yield* g.chooseCard(pid, g.zone(g.zk.hand(pid)).slice(), { purpose: 'riverRunnersOcc', prompt: 'p.pickOccupant', intent: 'cost' });
      if (occ == null) return;
      yield* g.stealKC(pid, k, occ);
    },
  },

  salt_toughness: {
    can: (g, t, pid) => g.handRoom(pid) > 0 && (g.activeOf(pid).length + g.zone(g.zk.discard(pid)).length) > 0,
    *run(g, t, pid) {
      const pool = g.activeOf(pid).concat(g.zone(g.zk.discard(pid)));
      const room = g.handRoom(pid);
      const chosen = yield* g.chooseCards(pid, pool, { purpose: 'saltToughness', prompt: 'p.saltToughness', min: 0, max: Math.min(room, pool.length), intent: 'good' });
      for (const u of chosen) g.toHand(u);
      g.syncClash();
    },
  },

  school_of_the_storms: {
    can: () => true,
    *run(g, t, pid) { g.addFx(pid, 'storms'); g.log('fx', { pid, fx: 'storms' }); },
  },

  sea_lanes: {
    can: (g, t, pid) => !!g.S.clash && ownActive(g, pid, g.S.clash.region).some((u) => ['heir', 'trader', 'warmachine'].includes(g.view(u).arch)),
    *run(g, t, pid) {
      const cand = ownActive(g, pid, g.S.clash.region).filter((u) => ['heir', 'trader', 'warmachine'].includes(g.view(u).arch));
      const u = yield* g.chooseCard(pid, cand, { purpose: 'seaLanes', prompt: 'p.seaLanes', intent: 'good' });
      if (u != null) g.addGain(u, { kind: 'cmd', cmd: { c: 'flank', step: 'day' }, round: g.S.round });
    },
  },

  // --------------------------------------------------------------- Gathering
  moonlit_foragers: {
    can: (g, t, pid) => g.zone(g.zk.hand(pid)).length > 0 && g.S.kdiscard.length > 0,
    *run(g, t, pid) {
      g.rng.shuffle(g.S.kdiscard);
      const five = g.S.kdiscard.slice(-5);
      g.log('foragers', { pid, cards: five });
      const k = yield* g.chooseCard(pid, five, { purpose: 'foragers', prompt: 'p.foragers', intent: 'good', ctx: { kc: true } });
      if (k == null) return;
      const occ = yield* g.chooseCard(pid, g.zone(g.zk.hand(pid)).slice(), { purpose: 'foragersOcc', prompt: 'p.pickOccupant', intent: 'cost' });
      if (occ == null) return;
      yield* g.gainKC(pid, k, { occupant: occ, bidCard: occ });
    },
  },

  out_beyond_the_lights: {
    can: (g, t, pid) => new Set(openActive(g, pid).map((u) => +g.C(u).z[1])).size >= 2,
    *run(g, t, pid) {
      const a = yield* g.chooseCard(pid, openActive(g, pid), { purpose: 'outBeyondA', prompt: 'p.swapFirst', intent: 'neutral' });
      if (a == null) return;
      const ra = +g.C(a).z[1];
      const others = openActive(g, pid).filter((u) => +g.C(u).z[1] !== ra);
      const b = yield* g.chooseCard(pid, others, { purpose: 'outBeyondB', prompt: 'p.swapSecond', intent: 'neutral' });
      if (b == null) return;
      g.swapCards(a, b);
      g.log('swapActive', { pid, a, b });
      g.syncClash();
      if (g.S.clash) for (const u of [a, b]) if (+g.C(u).z[1] === g.S.clash.region) g.joinClash(u);
    },
  },

  ritual_sacrifice: {
    can: (g, t, pid) => g.activeOf(pid).length + g.zone(g.zk.discard(pid)).length > 0,
    *run(g, t, pid) {
      const pool = g.activeOf(pid).concat(g.zone(g.zk.discard(pid)));
      const chosen = yield* g.chooseCards(pid, pool, { purpose: 'ritualSacrifice', prompt: 'p.ritualSacrifice', min: 0, max: Math.min(3, pool.length), intent: 'cost' });
      for (const u of chosen) g.toLost(u);
      g.syncClash();
      if (chosen.length) yield* g.gainLore(pid, chosen.length, 'ritualSacrifice');
      const disc = g.zone(g.zk.discard(pid)).slice();
      if (disc.length && g.handRoom(pid) > 0) {
        const u = yield* g.chooseCard(pid, disc, { purpose: 'ritualSacrificeHand', prompt: 'p.pickDiscard', optional: true, intent: 'good' });
        if (u != null) g.toHand(u);
      }
    },
  },

  school_of_the_stars: {
    can: (g, t, pid) => !!g.S.clash && g.supportersOn(g.S.clash.region, pid) >= 2
      && !g.regionLocked(g.S.clash.region, pid)
      && g.zone(g.zk.lost(pid)).some((u) => g.C(u).kind === 'f'),
    *run(g, t, pid) {
      const here = g.S.clash.region;
      g.removeSup(here, pid, 2);
      g.P(pid).lostSup += 2;
      g.log('supToLost', { pid, n: 2, region: here });
      const pool = g.zone(g.zk.lost(pid)).filter((u) => g.C(u).kind === 'f');
      const u = yield* g.chooseCard(pid, pool, { purpose: 'starsCard', prompt: 'p.pickLost', intent: 'good' });
      if (u == null) return;
      g.put(u, g.zk.active(here), 'top');
      g.log('toActive', { pid, card: u, region: here });
      g.joinClash(u);
    },
  },
};

// ------------------------------------------------------------ Kingdom's Favour
export const KF_LOGIC = {
  nobility: {
    can: () => true,
    *run(g, pid) {
      const pick = yield* g.chooseOption(pid, [{ id: 'inf', kind: 'opt', label: 'inf' }, { id: 'inv', kind: 'opt', label: 'heirInv' }], { purpose: 'regalGuard', prompt: 'p.regalGuard' });
      if (pick === 'inf') g.gainInf(pid, 1, 'regalGuard');
      else { g.addFx(pid, 'heirInvuln'); g.log('fx', { pid, fx: 'heirInvuln' }); }
    },
  },

  uprising: {
    can: (g, pid) => faceDownOf(g, pid).length > 0 || true,
    *run(g, pid) {
      const r = yield* g.chooseRegion(pid, [0, 1, 2], { purpose: 'spyRegion', prompt: 'p.spyRegion' });
      const seen = g.zone(g.zk.down(r)).slice();
      if (seen.length) yield* g.peek(pid, seen, 'p.peek');
      const mine = faceDownOf(g, pid);
      const targets = g.zone(g.zk.hand(pid)).slice();
      for (let i = 0; i < 3; i++) { const o = g.occAt(pid, i); if (o != null && g.C(o).owner === pid) targets.push(o); }
      if (!mine.length || !targets.length) return;
      const a = yield* g.chooseCard(pid, mine.map((x) => x.uid), { purpose: 'spyOwn', prompt: 'p.spyOwn', optional: true, intent: 'neutral' });
      if (a == null) return;
      const b = yield* g.chooseCard(pid, targets, { purpose: 'spyTarget', prompt: 'p.spyTarget', intent: 'neutral' });
      if (b == null) return;
      g.swapCards(a, b);
      g.log('spySwap', { pid });
    },
  },

  clans: {
    can: (g) => !!g.S.clash,
    *run(g, pid) {
      const here = g.S.clash.region;
      const loc = yield* g.chooseLoc(pid, REGIONS[here].locs, { purpose: 'prophetHerald', prompt: 'p.prophetHerald' });
      g.S.herald[pid] = loc;
      g.log('moveHerald', { pid, loc });
      for (let i = 0; i < 2; i++) {
        const options = [];
        for (let r = 0; r < 3; r++) if (r !== here && g.supportersOn(r, pid) > 0) options.push({ id: 'r' + r, kind: 'region', region: r });
        if (!options.length) break;
        options.push({ id: 'done', kind: 'none' });
        const [s] = yield* g.select(pid, { purpose: 'prophetSup', prompt: 'p.prophetSup', options, auto: false, intent: 'good' });
        if (!s || s.kind === 'none') break;
        g.removeSup(s.region, pid, 1);
        g.addSup(here, pid, 1);
        g.log('moveSup', { pid, n: 1, from: s.region, to: here });
      }
    },
  },

  gathering: {
    can: (g, pid) => { const r = g.heraldRegion(pid); return r >= 0 && ownActive(g, pid, r).length > 0; },
    *run(g, pid) {
      const r = g.heraldRegion(pid);
      const u = yield* g.chooseCard(pid, ownActive(g, pid, r), { purpose: 'heraldMoon', prompt: 'p.pickActive', intent: 'good' });
      if (u != null) { g.toHand(u); g.syncClash(); }
    },
  },
};

// ------------------------------------------------------------ Round-long effects
export const FX_LOGIC = {
  heirInvuln: {
    grant(g, fx, c, v) { if (c.kind === 'f' && v.arch === 'heir') v.inv = true; },
  },
  streets: {
    grant(g, fx, c, v) { if (c.kind === 'f' && v.arch === 'heir') v.cmds.push({ c: 'deadly', step: 'night' }); },
    on: {
      *eliminatedOthers(g, fx, ev, pid) {
        if (ev.pid !== pid) return;
        g.gainInf(pid, 1, 'streets');
        yield* g.gainLore(pid, 1, 'streets');
      },
    },
  },
  stones: {},
  storms: {},
  martialLaw: {},
};

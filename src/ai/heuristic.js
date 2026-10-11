// Heuristic AI (Easy / Normal / Hard).
//
// The AI only ever looks at information a real player could see: public zones, its own hand / face-down cards,
// counts of hidden cards and the (public) composition of every faction's card pool. Opponent hands, decks, bids and
// face-down cards are never read. Randomness comes exclusively from the RNG handed in by the Session so that games
// stay reproducible.

import { LOCATIONS, LOC_IDS, REGIONS, COUNCILS } from '../data/constants.js';
import { randomDecide } from './random.js';

// ------------------------------------------------------------------------------------------------ levels
// noise:   random jitter added to every option score (in "influence" units)
// lapse:   chance of a thoughtless (random) answer
// plan:    use the expected-value planner for Herald / face-down cards / Supporters
// count:   model opponents from the hidden card pool (card counting) instead of flat guesses
// day:     use the Day Step (tactics, commands) intelligently
const LEVELS = {
  easy:   { noise: 1.1, lapse: 0.1, plan: false, count: false, day: false, sd: 3.6 },
  normal: { noise: 0.35, lapse: 0.03, plan: true, count: false, day: true, sd: 3.0 },
  hard:   { noise: 0.1, lapse: 0, plan: true, count: true, day: true, sd: 2.6 },
};

// ------------------------------------------------------------------------------------------------ maths
function erf(x) {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ------------------------------------------------------------------------------------------------ environment
class Env {
  constructor(g, req, rng, lvl) {
    this.g = g; this.req = req; this.rng = rng; this.lvl = lvl;
    this.pid = req.pid;
    this.S = g.S;
    this.me = g.P(req.pid);
    this.opps = g.opponents(req.pid);
    this.maxR = g.maxRounds();
    this.left = this.maxR - g.S.round; // Rounds after the current one
    this._cv = new Map();
  }

  hand() { return this.g.zone(this.g.zk.hand(this.pid)); }
  jitter(scale = 1) { return (this.rng.next() - 0.5) * 2 * this.lvl.noise * scale; }

  // Strength including a small premium for "deadly" cards.
  effStr(uid) {
    const g = this.g;
    const v = g.view(uid);
    let s = v.str;
    if (v.cmds.some((x) => x.c === 'deadly')) s += 2.5;
    if (v.arch === 'agent') s -= 0.5;
    return s;
  }

  // How much a Faction Card is worth keeping in hand (influence-equivalents).
  cv(uid) {
    if (this._cv.has(uid)) return this._cv.get(uid);
    const g = this.g;
    const c = g.C(uid);
    let v = 0;
    if (c.kind === 'f') {
      const w = g.view(uid);
      v = this.effStr(uid) * 0.22 + w.votes * 0.2 + w.lore * 0.12;
      if (w.inv) v += 0.3;
      if (w.res) v += 0.2;
      for (const x of w.cmds) {
        if (x.c === 'ambush') v += 0.4;
        else if (x.c === 'retreat') v += 0.15;
        else if (x.c === 'flank') v += 0.25;
        else if (x.c === 'rally') v += 0.3;
        else if (x.c === 'deploy') v += 0.25;
      }
      if (w.arch === 'ruse') v += 0.25;
    }
    this._cv.set(uid, v);
    return v;
  }
}

// ------------------------------------------------------------------------------------------------ public-information model
// Strengths of the cards an opponent might hold (hand + deck + bid + face-down). Which of those is where stays unknown.
function hiddenPoolStrengths(env, o) {
  const g = env.g;
  const out = [];
  const take = (z) => { for (const u of g.zone(z)) if (g.C(u).owner === o && g.C(u).kind === 'f') out.push(g.C(u).def.str); };
  take(g.zk.hand(o)); take(g.zk.deck(o)); take(g.zk.bid(o));
  for (let r = 0; r < 3; r++) take(g.zk.down(r));
  return out;
}

function pooled(env, o) {
  const key = 'pool' + o;
  if (env[key]) return env[key];
  let arr;
  if (env.lvl.count) arr = hiddenPoolStrengths(env, o);
  else arr = [0, 0, 1, 2, 3, 4, 5, 5, 5, 6, 7, 8, 9, 10];
  arr = arr.slice().sort((a, b) => b - a);
  if (!arr.length) arr = [0];
  env[key] = arr;
  return arr;
}

const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];

// Value of winning the Clash in a Region (what the winner takes), from player `pid`'s point of view.
function locValue(env, pid, loc, forOpp = false) {
  const g = env.g;
  const S = env.S;
  const mine = pid === env.pid; // never look into an opponent's hand: assume typical values for them
  let v = LOCATIONS[loc].inf;
  switch (loc) {
    case 'castle': {
      if (mine) {
        const cands = g.governable(g.zone(g.zk.hand(pid)).concat(g.activeOf(pid)));
        v += cands.length ? 0.9 : 0;
      } else v += 0.7;
      // Clearing a Council hurts whoever has cards there.
      let denial = 0;
      for (const cn of COUNCILS) {
        const theirs = sum(g.councilCards(cn).filter((c) => c.owner !== pid), (c) => g.view(c.uid).votes);
        denial = Math.max(denial, theirs * 0.5);
      }
      v += denial;
      break;
    }
    case 'wilderness': {
      if (mine) {
        const cands = g.journeyable(g.zone(g.zk.hand(pid)).concat(g.activeOf(pid)));
        v += cands.length ? 0.35 * loreValue(env, pid) * Math.max(...cands.map((u) => g.view(u).lore)) + 0.2 : 0;
      } else v += 0.45;
      break;
    }
    case 'harvest': {
      const fac = g.playerFaction(pid);
      const kf = { nobility: 2.2, uprising: 1.1, clans: 1.5, gathering: 1.2 }[fac] || 1.2;
      if (S.kf.holder === pid) v += 0.4 + (3 - S.kf.uses) * 0.4;
      else v += kf + (S.kf.holder != null ? 0.6 : 0) + (env.left === 0 ? -0.4 : 0);
      break;
    }
    case 'shrine': v += 0.25; break;
    case 'necropolis': {
      if (mine) {
        const room = Math.max(0, g.P(pid).handSize - g.zone(g.zk.hand(pid)).length);
        const dsc = g.zone(g.zk.discard(pid)).length;
        v += 0.3 * Math.min(3, room, dsc);
      } else v += 0.5;
      break;
    }
    default: break;
  }
  if (forOpp) v *= 0.9;
  return v;
}

// What a point of Lore is worth right now.
function loreValue(env, pid) {
  const g = env.g;
  const sop = g.zone(g.zk.sop(pid));
  if (!sop.length) return env.left >= 0 ? 0.5 : 0.5;
  if (env.left === 0) return 0.05;
  return env.left >= 3 ? 0.55 : env.left === 2 ? 0.45 : 0.25;
}

function herdBonus(env, pid, loc) {
  const g = env.g;
  let b = 1;
  let relics = 0;
  for (const c of g.councilCards('relics', pid)) relics += g.view(c.uid).votes;
  const m = env.S.cmark.relics[pid];
  if (m) relics += (m.syn || 0);
  b += relics * 0.9;
  // Opponents who share the Location lose Influence.
  for (const o of g.opponents(pid)) if (env.S.herald[o] === loc) b += 1;
  return b;
}

// Importance of each Region for a player: the best Location reward there (+ Herald).
function regionWeights(env, pid, useHerald = true, hypLoc = null) {
  const w = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    let best = 0;
    for (const loc of REGIONS[r].locs) {
      let v = locValue(env, pid, loc, pid !== env.pid);
      const hl = hypLoc && pid === env.pid ? hypLoc : (useHerald ? env.S.herald[pid] : null);
      if (hl === loc) v += herdBonus(env, pid, loc);
      best = Math.max(best, v);
    }
    w[r] = best;
  }
  return w;
}

// Expected strength of opponent `o` in each Region (mean, sd) when the face-down cards are still hidden.
function oppModel(env, o) {
  const g = env.g;
  const pool = pooled(env, o);
  const qs = [q(pool, 0.1), q(pool, 0.33), q(pool, 0.55)];
  // Opponents with fewer cards in hand/deck play weaker cards.
  const w = regionWeights(env, o);
  const order = [0, 1, 2].sort((a, b) => w[b] - w[a]);
  const mu = [0, 0, 0];
  order.forEach((r, i) => { mu[r] = qs[i]; });
  for (let r = 0; r < 3; r++) {
    for (const u of g.zone(g.zk.active(r))) if (g.C(u).owner === o) mu[r] += g.view(u).str;
    mu[r] += (env.S.region[r].fresh[o] || 0) * (g.hasFx(o, 'stones') ? 2 : 1);
    // Cards face-down by this opponent are placed: the number of cards left shows how many regions they fill.
  }
  // Supporters that are still on their board will probably be committed (about two per Region).
  const sup = g.P(o).boardSup;
  for (let r = 0; r < 3; r++) mu[r] += (sup / 3) * 0.8;
  return { mu, sd: env.lvl.sd };
}

function winProb(env, models, r, mine) {
  let p = 1;
  for (const o of env.opps) {
    const m = models[o];
    p *= Phi((mine - m.mu[r] - 0.2) / m.sd);
  }
  return p;
}

// ------------------------------------------------------------------------------------------------ Kingdom Card values
const KC_BASE = {
  adventuring: 3.0, monument: 4.0, tincrowns: 3.0, benefactor: 2.0, watchtowers: 4.5, palace: 2.5, beacon: 3.0,
  library: 3.0, brigands: 3.0, court: 3.0, guild: 5.0, caves: 3.0, bothies: 4.0, pardons: 2.5, splendid: 3.0,
  estate: 1.5, signet: 4.5,
  airship: 2.0, rumours: 2.0, clockwork: 2.0, truenames: 2.0, lantern: 1.5, innkeeper: 2.0, diary: 2.0,
  boatman: 1.5, enchantress: 2.5, propaganda: 3.0, simulacrum: 2.5, mirror: 3.5, siren: 1.5, bell: 1.0,
  irongear: 3.0, helm: 3.0, eye: 2.5,
  assassins: 3.5, reservists: 3.0, workshop: 2.0, tourney: 2.5, greatwing: 2.5, lanes: 2.0, siegecmd: 3.0,
  banner: 3.0, citadel: 3.5, smuggler: 2.0, horn: 3.0, sword: 3.5, sundial: 1.5, ring: 3.0, ball: 2.5,
  spear: 3.5, shield: 2.5,
};

// Cards that pay off every Round get more valuable the earlier they are acquired.
const KC_PER_ROUND = { monument: 0.9, bothies: 0.8, guild: 0.9, watchtowers: 0.7, signet: 0.6, court: 0.4, library: 0.4, caves: 0.4, irongear: 0.4 };

function kcValue(env, kuid, pid = env.pid) {
  const g = env.g;
  const k = g.C(kuid);
  const key = k.def.key;
  const rounds = env.left + 1;
  let v = KC_BASE[key] ?? 2;
  const per = KC_PER_ROUND[key];
  if (per) v = (v - per * 3) + per * Math.min(rounds, 4);
  else if (rounds <= 1) v *= 0.55;
  // Situational adjustments.
  const hasCouncil = g.hasCardInCouncil(pid);
  if (key === 'monument' && !hasCouncil) v -= 1.5;
  if (key === 'estate' && !hasCouncil) v -= 1;
  if (key === 'beacon' && !g.zone(g.zk.sop(pid)).length) v = 0.2;
  if ((key === 'palace' || key === 'ring') && !g.S.tactics[pid].some((t) => !t.burned)) v = 0.3;
  if (key === 'tincrowns') {
    const f = g.zone(g.zk.hand(pid)).concat(g.zone(g.zk.deck(pid))).filter((u) => g.view(u).arch === 'follower').length;
    v = 1.5 + Math.min(3, f * 0.5);
  }
  if (key === 'splendid') {
    const fac = g.playerFaction(pid);
    v = { nobility: 3.5, uprising: 2.5, clans: 2.5, gathering: 2 }[fac] || 2.5;
  }
  if (key === 'guild') v = 2.5 + 0.55 * Math.min(rounds, 5);
  if (key === 'watchtowers') v = 2.5 + 0.5 * Math.min(rounds, 5);
  if (key === 'propaganda' && g.n === 2) v = 1.5;
  return Math.max(0.1, v);
}

// ------------------------------------------------------------------------------------------------ small selection helpers
// Pick option(s) from `scored` ([{o, s}]) honouring min / max. Higher score wins; noise handled by the caller.
function takeBest(scored, req, { threshold = -Infinity } = {}) {
  const arr = scored.slice().sort((a, b) => b.s - a.s);
  const out = [];
  for (const x of arr) {
    if (out.length >= req.max) break;
    if (out.length < req.min || x.s > threshold) out.push(x.o.id);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the planner (Herald, face-down cards, Supporters)
// Candidate plans: choose up to 3 hand cards and assign them to Regions. Returns { ev, assign:[uid|null x3] }.
function planFaceDown(env, hypLoc = null, forceCards = null) {
  const g = env.g;
  const hand = (forceCards || env.hand()).slice();
  const n = Math.min(3, hand.length);
  const w = regionWeights(env, env.pid, true, hypLoc);
  const models = {};
  for (const o of env.opps) models[o] = oppModel(env, o);
  const have = [0, 1, 2].map((r) => sum(g.activeOf(env.pid, r), (u) => g.view(u).str) + (env.S.region[r].fresh[env.pid] || 0) * (g.hasFx(env.pid, 'stones') ? 2 : 1));
  const strs = hand.map((u) => env.effStr(u));
  const isRuse = hand.map((u) => g.view(u).arch === 'ruse' || g.view(u).cmds.some((x) => x.c === 'ambush'));
  let best = { ev: -Infinity, assign: [null, null, null] };

  const regs = [0, 1, 2];
  // all ordered selections of n cards into distinct regions (regions left empty when hand < 3)
  const emptyRegions = n < 3 ? combos(regs, 3 - n) : [[]];
  const idx = hand.map((_, i) => i);
  for (const empty of emptyRegions) {
    const targets = regs.filter((r) => !empty.includes(r));
    for (const pick of permutations(idx, n)) {
      // pick[i] is the hand index placed in targets[i]
      const placed = new Set(pick);
      let ev = 0;
      // the best unplaced card can be Ambushed into a Region by a Ruse
      let reserve = 0;
      for (const i of idx) if (!placed.has(i)) reserve = Math.max(reserve, strs[i]);
      for (let k = 0; k < n; k++) {
        const r = targets[k];
        const i = pick[k];
        let s = strs[i] + have[r];
        if (isRuse[i]) s += reserve * 0.75;
        ev += w[r] * winProb(env, models, r, s);
        ev -= 0.06 * env.cv(hand[i]);
      }
      for (const r of empty) ev += w[r] * winProb(env, models, r, have[r]);
      if (ev > best.ev) {
        const assign = [null, null, null];
        targets.forEach((r, k) => { assign[r] = hand[pick[k]]; });
        best = { ev, assign };
      }
    }
  }
  return best;
}

function* permGen(arr, n, cur, used) {
  if (cur.length === n) { yield cur.slice(); return; }
  for (let i = 0; i < arr.length; i++) {
    if (used[i]) continue;
    used[i] = true; cur.push(arr[i]);
    yield* permGen(arr, n, cur, used);
    cur.pop(); used[i] = false;
  }
}
function permutations(arr, n) { return permGen(arr, n, [], []); }
function combos(arr, k) {
  const out = [];
  const rec = (start, cur) => {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

// ------------------------------------------------------------------------------------------------ Day Step evaluation
// Projects the outcome of the current Clash (Deadly / self-eliminating Agents are taken into account).
function clashProjection(env) {
  const g = env.g;
  const cl = env.S.clash;
  if (!cl) return null;
  const cards = g.clashCards();
  const deadlyOwners = new Set();
  for (const u of cards) if (g.view(u).cmds.some((x) => x.c === 'deadly' && x.step === 'night')) deadlyOwners.add(g.C(u).owner);
  const dead = new Set();
  for (const u of cards) {
    const c = g.C(u);
    const v = g.view(u);
    if (!v.inv && [...deadlyOwners].some((p) => p !== c.owner)) dead.add(u);
    if (c.def.logic === 'agent' && cards.some((o) => g.C(o).owner !== c.owner && g.view(o).arch === 'follower')) dead.add(u);
  }
  const totals = {};
  for (const p of cl.participants) {
    let t = 0;
    for (const u of cards) if (g.C(u).owner === p && !dead.has(u)) t += g.view(u).str;
    t += (env.S.region[cl.region].fresh[p] || 0) * (g.hasFx(p, 'stones') ? 2 : 1);
    t += cl.extra[p] || 0;
    totals[p] = t;
  }
  for (const u of g.zone(g.zk.regKC(cl.region))) {
    const k = g.C(u);
    if (k.def.key === 'citadel' && k.owner != null) for (const p of cl.participants) if (p !== k.owner) totals[p] = Math.ceil(totals[p] / 2);
  }
  const mine = totals[env.pid] || 0;
  const others = cl.participants.filter((p) => p !== env.pid).map((p) => totals[p] || 0);
  const best = others.length ? Math.max(...others) : 0;
  return { totals, mine, best, margin: mine - best, dead, region: cl.region };
}

// ------------------------------------------------------------------------------------------------ handlers: select
const H = {};

// ---- spring: bids
H.bid = (env, req) => {
  const g = env.g;
  const road = g.roadChoices(env.pid);
  const vals = road.map((k) => kcValue(env, k)).sort((a, b) => b - a);
  // Stealable Kingdom Cards from opponents also make a strong bid worthwhile.
  const steals = [];
  for (const o of env.opps) for (const b of g.boardKCs(o)) if (b.occ != null) steals.push({ v: kcValue(env, b.kc, env.pid) + kcValue(env, b.kc, o) * 0.35, need: g.C(b.occ).def.str + (g.hasKC(o, 'watchtowers') ? 5 : 0) });
  // Distribution of each opponent's bid strength.
  const oppStr = env.opps.map((o) => ({ o, pool: pooled(env, o), bonus: g.hasKC(o, 'watchtowers') ? 5 : 0 }));
  const scored = req.options.map((opt) => {
    const u = opt.uid;
    const s = g.bidStrengthOf(env.pid, u);
    // P(each opponent beats us)
    const pBeat = oppStr.map(({ o, pool, bonus }) => {
      const earlier = g.orderIndex(o) < g.orderIndex(env.pid);
      const mid = pool.filter((x) => x + bonus > s || (earlier && x + bonus === s)).length / pool.length;
      return clamp(mid * 0.85, 0, 1); // opponents rarely bid their very best card
    });
    // Probability to be at pick rank k
    let dist = [1];
    for (const p of pBeat) {
      const nd = new Array(dist.length + 1).fill(0);
      dist.forEach((d, k) => { nd[k] += d * (1 - p); nd[k + 1] += d * p; });
      dist = nd;
    }
    const cand = vals.slice();
    for (const st of steals) if (s > st.need) cand.push(st.v);
    cand.sort((a, b) => b - a);
    const cost = env.cv(u) * 0.75;
    let ev = 0;
    // A losing Bid can always be taken back (Return), so a pick is only taken when it is worth its price.
    for (let k = 0; k < dist.length; k++) ev += dist[k] * Math.max(0.12, (cand[k] ?? 0) - cost);
    return { o: opt, s: ev + env.jitter() };
  });
  return takeBest(scored, req);
};

H.bidResolve = (env, req) => {
  const g = env.g;
  const bid = req.ctx.bid;
  const bidCost = env.cv(bid);
  const slotsFull = (() => { const n = g.slotCount(env.pid); for (let i = 0; i < n; i++) if (g.kcAt(env.pid, i) == null) return false; return true; })();
  const weakestOwn = () => {
    const n = g.slotCount(env.pid);
    let m = Infinity;
    for (let i = 0; i < n; i++) { const k = g.kcAt(env.pid, i); if (k != null) m = Math.min(m, kcValue(env, k)); }
    return m === Infinity ? 0 : m;
  };
  const scored = req.options.map((o) => {
    if (o.kind === 'return') return { o, s: 0.15 + env.jitter() * 0.3 };
    const kcDef = g.C(o.kc).def;
    let v = kcValue(env, o.kc);
    let cost;
    if (kcDef.kind === 'occupy') {
      cost = bidCost * 0.55;
      if (slotsFull) v -= weakestOwn() * 0.85;
    } else {
      cost = bidCost * 0.9 + 0.2;
    }
    if (o.kind === 'steal') {
      v += kcValue(env, o.kc, o.owner) * 0.45; // denial
      // a stronger bid card protects the Kingdom Card from being stolen back
    } else {
      // Taking a good card off the Road also denies it to opponents.
      v += 0.25;
    }
    return { o, s: v - cost + env.jitter() };
  });
  return takeBest(scored, { ...req, min: 1, max: 1 });
};

// ---- spring: heralds
H.herald = (env, req) => {
  const g = env.g;
  const scored = req.options.map((o) => {
    let s;
    if (env.lvl.plan) {
      const plan = planFaceDown(env, o.loc);
      s = plan.ev;
    } else {
      s = locValue(env, env.pid, o.loc) + (LOCATIONS[o.loc].inf >= 2 ? 0.5 : 0);
    }
    // Do not walk into a crowded Region unless strong.
    const r = g.regionOfLoc(o.loc);
    for (const p of env.opps) if (g.heraldRegion(p) === r) s -= 0.15;
    return { o, s: s + env.jitter() };
  });
  return takeBest(scored, req);
};

H.rewardLoc = (env, req) => {
  const g = env.g;
  const scored = req.options.map((o) => {
    let s = locValue(env, env.pid, o.loc);
    if (env.S.herald[env.pid] === o.loc) {
      s += herdBonus(env, env.pid, o.loc);
      // relics cash-in is valuable only on the Herald's Location
    }
    // denial: opponents' heralds on the other location lose value
    for (const p of env.opps) if (env.S.herald[p] === o.loc) s += 0.4;
    for (const cn of ['relics']) { void cn; }
    return { o, s: s + env.jitter() };
  });
  void g;
  return takeBest(scored, req);
};

H.clashMarker = (env, req) => {
  // The first marker is the Region resolved first: resolve the least important one first so that the important Clashes
  // happen when more information is available and Flank / Retreat remain possible.
  const w = regionWeights(env, env.pid);
  const marker = req.ctx.marker || 1;
  const scored = req.options.map((o) => ({ o, s: (marker === 1 ? -w[o.region] : w[o.region] * 0.2) + env.jitter(0.6) }));
  return takeBest(scored, req);
};

H.tieCard = (env, req) => {
  const g = env.g;
  const w = regionWeights(env, env.pid);
  const r = req.ctx.region;
  const cards = req.options.filter((o) => o.kind === 'card');
  if (!cards.length) return ['pass'];
  const best = cards.slice().sort((a, b) => env.effStr(b.uid) - env.effStr(a.uid))[0];
  // Win chance: roughly the chance to hold the highest card among the tied players.
  const strength = env.effStr(best.uid);
  const pool = env.opps.length ? pooled(env, env.opps[0]) : [5];
  const pBetter = pool.filter((x) => x >= strength).length / pool.length;
  const p = Math.pow(1 - pBetter * 0.8, Math.max(1, env.opps.length - 1));
  const gain = w[r] * p - env.cv(best.uid) * 0.5;
  void g;
  return gain + env.jitter() > 0.2 ? [best.id] : ['pass'];
};

// ---- Kingdom Card / Tactic choices that are all about "which is worth the most"
const isNil = (o) => o.kind === 'none' || o.kind === 'pass';
const kcPick = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: (isNil(o) ? 0.05 : kcValue(env, o.uid) - 0.3) + env.jitter() }));
  return takeBest(scored, req);
};
H.advKC = kcPick;
H.moonshineKC = kcPick;
H.enchantressKC = kcPick;
H.foragers = kcPick;
H.riverRunners = (env, req) => {
  const g = env.g;
  const scored = req.options.map((o) => ({ o, s: kcValue(env, o.uid) + kcValue(env, o.uid, g.C(o.uid).owner) * 0.4 + env.jitter() }));
  return takeBest(scored, req);
};

H.replaceSlot = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: -(o.kc != null ? kcValue(env, o.kc) : 0) + env.jitter() }));
  return takeBest(scored, req);
};

H.placeKC = (env, req) => {
  // Region / Location placement of bold Kingdom Cards.
  const g = env.g;
  const kc = req.ctx.kc != null ? g.C(req.ctx.kc).def.key : '';
  const w = regionWeights(env, env.pid);
  const scored = req.options.map((o) => {
    let s = 0;
    if (o.kind === 'region') {
      const r = o.region;
      if (kc === 'citadel') s = w[r] + (g.activeOf(env.pid, r).length ? 0.6 : 0) + (env.S.herald[env.pid] != null && g.heraldRegion(env.pid) === r ? 1 : 0);
      else if (kc === 'court') s = g.governable(g.activeOf(env.pid, r)).length ? 1 : 0 + w[r] * 0.2;
      else s = w[r];
    } else if (o.kind === 'loc') {
      // Merchants' Guild: the Location claimed most often
      s = locValue(env, env.pid, o.loc) + (LOCATIONS[o.loc].inf >= 2 ? 1.4 : 0) + (o.loc === 'harvest' ? 0.4 : 0);
    }
    return { o, s: s + env.jitter() };
  });
  return takeBest(scored, req);
};

H.sundialRegion = (env, req) => {
  const w = regionWeights(env, env.pid);
  const scored = req.options.map((o) => ({ o, s: -w[o.region] + env.jitter() }));
  return takeBest(scored, req);
};

// ---- government / journey
function govValue(env, uid) {
  const g = env.g;
  const v = g.view(uid);
  if (env.left === 0) return -1; // nothing left to cash in
  const rel = env.left >= 1 ? 0.55 : 0.3;
  return v.votes * rel * 1.1 + 0.2 - env.cv(uid) * 0.9;
}
function journeyValue(env, uid) {
  const g = env.g;
  const v = g.view(uid);
  let lv = loreValue(env, env.pid) * v.lore;
  if (v.path) lv += 0.3; // does not end up in the Lost Pile
  return lv - env.cv(uid) * (v.path ? 0.5 : 0.85);
}

H.autumnGovern = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: govValue(env, o.uid) + env.jitter() }));
  return takeBest(scored, req);
};
H.castleGovern = (env, req) => {
  const g = env.g;
  const scored = req.options.map((o) => {
    if (isNil(o)) return { o, s: 0.05 + env.jitter() };
    let s = govValue(env, o.uid) + 0.5;
    // an Active card would be discarded anyway
    if (g.C(o.uid).z.endsWith(':active') && g.C(o.uid).inf === 0) s += 0.8;
    return { o, s: s + env.jitter() };
  });
  return takeBest(scored, req);
};
H.courtGovern = H.castleGovern;
H.queenGovern = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: o.kind === 'none' ? 0 : env.g.view(o.uid).votes + 0.5 + env.jitter() }));
  return takeBest(scored, req);
};

H.governCouncil = (env, req) => {
  const g = env.g;
  const card = req.ctx && req.ctx.card;
  const votes = card != null ? Math.max(1, g.view(card).votes) : 1;
  const scored = req.options.map((o) => {
    const cn = o.council;
    const mine = g.councilVotes(env.pid, cn);
    const theirs = Math.max(0, ...env.opps.map((p) => g.councilVotes(p, cn)));
    let s = 0;
    if (cn === 'relics') s = 2 + votes * 0.8 - (env.left === 0 ? 2 : 0);
    else if (cn === 'secrets') s = 1 + (mine + votes >= 1 ? 0.3 : 0) + Math.min(1.2, (mine + votes) * 0.25);
    else s = 0.9 + (g.P(env.pid).lostSup > 1 ? 0.6 : 0) + (mine + votes > theirs ? 0.4 : 0);
    // a Council full of enemy cards can be wiped by the Castle: avoid it
    const enemyCards = g.councilCards(cn).filter((c) => c.owner !== env.pid).length;
    s -= enemyCards * 0.15;
    return { o, s: s + env.jitter() };
  });
  return takeBest(scored, req);
};

H.autumnJourney = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: journeyValue(env, o.uid) + env.jitter() }));
  return takeBest(scored, req);
};
H.wildernessJourney = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: o.kind === 'none' ? 0.05 : journeyValue(env, o.uid) + 0.4 + env.jitter() }));
  return takeBest(scored, req);
};
H.smugglerJourney = (env, req) => (journeyValue(env, req.ctx.card) > 0 ? ['yes'] : ['no']);

// ---- Lore: buy the best Site of Power card
function sopValue(env, uid) {
  const d = env.g.C(uid).def;
  const r = env.left + 1;
  const base = {
    champion: 4.5, highCourt: 2.5, queen: 4.5, gildedWall: 2.0, royalBank: 3 + 0.9 * Math.min(r, 4),
    blackPowder: 2.5, guerrilla: 3.5, moonshine: 3.0, syndicate: 2.5,
    raidRaze: 3.0, riders: 5.5, newHavens: 3.5, embassy: 2.5,
    bringer: 3.0, tooth: 2.5, eye: 3.0, door: 3.0,
  }[d.logic] ?? (d.str ? d.str * 0.4 : 2);
  return (r <= 1 ? base * 0.5 : base);
}
H.spendLore = (env, req) => {
  const lore = req.ctx.lore;
  const scored = req.options.map((o) => {
    if (o.kind === 'none') return { o, s: 0.9 + env.jitter() };
    const val = sopValue(env, o.uid);
    return { o, s: val - o.cost * 0.35 + env.jitter() };
  });
  void lore;
  return takeBest(scored, { ...req, min: 1, max: 1 });
};

// ---- Relics / councils
H.relics = (env, req) => {
  const g = env.g;
  const scored = req.options.map((o) => {
    const votes = g.view(o.uid).votes;
    // Cashing in turns a card into Influence; keep cards in the Council only if the game goes on a long time.
    return { o, s: votes - (env.left >= 2 ? 0.6 : 0) + env.jitter() * 0.5 };
  });
  return takeBest(scored, req, { threshold: 0.3 });
};
H.relicsMarkers = () => ['yes'];
// Keeping Markers is worth more to the AI (they fund the Relics spend), so it declines the Syndicate option.
H.syndicateMarkers = () => ['no'];

H.secretsClaim = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: locValue(env, env.pid, o.loc) - LOCATIONS[o.loc].inf + env.jitter() }));
  return takeBest(scored, req);
};

H.highCourt = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: (o.council === 'relics' ? 1 : 0) + env.jitter() }));
  return takeBest(scored, req);
};

H.councilRemove = (env, req) => {
  const ids = req.options.map((o) => o.id);
  if (ids.includes('hand')) return ['hand'];
  if (ids.includes('lost') && env.left >= 1) return ['lost'];
  return ['discard'];
};

// ---- cards to give up
function costPick(env, req) {
  const scored = req.options.map((o) => {
    let s = -(o.kind === 'card' ? env.cv(o.uid) : 0);
    if (o.kind === 'none') s = -9;
    return { o, s: s + env.jitter() * 0.5 };
  });
  return takeBest(scored, req);
}
function goodPick(env, req) {
  const scored = req.options.map((o) => {
    let s = o.kind === 'card' ? env.cv(o.uid) : 0;
    if (o.kind === 'none') s = 0.05;
    return { o, s: s + env.jitter() * 0.5 };
  });
  return takeBest(scored, req);
}

H.discardExcess = costPick;
H.necropolisDiscard = (env, req) => {
  // Cycle weak cards out of the Hand: they are replaced by a fresh draw at the start of the next Year
  // (but only while the Deck still has cards, otherwise it would trigger Attrition).
  const g = env.g;
  const deckN = g.zone(g.zk.deck(env.pid)).length;
  const hand = env.hand();
  const pool = g.zone(g.zk.deck(env.pid)).concat(hand);
  const avg = pool.length ? sum(pool, (u) => env.cv(u)) / pool.length : 0.8;
  const maxN = Math.max(0, Math.min(req.max, deckN - 3, 3));
  const scored = req.options.map((o) => ({ o, s: avg - env.cv(o.uid) - 0.35 + env.jitter(0.4) })).filter((x) => x.s > 0);
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, maxN).map((x) => x.o.id);
};
H.shrine = (env, req) => {
  // Put weak cards at the bottom of the Deck (they will be drawn last); keep strong ones accessible.
  const scored = req.options.map((o) => ({ o, s: -env.cv(o.uid) + env.jitter() * 0.3 }));
  const bad = scored.filter((x) => env.cv(x.o.uid) < 0.55);
  const arr = bad.sort((a, b) => b.s - a.s).slice(0, req.max);
  return arr.map((x) => x.o.id);
};

H.mulligan = (env) => {
  const hand = env.hand().filter((u) => env.g.C(u).def.arch !== 'heir');
  const avg = hand.length ? sum(hand, (u) => env.g.C(u).def.str) / hand.length : 0;
  return avg < 3.2 ? ['yes'] : ['no'];
};
H.advOcc = costPick;
H.moonshineOcc = costPick;
H.riverRunnersOcc = costPick;
H.foragersOcc = costPick;
H.enchantressOcc = costPick;

// ---- tactics / palace / ring
H.palaceTactic = (env, req) => {
  const scored = req.options.map((o) => {
    const t = env.S.tactics[env.pid].find((x) => x.id === o.tid);
    // burn spent tiles first (they only give 1 Lore, so prefer tiles that are exhausted)
    return { o, s: (t.exhausted ? 1 : -1) + env.jitter() };
  });
  return takeBest(scored, req);
};
H.ringTactic = (env, req) => {
  const scored = req.options.map((o) => {
    const val = { river_runners: 5, school_of_the_stones: 3, night_raids: 3, witch_trial: 3, martial_law: 1, royal_seal: 3 }[o.tid] ?? 2.5;
    return { o, s: val + env.jitter() };
  });
  return takeBest(scored, req);
};

// ---- misc binary choices
H.royalSeal = (env) => {
  const g = env.g;
  const me = env.pid;
  const bids = {};
  for (const p of env.S.order) { const z = g.zone(g.zk.bid(p)); if (z.length) bids[p] = g.bidStrengthOf(p, z[0]); }
  const mine = bids[me] ?? 0;
  const rivals = env.opps.filter((o) => (bids[o] ?? 0) > mine);
  if (!rivals.length) return ['no'];
  const top = Math.max(...g.greatRoadCards().map((k) => kcValue(env, k)), 0);
  return top > 3.0 + (env.left > 1 ? 0.8 : 0) ? ['yes'] : ['no'];
};

H.royalBank = (env, req) => {
  // 'inf' is a sure point; fetching a Captain is only good if the discard pile holds a strong one
  const ids = req.options.map((o) => o.id);
  if (ids.includes('cap')) {
    const best = Math.max(0, ...env.g.zone(env.g.zk.discard(env.pid)).filter((u) => env.g.C(u).def.arch === 'captain').map((u) => env.cv(u)));
    if (best > 1.8 && env.g.handRoom(env.pid) > 0 && env.left > 0) return ['cap'];
  }
  return ['inf'];
};
H.royalBankBoth = () => ['yes'];
H.royalBankCaptain = goodPick;

H.regalGuard = () => ['inf'];
H.blackPowder = (env) => (loreValue(env, env.pid) > 0.4 ? ['lore'] : ['inf']);
H.doorExtra = () => ['no'];
H.airshipJourney = () => ['yes'];
H.retreatHerald = () => ['no'];
H.helm = (env) => (env.g.handRoom(env.pid) > 0 ? ['yes'] : ['no']);
H.monument = () => ['yes'];

H.orderPick = (env, req) => {
  const g = env.g;
  const pos = req.ctx.pos || 0;
  const scored = req.options.map((o) => {
    const p = o.player;
    let s;
    if (p === env.pid) s = pos === 0 ? 5 : pos === 1 ? 1 : -1;
    else s = g.P(p).inf * 0.2 + (pos === 0 ? 0 : 0.4);
    return { o, s: s + env.jitter() };
  });
  return takeBest(scored, req);
};

// Choose the Region for effects that add something (supporters / deploy / ...).
function bestRegionFor(env, req) {
  const w = regionWeights(env, env.pid);
  const g = env.g;
  const scored = req.options.map((o) => {
    const r = o.region;
    let s = w[r];
    s += sum(g.activeOf(env.pid, r), (u) => g.view(u).str) * 0.05;
    return { o, s: s + env.jitter() };
  });
  return takeBest(scored, req);
}
H.deployRegion = bestRegionFor;
H.newHavens = bestRegionFor;
H.spyRegion = bestRegionFor;
H.innkeeperRegion = bestRegionFor;
H.martialLaw = bestRegionFor;
H.flankRegion = (env, req) => {
  const g = env.g;
  const w = regionWeights(env, env.pid);
  const models = {};
  for (const o of env.opps) models[o] = oppModel(env, o);
  const scored = req.options.map((o) => {
    const r = o.region;
    const have = sum(g.activeOf(env.pid, r), (u) => g.view(u).str) + (env.S.region[r].fresh[env.pid] || 0);
    const u = req.ctx.source;
    const before = w[r] * winProb(env, models, r, have);
    const after = w[r] * winProb(env, models, r, have + g.view(u).str);
    return { o, s: after - before + env.jitter() };
  });
  return takeBest(scored, req);
};
H.prophetHerald = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: locValue(env, env.pid, o.loc) + (LOCATIONS[o.loc].inf >= 2 ? 0.5 : 0) + env.jitter() }));
  return takeBest(scored, req);
};
H.prophetSup = () => ['done'];
H.tourneyLoc = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: locValue(env, env.pid, o.loc) + env.jitter() }));
  return takeBest(scored, req);
};
H.tourneyCard = (env, req) => {
  // Highest unique Strength wins: the Heir (10) is unique inside our own pool, otherwise stay mid-high.
  const scored = req.options.map((o) => {
    const s = env.g.C(o.uid).def.str;
    return { o, s: s - (s >= 10 ? 0 : 0) * 0.1 - env.cv(o.uid) * 0.3 + env.jitter() };
  });
  return takeBest(scored, req);
};
H.sirenLoc = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: locValue(env, env.pid, o.loc) + env.jitter() }));
  return takeBest(scored, req);
};
H.sirenWho = (env, req) => {
  // Drag opponents' Heralds onto the chosen Location only if that location is crowded for them... pick none.
  void env;
  return req.options.length && req.min > 0 ? [req.options[0].id] : [];
};
H.rumours = (env, req) => {
  const mine = req.options.find((o) => o.player === env.pid);
  const hand = env.hand();
  const avg = hand.length ? sum(hand, (u) => env.cv(u)) / hand.length : 0;
  return mine && avg < 0.9 ? [mine.id] : [];
};
H.falseOrdersWho = (env, req) => [req.options[0].id];
H.falseOrdersPair = (env, req) => [req.options[Math.floor(env.rng.next() * req.options.length)].id];
H.spyOwn = () => ['none'];
H.spyTarget = (env, req) => [req.options[0].id];
H.witchTrial = (env, req) => {
  const g = env.g;
  const scored = req.options.map((o) => ({ o, s: sum(g.councilCards(o.council).filter((c) => c.owner !== env.pid), (c) => g.view(c.uid).votes) + env.jitter() }));
  return takeBest(scored, req);
};
H.witchTrialDeck = (env, req) => {
  // Move council cards to the top of the Deck: they come back next Round (and give Lore).
  const arr = req.options.slice().sort((a, b) => env.cv(b.uid) - env.cv(a.uid));
  return arr.slice(0, Math.min(req.max, Math.max(req.min, arr.length))).map((o) => o.id);
};
H.bell = () => ['top'];
H.bellOrder = (env, req) => req.options.slice().sort((a, b) => env.cv(b.uid) - env.cv(a.uid)).map((o) => o.id).slice(0, req.max);
H.rumoursOrder = (env, req) => req.options.slice().sort((a, b) => env.cv(a.uid) - env.cv(b.uid)).map((o) => o.id).slice(0, req.max);
H.bringerMarker = (env, req) => {
  const g = env.g;
  const scored = req.options.map((o) => ({ o, s: (o.council === 'relics' ? 1.5 : 0) + g.councilVotes(env.pid, o.council) * 0.1 + env.jitter() }));
  return takeBest(scored, req);
};
H.saltToughness = (env, req) => {
  const room = env.g.handRoom(env.pid);
  const arr = req.options.slice().sort((a, b) => env.cv(b.uid) - env.cv(a.uid)).filter((o) => env.cv(o.uid) > 0.45);
  return arr.slice(0, Math.min(room, req.max)).map((o) => o.id);
};
H.ritualSacrifice = (env, req) => {
  const arr = req.options.slice().sort((a, b) => env.cv(a.uid) - env.cv(b.uid)).filter((o) => env.cv(o.uid) < 0.55 && env.left > 0);
  return arr.slice(0, req.max).map((o) => o.id);
};
H.rallyCards = (env, req) => {
  const arr = req.options.slice().sort((a, b) => env.cv(b.uid) - env.cv(a.uid));
  return arr.slice(0, Math.max(req.min, Math.min(req.max, arr.length))).map((o) => o.id);
};
H.retreatCards = (env, req) => req.options.map((o) => o.id).slice(0, req.max);
H.retreatSup = (env, req) => [req.options[req.options.length - 1].id];
H.embassy = (env, req) => req.options.map((o) => o.id);
H.pardon = goodPick;
H.reservists = goodPick;
H.ritualSacrificeHand = goodPick;
H.boatmanLost = goodPick;
H.boatmanHand = costPick;
H.mirrorCard = goodPick;
H.mirrorLost = goodPick;
H.starsCard = goodPick;
H.irongear = goodPick;
H.heraldMoon = goodPick;
H.beacon = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: sopValue(env, o.uid) + env.jitter() }));
  return takeBest(scored, req);
};
H.estate = costPick;
H.tooth = costPick;
H.nightRaids = costPick;
H.lanesActive = costPick;
H.lanesTarget = goodPick;
H.swapHand = (env, req) => costPick(env, req);
H.swapTarget = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: -env.cv(o.uid) * 0.5 + env.jitter() }));
  return takeBest(scored, req);
};
H.doorCard = goodPick;
H.diaryCard = (env, req) => {
  const scored = req.options.map((o) => ({ o, s: govValue(env, o.uid) + 1 + env.jitter() }));
  return takeBest(scored, req);
};
H.diaryDiscard = (env, req) => {
  // discard enemy cards from the chosen Council
  const arr = req.options.filter((o) => env.g.C(o.uid).owner !== env.pid);
  return arr.slice(0, req.max).map((o) => o.id);
};
H.workshop = goodPick;
H.safehouses = goodPick;
H.seaLanes = goodPick;
H.smugglerCard = goodPick;
H.hornCard = goodPick;
H.spearCard = goodPick;
H.shieldCard = goodPick;
H.outBeyondA = (env, req) => [req.options[0].id];
H.outBeyondB = (env, req) => [req.options[0].id];
H.banner = (env, req) => {
  // Prefer returning Supporters from the Map (they would be lost in Winter)
  const reg = req.options.filter((o) => o.kind === 'region');
  if (reg.length) return [reg[0].id];
  const lost = req.options.find((o) => o.id === 'lost');
  return lost ? [lost.id] : ['done'];
};
H.lantern = (env, req) => {
  const reg = req.options.filter((o) => o.kind === 'region');
  const w = regionWeights(env, env.pid);
  if (reg.length) return [reg.sort((a, b) => w[b.region] - w[a.region])[0].id];
  return [req.options[0].id];
};
H.lanternN = (env, req) => [req.options[req.options.length - 1].id];
H.newHavensN = (env, req) => [req.options[req.options.length - 1].id];
H.raidRaze = (env, req) => [req.options[req.options.length - 1].id];
H.innkeeperSwap = () => null;

// Generic leftovers
function generic(env, req) {
  const g = env.g;
  const scored = req.options.map((o) => {
    let s = 0;
    switch (o.kind) {
      case 'card': s = req.intent === 'cost' ? -env.cv(o.uid) : req.intent === 'good' ? env.cv(o.uid) : 0; break;
      case 'region': s = regionWeights(env, env.pid)[o.region]; break;
      case 'loc': s = locValue(env, env.pid, o.loc); break;
      case 'council': s = g.councilVotes(env.pid, o.council) * 0.1; break;
      case 'yes': s = req.intent === 'good' ? 1 : -0.5; break;
      case 'no': s = req.intent === 'good' ? 0 : 0; break;
      case 'num': s = req.intent === 'good' ? o.n : 0; break;
      case 'none': s = 0.1; break;
      case 'pass': s = 0; break;
      default: s = 0;
    }
    return { o, s: s + env.jitter() };
  });
  return takeBest(scored, req);
}

// ------------------------------------------------------------------------------------------------ action selection
function actionScores(env, req) {
  const g = env.g;
  const pid = env.pid;
  const step = req.ctx.step;
  const rounds = env.left; // Rounds after this one
  const urgency = 1 + (1 - rounds / Math.max(1, env.maxR)) * 0.4; // one-shot things get used eventually
  const lastRound = rounds === 0;
  const proj = step === 'day' ? clashProjection(env) : null;
  const wAll = regionWeights(env, pid);
  const out = [];

  const handCards = env.hand();
  const activeAll = g.activeOf(pid);

  for (const o of req.options) {
    if (o.kind === 'pass') continue;
    let s = 0.35; // unknown actions are mildly interesting
    const k = o.id;
    if (o.act === 'sup') {
      s = 9;
    } else if (o.act === 'govern') {
      const best = Math.max(-9, ...g.governable(handCards).map((u) => govValue(env, u)));
      s = best > 0.2 ? 2.6 + best * 0.4 : 0;
    } else if (o.act === 'journey') {
      const cands = g.journeyable(g.journeySources(pid));
      const best = Math.max(-9, ...cands.map((u) => journeyValue(env, u)));
      s = best > 0.15 ? 2.0 + best * 0.5 : 0;
      if (lastRound && g.zone(g.zk.sop(pid)).length) s = 0;
    } else if (o.act === 'council') {
      if (o.council === 'secrets') {
        const v = g.councilVotes(pid, 'secrets');
        const top = Math.max(0, ...LOC_IDS.map((l) => env.S.lmark[l][pid] || 0));
        s = top + v >= 4 ? 3.2 : (lastRound ? 0 : 0.8 + v * 0.2);
      } else {
        const lostSup = g.P(pid).lostSup;
        const onMap = g.totalSupOnMap(pid);
        s = (lastRound ? 0 : Math.min(g.councilVotes(pid, 'oaths') + 1, lostSup + onMap) * 0.55);
      }
    } else if (o.act === 'tactic') {
      s = tacticScore(env, o.tid, { proj, wAll, urgency, lastRound });
    } else if (o.act === 'kf') {
      s = kfScore(env, g.playerFaction(pid), { proj, urgency });
      if (o.free) s += 0.3;
    } else if (o.act === 'kfsim') {
      s = kfScore(env, o.faction, { proj, urgency }) * 0.8;
    } else if (o.act === 'kc' || o.act === 'card') {
      s = cardActionScore(env, o, { proj, wAll, urgency, lastRound, step });
    } else if (o.act === 'cmd') {
      s = commandScore(env, o, { proj, wAll, urgency, lastRound, step });
    }
    void k;
    out.push({ o, s });
  }
  return out;
}

function tacticScore(env, tid, ctx) {
  const g = env.g;
  const pid = env.pid;
  const { proj, urgency, lastRound } = ctx;
  const supMap = g.totalSupOnMap(pid);
  switch (tid) {
    case 'school_of_the_stones': return supMap >= 3 ? 1.5 + supMap * 0.55 : (lastRound && supMap >= 2 ? 2.2 : 0.1);
    case 'school_of_the_storms': return 2.0 * urgency;
    case 'school_of_the_streets': {
      const heir = env.hand().some((u) => g.view(u).arch === 'heir') || g.activeOf(pid).some((u) => g.view(u).arch === 'heir');
      return heir ? 1.4 * urgency : 0.3;
    }
    case 'martial_law': return 1.2;
    case 'night_raids': {
      const n = g.boardKCs(pid).length;
      const hands = sum(env.opps, (o) => Math.min(n, g.zone(g.zk.hand(o)).length));
      return hands * 0.65 * (lastRound ? 0.4 : 1) - 0.6;
    }
    case 'false_orders': return 0.2;
    case 'safehouses': return 0.2;
    case 'river_runners': {
      const best = Math.max(0, ...env.opps.flatMap((o) => g.boardKCs(o).map((b) => kcValue(env, b.kc, pid) + 0.4 * kcValue(env, b.kc, o))));
      const cost = Math.min(9, ...handCardsCv(env));
      return best >= 3 ? best * 0.9 - cost * 0.5 : 0.1;
    }
    case 'salt_toughness': {
      const room = g.handRoom(pid);
      const pool = g.activeOf(pid).filter((u) => g.C(u).inf === 0).concat(g.zone(g.zk.discard(pid)));
      const good = pool.filter((u) => env.cv(u) > 0.9).length;
      return Math.min(room, good) * 0.75 * (lastRound ? 0.1 : 1);
    }
    case 'witch_trial': {
      const theirs = sum(COUNCILS, (cn) => g.councilCards(cn).filter((c) => c.owner !== pid).length);
      const mine = sum(COUNCILS, (cn) => g.councilCards(cn, pid).length);
      return theirs >= 2 ? theirs * 1.1 - mine * 0.8 : -1;
    }
    case 'moonlit_foragers': {
      const free = [0, 1, 2].slice(0, g.slotCount(pid)).some((i) => g.kcAt(pid, i) == null);
      return free && env.hand().length >= 4 ? 2.0 * (lastRound ? 0.3 : 1) : 0.2;
    }
    case 'out_beyond_the_lights': return 0.2;
    case 'ritual_sacrifice': {
      const weak = g.zone(g.zk.discard(pid)).filter((u) => env.cv(u) < 0.55).length;
      return lastRound ? 0 : weak >= 2 ? 0.7 + weak * 0.3 : 0.2;
    }
    case 'sea_lanes': return 0.3;
    case 'school_of_the_stars': {
      if (!proj) return 0;
      const pool = g.zone(g.zk.lost(pid)).filter((u) => g.C(u).kind === 'f');
      const bestStr = Math.max(0, ...pool.map((u) => g.view(u).str));
      const need = -proj.margin + 0.5;
      const w = ctx.wAll[proj.region];
      // supporters (2) leave the Region: -2
      return bestStr - 2 > need && need > -1 ? w * 1.3 : 0.1;
    }
    default: return 0.4;
  }
}
const handCardsCv = (env) => env.hand().map((u) => env.cv(u));

function kfScore(env, fac, ctx) {
  const g = env.g;
  const pid = env.pid;
  const { proj, urgency } = ctx;
  switch (fac) {
    case 'nobility': return 5.2;
    case 'uprising': return 0.5;
    case 'clans': {
      if (!proj) return 0;
      const here = proj.region;
      const sups = [0, 1, 2].filter((r) => r !== here).reduce((a, r) => a + Math.min(2, g.supportersOn(r, pid)), 0);
      const w = ctx.wAll ? ctx.wAll[here] : 2;
      const swing = proj.margin <= 0 && proj.margin + Math.min(2, sups) > 0;
      return swing ? 2.5 + w : 0.3;
    }
    case 'gathering': {
      const r = g.heraldRegion(pid);
      if (r < 0) return 0;
      const saved = g.activeOf(pid, r).filter((u) => g.C(u).inf === 0).map((u) => env.cv(u));
      return saved.length ? Math.max(...saved) * 1.0 * urgency : 0;
    }
    default: return 0.3;
  }
}

function cardActionScore(env, o, ctx) {
  const g = env.g;
  const pid = env.pid;
  const { proj, urgency, lastRound, step } = ctx;
  const c = g.C(o.uid);
  const key = c.kind === 'k' ? c.def.key : c.def.logic;
  const act = o.key;
  const hand = env.hand();
  switch (key) {
    case 'monument': return 6;
    case 'bothies': return 5;
    case 'palace': return lastRound ? 0.8 : 0.4;
    case 'pardons': {
      const best = Math.max(0, ...g.zone(g.zk.discard(pid)).map((u) => env.cv(u)));
      return g.handRoom(pid) > 0 ? best * 1.1 : best * 0.3;
    }
    case 'rumours': return 0.6;
    case 'clockwork': return 0.3;
    case 'innkeeper': return 0.4;
    case 'siren': return 0.2;
    case 'boatman': {
      const lost = Math.max(0, ...g.zone(g.zk.lost(pid)).filter((u) => g.C(u).kind === 'f').map((u) => env.cv(u)));
      const weak = Math.min(9, ...hand.map((u) => env.cv(u)));
      return lost - weak > 0.8 ? (lost - weak) * 0.9 : 0.1;
    }
    case 'enchantress': {
      const vals = g.roadChoices(pid).map((k) => kcValue(env, k)).sort((a, b) => b - a);
      const total = (vals[0] || 0) + (vals[1] || 0);
      return total - kcValue(env, c.uid) - 1.8 > 1.2 && hand.length >= 4 ? 2.5 : 0.1;
    }
    case 'tourney': {
      const mx = Math.max(0, ...hand.map((u) => g.C(u).def.str));
      return mx >= 9 && env.opps.length <= 2 ? 2.8 : 0.5;
    }
    case 'sundial': return 0.2;
    case 'estate': return lastRound ? 0 : (g.P(pid).handSize <= 6 ? 1.3 : 0.2);
    case 'court': {
      const r = c.z && /^R(\d):kc$/.exec(c.z);
      const reg = r ? +r[1] : -1;
      const cand = g.governable(g.activeOf(pid, reg));
      if (!cand.length || lastRound) return 0;
      const best = Math.max(...cand.map((u) => govValue(env, u) + (g.C(u).inf === 0 ? 0.8 : 0)));
      return best > 0.2 ? 2.4 : 0;
    }
    case 'diary': {
      if (lastRound) return 0;
      const cand = g.governable(g.activeOf(pid)).filter((u) => g.C(u).inf === 0);
      return cand.length ? 1.2 + Math.max(...cand.map((u) => g.view(u).votes)) * 0.4 : 0.1;
    }
    case 'irongear': case 'heraldMoon': {
      const room = g.handRoom(pid);
      const saved = g.activeOf(pid).filter((u) => g.C(u).inf === 0).map((u) => env.cv(u));
      return room > 0 && saved.length && !lastRound ? Math.max(...saved) * 1.0 : 0;
    }
    case 'bell': return lastRound || !g.zone(g.zk.lost(pid)).some((u) => g.C(u).kind === 'f') ? 0 : 0.5;
    case 'banner': {
      const onMap = g.totalSupOnMap(pid);
      return lastRound ? 0 : Math.min(2, onMap + g.P(pid).lostSup) * 0.6;
    }
    case 'reservists': {
      const f = g.zone(g.zk.discard(pid)).filter((u) => g.view(u).arch === 'follower');
      return g.handRoom(pid) > 0 && f.length ? Math.max(...f.map((u) => env.cv(u))) * 0.9 : 0;
    }
    case 'workshop': return 0.6;
    case 'ring': {
      const exh = g.S.tactics[pid].filter((t) => !t.burned && t.exhausted);
      return exh.length && !lastRound ? 2.4 : 0;
    }
    // Day KCs (resolved against the live Clash)
    case 'truenames': {
      if (!proj) return 0;
      return proj.margin < 0 && proj.region != null ? 1.4 * ctx.wAll[proj.region] : 0.2;
    }
    case 'lantern': return 0.2;
    case 'mirror': {
      if (!proj) return 0;
      const pool = g.S.order.flatMap((p) => g.zone(g.zk.lost(p)).filter((u) => g.C(u).kind === 'f'));
      const bestStr = Math.max(0, ...pool.map((u) => g.C(u).def.str));
      const mine = g.clashCards().filter((u) => g.C(u).owner === pid);
      if (!mine.length || !bestStr) return 0;
      const weakest = Math.min(...mine.map((u) => g.view(u).str));
      const gain = bestStr - weakest;
      const need = -proj.margin + 0.5;
      return gain >= need && need > -1 ? ctx.wAll[proj.region] * 1.2 : 0.1;
    }
    case 'lanes': return 0.3;
    case 'smuggler': {
      if (!proj) return 0;
      return proj.margin <= -4 ? 1.4 : 0;
    }
    case 'horn': {
      if (!proj) return 0;
      const gain = Math.max(0, ...hand.map((u) => g.C(u).def.str));
      const need = -proj.margin + 0.5;
      return gain >= need && need > -1 && hand.length ? ctx.wAll[proj.region] * 0.9 : 0.1;
    }
    case 'sword': {
      if (!proj) return 0;
      const need = -proj.margin + 0.5;
      const w = ctx.wAll[proj.region];
      if (need > 0 && 5 >= need) return w * 1.5 + 0.5;
      return 0;
    }
    case 'spear': {
      if (!proj) return 0;
      const myBest = g.clashCards().filter((u) => g.C(u).owner === pid);
      const oppVuln = g.clashCards().filter((u) => g.C(u).owner !== pid && !g.view(u).inv);
      const killed = sum(oppVuln, (u) => g.view(u).str);
      if (!myBest.length || proj.margin >= 3) return 0;
      return killed - Math.max(0, -proj.margin) > 2 ? ctx.wAll[proj.region] * 1.3 : 0.1;
    }
    case 'shield': {
      if (!proj) return 0;
      const threat = g.clashCards().some((u) => g.C(u).owner !== pid && g.view(u).cmds.some((x) => x.c === 'deadly' && x.step === 'night'));
      const vuln = g.clashCards().filter((u) => g.C(u).owner === pid && !g.view(u).inv);
      return threat && vuln.length ? Math.max(...vuln.map((u) => g.view(u).str)) * 0.3 + 0.8 : 0.1;
    }
    // faction card actions
    case 'highCourt': return lastRound ? 0 : 0.3;
    case 'gildedWall': return 0.9;
    case 'royalBank': return 5.5;
    case 'bringer': return 0.8;
    case 'moonshine': {
      const hasCard = hand.some((u) => ['captain', 'champion'].includes(g.view(u).arch));
      const vals = g.roadChoices(pid).map((k) => kcValue(env, k)).sort((a, b) => b - a);
      const slotFree = g.kcAt(pid, 2) == null;
      return hasCard && vals.length ? (slotFree ? vals[0] * 0.9 : vals[0] - 2.5) - 0.8 : 0;
    }
    case 'newHavens': return g.P(pid).lostSup > 0 ? 1.6 : 0;
    case 'tooth': return 0.5;
    case 'door': return 0.3;
    case 'embassy': return 0.2;
    default: return step === 'day' ? 0.2 : 0.4;
  }
}

function commandScore(env, o, ctx) {
  const g = env.g;
  const pid = env.pid;
  const { proj, lastRound, wAll } = ctx;
  const u = o.uid;
  switch (o.cmd) {
    case 'ambush': {
      if (!proj) return 0;
      const pool = (o.fromDiscard ? g.zone(g.zk.discard(pid)) : env.hand());
      const cards = pool.map((x) => g.C(x).def.str);
      const mx = cards.length ? Math.max(...cards) : 0;
      const need = -proj.margin + 0.5;
      const w = wAll[proj.region];
      // cards that kill themselves or stay vulnerable are discounted
      if (proj.margin > 2) return 0.1;
      if (mx >= need) return (w * 1.2 + 0.6) * (proj.margin > -1 ? 0.9 : 1);
      return 0.15;
    }
    case 'retreat': {
      if (!proj) return 0;
      const r = proj.region;
      const mineHere = g.activeOf(pid, r);
      const vuln = mineHere.filter((x) => proj.dead.has(x));
      const saved = sum(mineHere.filter((x) => g.C(x).inf === 0), (x) => env.cv(x));
      if (proj.margin <= -4 || vuln.length >= 2) return Math.min(3, saved * 0.8) + (vuln.length ? 0.5 : 0);
      if (vuln.length && proj.margin < 0) return 1.5;
      return 0;
    }
    case 'flank': {
      if (!proj) return 0;
      const dests = g.flankTargets(proj.region);
      if (!dests.length) return 0;
      const here = proj.region;
      const str = g.view(u).str;
      // Card is useless where it is if we are losing badly or winning easily
      if (proj.margin <= -(str + 1) || proj.margin >= str + 4) return 1.2 + Math.max(...dests.map((r) => wAll[r])) * 0.2;
      void here;
      return 0.1;
    }
    case 'rally': {
      if (lastRound) return 0;
      const saved = g.activeOf(pid).filter((x) => g.C(x).inf === 0).map((x) => env.cv(x)).sort((a, b) => b - a);
      const n = o.mode === 'self' ? 1 : Math.min(o.n || 1, saved.length);
      const val = sum(saved.slice(0, n));
      return g.handRoom(pid) > 0 ? val * 0.85 : val * 0.3;
    }
    case 'deploy': {
      const str = g.view(u).str;
      return str >= 2 ? 0.5 + str * 0.32 : 0.3;
    }
    default: return 0.3;
  }
}

H.action = (env, req) => {
  const lvl = env.lvl;
  const step = req.ctx.step;
  const pass = req.options.find((o) => o.kind === 'pass');
  // Easy ignores the Day Step most of the time (it is the hardest part to read).
  if (!lvl.day && step === 'day' && env.rng.next() < 0.75) return [pass.id];
  const scored = actionScores(env, req);
  const threshold = 0.9 + (lvl.noise > 0.5 ? 0.3 : 0);
  const best = scored.map((x) => ({ ...x, s: x.s + env.jitter() })).sort((a, b) => b.s - a.s)[0];
  if (best && best.s >= threshold) return [best.o.id];
  return [pass.id];
};

// Nested decisions that depend on the specific action that created them:
H.ambushCard = (env, req) => {
  const g = env.g;
  const proj = clashProjection(env);
  const need = proj ? -proj.margin + 0.5 : 0;
  const cards = req.options;
  // The weakest card that still flips the Clash (keep stronger cards); otherwise the strongest card.
  const good = cards.filter((o) => g.C(o.uid).def.str >= need).sort((a, b) => g.C(a.uid).def.str - g.C(b.uid).def.str);
  if (good.length) return [good[0].id];
  return [cards.slice().sort((a, b) => g.C(b.uid).def.str - g.C(a.uid).def.str)[0].id];
};

// ------------------------------------------------------------------------------------------------ assign / distribute
function decideAssign(env, req) {
  const g = env.g;
  if (req.purpose !== 'faceDown') return null;
  const lvl = env.lvl;
  const cards = req.cards.slice();
  const n = Math.min(cards.length, req.slots.length);
  if (lvl.plan) {
    const plan = planFaceDown(env, null);
    const out = plan.assign.slice();
    if (out.filter((u) => u != null).length === n) return out;
  }
  // Easy / fallback: the strongest cards go to the most valuable Regions
  const w = regionWeights(env, env.pid);
  const order = [0, 1, 2].sort((a, b) => w[b] + env.jitter() * 2 - w[a]);
  const byStr = cards.slice().sort((a, b) => env.effStr(b) - env.effStr(a) + env.jitter() * 2);
  const out = [null, null, null];
  for (let i = 0; i < n; i++) out[order[i]] = byStr[i];
  void g;
  return out;
}

function decideDistribute(env, req) {
  const g = env.g;
  const pid = env.pid;
  const slots = req.slots;
  const out = slots.map(() => 0);
  switch (req.purpose) {
    case 'placeSup': {
      const total = req.total;
      // How many to commit this Round
      const stones = g.S.tactics[pid].some((t) => t.id === 'school_of_the_stones' && !t.exhausted && !t.burned);
      const rounds = env.left + 1;
      let commit = rounds <= 1 ? total : Math.min(total, Math.max(2, Math.ceil((total * 2) / rounds)));
      if (stones || g.hasFx(pid, 'stones')) commit = total;
      if (!env.lvl.plan) commit = Math.min(total, 1 + env.rng.int(total));
      const w = regionWeights(env, pid);
      const models = {};
      for (const o of env.opps) models[o] = oppModel(env, o);
      const have = [0, 1, 2].map((r) => sum(g.activeOf(pid, r), (u) => g.view(u).str) + (env.S.region[r].fresh[pid] || 0) * (g.hasFx(pid, 'stones') ? 2 : 1));
      const faceDown = [0, 1, 2].map((r) => { const u = g.zone(g.zk.down(r)).find((x) => g.C(x).owner === pid); return u != null ? env.effStr(u) : 0; });
      const cur = [0, 1, 2].map((r) => have[r] + faceDown[r]);
      const unit = g.hasFx(pid, 'stones') ? 2 : 1;
      for (let i = 0; i < commit; i++) {
        let bestR = 0; let bestGain = -Infinity;
        for (let r = 0; r < slots.length; r++) {
          if (out[r] >= slots[r].cap) continue;
          const gain = w[slots[r].region] * (winProb(env, models, slots[r].region, cur[slots[r].region] + unit) - winProb(env, models, slots[r].region, cur[slots[r].region])) + env.jitter(0.3);
          if (gain > bestGain) { bestGain = gain; bestR = r; }
        }
        out[bestR]++; cur[slots[bestR].region] += unit;
      }
      return out;
    }
    case 'secretsMarkers': {
      let left = req.total;
      // pile everything on the Location closest to four markers (and valuable)
      const order = slots.map((s, i) => ({ i, v: (env.S.lmark[s.loc][pid] || 0) * 1.2 + locValue(env, pid, s.loc) * 0.4 })).sort((a, b) => b.v - a.v);
      for (const { i } of order) { const k = Math.min(slots[i].cap, left); out[i] = k; left -= k; if (left <= 0) break; }
      return out;
    }
    case 'oathsReturn': {
      let left = req.total;
      // Supporters left on the map are lost in Winter: save those first
      const order = slots.map((s, i) => ({ i, v: s.lost ? 0 : 1 + (s.region === g.heraldRegion(pid) ? 0 : 0.2) })).sort((a, b) => b.v - a.v);
      for (const { i } of order) { const k = Math.min(slots[i].cap, left); out[i] = k; left -= k; if (left <= 0) break; }
      return out;
    }
    default: return null;
  }
}

// ------------------------------------------------------------------------------------------------ main entry
export function heuristicDecide(game, req, rng, levelName) {
  const lvl = LEVELS[levelName] || LEVELS.normal;
  const env = new Env(game, req, rng, lvl);
  if (req.type === 'peek') return null;

  if (req.type === 'assign') return decideAssign(env, req);
  if (req.type === 'distribute') return decideDistribute(env, req);
  if (req.type !== 'select') return undefined;

  // Occasional lapses (random legal answer) for the weaker levels.
  if (lvl.lapse > 0 && rng.next() < lvl.lapse && req.purpose !== 'bid') return randomDecide(game, req, rng);

  const handler = H[req.purpose] || generic;
  let ans = handler(env, req);
  if (ans == null) ans = generic(env, req);
  return ans;
}

export { LEVELS };

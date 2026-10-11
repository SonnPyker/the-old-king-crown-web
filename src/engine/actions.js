// Action Steps: everything a player may activate in the Spring / Day / Autumn Action Steps
// (card & Kingdom Card Actions, Tactics, Kingdom's Favour, Council Actions, Govern / Journey, Commands).

import { Game } from './game.js';
import { COUNCILS, LOC_IDS } from '../data/constants.js';
import { TACTIC_DEFS, KF_DEFS } from '../data/tactics.js';
import { TACTIC_LOGIC, KF_LOGIC } from './logic/index.js';

const isActiveZone = (z) => !!z && /^R\d:active$/.test(z);
const zoneKind = (c) => (isActiveZone(c.z) ? 'active' : c.z && c.z.startsWith('C:') ? 'council' : 'other');

Object.assign(Game.prototype, {
  // One player's Action Step. `only` restricts the step to the printed / gained Actions and Commands
  // of the listed cards (used when Ambushed cards are revealed).
  *actionStep(pid, step, { only = null } = {}) {
    this.S.stepSeq++;
    for (;;) {
      const opts = this.collectActions(pid, step, only);
      if (!opts.length) return;
      const options = opts.map((o) => o.opt).concat([{ id: 'pass', kind: 'pass' }]);
      const [r] = yield* this.select(pid, {
        purpose: 'action', prompt: 'p.action', options, auto: false, intent: 'neutral',
        ctx: { step, region: this.S.clash ? this.S.clash.region : null, restricted: !!only },
      });
      if (!r || r.kind === 'pass') return;
      const o = opts.find((x) => x.opt.id === r.id);
      for (const m of [].concat(o.mark || [])) this.markUsed(m);
      yield* o.run();
      this.syncClash();
    }
  },

  // Every Action / Command the player could activate right now.
  collectActions(pid, step, only = null) {
    const g = this;
    const S = this.S;
    const cl = S.clash;
    const out = [];
    const add = (opt, mark, run) => out.push({ opt, mark, run });
    const hand = () => this.zone(this.zk.hand(pid));

    // ------------------------------------------------------------- system Actions
    if (!only) {
      if (step === 'spring') {
        const k = this.roundKey('sup|' + pid);
        if (this.P(pid).boardSup > 0 && !this.usedKey(k)) {
          add({ id: 'a:sup', kind: 'action', act: 'sup' }, k, () => g.placeSupporters(pid));
        }
      }
      if (step === 'autumn') {
        const kg = this.stepKey('govern');
        if (!this.usedKey(kg) && this.governable(hand().slice()).length) {
          add({ id: 'a:govern', kind: 'action', act: 'govern' }, kg, function* () {
            yield* g.chooseGovern(pid, hand().slice(), { optional: false, purpose: 'autumnGovern' });
          });
        }
        const kj = this.stepKey('journey');
        if (!this.usedKey(kj) && this.journeyable(this.journeySources(pid)).length) {
          add({ id: 'a:journey', kind: 'action', act: 'journey' }, kj, function* () {
            const cand = g.journeyable(g.journeySources(pid));
            const u = yield* g.chooseCard(pid, cand, { purpose: 'autumnJourney', prompt: 'p.journeyCard', intent: 'good' });
            if (u != null) yield* g.journey(pid, u);
          });
        }
      }
    }

    // ------------------------------------------------- Actions printed on cards (Faction & Kingdom)
    for (const s of this.sourcesOf(pid)) {
      const L = s.logic;
      if (!L.actions) continue;
      const c = s.card;
      if (only && !only.includes(c.uid)) continue;
      for (const a of L.actions) {
        if (a.step !== step) continue;
        if (c.kind === 'f') {
          if (a.zones && !a.zones.includes(zoneKind(c))) continue;
          if (step === 'day' && isActiveZone(c.z) && !(cl && cl.cards.includes(c.uid))) continue;
        }
        const key = this.roundKey(`act|${c.uid}|${s.id || ''}|${a.key}`);
        if (this.usedKey(key)) continue;
        if (a.can && !a.can(this, c, pid)) continue;
        add({
          id: `a:${c.kind === 'k' ? 'kc' : 'card'}:${c.uid}:${s.id || ''}:${a.key}`, kind: 'action',
          act: c.kind === 'k' ? 'kc' : 'card', uid: c.uid, key: a.key,
        }, key, () => a.run(g, c, pid));
      }
    }

    if (!only) {
      // ------------------------------------------------------------------ Council Actions
      if (step === 'autumn') {
        for (const cn of ['secrets', 'oaths']) {
          const key = this.roundKey(`act|council|${cn}|${pid}`);
          if (this.usedKey(key) || this.councilVotes(pid, cn) < 1) continue;
          add({ id: 'a:council:' + cn, kind: 'action', act: 'council', council: cn }, key,
            () => (cn === 'secrets' ? g.secretsAction(pid) : g.oathsAction(pid)));
        }
      }

      // --------------------------------------------------------------------- Tactic Tiles
      for (const t of S.tactics[pid]) {
        const def = TACTIC_DEFS[t.id];
        if (def.step !== step || t.exhausted || t.burned) continue;
        const L = TACTIC_LOGIC[t.id];
        if (!L || L.reaction) continue;
        const key = def.markers > 0 ? this.stepKey('tactic|' + t.id) : this.roundKey('act|tactic|' + t.id);
        if (this.usedKey(key) || !L.can(this, t, pid)) continue;
        add({ id: 'a:tactic:' + t.id, kind: 'action', act: 'tactic', tid: t.id }, key, function* () {
          if (def.markers > 0) { t.markers -= 1; if (t.markers <= 0) { t.markers = 0; t.exhausted = true; } } else t.exhausted = true;
          g.log('useTactic', { pid, tid: t.id });
          yield* L.run(g, t, pid);
        });
      }

      // ------------------------------------------------------------ Kingdom's Favour
      const fac = this.playerFaction(pid);
      const kdef = KF_DEFS[fac];
      if (kdef && kdef.step === step) {
        const holds = S.kf.holder === pid;
        const splendid = this.hasKC(pid, 'splendid');
        const k0 = this.roundKey('kf0|' + pid);
        const k1 = this.roundKey('kf1|' + pid);
        let slot = null;
        if (!this.usedKey(k0)) { if (holds || splendid) slot = 0; } else if (!this.usedKey(k1) && splendid && holds) slot = 1;
        if (slot != null && KF_LOGIC[fac].can(this, pid)) {
          add({ id: 'a:kf', kind: 'action', act: 'kf', faction: fac, free: !(holds && slot === 0) }, slot === 0 ? k0 : k1, function* () {
            if (holds && slot === 0) g.useKFcharge();
            g.log('useKF', { pid, faction: fac });
            yield* KF_LOGIC[fac].run(g, pid);
          });
        }
      }
      if (this.hasKC(pid, 'simulacrum')) {
        const key = this.roundKey('act|sim|' + pid);
        if (!this.usedKey(key)) {
          for (const o of this.opponents(pid)) {
            const of = this.playerFaction(o);
            if (of === fac && kdef.step === step) continue; // identical to the own Favour (cannot happen with unique factions)
            if (KF_DEFS[of].step !== step || !KF_LOGIC[of].can(this, pid)) continue;
            add({ id: 'a:sim:' + of, kind: 'action', act: 'kfsim', faction: of }, key, function* () {
              g.log('useKFsim', { pid, faction: of });
              yield* KF_LOGIC[of].run(g, pid);
            });
          }
        }
      }
    }

    // ------------------------------------------------------------------------- Commands
    this.commandOptions(pid, step, only, add);
    return out;
  },

  commandOptions(pid, step, only, add) {
    const g = this;
    const S = this.S;
    const cl = S.clash;
    const ckey = (u, c) => this.clashKey(`cmd|${u}|${c}`);
    const gkey = (u, grp) => this.clashKey(`cmd|${u}|grp:${grp}`);

    if (step === 'day' && cl) {
      const mine = this.clashCards().filter((u) => this.C(u).owner === pid && (!only || only.includes(u)));
      for (const u of mine) {
        const dayCmds = this.view(u).cmds.filter((x) => x.step === 'day');
        const seen = new Map();
        for (const x of dayCmds) {
          if (!['ambush', 'retreat', 'flank'].includes(x.c)) continue;
          if (this.usedKey(ckey(u, x.c)) || (x.grp && this.usedKey(gkey(u, x.grp)))) continue;
          const dk = `${x.c}|${x.fromDiscard ? 1 : 0}`;
          const prev = seen.get(dk);
          // Prefer the variant that is not tied to a once-per-Clash group, and the Smuggler's Pass variant.
          if (!prev || (prev.grp && !x.grp) || (x.smuggler && !prev.smuggler)) seen.set(dk, x);
        }
        // A Retreat with Smuggler's Pass supersedes the plain Retreat.
        for (const [dk, x] of [...seen]) if (x.c === 'retreat' && !x.smuggler && [...seen.values()].some((y) => y.c === 'retreat' && y.smuggler)) seen.delete(dk);
        for (const x of seen.values()) {
          const marks = [ckey(u, x.c)].concat(x.grp ? [gkey(u, x.grp)] : []);
          const base = { kind: 'action', act: 'cmd', cmd: x.c, uid: u };
          if (x.c === 'ambush') {
            const pool = x.fromDiscard ? this.zone(this.zk.discard(pid)) : this.zone(this.zk.hand(pid));
            if (!pool.length || this.regionLocked(cl.region, pid)) continue;
            add({ ...base, id: `a:cmd:ambush:${u}:${x.fromDiscard ? 'd' : 'h'}`, fromDiscard: !!x.fromDiscard }, marks, () => g.doAmbush(pid, u, x));
          } else if (x.c === 'retreat') {
            add({ ...base, id: `a:cmd:retreat:${u}`, smuggler: !!x.smuggler }, marks, () => g.doRetreat(pid, u, x));
          } else if (x.c === 'flank') {
            if (!this.flankTargets(cl.region).length) continue;
            add({ ...base, id: `a:cmd:flank:${u}` }, marks, () => g.doFlank(pid, u));
          }
        }
      }
    }

    if (!only && step === 'autumn') {
      for (const u of this.activeOf(pid)) {
        const rl = this.view(u).cmds.filter((x) => x.c === 'rally' && x.step === 'autumn');
        if (!rl.length) continue;
        const key = this.stepKey(`rally|${u}`);
        if (this.usedKey(key)) continue;
        // Rally (Any X) includes the self case.
        const x = rl.find((y) => y.mode === 'any') || rl[0];
        add({ id: `a:cmd:rally:${u}`, kind: 'action', act: 'cmd', cmd: 'rally', uid: u, mode: x.mode, n: x.n || 1 }, key, () => g.doRally(pid, u, x));
      }
    }
    if (!only && (step === 'autumn' || step === 'spring')) {
      for (const u of this.zone(this.zk.hand(pid))) {
        const dl = this.view(u).cmds.filter((x) => x.c === 'deploy' && x.step === step);
        if (!dl.length) continue;
        const key = this.stepKey(`deploy|${u}`);
        if (this.usedKey(key)) continue;
        const x = dl.reduce((a, b) => ((b.n || 0) > (a.n || 0) ? b : a));
        add({ id: `a:cmd:deploy:${u}`, kind: 'action', act: 'cmd', cmd: 'deploy', uid: u, n: x.n || 1 }, key, () => g.doDeploy(pid, u, x));
      }
    }
  },

  // ---------------------------------------------------------------- system Actions
  *placeSupporters(pid) {
    const n = this.P(pid).boardSup;
    const slots = [0, 1, 2].map((r) => ({ id: 'r' + r, region: r, cap: n }));
    const counts = yield* this.distribute(pid, { purpose: 'placeSup', prompt: 'p.placeSup', total: n, slots });
    counts.forEach((k, r) => {
      if (k > 0) { this.P(pid).boardSup -= k; this.addSup(r, pid, k); this.log('placeSup', { pid, region: r, n: k, from: 'board' }); }
    });
  },

  // Council of Secrets: place Faction Markers on Locations, claim any Location with four or more.
  *secretsAction(pid) {
    const v = this.councilVotes(pid, 'secrets');
    const slots = LOC_IDS.map((l) => ({ id: l, loc: l, cap: v }));
    const counts = yield* this.distribute(pid, { purpose: 'secretsMarkers', prompt: 'p.secretsMarkers', total: v, slots });
    counts.forEach((k, i) => {
      if (k > 0) {
        const lm = this.S.lmark[LOC_IDS[i]];
        lm[pid] = (lm[pid] || 0) + k;
        this.log('placeMarkers', { pid, loc: LOC_IDS[i], n: k });
      }
    });
    for (;;) {
      const full = LOC_IDS.filter((l) => (this.S.lmark[l][pid] || 0) >= 4);
      if (!full.length) break;
      const loc = full.length === 1 ? full[0] : yield* this.chooseLoc(pid, full, { purpose: 'secretsClaim', prompt: 'p.secretsClaim', intent: 'good' });
      this.S.lmark[loc][pid] = 0;
      yield* this.claimLocationReward(pid, loc, { ignoreInf: true });
    }
  },

  // Council of Oaths: return Supporters from the Map and / or the Lost Pile to the Player Board.
  *oathsAction(pid) {
    const mine = this.councilVotes(pid, 'oaths');
    let best = true;
    for (const o of this.opponents(pid)) if (this.councilVotes(o, 'oaths') >= mine) best = false;
    const total = mine + (mine > 0 && best ? 1 : 0);
    const slots = [0, 1, 2].map((r) => ({ id: 'r' + r, region: r, cap: this.supportersOn(r, pid) }));
    slots.push({ id: 'lost', lost: true, cap: this.P(pid).lostSup });
    const counts = yield* this.distribute(pid, { purpose: 'oathsReturn', prompt: 'p.oathsReturn', total, slots });
    counts.forEach((k, i) => {
      if (k <= 0) return;
      if (slots[i].lost) this.P(pid).lostSup -= k; else this.removeSup(slots[i].region, pid, k);
      this.P(pid).boardSup += k;
      this.log('returnSup', { pid, n: k, from: slots[i].lost ? 'lost' : slots[i].region });
    });
  },

  // ------------------------------------------------------------------- Commands
  *doAmbush(pid, uid, cmd) {
    const cl = this.S.clash;
    const pool = (cmd.fromDiscard ? this.zone(this.zk.discard(pid)) : this.zone(this.zk.hand(pid))).slice();
    const u = yield* this.chooseCard(pid, pool, { purpose: 'ambushCard', prompt: 'p.ambushCard', intent: 'good', ctx: { source: uid, hidden: true } });
    if (u == null) return;
    this.leaveHooks(u);
    this.put(u, this.zk.down(cl.region), 'top');
    cl.pending.push(u);
    this.log('ambush', { pid, source: uid, region: cl.region });
  },

  *doRetreat(pid, uid, cmd) {
    const cl = this.S.clash;
    const r = +this.C(uid).z[1];
    const mine = this.activeOf(pid, r);
    const chosen = yield* this.chooseCards(pid, mine, { purpose: 'retreatCards', prompt: 'p.retreatCards', min: 0, max: mine.length, intent: 'neutral', ctx: { source: uid, region: r } });
    for (const u of chosen) this.toHand(u);
    this.syncClash();
    this.log('retreat', { pid, source: uid, cards: chosen, region: r });
    if (this.heraldRegion(pid) === r) {
      if (yield* this.yesNo(pid, 'p.retreatHerald', { purpose: 'retreatHerald', intent: 'neutral', ctx: { region: r } })) {
        this.S.herald[pid] = null;
        this.log('heraldHome', { pid });
      }
    }
    const n = this.supportersOn(r, pid);
    if (n > 0) {
      const k = yield* this.chooseNumber(pid, 0, n, { purpose: 'retreatSup', prompt: 'p.retreatSup', ctx: { region: r } });
      if (k > 0) {
        this.removeSup(r, pid, k);
        this.P(pid).boardSup += k;
        this.log('returnSup', { pid, n: k, from: r });
      }
    }
    void cl;
    if (cmd.smuggler) {
      const c = this.C(uid);
      if (c.z === this.zk.hand(pid) && this.journeyable([uid]).length) {
        if (yield* this.yesNo(pid, 'p.smugglerJourney', { purpose: 'smugglerJourney', intent: 'good', ctx: { card: uid } })) yield* this.journey(pid, uid);
      }
    }
  },

  // Unresolved Regions a card may Flank to from `region`.
  flankTargets(region) {
    return [0, 1, 2].filter((r) => r !== region && !this.S.resolved[r]);
  },

  *doFlank(pid, uid) {
    const cl = this.S.clash;
    const from = cl.region;
    const dests = this.flankTargets(from);
    const to = yield* this.chooseRegion(pid, dests, { purpose: 'flankRegion', prompt: 'p.flankRegion', intent: 'good', ctx: { source: uid, from } });
    if (to == null) return;
    this.put(uid, this.zk.active(to), 'top');
    this.syncClash();
    this.log('flank', { pid, card: uid, from, to });
    yield* this.fire('flanked', { pid, uid, from, to });
  },

  *doRally(pid, uid, cmd) {
    if (cmd.mode === 'self') {
      this.toHand(uid);
      this.log('rally', { pid, cards: [uid] });
      return;
    }
    const cand = this.activeOf(pid);
    const chosen = yield* this.chooseCards(pid, cand, { purpose: 'rallyCards', prompt: 'p.rallyCards', min: 1, max: Math.min(cmd.n || 1, cand.length), intent: 'good', ctx: { source: uid } });
    for (const u of chosen) this.toHand(u);
    this.log('rally', { pid, cards: chosen });
  },

  *doDeploy(pid, uid, cmd) {
    const r = yield* this.chooseRegion(pid, [0, 1, 2], { purpose: 'deployRegion', prompt: 'p.deployRegion', intent: 'good', ctx: { card: uid } });
    if (r == null) return;
    this.put(uid, this.zk.active(r), 'top');
    this.C(uid).inf += cmd.n || 1;
    this.log('deploy', { pid, card: uid, region: r, n: cmd.n || 1 });
  },
});

export { COUNCILS };

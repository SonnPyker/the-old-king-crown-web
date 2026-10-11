// Effective card values ("view"), effect sources and event firing.

import { Game } from './game.js';
import { LOC_IDS, COUNCILS } from '../data/constants.js';
import { logicOf, logicById, FX_LOGIC } from './logic/index.js';

Object.assign(Game.prototype, {
  // ------------------------------------------------------------------ views
  // Blanking: 'str' = everything but Strength is blank (Guerrilla); 'strarch' = keep Strength and Archetype (Poisoner's Ball).
  blankMode(c) {
    const z = c.z;
    if (!z || !z.startsWith('R') || !z.endsWith(':active')) return null;
    const r = +z[1];
    let mode = null;
    // Poisoner's Ball on this Region (placed by an opponent)
    for (const u of this.zone(this.zk.regKC(r))) {
      const k = this.C(u);
      if (k.def.key === 'ball' && k.owner !== c.owner) mode = 'strarch';
    }
    // Guerrilla Fighters Active in the current Clash in this Region
    const cl = this.S.clash;
    if (cl && cl.region === r && c.def.arch !== 'heir') {
      for (const u of cl.cards) {
        const g = this.C(u);
        if (g.owner !== c.owner && this.hasGuerrillaText(g) && g.z === z && !this.isBlankedStatic(g)) mode = 'str';
      }
    }
    return mode;
  },
  isBlankedStatic() { return false; },
  // Guerrilla Fighters' text: the card's current identity, or a Guerrilla rule copied by Ritual of the Tooth.
  // Uses gain and baseDef directly, not logicIds, because logicIds calls blankMode.
  hasGuerrillaText(c) {
    if (this.baseDef(c).logic === 'guerrilla') return true;
    return c.gain.some((gn) => gn.kind === 'copy' && this.gainValid(gn) && gn.def.logic === 'guerrilla');
  },
  // Definition the card currently "is" (Shapeshifter's Mirror lasts for the Round).
  baseDef(c) { return c.becomes && c.becomesRound === this.S.round ? c.becomes : c.def; },

  // Logic ids that apply to a Faction Card (printed rules text, plus copies). Blank cards have none.
  logicIds(c) {
    if (c.kind !== 'f' || this.blankMode(c)) return [];
    const base = this.baseDef(c);
    const ids = [];
    if (base.logic) ids.push(base.logic);
    for (const gn of c.gain) if (gn.kind === 'copy' && this.gainValid(gn) && gn.def.logic) ids.push(gn.def.logic);
    return ids;
  },

  gainValid(gn) {
    const S = this.S;
    if (gn.round != null && gn.round !== S.round) return false;
    if (gn.clash != null && !(S.clash && S.clash.seq === gn.clash)) return false;
    return true;
  },

  view(uid) {
    const c = this.C(uid);
    if (c.kind !== 'f') return { uid, str: 0, arch: null, inv: false, res: false, path: false, cmds: [], votes: 0, lore: 0, logics: [], blank: false };
    const base = this.baseDef(c);
    const blank = this.blankMode(c);
    const v = {
      uid, str: c.def.str, arch: blank === 'str' ? null : base.arch,
      inv: false, res: false, path: false, cmds: [], votes: 0, lore: 0, logics: [], blank: !!blank,
      printedVotes: base.votes, printedLore: base.lore, name: base.name,
    };
    if (!blank) {
      v.inv = !!base.inv; v.res = !!base.res; v.path = !!base.path;
      v.votes = base.votes; v.lore = base.lore;
      v.cmds = base.cmds.map((x) => ({ ...x }));
    } else if (blank === 'strarch') {
      v.arch = base.arch;
    }
    // Gains and copies
    for (const gn of c.gain) {
      if (!this.gainValid(gn)) continue;
      if (gn.kind === 'trait') v[gn.trait] = true;
      else if (gn.kind === 'cmd') v.cmds.push({ ...gn.cmd });
      else if (gn.kind === 'str') v.str += gn.n;
      else if (gn.kind === 'copy') {
        const d = gn.def;
        v.str += d.str;
        if (d.inv) v.inv = true; if (d.res) v.res = true; if (d.path) v.path = true;
        for (const x of d.cmds) v.cmds.push({ ...x });
      }
    }
    v.logics = this.logicIds(c);
    // Static sources owned by the card's owner, then late ones (that depend on other grants).
    const srcs = this.sourcesOf(c.owner);
    for (const s of srcs) { const L = s.logic; if (L.grant && !L.late) L.grant(this, s.card, c, v); }
    for (const s of srcs) { const L = s.logic; if (L.grant && L.late) L.grant(this, s.card, c, v); }
    for (const fx of this.S.fx) {
      if (fx.pid === c.owner && fx.round === this.S.round) { const F = FX_LOGIC[fx.key]; if (F && F.grant) F.grant(this, fx, c, v); }
    }
    return v;
  },

  hasTrait(uid, t) { return !!this.view(uid)[t]; },
  strOf(uid) { return this.view(uid).str; },
  archOf(uid) { return this.view(uid).arch; },
  isArch(uid, a) { return this.view(uid).arch === a; },
  cmdsOf(uid, c, step) { return this.view(uid).cmds.filter((x) => x.c === c && (!step || x.step === step)); },
  hasCmd(uid, c, step) { return this.cmdsOf(uid, c, step).length > 0; },
  votesOf(uid) { return this.view(uid).votes; },
  loreOf(uid) { return this.view(uid).lore; },
  addGain(uid, gain) { this.C(uid).gain.push(gain); },

  // ---------------------------------------------------------------- sources
  // Cards owned by pid that are "in play" and may carry static / triggered abilities.
  sourcesOf(pid) {
    const out = [];
    const push = (c) => { const L = logicOf(c); if (L) out.push({ card: c, logic: L }); };
    for (const u of this.zone(this.zk.supply(pid))) push(this.C(u));
    for (let i = 0; i < 3; i++) for (const u of this.zone(this.zk.kc(pid, i))) push(this.C(u));
    for (let r = 0; r < 3; r++) {
      for (const u of this.zone(this.zk.regKC(r))) { const k = this.C(u); if (k.owner === pid) push(k); }
      for (const u of this.zone(this.zk.active(r))) {
        const c = this.C(u);
        if (c.owner !== pid) continue;
        for (const id of this.logicIds(c)) { const L = logicById(id); if (L && (!L.zones || L.zones.includes('active'))) out.push({ card: c, logic: L, id }); }
      }
    }
    for (const l of LOC_IDS) for (const u of this.zone(this.zk.locKC(l))) { const k = this.C(u); if (k.owner === pid) push(k); }
    for (const cn of COUNCILS) {
      for (const u of this.zone(this.zk.council(cn))) {
        const c = this.C(u);
        if (c.owner !== pid) continue;
        for (const id of this.logicIds(c)) { const L = logicById(id); if (L && L.zones && L.zones.includes('council')) out.push({ card: c, logic: L, id }); }
      }
    }
    return out;
  },

  // Sources whose logic defines handler `name` under `.on`.
  handlers(pid, name) {
    return this.sourcesOf(pid).filter((s) => s.logic.on && s.logic.on[name]);
  },

  // Fire an event to every player's sources (turn order). Handlers are generators.
  *fire(name, ev) {
    for (const pid of this.S.order) {
      for (const s of this.handlers(pid, name)) {
        yield* s.logic.on[name](this, s.card, ev, pid);
      }
      for (const fx of this.S.fx.slice()) {
        if (fx.pid !== pid || fx.round !== this.S.round) continue;
        const F = FX_LOGIC[fx.key];
        if (F && F.on && F.on[name]) yield* F.on[name](this, fx, ev, pid);
      }
    }
  },
  // Fire only for one player's sources
  *fireFor(pid, name, ev) {
    for (const s of this.handlers(pid, name)) yield* s.logic.on[name](this, s.card, ev, pid);
  },

  hasKC(pid, key) {
    for (const s of this.sourcesOf(pid)) if (s.card.kind === 'k' && s.card.def.key === key) return true;
    return false;
  },
  hasHQ(pid, logic) {
    return this.zone(this.zk.supply(pid)).some((u) => this.C(u).def.logic === logic);
  },
  kcCard(pid, key) {
    for (const s of this.sourcesOf(pid)) if (s.card.kind === 'k' && s.card.def.key === key) return s.card;
    return null;
  },
  addFx(pid, key, extra = {}) {
    this.S.fx.push({ pid, key, round: this.S.round, ...extra });
  },
  hasFx(pid, key) {
    return this.S.fx.some((f) => f.pid === pid && f.key === key && f.round === this.S.round);
  },
});

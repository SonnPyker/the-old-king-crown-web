// Round structure: Start of the Year, Summer, Autumn, Winter, final scoring and the main game loop.

import { Game } from './game.js';
import { removeFrom } from './util.js';
import { COUNCILS } from '../data/constants.js';

Object.assign(Game.prototype, {
  // The whole game as a generator. Yields requests; ends when the game is over.
  *run() {
    this.initState();
    yield* this.setupInteractive();
    const max = this.maxRounds();
    for (let r = 1; r <= max; r++) {
      this.S.round = r;
      this.log('round', { round: r });
      if (r > 1) yield* this.startOfYear();
      yield* this.springPhase();
      yield* this.summerPhase();
      yield* this.autumnPhase();
      yield* this.winterPhase();
    }
    this.scoreEnd();
  },

  // ------------------------------------------------------------ Start of the Year
  *startOfYear() {
    const S = this.S;
    S.phase = 'year';
    this.log('phase', { phase: 'year' });
    for (const pid of S.order.slice()) yield* this.draw(pid, 0, { upTo: true });

    const prev = S.order.slice();
    let order = prev.slice().sort((a, b) => (this.P(b).inf - this.P(a).inf) || (prev.indexOf(b) - prev.indexOf(a)));
    const prop = prev.find((p) => this.hasKC(p, 'propaganda'));
    if (prop != null) {
      const rest = prev.slice();
      order = [];
      while (rest.length > 1) {
        const p = yield* this.choosePlayer(prop, rest.slice(), { purpose: 'orderPick', prompt: 'p.orderPick', ctx: { pos: order.length } });
        order.push(p);
        removeFrom(rest, p);
      }
      order.push(rest[0]);
    }
    S.order = order;
    this.log('order', { order: order.slice() });
  },

  // ----------------------------------------------------------------------- Summer
  *summerPhase() {
    const S = this.S;
    S.phase = 'summer';
    this.log('phase', { phase: 'summer' });
    S.resolved = [false, false, false];
    const storms = S.order.find((p) => this.hasFx(p, 'storms'));
    const placer = storms != null ? storms : S.order[S.order.length - 1];
    const left = [0, 1, 2];
    const seq = [];
    while (left.length > 1) {
      const r = yield* this.chooseRegion(placer, left.slice(), { purpose: 'clashMarker', prompt: 'p.clashMarker', ctx: { marker: seq.length + 1 } });
      seq.push(r);
      removeFrom(left, r);
    }
    seq.push(left[0]);
    S.clashOrder = seq;
    // Region indices, not player ids: the UI formats them with region names (see log.js `regions`).
    this.log('clashOrder', { pid: placer, regions: seq.slice() });
    for (const r of seq) yield* this.resolveRegion(r);
    S.clashOrder = [];
  },

  // ----------------------------------------------------------------------- Autumn
  *autumnPhase() {
    this.S.phase = 'autumn';
    this.log('phase', { phase: 'autumn' });
    for (const pid of this.S.order) yield* this.actionStep(pid, 'autumn');
  },

  // ----------------------------------------------------------------------- Winter
  *winterPhase() {
    const S = this.S;
    S.phase = 'winter';
    this.log('phase', { phase: 'winter' });

    // Winter Effects Step.
    const effects = [];
    for (const pid of S.order) {
      for (const s of this.sourcesOf(pid)) if (s.card.kind === 'k' && s.logic.winter) effects.push({ s, pid });
    }
    for (const { s, pid } of effects) {
      if (!s.card.z) continue;
      yield* s.logic.winter(this, s.card, pid);
    }
    yield* this.fire('winter', {});

    // Cleanup Step.
    for (const pid of S.order) S.herald[pid] = null;
    for (let r = 0; r < 3; r++) {
      const R = S.region[r];
      for (const pid of S.order) {
        const n = R.sup[pid] || 0;
        if (n <= 0) continue;
        if (this.hasFx(pid, 'stones')) { R.fresh[pid] = n; continue; }
        this.P(pid).lostSup += n;
        R.sup[pid] = 0;
        R.fresh[pid] = 0;
        this.log('supLost', { pid, n, region: r });
      }
      for (const pid of S.order) if (!(R.sup[pid] > 0)) R.fresh[pid] = 0;
      for (const u of this.zone(this.zk.active(r)).slice()) {
        const c = this.C(u);
        if (c.inf > 0) c.inf -= 1;
        else this.toDiscard(u);
      }
      // Cards that stay Active may clash again next Round.
      for (const u of this.zone(this.zk.active(r))) this.C(u).clashedAt = null;
      for (const u of this.zone(this.zk.down(r)).slice()) this.toHand(u, { force: true });
    }
    S.fx = S.fx.filter((f) => f.round !== S.round);
    S.resolved = [false, false, false];
    this.log('winterEnd', {});
  },

  // ------------------------------------------------------------------ Final score
  scoreEnd() {
    const S = this.S;
    S.phase = 'end';
    const scores = S.order.map((pid) => {
      const p = this.P(pid);
      const sopEmpty = this.zone(this.zk.sop(pid)).length === 0;
      const bonus = sopEmpty ? Math.floor(p.lore / 2) : 0;
      return { pid, inf: p.inf, lore: p.lore, bonus, total: p.inf + bonus };
    });
    const rank = scores.slice().sort((a, b) => (b.total - a.total)
      || ((S.kf.holder === b.pid ? 1 : 0) - (S.kf.holder === a.pid ? 1 : 0))
      || (S.order.indexOf(a.pid) - S.order.indexOf(b.pid)));
    S.result = { scores, ranking: rank.map((x) => x.pid), winner: rank[0].pid };
    this.log('gameEnd', { winner: rank[0].pid, scores });
  },
});

export { COUNCILS };

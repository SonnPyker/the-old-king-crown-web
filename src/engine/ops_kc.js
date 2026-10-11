// Kingdom Card ownership: acquiring, occupying, stealing, discarding.

import { Game } from './game.js';
import { removeFrom } from './util.js';
import { logicOf } from './logic/index.js';

const SLOT_RE = /^k(\d+)\.(\d+)$/;

Object.assign(Game.prototype, {
  slotCount(pid) { return this.hasHQ(pid, 'moonshine') ? 3 : 2; },
  kcAt(pid, i) { const z = this.zone(this.zk.kc(pid, i)); return z.length ? z[0] : null; },
  occAt(pid, i) { const z = this.zone(this.zk.occ(pid, i)); return z.length ? z[0] : null; },
  slotOfKC(kuid) {
    const m = SLOT_RE.exec(this.C(kuid).z || '');
    return m ? +m[2] : -1;
  },
  // Occupied Kingdom Cards on a player's board (stealable ones).
  boardKCs(pid) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const k = this.kcAt(pid, i);
      if (k != null) out.push({ slot: i, kc: k, occ: this.occAt(pid, i) });
    }
    return out;
  },
  // All Kingdom Cards a player currently owns (anywhere).
  ownedKCs(pid) {
    const out = [];
    for (const s of this.sourcesOf(pid)) if (s.card.kind === 'k') out.push(s.card.uid);
    return out;
  },

  *chooseSlot(pid, onlySlot = null) {
    const n = this.slotCount(pid);
    let slots = [];
    for (let i = 0; i < n; i++) slots.push(i);
    if (onlySlot != null) slots = slots.filter((i) => i === onlySlot);
    else if (n === 3) slots = slots.filter((i) => i !== 2 || true);
    const free = slots.filter((i) => this.kcAt(pid, i) == null);
    if (free.length) return free[0];
    if (slots.length === 1) return slots[0];
    const options = slots.map((i) => ({ id: 's' + i, kind: 'slot', slot: i, kc: this.kcAt(pid, i) }));
    const [r] = yield* this.select(pid, { purpose: 'replaceSlot', prompt: 'p.replaceSlot', options, intent: 'cost' });
    return r.slot;
  },

  // Take a Kingdom Card out of wherever it is and hold it "in the air" while a decision is pending.
  parkKC(kuid) {
    const k = this.C(kuid);
    this.leaveKC(kuid);
    k.z = 'limbo';
    this.zone('limbo').push(kuid);
  },

  // Remove a Kingdom Card from its owner's holding. Occupying card returns to Hand.
  *releaseKC(kuid) {
    const k = this.C(kuid);
    const owner = k.owner;
    const m = SLOT_RE.exec(k.z || '');
    if (m) {
      const occ = this.occAt(+m[1], +m[2]);
      if (occ != null) this.toHand(occ);
    }
    this.parkKC(kuid);
    const L = logicOf(k);
    if (owner != null && L && L.onLose) yield* L.onLose(this, k, owner);
  },

  // Discard a Kingdom Card (to the Kingdom Discard Pile), from anywhere.
  *discardKC(kuid) {
    const k = this.C(kuid);
    if (k.z === 'road' || k.z === 'kdeck') { this.kdiscardPut(kuid); return; }
    if (k.z === 'kdiscard') return;
    yield* this.releaseKC(kuid);
    this.kdiscardPut(kuid);
  },

  // Put a Kingdom Card on a board slot and Occupy it with a Faction Card.
  *occupyKC(pid, kuid, occUid, slot) {
    const old = this.kcAt(pid, slot);
    if (old != null && old !== kuid) yield* this.discardKC(old);
    const k = this.C(kuid);
    if (k.z && k.z !== 'road' && k.z !== 'kdeck' && k.z !== 'kdiscard') {
      // KC is moving from elsewhere (steal) - caller already released it.
      removeFrom(this.zone(k.z), kuid);
    } else this.leaveKC(kuid);
    k.owner = pid;
    k.z = this.zk.kc(pid, slot);
    this.zone(k.z).push(kuid);
    if (occUid != null) this.put(occUid, this.zk.occ(pid, slot), 'top');
    this.log('occupy', { pid, kc: kuid, card: occUid, slot });
  },

  // Acquire a Kingdom Card (from the Great Road or elsewhere) following its own acquisition instructions.
  // opts: { occupant, bidCard, onlySlot }
  *gainKC(pid, kuid, opts = {}) {
    const k = this.C(kuid);
    const kind = k.def.kind;
    const L = logicOf(k);
    if (kind === 'occupy') {
      const slot = yield* this.chooseSlot(pid, opts.onlySlot ?? null);
      yield* this.occupyKC(pid, kuid, opts.occupant ?? opts.bidCard ?? null, slot);
    } else {
      if (opts.bidCard != null) this.toDiscard(opts.bidCard);
      if (kind === 'supply') {
        this.leaveKC(kuid); k.owner = pid;
        this.put(kuid, this.zk.supply(pid), 'top'); this.log('kcToSupply', { pid, kc: kuid });
      } else if (kind === 'region') {
        const r = yield* this.chooseRegion(pid, [0, 1, 2], { purpose: 'placeKC', prompt: 'p.placeKCRegion', ctx: { kc: kuid } });
        this.leaveKC(kuid); k.owner = pid;
        this.put(kuid, this.zk.regKC(r), 'top'); this.log('kcToRegion', { pid, kc: kuid, region: r });
      } else if (kind === 'loc') {
        const l = yield* this.chooseLoc(pid, ['castle', 'wilderness', 'harvest', 'battlefield', 'shrine', 'necropolis'], { purpose: 'placeKC', prompt: 'p.placeKCLoc', ctx: { kc: kuid } });
        this.leaveKC(kuid); k.owner = pid;
        this.put(kuid, this.zk.locKC(l), 'top'); this.log('kcToLoc', { pid, kc: kuid, loc: l });
      } else if (kind === 'instant') {
        this.parkKC(kuid); k.owner = pid;
        this.log('gainKC', { pid, kc: kuid });
        if (L && L.instant) yield* L.instant(this, k, pid);
        this.kdiscardPut(kuid);
        return kuid;
      }
    }
    this.log('gainKC', { pid, kc: kuid });
    if (L && L.onGain) yield* L.onGain(this, k, pid);
    yield* this.fire('kcAcquired', { pid, kc: kuid });
    return kuid;
  },

  // Steal an Occupied Kingdom Card from an opponent, occupying it with `bidCard`.
  *stealKC(pid, kuid, bidCard) {
    const k = this.C(kuid);
    const victim = k.owner;
    this.log('steal', { pid, victim, kc: kuid });
    yield* this.releaseKC(kuid);
    const slot = yield* this.chooseSlot(pid);
    k.owner = pid;
    yield* this.occupyKC(pid, kuid, bidCard, slot);
    const L = logicOf(k);
    if (L && L.onGain) yield* L.onGain(this, k, pid);
    // Emboldened Brigands: whenever a Kingdom Card is stolen its holder gains 1 Influence.
    for (const p of this.S.order) {
      if (this.hasKC(p, 'brigands')) this.gainInf(p, 1, 'brigands');
    }
    yield* this.fire('kcAcquired', { pid, kc: kuid, stolen: true });
  },
});

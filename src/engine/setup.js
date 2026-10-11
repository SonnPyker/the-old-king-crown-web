// Game setup: building the initial state and the optional Advanced Setup steps.

import { Game } from './game.js';
import { LOC_IDS, START_HAND, SUPPORTERS } from '../data/constants.js';
import { FACTION_DEFS } from '../data/cards.js';
import { KINGDOM_DEFS } from '../data/kingdom.js';
import { TACTICS_BY_FACTION } from '../data/tactics.js';

Object.assign(Game.prototype, {
  // Build the whole game state (everything that needs no player decisions).
  initState() {
    const settings = this.settings;
    const specs = settings.players;
    const n = specs.length;
    const S = (this.S = {
      round: 0, phase: 'setup', players: [], cards: [], z: {}, order: [], used: {},
      stepSeq: 0, clashSeq: 0, kdeck: [], kdiscard: [], road: [null, null, null, null],
      region: [0, 1, 2].map(() => ({ sup: {}, fresh: {} })),
      herald: {}, resolved: [false, false, false], clashOrder: [], fx: [], kf: { holder: null, uses: 3 },
      cmark: { relics: {}, secrets: {}, oaths: {} }, lmark: {}, door: {}, tactics: {},
      clash: null, result: null,
    });
    for (const l of LOC_IDS) S.lmark[l] = {};

    // Kingdom Deck
    for (const d of KINGDOM_DEFS) {
      const c = this.newCard(d, null, 'k');
      c.z = 'kdeck';
      S.kdeck.push(c.uid);
    }
    this.rng.shuffle(S.kdeck);

    // Advanced Setup I: each player is dealt five face-down Kingdom Cards.
    if (settings.advanced) {
      for (let pid = 0; pid < n; pid++) {
        for (let i = 0; i < 5; i++) {
          const u = S.kdeck.shift();
          this.C(u).z = this.zk.adv(pid);
          this.zone(this.zk.adv(pid)).push(u);
        }
      }
    }
    this.populateRoad();

    // Players
    for (let pid = 0; pid < n; pid++) {
      const sp = specs[pid];
      S.players.push({
        faction: sp.faction, inf: 0, lore: 0, handSize: START_HAND, boardSup: SUPPORTERS, lostSup: 0,
        name: sp.name || `P${pid + 1}`, type: sp.type || 'human', level: sp.level || 'normal',
      });
      S.herald[pid] = null;
      S.tactics[pid] = TACTICS_BY_FACTION[sp.faction].map((d) => ({ id: d.id, markers: d.markers, exhausted: false, burned: false }));
      for (const d of FACTION_DEFS[sp.faction]) {
        const c = this.newCard(d, pid, 'f');
        if (d.type === 'basic') this.put(c.uid, d.arch === 'heir' ? this.zk.hand(pid) : this.zk.deck(pid), 'bottom');
        else this.put(c.uid, this.zk.sop(pid), 'bottom');
      }
      this.shuffleZone(this.zk.deck(pid));
      // Draw starting Hand: the Heir plus cards from the Deck until six.
      const hand = this.zone(this.zk.hand(pid));
      const deck = this.zone(this.zk.deck(pid));
      while (hand.length < START_HAND && deck.length) {
        const u = deck.shift();
        this.C(u).z = this.zk.hand(pid);
        hand.push(u);
      }
    }

    // Starting order on the Order Track.
    const ids = specs.map((_, i) => i);
    S.order = settings.order === 'seat' ? ids : this.rng.shuffle(ids);
    this.log('setupDone', { order: S.order.slice() });
  },

  // Advanced Setup, steps II - V (needs decisions). Does nothing in a normal game.
  *setupInteractive() {
    const S = this.S;
    if (!this.settings.advanced) return;
    this.log('advancedSetup', {});

    // II. Mulligan: return non-Heir cards to the top of the Deck, shuffle and redraw up to Hand Size.
    const mull = {};
    for (const pid of S.order) mull[pid] = yield* this.yesNo(pid, 'p.mulligan', { purpose: 'mulligan', intent: 'neutral', ctx: { hidden: true } });
    for (const pid of S.order) {
      if (!mull[pid]) continue;
      for (const u of this.zone(this.zk.hand(pid)).slice()) {
        if (this.C(u).def.arch !== 'heir') this.put(u, this.zk.deck(pid), 'top');
      }
      this.shuffleZone(this.zk.deck(pid));
      yield* this.draw(pid, 0, { upTo: true });
      this.log('mulligan', { pid });
    }

    // III. Choose one dealt Kingdom Card and a Hand card to Occupy it (face-down); the rest return to the Kingdom Deck.
    const chosen = {};
    for (const pid of S.order) {
      const dealt = this.zone(this.zk.adv(pid)).slice();
      const kc = yield* this.chooseCard(pid, dealt, { purpose: 'advKC', prompt: 'p.advKC', intent: 'good', ctx: { hidden: true, kc: true } });
      const occ = yield* this.chooseCard(pid, this.zone(this.zk.hand(pid)).slice(), { purpose: 'advOcc', prompt: 'p.advOcc', intent: 'cost', ctx: { hidden: true, kc } });
      this.put(occ, this.zk.bid(pid), 'top');
      chosen[pid] = { kc, occ };
    }
    for (const pid of S.order) {
      for (const u of this.zone(this.zk.adv(pid)).slice()) {
        if (u === chosen[pid].kc) continue;
        this.zone(this.zk.adv(pid)).splice(this.zone(this.zk.adv(pid)).indexOf(u), 1);
        this.C(u).z = 'kdeck';
        S.kdeck.push(u);
      }
    }
    this.rng.shuffle(S.kdeck);

    // IV. Reveal, Occupy and resolve bold instructions in turn order.
    for (const pid of S.order) {
      const { kc, occ } = chosen[pid];
      this.log('advReveal', { pid, kc, card: occ });
      yield* this.gainKC(pid, kc, { occupant: occ, bidCard: occ, onlySlot: 0 });
    }

    // V. Draw up to Hand Size.
    for (const pid of S.order) yield* this.draw(pid, 0, { upTo: true });
  },
});

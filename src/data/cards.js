// Static Faction Card definitions (basic deck, Advanced cards and HQ cards).
// Logic for special abilities lives in engine/logic/faction.js keyed by `logic`.

import { FACTIONS } from './constants.js';

const BASIC_NAMES = {
  nobility: ['Ruse!', 'Guild of Dawn Traders', 'Watchers at the Walls', 'Hunting Parties', 'The Tithe', 'Keepers of the Gates', 'Vial Sect', 'Knights of the Pasture', 'Woe', 'Master of Records', 'The Count', 'The Magistrate', 'Master of Arms', 'Titus of Dawns & Dusks'],
  uprising: ['Ruse!', 'The Fence', 'Secret Postal Service', 'The Irregulars', 'Hawkers', 'The Pickets', 'Night Carnival', 'Ornithopter Club', 'Experimental Academies', 'The Librarian', 'The Deadlifter', 'Baron Cuttlefish', 'Captain Mooncurser', 'The Secret Society'],
  clans: ['Ruse!', 'Purser', 'Snowdrop Scouts', 'Creel Haulers', 'Priestesses of the Peaks', 'Sea Breakers', 'Nixing Knife', 'Shore Runner Sleds', 'Hall Upon the Waves', 'Shrike of the Steppes', 'The Branded Seer', 'Lethe', 'Gall', 'Saga the Unifier'],
  gathering: ['Ruse!', 'The Nightjar', 'Effigies', 'Speakers of the Wood', 'The Wandering Lost', 'The Moon-Stung', 'Cult of Dreams', 'The Loping', 'The Burning Wood', 'The Owl', 'The Goat', 'The Fox', 'The Stag', 'Petrichor the Unmasked'],
};

// idx: [arch, str, inv, res, path, cmds, votes, lore, logic]
const BASIC = [
  ['ruse', 0, 1, 0, 0, [{ c: 'ambush', step: 'day', grp: 'ruse' }, { c: 'retreat', step: 'day', grp: 'ruse' }], 0, 0, 'ruse'],
  ['trader', 0, 0, 0, 0, [{ c: 'rally', step: 'autumn', mode: 'any', n: 2 }], 2, 2, null],
  ['follower', 1, 1, 0, 0, [], 0, 1, null],
  ['follower', 2, 1, 0, 0, [], 0, 1, null],
  ['follower', 3, 1, 0, 0, [], 0, 1, null],
  ['follower', 4, 1, 0, 0, [], 0, 1, null],
  ['agent', 5, 0, 0, 0, [{ c: 'deadly', step: 'night' }], 2, 1, 'agent'],
  ['cavalry', 5, 0, 0, 1, [{ c: 'flank', step: 'day' }], 1, 1, null],
  ['warmachine', 5, 1, 0, 0, [{ c: 'deploy', step: 'autumn', n: 1 }], 0, 0, null],
  ['captain', 6, 0, 0, 1, [], 1, 1, null],
  ['captain', 7, 0, 0, 1, [], 1, 1, null],
  ['captain', 8, 0, 0, 1, [], 1, 1, null],
  ['captain', 9, 0, 0, 1, [], 1, 1, null],
  ['heir', 10, 0, 1, 1, [{ c: 'rally', step: 'autumn', mode: 'self' }], 1, 1, null],
];

// Advanced / HQ: name, cost, arch, str, inv, res, path, cmds, votes, lore, logic, text, img
const ADV = {
  nobility: [
    { name: 'The Viceroy', cost: 2, arch: 'champion', str: 11, res: 1, votes: 2, lore: 0, logic: 'champion',
      text: 'When this card is used to steal a Kingdom Card, treat the Occupying card as if its Strength is 0.' },
    { name: 'The High Court', cost: 3, arch: 'trader', str: 5, inv: 1, votes: 2, lore: 0, logic: 'highCourt',
      text: '(Autumn Action) If this card is in a Council, move it to another Council.' },
    { name: 'The Queen, Long Ago', cost: 4, arch: 'heir', str: 10, res: 1, path: 1, cmds: [{ c: 'rally', step: 'autumn', mode: 'self' }], votes: 1, lore: 1, logic: 'queen',
      text: 'When you acquire this card, Govern with up to three of your cards from the Lost Pile and/or Discard Pile. Each card must be Governed into a different Council.' },
    { name: 'Gilded Wall', cost: 2, arch: 'warmachine', str: 3, inv: 1, cmds: [{ c: 'deploy', step: 'autumn', n: 1 }], votes: 0, lore: 0, logic: 'gildedWall',
      text: '(Autumn Action) If you have two or more Supporters in this card’s Region, place 1 Influence on this card.' },
  ],
  uprising: [
    { name: 'Arch Agitant', cost: 2, arch: 'champion', str: 11, votes: 2, lore: 2, logic: 'champion',
      text: 'When this card is used to steal a Kingdom Card, treat the Occupying card as if its Strength is 0.' },
    { name: 'Black Powder Ploy', cost: 3, arch: 'agent', str: 5, res: 1, votes: 0, lore: 0, logic: 'blackPowder',
      text: '(Night Effect) Eliminate all opponent Heirs/Captains in the current Clash. If at least one card was Eliminated this way, choose one: Gain 1 Influence or Gain 1 Lore.' },
    { name: 'Guerrilla Fighters', cost: 5, arch: 'agent', str: 5, res: 1, cmds: [{ c: 'ambush', step: 'day' }], votes: 0, lore: 0, logic: 'guerrilla',
      text: 'If this card is Active in a Clash, treat all printed information, except for Strength, on opponents’ non-Heir Faction Cards in the Region as blank. (Night Effect) If there are any Active opponent Heirs in the Clash, Eliminate this card.' },
  ],
  clans: [
    { name: 'The Storyteller', cost: 2, arch: 'champion', str: 11, res: 1, path: 1, votes: 0, lore: 2, logic: 'champion',
      text: 'When this card is used to steal a Kingdom Card, treat the Occupying card as if its Strength is 0.' },
    { name: 'Raid & Raze', cost: 3, arch: 'cavalry', str: 3, cmds: [{ c: 'flank', step: 'day' }, { c: 'deadly', step: 'night' }], votes: 0, lore: 0, logic: 'raidRaze',
      text: 'When this card Flanks, you may move any number of your Supporters from this card’s current Region to the new Region.' },
    { name: 'Riders of the North Sky', cost: 5, arch: 'cavalry', str: 11, inv: 1, path: 1, cmds: [{ c: 'flank', step: 'day' }], votes: 0, lore: 2, logic: 'riders',
      text: 'When you win a Clash in a Region where this card is Active, before claiming any rewards, gain 1 Influence.' },
  ],
  gathering: [
    { name: 'The Mask Maker', cost: 2, arch: 'champion', str: 11, res: 1, votes: 1, lore: 2, logic: 'champion',
      text: 'When this card is used to steal a Kingdom Card, treat the Occupying card as if its Strength is 0.' },
    { name: 'Bringer of the Word', cost: 2, arch: 'captain', str: 5, inv: 1, votes: 1, lore: 0, logic: 'bringer',
      text: '(Autumn Action) If this card is in a Council, place a Faction Marker on any Council. When this card is in a Council, each marker on a Council contributes 1 vote to you. When this card is removed from a Council, you may move it to the Lost Pile.' },
    { name: 'Ritual of the Tooth', cost: 3, arch: 'cavalry', str: 5, res: 1, votes: 0, lore: 0, logic: 'tooth',
      text: '(Day Action) Burn one of your cards in the Lost Pile. This card adds the Burned card’s printed Strength, Traits, Commands, and rules text to its own until the end of the Round.' },
    { name: 'Ritual of the Eye', cost: 4, arch: 'agent', str: 3, res: 1, votes: 0, lore: 0, logic: 'eye',
      text: 'If this card is Active in the current Clash, the player with the lowest total Strength above 0 wins the current Clash instead of the player with the highest total Strength.' },
  ],
};

const HQ = {
  nobility: { id: 'royal_bank', name: 'Royal Bank', cost: 3, logic: 'royalBank', text: 'Your Faction Cards with no printed votes gain +1 vote. (Autumn Action) Choose one: Move a Captain from your Discard Pile to your Hand, or gain 1 Influence. If you are not first on the Order Track you may do both.' },
  uprising: [
    { id: 'moonshine_cove', name: 'Moonshine Cove', cost: 2, logic: 'moonshine', text: 'You have an additional space to Occupy a Kingdom Card. (Autumn Action) Acquire a face-up Kingdom Card from the Great Road with a Captain or Champion from your Hand. It may only be Occupied on this space.' },
    { id: 'the_syndicate', name: 'The Syndicate', cost: 2, logic: 'syndicate', text: 'Whenever you acquire a Kingdom Card, place a Faction Marker on the Council matching its Suit (max 2 per Council). Each marker contributes 1 vote there.' },
  ],
  clans: [
    { id: 'new_havens_harbour', name: 'New Havens Harbour', cost: 2, logic: 'newHavens', text: 'All your cards without Resilient gain Resilient. (Spring Action) Move up to two Supporters from your Lost Pile to a Region.' },
    { id: 'wandering_embassy', name: 'Wandering Embassy', cost: 2, logic: 'embassy', text: 'Your Traders gain Flank (Day). Whenever your cards are removed from a Council you may move them to your Hand. (Day Action) Move any number of your Active cards with Flank into a Council.' },
  ],
  gathering: { id: 'door_in_the_night', name: 'The Door in the Night', cost: 2, logic: 'door', text: 'When acquired, place 3 Faction Markers here. (Day Action) Remove a marker to give one of your Active cards in the current Clash Ambush until the end of the Round; you may remove an extra marker to Ambush with a card from your Discard Pile instead of your Hand.' },
};

export function buildFactionDefs() {
  const defs = {};
  for (const f of FACTIONS) {
    const list = [];
    BASIC.forEach((b, i) => {
      list.push({
        id: `${f}_${String(i).padStart(2, '0')}`, faction: f, type: 'basic', idx: i, name: BASIC_NAMES[f][i],
        arch: b[0], str: b[1], inv: b[2], res: b[3], path: b[4], cmds: b[5], votes: b[6], lore: b[7], logic: b[8],
        img: `cards/${f}_${String(i).padStart(2, '0')}.webp`,
      });
    });
    ADV[f].forEach((a, k) => {
      const i = 14 + k;
      list.push({
        id: `${f}_${i}`, faction: f, type: 'adv', idx: i, name: a.name, cost: a.cost,
        arch: a.arch, str: a.str, inv: a.inv || 0, res: a.res || 0, path: a.path || 0, cmds: a.cmds || [],
        votes: a.votes || 0, lore: a.lore || 0, logic: a.logic, text: a.text,
        img: `cards/${f}_${String(i).padStart(2, '0')}.webp`,
      });
    });
    const hqs = [].concat(HQ[f]);
    for (const h of hqs) {
      list.push({ id: `hq_${h.id}`, faction: f, type: 'hq', name: h.name, cost: h.cost, logic: h.logic, text: h.text, img: `hq/${h.id}.webp`,
        arch: null, str: 0, inv: 0, res: 0, path: 0, cmds: [], votes: 0, lore: 0 });
    }
    defs[f] = list;
  }
  return defs;
}

export const FACTION_DEFS = buildFactionDefs();
export const DEF_BY_ID = {};
for (const f of FACTIONS) for (const d of FACTION_DEFS[f]) DEF_BY_ID[d.id] = d;

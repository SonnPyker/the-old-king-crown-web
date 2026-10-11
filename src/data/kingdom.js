// Static Kingdom Card definitions. Behaviour lives in engine/logic/kingdom.js keyed by `key`.
// kind: how the card is acquired.
//   occupy  - normal: the bidding card Occupies it
//   supply  - bold: discard bidding card, card goes to Supply
//   region  - bold: discard bidding card, place on a Region
//   loc     - bold: discard bidding card, place on a Location
//   instant - bold: discard bidding card, resolve immediately, then discard

const RAW = [
  // Relics (coins)
  ['adventuring', 'Adventuring Party', 'relics', 'occupy'],
  ['monument', 'Monument Builders', 'relics', 'occupy'],
  ['tincrowns', 'Tin Crowns', 'relics', 'occupy'],
  ['benefactor', 'Mysterious Benefactor', 'relics', 'supply'],
  ['watchtowers', 'White Watchtowers', 'relics', 'occupy'],
  ['palace', 'Forgotten Palace', 'relics', 'occupy'],
  ['beacon', 'The Beacon', 'relics', 'instant'],
  ['library', 'Endless Library', 'relics', 'occupy'],
  ['brigands', 'Emboldened Brigands', 'relics', 'occupy'],
  ['court', 'Midnight Court', 'relics', 'region'],
  ['guild', 'Merchants’ Guild', 'relics', 'loc'],
  ['caves', 'Glittering Caves', 'relics', 'occupy'],
  ['bothies', 'Remote Bothies', 'relics', 'occupy'],
  ['pardons', 'Forged Royal Pardons', 'relics', 'occupy'],
  ['splendid', 'Splendid Guard', 'relics', 'occupy'],
  ['estate', 'Abandoned Estate', 'relics', 'occupy'],
  ['signet', 'Old King’s Signet', 'relics', 'occupy'],
  // Secrets (book)
  ['airship', 'Airship Docks', 'secrets', 'occupy'],
  ['rumours', 'Rumours in the Dark', 'secrets', 'occupy'],
  ['clockwork', 'Clockwork Messengers', 'secrets', 'occupy'],
  ['truenames', 'Book of True Names', 'secrets', 'occupy'],
  ['lantern', 'Old King’s Lantern', 'secrets', 'occupy'],
  ['innkeeper', 'The Innkeeper', 'secrets', 'occupy'],
  ['diary', 'Courtier’s Diary', 'secrets', 'occupy'],
  ['boatman', 'The Boatman', 'secrets', 'occupy'],
  ['enchantress', 'Old Enchantress', 'secrets', 'occupy'],
  ['propaganda', 'Propaganda Advisor', 'secrets', 'occupy'],
  ['simulacrum', 'Prototype Simulacrum', 'secrets', 'occupy'],
  ['mirror', 'Shapeshifter’s Mirror', 'secrets', 'occupy'],
  ['siren', 'The Siren’s Pool', 'secrets', 'occupy'],
  ['bell', 'Blue Hour Bell', 'secrets', 'occupy'],
  ['irongear', 'Unearthed Iron Gear', 'secrets', 'occupy'],
  ['helm', 'Old King’s Helm', 'secrets', 'occupy'],
  ['eye', 'Old King’s Eye', 'secrets', 'supply'],
  // Oaths (swords)
  ['assassins', 'Assassins’ Guild', 'oaths', 'occupy'],
  ['reservists', 'Countryside Reservists', 'oaths', 'occupy'],
  ['workshop', 'Engineers’ Workshop', 'oaths', 'occupy'],
  ['tourney', 'Grand Tourney', 'oaths', 'occupy'],
  ['greatwing', 'The Great Wing', 'oaths', 'occupy'],
  ['lanes', 'Hidden Lanes', 'oaths', 'occupy'],
  ['siegecmd', 'Siege Commander', 'oaths', 'occupy'],
  ['banner', 'Mustering Banner', 'oaths', 'occupy'],
  ['citadel', 'Ruined Citadel', 'oaths', 'region'],
  ['smuggler', 'Smuggler’s Pass', 'oaths', 'occupy'],
  ['horn', 'Swansong Horn', 'oaths', 'occupy'],
  ['sword', 'The Sword That Slept', 'oaths', 'occupy'],
  ['sundial', 'Cracked Sundial', 'oaths', 'occupy'],
  ['ring', 'Curious Ring', 'oaths', 'occupy'],
  ['ball', 'Poisoner’s Ball', 'oaths', 'region'],
  ['spear', 'Old King’s Spear', 'oaths', 'occupy'],
  ['shield', 'Old King’s Shield', 'oaths', 'occupy'],
];

export const KINGDOM_DEFS = RAW.map(([key, name, suit, kind], idx) => ({
  id: 'kc_' + key, key, idx, name, suit, kind,
  img: `kingdom/kc_${String(idx).padStart(2, '0')}.webp`,
}));

export const KC_BY_KEY = {};
for (const d of KINGDOM_DEFS) KC_BY_KEY[d.key] = d;

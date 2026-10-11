// Static constants shared by engine, AI and UI.

export const FACTIONS = ['nobility', 'uprising', 'clans', 'gathering'];

export const FACTION_INFO = {
  nobility:  { name: 'Nobility',  title: 'The Nobility',  color: '#2f62bd', dark: '#1b3a78', light: '#7fa3e6', heir: 'Titus of Dawns & Dusks' },
  uprising:  { name: 'Uprising',  title: 'The Uprising',  color: '#b3162a', dark: '#6e0d1a', light: '#e86a78', heir: 'The Secret Society' },
  clans:     { name: 'Clans',     title: 'The Clans',     color: '#13a09a', dark: '#0a615d', light: '#6fd9d3', heir: 'Saga the Unifier' },
  gathering: { name: 'Gathering', title: 'The Gathering', color: '#8a35a8', dark: '#552068', light: '#c88be0', heir: 'Petrichor the Unmasked' },
};

// Regions of the Map (index = Clash-marker target) and their Locations.
export const REGIONS = [
  { id: 0, name: 'Highlands', locs: ['castle', 'wilderness'] },
  { id: 1, name: 'Plateau',   locs: ['harvest', 'battlefield'] },
  { id: 2, name: 'Lowlands',  locs: ['shrine', 'necropolis'] },
];

export const LOCATIONS = {
  castle:      { name: 'Castle',      region: 0, inf: 1 },
  wilderness:  { name: 'Wilderness',  region: 0, inf: 1 },
  harvest:     { name: 'Harvest Field', region: 1, inf: 1 },
  battlefield: { name: 'Battlefield', region: 1, inf: 2 },
  shrine:      { name: 'Shrine',      region: 2, inf: 1 },
  necropolis:  { name: 'Necropolis',  region: 2, inf: 1 },
};
export const LOC_IDS = Object.keys(LOCATIONS);

export const COUNCILS = ['relics', 'secrets', 'oaths'];
export const COUNCIL_INFO = {
  relics:  { name: 'Council of Relics',  suit: 'relics' },
  secrets: { name: 'Council of Secrets', suit: 'secrets' },
  oaths:   { name: 'Council of Oaths',   suit: 'oaths' },
};

export const ARCHETYPES = {
  heir: 'Heir', agent: 'Agent', captain: 'Captain', cavalry: 'Cavalry', champion: 'Champion',
  follower: 'Follower', ruse: 'Ruse', trader: 'Trader', warmachine: 'War Machine',
};

export const MIN_HAND = 3;
export const MAX_HAND = 8;
export const START_HAND = 6;
export const SUPPORTERS = 5;

export const GAME_LENGTHS = { short: 4, standard: 5, extended: 6 };

// Convenience step ids
export const STEPS = ['spring', 'day', 'autumn', 'night', 'winter'];

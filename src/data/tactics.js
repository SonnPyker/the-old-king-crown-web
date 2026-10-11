// Static Tactic Tile definitions (4 per Faction). Behaviour lives in engine/logic/tactics.js.
// step: when the Action is available ('spring' | 'day' | 'autumn' | 'bid' = reaction while resolving Bids).
// markers: number of Faction Markers placed on the tile during Setup (0 = single use).

const RAW = [
  // Nobility
  ['martial_law', 'nobility', 'Martial Law', 'spring', 2],
  ['royal_seal', 'nobility', 'Royal Seal', 'bid', 0],
  ['school_of_the_stones', 'nobility', 'School of the Stones', 'spring', 0],
  ['witch_trial', 'nobility', 'Witch Trial', 'autumn', 0],
  // Uprising
  ['false_orders', 'uprising', 'False Orders', 'spring', 0],
  ['night_raids', 'uprising', 'Night Raids', 'spring', 0],
  ['safehouses', 'uprising', 'Safehouses', 'day', 3],
  ['school_of_the_streets', 'uprising', 'School of the Streets', 'spring', 0],
  // Clans
  ['river_runners', 'clans', 'River Runners', 'autumn', 0],
  ['salt_toughness', 'clans', 'Salt Toughness', 'autumn', 0],
  ['school_of_the_storms', 'clans', 'School of the Storms', 'spring', 0],
  ['sea_lanes', 'clans', 'Sea Lanes', 'day', 3],
  // Gathering
  ['moonlit_foragers', 'gathering', 'Moonlit Foragers', 'spring', 0],
  ['out_beyond_the_lights', 'gathering', 'Out Beyond the Lights', 'day', 0],
  ['ritual_sacrifice', 'gathering', 'Ritual Sacrifice', 'autumn', 0],
  ['school_of_the_stars', 'gathering', 'School of the Stars', 'day', 0],
];

export const TACTIC_DEFS = {};
export const TACTICS_BY_FACTION = { nobility: [], uprising: [], clans: [], gathering: [] };
for (const [id, faction, name, step, markers] of RAW) {
  const d = { id, faction, name, step, markers, img: `tactics/${id}.webp`, back: `tactics/back_${faction}.webp` };
  TACTIC_DEFS[id] = d;
  TACTICS_BY_FACTION[faction].push(d);
}

// Kingdom's Favour actions (one per Faction) and the Step in which they are used.
export const KF_DEFS = {
  nobility: { id: 'regal_guard', name: 'Regal Guard', step: 'spring' },
  uprising: { id: 'spy_network', name: 'Spy Network', step: 'spring' },
  clans: { id: 'prophet_of_the_waves', name: 'Prophet of the Waves', step: 'day' },
  gathering: { id: 'herald_of_the_moon', name: 'Herald of the Moon', step: 'autumn' },
};

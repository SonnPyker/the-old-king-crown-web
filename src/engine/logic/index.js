// Registry connecting card definitions to their rules logic.

import { FACTION_LOGIC } from './faction.js';
import { KC_LOGIC } from './kingdom.js';
import { TACTIC_LOGIC, KF_LOGIC, FX_LOGIC } from './tactics.js';

export { FACTION_LOGIC, KC_LOGIC, TACTIC_LOGIC, KF_LOGIC, FX_LOGIC };

export function logicById(id) { return id ? FACTION_LOGIC[id] || null : null; }

// Logic for a card object (Kingdom Card by key, Faction/HQ card by def.logic).
export function logicOf(c) {
  if (c.kind === 'k') return KC_LOGIC[c.def.key] || null;
  if (c.kind === 'f') return c.def.logic ? FACTION_LOGIC[c.def.logic] || null : null;
  return null;
}

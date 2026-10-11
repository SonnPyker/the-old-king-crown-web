// Consistency checks used by the simulator and tests.

import { SUPPORTERS } from '../data/constants.js';

export function checkInvariants(g, req = null) {
  const S = g.S;
  const bad = [];
  const seen = new Map();
  for (const [key, arr] of Object.entries(S.z)) {
    for (const u of arr) {
      if (seen.has(u)) bad.push(`card ${u} in two zones: ${seen.get(u)} and ${key}`);
      seen.set(u, key);
      if (!S.cards[u]) bad.push(`unknown card ${u} in ${key}`);
      else if (S.cards[u].z !== key) bad.push(`card ${u} (${S.cards[u].def.name}) listed in ${key} but z=${S.cards[u].z}`);
    }
  }
  const special = { road: S.road.filter((u) => u != null), kdeck: S.kdeck, kdiscard: S.kdiscard };
  for (const [key, arr] of Object.entries(special)) {
    for (const u of arr) {
      if (seen.has(u)) bad.push(`card ${u} in two zones: ${seen.get(u)} and ${key}`);
      seen.set(u, key);
      if (S.cards[u].z !== key) bad.push(`card ${u} (${S.cards[u].def.name}) listed in ${key} but z=${S.cards[u].z}`);
    }
  }
  for (const c of S.cards) {
    if (!seen.has(c.uid)) bad.push(`card ${c.uid} (${c.def.name}, kind ${c.kind}) is nowhere (z=${c.z})`);
  }
  for (let pid = 0; pid < S.players.length; pid++) {
    const p = S.players[pid];
    const onMap = g.totalSupOnMap(pid);
    if (p.boardSup + p.lostSup + onMap !== SUPPORTERS) bad.push(`P${pid} supporters board ${p.boardSup} lost ${p.lostSup} map ${onMap}`);
    if (p.inf < 0 || p.lore < 0) bad.push(`P${pid} negative resources`);
    if (p.handSize < 3 || p.handSize > 8) bad.push(`P${pid} hand size ${p.handSize}`);
    const h = g.zone(g.zk.hand(pid)).length + g.zone(g.zk.bid(pid)).length;
    if (h > p.handSize && !(req && req.purpose === 'discardExcess' && req.pid === pid)) bad.push(`P${pid} hand ${h} > size ${p.handSize} (phase ${S.phase})`);
    for (let i = 0; i < 3; i++) {
      if (g.zone(g.zk.kc(pid, i)).length > 1) bad.push(`P${pid} slot ${i} holds several KCs`);
      if (g.zone(g.zk.occ(pid, i)).length > 1) bad.push(`P${pid} slot ${i} has several occupants`);
      if (g.zone(g.zk.occ(pid, i)).length && !g.zone(g.zk.kc(pid, i)).length) bad.push(`P${pid} slot ${i} occupant without KC`);
    }
  }
  for (let r = 0; r < 3; r++) {
    const R = S.region[r];
    for (const pid of Object.keys(R.sup)) {
      if ((R.sup[pid] || 0) < 0) bad.push(`neg sup region ${r}`);
      if ((R.fresh[pid] || 0) > (R.sup[pid] || 0)) bad.push(`fresh > sup region ${r} P${pid}`);
    }
    for (const u of g.zone(g.zk.active(r))) {
      const c = S.cards[u];
      if (c.kind !== 'f') bad.push(`non-faction card ${u} Active in region ${r}`);
    }
  }
  for (const c of S.cards) {
    if (c.inf > 0 && !(c.z && /^R\d:active$/.test(c.z))) bad.push(`card ${c.uid} (${c.def.name}) has inf ${c.inf} in ${c.z}`);
    if (c.kind === 'f' && c.owner == null) bad.push(`faction card ${c.uid} without owner`);
  }
  return bad;
}

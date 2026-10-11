// Verifies that every translation key used by the UI / engine exists in both languages.
import fs from 'node:fs';
import path from 'node:path';
import { DICT } from '../src/ui/i18n.js';
import { FACTION_DEFS } from '../src/data/cards.js';
import { LOC_IDS } from '../src/data/constants.js';
import { TACTIC_DEFS } from '../src/data/tactics.js';

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk('src').filter((f) => f.endsWith('.js'));
const need = new Map();
const want = (k, where) => { if (!k.endsWith('.') && !need.has(k)) need.set(k, where); };
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  if (f.includes(path.join('src', 'ui'))) for (const m of s.matchAll(/\bt\('([A-Za-z0-9_.]+)'/g)) want(m[1], f);
  for (const m of s.matchAll(/prompt: '(p\.[A-Za-z0-9_]+)'/g)) want(m[1], f);
  for (const m of s.matchAll(/'(p\.[A-Za-z0-9_]+)'/g)) want(m[1], f);
  for (const m of s.matchAll(/\.log\('([A-Za-z]+)'/g)) want('l.' + m[1], f);
  for (const m of s.matchAll(/label: '([A-Za-z]+)'/g)) want('o.' + m[1], f);
  for (const m of s.matchAll(/(?:why|dest)?\bgainInf\([^;]*?'([a-zA-Z]+)'\)/g)) want('why.' + m[1], f);
  for (const m of s.matchAll(/gainLore\([^;]*?'([a-zA-Z]+)'\)/g)) want('why.' + m[1], f);
  for (const m of s.matchAll(/stealInf\([^;]*?'([a-zA-Z]+)'\)/g)) want('why.' + m[1], f);
  for (const m of s.matchAll(/addFx\(pid, '([a-zA-Z]+)'/g)) want('fx.' + m[1], f);
  for (const m of s.matchAll(/^(?!.*fx\.push).*?(?:^|\s)key: '([a-zA-Z]+)',/gm)) if (f.includes('logic')) want('a.' + m[1], f);
}
for (const l of LOC_IDS) { want('loc.' + l); want('loc.reward.' + l); want('loc.short.' + l); }
for (const c of ['relics', 'secrets', 'oaths']) { want('council.' + c); want('council.hint.' + c); want('suit.' + c); }
for (const r of [0, 1, 2]) want('region.' + r);
for (const f of ['nobility', 'uprising', 'clans', 'gathering']) { want('faction.' + f); want('kf.' + f); want('faction.desc.' + f); }
for (const a of ['heir', 'agent', 'captain', 'cavalry', 'champion', 'follower', 'ruse', 'trader', 'warmachine']) want('arch.' + a);
for (const c of ['ambush', 'retreat', 'flank', 'rally', 'deploy', 'deadly']) want('cmd.' + c);
for (const p of ['year', 'spring', 'summer', 'autumn', 'winter', 'end', 'setup']) want('phase.' + p);
for (const s of ['spring', 'day', 'autumn']) want('step.' + s);
let bad = 0;
for (const [k, where] of need) {
  for (const l of ['vi', 'en']) if (!(k in DICT[l])) { console.log(`MISSING ${l}: ${k}   (${where || ''})`); bad++; }
}
for (const k of Object.keys(DICT.en)) if (!(k in DICT.vi)) { console.log('vi lacks', k); bad++; }
for (const k of Object.keys(DICT.vi)) if (!(k in DICT.en)) { console.log('en lacks', k); bad++; }
console.log(bad ? `${bad} problems` : 'all keys present', `(${need.size} checked)`);
void FACTION_DEFS; void TACTIC_DEFS;

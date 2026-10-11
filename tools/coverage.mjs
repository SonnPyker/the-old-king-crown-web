// Which request purposes / log events occur in simulated games? Lists the ones never seen.
// Usage: node tools/coverage.mjs [games=200] [level=random|easy|normal|hard]
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const out = path.join(os.tmpdir(), 'tokc-sim.mjs');
await build({ entryPoints: ['src/sim_entry.js'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { Session, FACTIONS } = await import(pathToFileURL(out).href + '?t=' + Date.now());
const games = +(process.argv[2] || 200);
const level = process.argv[3] || 'random';
const purposes = {}; const keys = {}; const actions = {};
for (let seed = 1; seed <= games; seed++) {
  const np = 2 + (seed % 3);
  const facs = FACTIONS.slice().sort((a, b) => ((seed * 7 + a.charCodeAt(0)) % 11) - ((seed * 7 + b.charCodeAt(0)) % 11));
  const settings = { players: Array.from({ length: np }, (_, i) => ({ name: 'AI' + i, type: 'ai', faction: facs[i], level })), length: ['short', 'standard', 'extended'][seed % 3], advanced: seed % 4 === 0, order: 'random' };
  const s = new Session({ settings, seed });
  while (!s.done) {
    const r = s.req; purposes[r.purpose] = (purposes[r.purpose] || 0) + 1;
    s.stepAI();
    if (r.purpose === 'action') { const a = s.responses[s.responses.length - 1].a[0]; const k = a.split(':').slice(0, 2).join(':') + (a.startsWith('a:card') || a.startsWith('a:kc') ? ':' + a.split(':').slice(-2).join(':') : ''); actions[k] = (actions[k] || 0) + 1; }
  }
  for (const e of s.log) keys[e.key] = (keys[e.key] || 0) + 1;
}
const src = fs.readdirSync('src/engine').filter((f) => f.endsWith('.js')).concat(fs.readdirSync('src/engine/logic').map((f) => 'logic/' + f)).map((f) => fs.readFileSync('src/engine/' + f, 'utf8')).join('\n');
const all = new Set([...src.matchAll(/purpose: '([A-Za-z0-9_]+)'/g)].map((m) => m[1]));
const never = [...all].filter((p) => !purposes[p]).sort();
console.log('purposes seen:', Object.keys(purposes).length, 'defined:', all.size);
console.log('never seen purposes:', never.join(', '));
const allLogs = new Set([...src.matchAll(/log\('([A-Za-z0-9_]+)'/g)].map((m) => m[1]));
console.log('never seen log keys:', [...allLogs].filter((k) => !keys[k]).sort().join(', '));
console.log('actions:', JSON.stringify(actions, null, 0));

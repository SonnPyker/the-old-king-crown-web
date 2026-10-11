// Dumps the shape of every request purpose seen in random games (option kinds / fields, ctx keys, min/max, intent).
// Usage: node tools/purposes.mjs [games=60] [startSeed=1] [purposeFilter]
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
const games = nums[0] ?? 60;
const start = nums[1] ?? 1;
const filter = args.find((a) => !/^\d+$/.test(a) && !a.startsWith('--'));

const out = path.join(os.tmpdir(), 'tokc-purposes.mjs');
await build({ entryPoints: ['src/sim_entry.js'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { Session, FACTIONS } = await import(pathToFileURL(out).href + '?t=' + Date.now());

const seen = new Map();
const optIds = new Map();
const note = (req) => {
  const key = req.type + ':' + req.purpose;
  let e = seen.get(key);
  if (!e) { e = { n: 0, kinds: new Map(), ctx: new Set(), min: new Set(), max: new Set(), intent: new Set(), slots: new Set(), sample: null }; seen.set(key, e); }
  e.n++;
  e.intent.add(req.intent);
  if (req.type === 'select') {
    e.min.add(req.min); e.max.add(req.max > 20 ? 'N' : req.max);
    for (const o of req.options) {
      const f = Object.keys(o).filter((k) => k !== 'id' && k !== 'kind').sort().join(',');
      const kk = o.kind + (f ? `{${f}}` : '');
      if (o.kind === 'opt' || o.kind === 'none' || o.kind === 'yes' || o.kind === 'pass') { const set = optIds.get(req.purpose) || new Set(); set.add(o.id + (o.label ? '=' + o.label : '')); optIds.set(req.purpose, set); }
      e.kinds.set(kk, (e.kinds.get(kk) || 0) + 1);
    }
  } else if (req.type === 'distribute') {
    for (const s of req.slots) e.slots.add(Object.keys(s).join(','));
  }
  for (const k of Object.keys(req.ctx || {})) e.ctx.add(k);
  if (!e.sample) e.sample = req;
};

for (let g = 0; g < games; g++) {
  const seed = start + g;
  const np = 2 + (seed % 3);
  const facs = FACTIONS.slice().sort((a, b) => ((seed * 7 + a.charCodeAt(0)) % 11) - ((seed * 7 + b.charCodeAt(0)) % 11));
  const settings = {
    players: Array.from({ length: np }, (_, i) => ({ name: 'AI' + i, type: 'ai', faction: facs[i], level: 'random' })),
    length: ['short', 'standard', 'extended'][seed % 3], advanced: seed % 4 === 0, order: 'random',
  };
  const s = new Session({ settings, seed });
  let n = 0;
  while (!s.done && n < 200000) { note(s.req); s.stepAI(); n++; }
}

const rows = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [k, e] of rows) {
  if (filter && !k.includes(filter)) continue;
  console.log(`${k}  x${e.n}  intent=${[...e.intent].join('/')}  min=${[...e.min].join('/')} max=${[...e.max].join('/')}`);
  if (e.kinds.size) console.log('    opts: ' + [...e.kinds.keys()].join(' | '));
  if (e.slots.size) console.log('    slots: ' + [...e.slots].join(' | '));
  if (e.ctx.size) console.log('    ctx: ' + [...e.ctx].join(','));
  const ids = optIds.get(k.split(':')[1]); if (ids && k.startsWith('select')) console.log('    ids: ' + [...ids].join(' ; '));
}
console.log(`\n${rows.length} request shapes`);

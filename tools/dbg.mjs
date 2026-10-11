import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const out = path.join(os.tmpdir(), 'tokc-sim.mjs');
await build({ entryPoints: ['src/sim_entry.js'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { Session, FACTIONS, checkInvariants } = await import(pathToFileURL(out).href + '?t=' + Date.now());
const seed = +process.argv[2];
const np = +(process.argv[3] || (2 + (seed % 3)));
const facs = FACTIONS.slice().sort((a, b) => ((seed * 7 + a.charCodeAt(0)) % 11) - ((seed * 7 + b.charCodeAt(0)) % 11));
const settings = {
  players: Array.from({ length: np }, (_, i) => ({ name: 'AI' + i, type: 'ai', faction: facs[i], level: 'random' })),
  length: ['short', 'standard', 'extended'][seed % 3], advanced: seed % 4 === 0, order: 'random',
};
const s = new Session({ settings, seed });
let n = 0;
while (!s.done) {
  const rq = s.req; const before = [0,1,2].filter(p=>p<np).map(p => s.game.zone(s.game.zk.hand(p)).length + '+' + s.game.zone(s.game.zk.bid(p)).length);
  s.stepAI(); n++;
  if (process.argv[4] && n<12) console.log(JSON.stringify(s.game.zone('p2:hand').map(u=>s.game.C(u).def.name)), JSON.stringify(s.game.log ? '' : ''));
  if (process.argv[4]) console.log(n, rq.purpose, rq.pid, before.join(' '), JSON.stringify(s.responses[s.responses.length-1].a));
  const bad = checkInvariants(s.game, s.req);
  if (bad.length) {
    console.log('step', n, bad);
    for (const e of s.log.slice(-14)) console.log(JSON.stringify(e));
    const g = s.game;
    for (let pid = 0; pid < np; pid++) console.log('P' + pid, 'hand', g.zone(g.zk.hand(pid)).map((u) => g.C(u).def.name), 'bid', g.zone(g.zk.bid(pid)), 'size', g.P(pid).handSize);
    break;
  }
}

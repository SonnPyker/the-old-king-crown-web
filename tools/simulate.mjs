// Headless test bench: plays many AI-only games to find engine crashes / invariant violations,
// and (with --levels) to compare AI levels against each other.
// Usage: node tools/simulate.mjs [games=20] [startSeed=1] [--adv] [--players=3] [--verbose] [--nocheck]
//        node tools/simulate.mjs 200 1 --levels=hard,normal,easy,random [--nocheck]
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n, d) => { const a = args.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
const games = nums[0] ?? 20;
const start = nums[1] ?? 1;
const levels = val('levels', '') ? val('levels', '').split(',') : null;

const out = path.join(os.tmpdir(), 'tokc-sim.mjs');
await build({ entryPoints: ['src/sim_entry.js'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const mod = await import(pathToFileURL(out).href + '?t=' + Date.now());
const { Session, FACTIONS, checkInvariants } = mod;
const check = !flag('nocheck');
const realError = console.error;
console.error = (...a) => { if (a[0] !== 'AI failure') realError(...a); }; // AI problems are counted in `issues` below

let fails = 0;
const stats = { rounds: 0, steps: 0, wins: {} };
const byLevel = {}; // level -> { games, wins, score, rank }
const issues = {};
const prof = {}; // level -> { key -> total }
const profile = flag('profile');
const t0 = Date.now();
for (let g = 0; g < games; g++) {
  const seed = start + g;
  const np = levels ? levels.length : +val('players', 2 + (seed % 3));
  const rot = FACTIONS.slice();
  const k = levels ? Math.floor(seed / levels.length) % 4 : seed % 4; // decorrelate faction and level rotation
  const facs = rot.slice(k).concat(rot.slice(0, k));
  const settings = {
    players: Array.from({ length: np }, (_, i) => ({
      name: 'AI' + i, type: 'ai', faction: facs[i],
      level: levels ? levels[(i + seed) % levels.length] : 'random',
    })),
    length: levels ? (flag('short') ? 'short' : 'standard') : ['short', 'standard', 'extended'][seed % 3],
    advanced: flag('adv') || (!levels && seed % 4 === 0), order: 'random',
  };
  try {
    const s = new Session({ settings, seed });
    s.onAIIssue = (req, kind, info) => {
      const key = `${kind} ${req.type}:${req.purpose}`;
      issues[key] = issues[key] || { n: 0, sample: String(info && info.stack ? info.stack.split('\n').slice(0, 3).join(' / ') : JSON.stringify(info)).slice(0, 300) };
      issues[key].n++;
    };
    let n = 0;
    while (!s.done && n < 200000) {
      if (!s.stepAI()) throw new Error('human wait? ' + JSON.stringify(s.req).slice(0, 200));
      n++;
      if (check) {
        const bad = checkInvariants(s.game, s.req);
        if (bad.length) throw new Error(`invariant (step ${n}, ${s.game.S.phase} r${s.game.S.round}): ${bad.slice(0, 4).join(' | ')} last=${JSON.stringify(s.log.slice(-4).map((e) => e.key))}`);
      }
    }
    if (!s.done) throw new Error('did not finish in 200000 steps');
    stats.steps += n;
    const res = s.result;
    const wf = settings.players[res.winner].faction;
    stats.wins[wf] = (stats.wins[wf] || 0) + 1;
    for (const sc of res.scores) {
      const lv = settings.players[sc.pid].level;
      const b = byLevel[lv] = byLevel[lv] || { games: 0, wins: 0, score: 0, rank: 0 };
      b.games++; b.score += sc.total; b.rank += res.ranking.indexOf(sc.pid) + 1;
      if (sc.pid === res.winner) b.wins++;
    }
    if (profile) {
      for (const e of s.log) {
        if (e.pid == null || !settings.players[e.pid]) continue;
        const lv = settings.players[e.pid].level;
        const P = prof[lv] = prof[lv] || {};
        const key = e.key === 'gainInf' ? 'inf:' + e.why : e.key === 'stealInf' ? 'steal:' + e.why : e.key;
        P[key] = (P[key] || 0) + (e.key === 'gainInf' || e.key === 'stealInf' ? e.n : 1);
      }
    }
    if (flag('verbose')) console.log(`seed ${seed}: ${np}p ${settings.length}${settings.advanced ? ' adv' : ''} steps=${n} winner=${res.winner}(${settings.players[res.winner].level}) scores=${res.scores.map((x) => x.total).join('/')}`);
    // Replay determinism
    if (!flag('noreplay')) {
      const s2 = new Session({ settings, seed, responses: s.responses });
      if (!s2.done || JSON.stringify(s2.result) !== JSON.stringify(res)) throw new Error('replay mismatch');
    }
  } catch (e) {
    fails++;
    console.log(`seed ${seed} FAILED: ${e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e}`);
    if (fails >= 5) break;
  }
}
console.log(`done: ${games} games, ${fails} failures, avg steps ${(stats.steps / Math.max(1, games - fails)).toFixed(0)}, ${((Date.now() - t0) / 1000).toFixed(1)}s, wins by faction ${JSON.stringify(stats.wins)}`);
if (levels) {
  console.log('level      games  wins   win%   avg score  avg rank');
  for (const [lv, b] of Object.entries(byLevel)) {
    console.log(`${lv.padEnd(9)} ${String(b.games).padStart(6)} ${String(b.wins).padStart(5)} ${(100 * b.wins / b.games).toFixed(1).padStart(6)}% ${(b.score / b.games).toFixed(2).padStart(10)} ${(b.rank / b.games).toFixed(2).padStart(9)}`);
  }
}
if (profile) {
  const lvs = Object.keys(prof);
  const keys = [...new Set(lvs.flatMap((l) => Object.keys(prof[l])))].sort();
  console.log('per-game average of events per player (by level):');
  console.log('key'.padEnd(26) + lvs.map((l) => l.padStart(9)).join(''));
  for (const k of keys) console.log(k.padEnd(26) + lvs.map((l) => (((prof[l][k] || 0) / byLevel[l].games).toFixed(2)).padStart(9)).join(''));
}
const iss = Object.entries(issues).sort((a, b) => b[1].n - a[1].n);
if (iss.length) {
  console.log('AI fallbacks (invalid / thrown answers):');
  for (const [k, v] of iss.slice(0, 40)) console.log(`  ${String(v.n).padStart(6)}  ${k}   e.g. ${v.sample}`);
}
process.exit(fails ? 1 : 0);

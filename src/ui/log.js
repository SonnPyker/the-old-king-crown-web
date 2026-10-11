// Turns engine log entries into localized HTML. Never prints the identity of hidden cards.

import { esc } from './util.js';
import { t, has } from './i18n.js';
import { TACTIC_DEFS } from '../data/tactics.js';
import { pspan, cname } from './cards.js';

const MINOR = new Set(['kdiscard', 'roadRepopulated', 'kdeckReshuffle', 'toLost', 'burn', 'overflowToDeck', 'placeInfOnCard', 'bidsPlaced', 'supLost', 'winterEnd', 'step']);
const HEAD = new Set(['round', 'phase']);

function place(g, v) {
  if (typeof v === 'number') return t('region.' + v);
  if (v === 'board') return t('where.board');
  if (v === 'lost') return t('where.lost');
  if (v === 'hand') return t('where.hand');
  if (v === 'discard') return t('where.discard');
  if (v === 'deckTop') return t('where.deckTop');
  if (v === 'bottom') return t('bottom');
  return esc(v);
}

function fmt(g, k, v, e) {
  if (v == null) return '';
  switch (k) {
    case 'pid': case 'victim': case 'target': return pspan(g, v);
    case 'card': case 'kc': case 'as': case 'a': case 'b': return cname(g, v);
    case 'region': return t('region.' + v);
    case 'from': case 'to': return place(g, v);
    case 'loc': return t('loc.' + v);
    case 'council': return t('council.' + v);
    case 'order': case 'tied': return v.map((p) => pspan(g, p)).join(' › ');
    case 'regions': return v.map((r) => t('region.' + r)).join(' › ');
    case 'tid': return esc(TACTIC_DEFS[v] ? TACTIC_DEFS[v].name : v);
    case 'why': return has('why.' + v) ? t('why.' + v) : '';
    case 'fx': return t('fx.' + v);
    case 'faction': return t('kf.' + v);
    case 'phase': return t('phase.' + v);
    case 'step': return t('step.' + v);
    // Lore paid for a Site of Power; a free acquisition logs 0 and shows nothing.
    case 'cost': return v > 0 ? ` (${v} ${t('lore')})` : '';
    case 'bids': return Object.keys(v).map((p) => `${pspan(g, +p)} ${cname(g, v[p])} <b>${e.str ? e.str[p] : ''}</b>`).join(' · ');
    case 'totals': return Object.keys(v).map((p) => `${pspan(g, +p)} <b>${v[p]}</b>`).join(' · ');
    default: return esc(v);
  }
}

export function logLine(g, e) {
  const tpl = 'l.' + e.key;
  if (!has(tpl)) return null;
  let s = t(tpl);
  if (e.key === 'phase') return { cls: 'head ph-' + e.phase, html: t('l.phase', { phase: t('phase.' + e.phase) }) };
  if (e.key === 'round') return { cls: 'head rnd', html: t('l.round', { round: e.round }) };
  s = s.replace(/\{(\w+)\}/g, (m, k) => (k in e ? fmt(g, k, e[k], e) : (k === 'why' ? '' : '')));
  const f = e.pid != null && g.P(e.pid) ? g.P(e.pid).faction : '';
  return { cls: (MINOR.has(e.key) ? 'minor ' : '') + (f ? 'f-' + f : ''), html: s };
}

export function renderLog(g, limit = 220) {
  const all = g.logEntries;
  const from = Math.max(0, all.length - limit);
  const rows = [];
  for (let i = from; i < all.length; i++) {
    const r = logLine(g, all[i]);
    if (r) rows.push(`<li class="${r.cls}">${r.html}</li>`);
  }
  return rows.join('');
}

// The last few non-minor lines (used for the toast strip on small screens).
export function lastLines(g, n = 3) {
  const out = [];
  for (let i = g.logEntries.length - 1; i >= 0 && out.length < n; i--) {
    const e = g.logEntries[i];
    if (MINOR.has(e.key) || HEAD.has(e.key)) continue;
    const r = logLine(g, e);
    if (r) out.unshift(r.html);
  }
  return out;
}

// The decision panel: renders the pending request (select / assign / distribute / peek) and
// turns clicks on the panel or on highlighted board elements into answers.

import { esc } from './util.js';
import { t, has } from './i18n.js';
import { ui } from './state.js';
import { anyCard, tok, emblem, pchip, cname } from './cards.js';
import { TACTIC_DEFS } from '../data/tactics.js';
import { REGIONS } from '../data/constants.js';

// Kinds that always answer immediately when clicked.
const TERMINAL = new Set(['yes', 'no', 'pass', 'none', 'num', 'opt', 'return', 'regionPair']);
// Kinds that follow the "select, then Confirm" preference on touch screens.
const CONFIRMABLE = new Set(['card', 'road', 'steal', 'slot', 'tactic']);

// ----------------------------------------------------------------------------- request bookkeeping
export function syncReq(req) {
  const key = req ? `${req.id}:${req.type}` : null;
  if (key === ui.reqKey) return false;
  ui.reqKey = key;
  ui.sel = [];
  ui.focus = null;
  ui.asg = null;
  ui.dist = null;
  if (req && req.type === 'assign') ui.asg = { slots: req.slots.map(() => null), held: null };
  if (req && req.type === 'distribute') ui.dist = req.slots.map(() => 0);
  return true;
}

// Board targets for the current request: Map(targetKey -> [optionId]).
export function targetMap(g, req) {
  const m = new Map();
  const add = (k, id) => { if (!m.has(k)) m.set(k, []); m.get(k).push(id); };
  if (!req) return m;
  if (req.type === 'select') {
    for (const o of req.options) {
      switch (o.kind) {
        case 'card': add('u:' + o.uid, o.id); break;
        case 'road': case 'steal': add('u:' + o.kc, o.id); break;
        case 'region': add('r:' + o.region, o.id); break;
        case 'loc': add('l:' + o.loc, o.id); break;
        case 'council': add('c:' + o.council, o.id); break;
        case 'player': add('p:' + o.player, o.id); break;
        case 'tactic': add(`t:${o.pid}:${o.tid}`, o.id); break;
        case 'slot': add(`s:${req.pid}:${o.slot}`, o.id); break;
        case 'action':
          if (o.uid != null && (o.act === 'card' || o.act === 'kc' || o.act === 'cmd')) add('u:' + o.uid, o.id);
          else if (o.act === 'tactic') add(`t:${req.pid}:${o.tid}`, o.id);
          break;
        default: break;
      }
    }
  } else if (req.type === 'assign') {
    for (const u of req.cards) add('u:' + u, 'asg');
    for (const s of req.slots) if (s.region != null) add('r:' + s.region, 'asg');
  }
  return m;
}

export const selectedTargets = (req) => {
  const out = new Set();
  if (!req || req.type !== 'select') return out;
  for (const id of ui.sel) {
    const o = req.options.find((x) => x.id === id);
    if (!o) continue;
    if (o.kind === 'card') out.add('u:' + o.uid);
    else if (o.kind === 'road' || o.kind === 'steal') out.add('u:' + o.kc);
    else if (o.kind === 'region') out.add('r:' + o.region);
    else if (o.kind === 'loc') out.add('l:' + o.loc);
    else if (o.kind === 'council') out.add('c:' + o.council);
    else if (o.kind === 'player') out.add('p:' + o.player);
    else if (o.kind === 'tactic') out.add(`t:${o.pid}:${o.tid}`);
    else if (o.kind === 'slot') out.add(`s:${req.pid}:${o.slot}`);
  }
  return out;
};

// ----------------------------------------------------------------------------- answers
const countOk = (req) => ui.sel.length >= req.min && ui.sel.length <= req.max;

// Click on an option (from the panel or via a board target). Returns an answer to submit, or undefined.
export function pickOption(g, req, optId) {
  const o = req.options.find((x) => x.id === optId);
  if (!o) return undefined;
  if (req.max > 1) {
    if (TERMINAL.has(o.kind)) return [o.id];
    const i = ui.sel.indexOf(o.id);
    if (i >= 0) ui.sel.splice(i, 1);
    else if (ui.sel.length < req.max) ui.sel.push(o.id);
    else if (req.max === 1) ui.sel = [o.id];
    return undefined;
  }
  if (!TERMINAL.has(o.kind) && CONFIRMABLE.has(o.kind) && ui.prefs.confirmPicks) {
    ui.sel = ui.sel[0] === o.id ? [] : [o.id];
    return undefined;
  }
  return [o.id];
}

// Click on a highlighted board element.
export function targetClick(g, req, tg) {
  if (!req) return undefined;
  if (req.type === 'assign') return assignClick(g, req, tg);
  if (req.type !== 'select') return undefined;
  const opts = targetMap(g, req).get(tg);
  if (!opts || !opts.length) return undefined;
  if (opts.length === 1) return pickOption(g, req, opts[0]);
  ui.focus = ui.focus === tg ? null : tg;
  return undefined;
}

export function confirmAnswer(g, req) {
  if (!req) return undefined;
  if (req.type === 'select') return countOk(req) ? ui.sel.slice() : undefined;
  if (req.type === 'assign') return assignComplete(req) ? ui.asg.slots.slice() : undefined;
  if (req.type === 'distribute') return distOk(req) ? ui.dist.slice() : undefined;
  if (req.type === 'peek') return null;
  return undefined;
}

export function canConfirm(g, req) {
  if (!req) return false;
  if (req.type === 'select') return countOk(req);
  if (req.type === 'assign') return assignComplete(req);
  if (req.type === 'distribute') return distOk(req);
  return true;
}

// ---- assign
const assignPlaced = () => ui.asg.slots.filter((u) => u != null);
const assignComplete = (req) => !req.exact || assignPlaced().length === Math.min(req.cards.length, req.slots.length);

function assignClick(g, req, tg) {
  const A = ui.asg;
  if (tg.startsWith('u:')) {
    const u = +tg.slice(2);
    if (!req.cards.includes(u)) return undefined;
    const at = A.slots.indexOf(u);
    if (at >= 0) { A.slots[at] = null; A.held = null; } else A.held = A.held === u ? null : u;
  } else if (tg.startsWith('r:')) {
    const si = req.slots.findIndex((s) => s.region === +tg.slice(2));
    if (si < 0) return undefined;
    assignSlot(req, si);
  }
  return undefined;
}

export function assignSlot(req, si) {
  const A = ui.asg;
  if (A.held != null) {
    const prev = A.slots[si];
    const from = A.slots.indexOf(A.held);
    if (from >= 0) A.slots[from] = prev; // swap with the slot the held card came from
    A.slots[si] = A.held;
    A.held = null;
  } else if (A.slots[si] != null) {
    A.held = A.slots[si];
    A.slots[si] = null;
  }
}

export function assignDrop(req, uid, si) {
  ui.asg.held = uid;
  assignSlot(req, si);
}

// ---- distribute
const distSum = () => ui.dist.reduce((a, b) => a + b, 0);
function distOk(req) {
  const s = distSum();
  if (s > req.total) return false;
  if (req.exact && s !== Math.min(req.total, req.slots.reduce((a, x) => a + x.cap, 0))) return false;
  return true;
}
export function distAdjust(req, i, d) {
  const cap = req.slots[i].cap;
  const rest = req.total - distSum();
  if (d === 'max') ui.dist[i] = Math.max(0, Math.min(cap, ui.dist[i] + rest));
  else if (d === 'clear') ui.dist[i] = 0;
  else ui.dist[i] = Math.max(0, Math.min(cap, ui.dist[i] + d, ui.dist[i] + rest));
}

// ----------------------------------------------------------------------------- rendering
function promptText(req) {
  const c = req.ctx || {};
  let key = req.prompt;
  if (req.purpose === 'action' && c.restricted) key = 'p.action.restricted';
  const p = { n: req.min, marker: c.marker, pos: (c.pos || 0) + 1, lore: c.lore, region: c.region != null ? t('region.' + c.region) : '' };
  let s = key && has(key) ? t(key, p) : t('p.pickCard');
  if (req.purpose === 'action') {
    s += ` <em class="stp">${t('step.' + c.step)}${c.region != null ? ' · ' + t('region.' + c.region) : ''}</em>`;
  }
  if (req.purpose === 'relicsMarkers') s = t('p.relicsMarkers', { n: req.max });
  return s;
}

function optLabel(g, req, o) {
  switch (o.kind) {
    case 'yes': return t('yes');
    case 'no': return t('no');
    case 'pass': return req.purpose === 'action' ? t('act.pass') : t('pass');
    case 'none': return o.label && has('o.' + o.label) ? t('o.' + o.label) : (req.min === 0 || req.max > 1 ? t('done') : t('none'));
    case 'num': return String(o.n);
    case 'opt': return has('o.' + o.label) ? t('o.' + o.label) : esc(o.label);
    case 'region': return t('region.' + o.region);
    case 'loc': return `${t('loc.' + o.loc)} <small>${t('loc.short.' + o.loc)}</small>`;
    case 'council': return t('council.' + o.council);
    case 'player': return pchip(g, o.player);
    case 'return': return t('bid.return');
    case 'regionPair': return `${t('region.' + o.a)} ↔ ${t('region.' + o.b)}`;
    default: return esc(o.id);
  }
}

function actLabel(g, o) {
  switch (o.act) {
    case 'sup': return t('act.sup');
    case 'govern': return t('act.govern');
    case 'journey': return t('act.journey');
    case 'council': return t('act.council.' + o.council);
    case 'tactic': return `<b>${esc(TACTIC_DEFS[o.tid].name)}</b>`;
    case 'kf': return t('act.kf', { name: t('kf.' + o.faction) }) + (o.free ? ` <small>(${t('act.free')})</small>` : '');
    case 'kfsim': return t('act.kfsim', { name: t('kf.' + o.faction) });
    case 'card': case 'kc': return has('a.' + o.key) ? t('a.' + o.key) : t('a.' + o.act);
    case 'cmd':
      if (o.cmd === 'ambush') return o.fromDiscard ? t('act.cmd.ambushD') : t('act.cmd.ambush');
      return has('act.cmd.' + o.cmd) ? t('act.cmd.' + o.cmd) : esc(o.cmd);
    default: return esc(o.act);
  }
}

const selCls = (id) => (ui.sel.includes(id) ? ' sel' : '');
const ordAttr = (req, id) => {
  if (!req.ordered) return '';
  const i = ui.sel.indexOf(id);
  return i >= 0 ? ` data-ord="${i + 1}"` : '';
};

function btn(req, o, html, extra = '') {
  return `<div class="opt btn${selCls(o.id)} k-${o.kind}${extra}" role="button" tabindex="0" data-opt="${esc(o.id)}"${ordAttr(req, o.id)}>${html}</div>`;
}

function actionList(g, req) {
  const opts = req.options.filter((o) => o.kind === 'action');
  const focus = ui.focus;
  const list = focus ? opts.filter((o) => (o.uid != null && 'u:' + o.uid === focus) || (o.act === 'tactic' && `t:${req.pid}:${o.tid}` === focus)) : opts;
  const groups = { system: [], cards: [], tactics: [], cmds: [] };
  for (const o of list) {
    if (['sup', 'govern', 'journey', 'council'].includes(o.act)) groups.system.push(o);
    else if (o.act === 'card' || o.act === 'kc') groups.cards.push(o);
    else if (o.act === 'cmd') groups.cmds.push(o);
    else groups.tactics.push(o);
  }
  const row = (o) => {
    let lead = '';
    if (o.uid != null) lead = anyCard(g, o.uid, { size: 'xs' }) + `<span class="an">${esc(g.C(o.uid).def.name)}</span>`;
    else if (o.act === 'tactic') lead = `<img class="tth" src="assets/${TACTIC_DEFS[o.tid].img}" alt="" draggable="false">`;
    else if (o.act === 'kf' || o.act === 'kfsim') lead = tok('favour', 'kfi');
    return btn(req, o, `${lead}<span class="al">${actLabel(g, o)}</span>`, ' act');
  };
  let html = '';
  for (const k of ['system', 'cards', 'tactics', 'cmds']) {
    if (!groups[k].length) continue;
    html += `<div class="agrp"><h5>${t('act.group.' + k)}</h5><div class="alist">${groups[k].map(row).join('')}</div></div>`;
  }
  const pass = req.options.find((o) => o.kind === 'pass');
  const back = focus ? `<button class="mini-btn" data-act="unfocus">← ${t('back')}</button>` : '';
  return back + html + (pass ? `<div class="agrp"><div class="alist">${btn(req, pass, optLabel(g, req, pass), ' end')}</div></div>` : '');
}

function bidResolveList(g, req) {
  const c = req.ctx || {};
  const road = req.options.filter((o) => o.kind === 'road');
  const steal = req.options.filter((o) => o.kind === 'steal');
  const ret = req.options.find((o) => o.kind === 'return');
  const head = `<div class="bidinfo">${c.bid != null ? anyCard(g, c.bid, { size: 'sm', str: true }) : ''}<span>${t('bid.strength', { n: c.strength })}</span></div>`;
  let html = head;
  if (road.length) {
    html += `<div class="agrp"><h5>${t('bid.road')}</h5><div class="clist">${road.map((o) => btn(req, o, anyCard(g, o.kc, { size: 'kc' }), ' copt')).join('')}</div></div>`;
  }
  if (steal.length) {
    html += `<div class="agrp"><h5>${t('bid.stealH')}</h5><div class="clist">${steal.map((o) => btn(req, o, `${anyCard(g, o.kc, { size: 'kc' })}<span class="need">${pchip(g, o.owner)} ${t('bid.need', { n: o.need })}</span>`, ' copt')).join('')}</div></div>`;
  }
  if (ret) html += `<div class="agrp"><div class="alist">${btn(req, ret, optLabel(g, req, ret), ' end')}</div></div>`;
  return html;
}

function selectBody(g, req) {
  if (req.purpose === 'action') return actionList(g, req);
  if (req.purpose === 'bidResolve') return bidResolveList(g, req);
  const cards = req.options.filter((o) => o.kind === 'card');
  const tactics = req.options.filter((o) => o.kind === 'tactic');
  const slots = req.options.filter((o) => o.kind === 'slot');
  const others = req.options.filter((o) => !['card', 'tactic', 'slot'].includes(o.kind));
  let html = '';
  const c = req.ctx || {};
  const refUid = c.card ?? c.source;
  if (refUid != null && g.C(refUid)) html += `<div class="ref">${anyCard(g, refUid, { size: 'xs' })}<span>${cname(g, refUid)}</span></div>`;
  if (cards.length) {
    html += `<div class="clist">${cards.map((o) => btn(req, o, `${anyCard(g, o.uid, { size: g.C(o.uid).kind === 'k' ? 'kc' : 'sm', str: true })}${o.cost != null ? `<b class="cost">${o.cost} ${tok('lore')}</b>` : ''}`, ' copt')).join('')}</div>`;
  }
  if (tactics.length) {
    html += `<div class="clist">${tactics.map((o) => {
      const tc = g.S.tactics[o.pid].find((x) => x.id === o.tid);
      return btn(req, o, `<img class="tth big" src="assets/${TACTIC_DEFS[o.tid].img}" alt="" draggable="false"><span class="an">${esc(TACTIC_DEFS[o.tid].name)}${tc && tc.markers ? ` ·◆${tc.markers}` : ''}</span>`, ' copt');
    }).join('')}</div>`;
  }
  if (slots.length) {
    html += `<div class="clist">${slots.map((o) => btn(req, o, `${o.kc != null ? anyCard(g, o.kc, { size: 'kc' }) : ''}<span class="an">${t('me.slot', { n: o.slot + 1 })}</span>`, ' copt')).join('')}</div>`;
  }
  const nums = others.filter((o) => o.kind === 'num');
  if (nums.length) html += `<div class="nums">${nums.map((o) => btn(req, o, optLabel(g, req, o))).join('')}</div>`;
  const rest = others.filter((o) => o.kind !== 'num');
  if (rest.length) html += `<div class="olist">${rest.map((o) => btn(req, o, optLabel(g, req, o))).join('')}</div>`;
  return html;
}

function assignBody(g, req) {
  const A = ui.asg;
  const placed = new Set(assignPlaced());
  const pool = req.cards.filter((u) => !placed.has(u));
  const slots = req.slots.map((s, i) => {
    const u = A.slots[i];
    return `<div class="aslot${A.held != null ? ' ready' : ''}${u != null ? ' full' : ''}" data-aslot="${i}" data-tg="r:${s.region}">
      <h6>${t('asg.slot', { region: t('region.' + s.region) })}</h6>${u != null ? anyCard(g, u, { size: 'sm', str: true }) : '<span class="drop">+</span>'}</div>`;
  }).join('');
  const hand = pool.map((u) => `<div class="opt copt${A.held === u ? ' sel' : ''}" data-hold="${u}" draggable="true">${anyCard(g, u, { size: 'sm', str: true })}</div>`).join('');
  return `<p class="hint">${t('asg.hint')}</p><div class="aslots">${slots}</div><div class="clist hold">${hand}</div>`;
}

function distBody(g, req) {
  const rest = req.total - distSum();
  const rows = req.slots.map((s, i) => {
    let label;
    if (s.region != null) label = t('region.' + s.region);
    else if (s.loc != null) label = t('loc.' + s.loc);
    else if (s.lost) label = t('dist.lost');
    else label = esc(s.id);
    const n = ui.dist[i];
    return `<div class="drow${s.cap <= 0 ? ' off' : ''}"><span class="dl">${label}</span><span class="dcap">${t('dist.max', { n: s.cap })}</span>
      <button class="step" data-dist="${i}" data-d="-1" ${n <= 0 ? 'disabled' : ''}>−</button><b class="dn">${n}</b>
      <button class="step" data-dist="${i}" data-d="1" ${n >= s.cap || rest <= 0 ? 'disabled' : ''}>＋</button>
      <button class="step mx" data-dist="${i}" data-d="max" ${n >= s.cap || rest <= 0 ? 'disabled' : ''}>max</button></div>`;
  }).join('');
  return `<div class="dsum"><b>${t('dist.remaining', { n: rest })}</b></div>${rows}`;
}

function peekBody(g, req) {
  return `<div class="clist">${req.cards.map((u) => `<div class="opt copt">${anyCard(g, u, { size: g.C(u).kind === 'k' ? 'kc' : 'sm', str: true })}</div>`).join('')}</div>`;
}

export function decisionHtml(g, req) {
  if (!req) return '';
  let body = '';
  if (req.type === 'select') body = selectBody(g, req);
  else if (req.type === 'assign') body = assignBody(g, req);
  else if (req.type === 'distribute') body = distBody(g, req);
  else if (req.type === 'peek') body = peekBody(g, req);

  // footer: confirm / skip
  let foot = '';
  if (req.type === 'select') {
    const multi = req.max > 1;
    const needConfirm = multi || (ui.prefs.confirmPicks && req.options.some((o) => CONFIRMABLE.has(o.kind)));
    const optional = req.min === 0;
    if (multi) {
      const k = ui.sel.length;
      foot += `<span class="cnt">${req.min === req.max ? t('sel.countExact', { k, min: req.min }) : t('sel.count', { k, min: req.min, max: req.max })}${req.ordered ? ' · ' + t('sel.order') : ''}</span>`;
    }
    if (needConfirm || optional) {
      const hasTerminalSkip = req.options.some((o) => o.kind === 'none' || o.kind === 'pass');
      if (!(optional && !multi && !needConfirm && hasTerminalSkip)) {
        const label = !ui.sel.length && optional ? t('done') : t('confirm');
        foot += `<button class="primary" data-act="confirm" ${countOk(req) ? '' : 'disabled'}>${label}</button>`;
      }
      if (ui.sel.length) foot += `<button class="ghost" data-act="clearsel">${t('reset')}</button>`;
    }
  } else if (req.type === 'assign') {
    foot = `<span class="cnt">${t('asg.remaining', { n: req.cards.length - assignPlaced().length })}</span><button class="primary" data-act="confirm" ${assignComplete(req) ? '' : 'disabled'}>${t('confirm')}</button><button class="ghost" data-act="clearsel">${t('reset')}</button>`;
  } else if (req.type === 'distribute') {
    foot = `<button class="primary" data-act="confirm" ${distOk(req) ? '' : 'disabled'}>${t('confirm')}</button><button class="ghost" data-act="clearsel">${t('reset')}</button>`;
  } else if (req.type === 'peek') {
    foot = `<button class="primary" data-act="confirm">${t('ok')}</button>`;
  }
  const hiddenMark = req.ctx && req.ctx.hidden ? '<span class="lock" title="hidden">🔒</span>' : '';
  return `<div class="dec-hd">${hiddenMark}<span class="pt">${promptText(req)}</span></div><div class="dec-body">${body}</div>${foot ? `<div class="dec-ft">${foot}</div>` : ''}`;
}

export function waitingHtml(g, req, name, error) {
  if (error) return `<div class="dec-wait err"><span>${t('top.aiError')}</span></div>`;
  return `<div class="dec-wait"><span class="spin"></span><span>${t('top.thinking', { name: esc(name) })}</span></div>`;
}

export function clearSel(req) {
  ui.sel = [];
  ui.focus = null;
  if (req && req.type === 'assign') ui.asg = { slots: req.slots.map(() => null), held: null };
  if (req && req.type === 'distribute') ui.dist = req.slots.map(() => 0);
}

export { REGIONS, emblem };

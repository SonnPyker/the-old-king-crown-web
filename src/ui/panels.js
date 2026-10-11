// Panel renderers: top bar, Great Road, Councils, Map, player boards and the dock (the board in focus).
// Each returns an HTML string; interactivity is attached by event delegation (see app.js).

import { esc } from './util.js';
import { t, has } from './i18n.js';
import { ui, viewerPid, humanPids } from './state.js';
import { fcard, kcard, anyCard, tacticEl, tok, emblem, pchip, pspan } from './cards.js';
import { REGIONS, LOC_IDS, COUNCILS, FACTION_INFO } from '../data/constants.js';
import { KF_DEFS } from '../data/tactics.js';

const canSee = (pid) => humanPids().includes(pid) && pid === viewerPid();
const handSorted = (g, pid) => g.zone(g.zk.hand(pid)).slice().sort((a, b) => (g.C(a).def.str - g.C(b).def.str) || (g.C(a).def.idx - g.C(b).def.idx));

// ----------------------------------------------------------------------------- top bar
export function topbar(g, req) {
  const S = g.S;
  const phases = ['year', 'spring', 'summer', 'autumn', 'winter'];
  const cur = S.phase === 'setup' ? 'spring' : S.phase;
  const pills = phases.map((p) => `<span class="ph ph-${p}${p === cur ? ' on' : ''}${p === 'year' && S.round === 1 ? ' skip' : ''}">${t('phase.' + p)}</span>`).join('');
  const order = S.order.map((pid, i) => {
    const p = g.P(pid);
    const active = req && req.pid === pid;
    return `<span class="sc f-${p.faction}${active ? ' act' : ''}${S.kf.holder === pid ? ' kf' : ''}" data-tg="p:${pid}" data-bview="${pid}" title="${esc(p.name)}">
      <i class="no">${i + 1}</i>${emblem(p.faction)}<b class="nm">${esc(p.name)}</b>
      <span class="v">${tok('inf1')}<em data-k="inf:${pid}" data-v="${p.inf}">${p.inf}</em></span><span class="v">${tok('lore')}<em data-k="lore:${pid}" data-v="${p.lore}">${p.lore}</em></span>${S.kf.holder === pid ? tok('favour', 'kfi') : ''}</span>`;
  }).join('');
  const sub = S.phase === 'end' ? t('phase.end') : t('top.round', { round: Math.max(1, S.round), max: g.maxRounds() });
  return `<div class="tb-l"><button class="ib" data-act="menu" title="${t('top.menu')}">☰</button><span class="logo">${t('app.title')}</span></div>
    <div class="tb-m"><span class="rnd">${tok('round')}<b>${sub}</b></span><span class="phs">${pills}</span></div>
    <div class="tb-o">${order}</div>
    <div class="tb-r"><button class="ib" data-act="undo" title="${t('top.undo')}" ${ui.session && ui.session.canUndo ? '' : 'disabled'}>↶</button>
    <button class="ib" data-act="save" title="${t('top.save')}">💾</button><button class="ib" data-act="rules" title="${t('top.rules')}">❓</button></div>`;
}

// ----------------------------------------------------------------------------- Great Road
export function roadPanel(g) {
  const S = g.S;
  const v = viewerPid();
  const slots = S.road.map((u, i) => (u == null ? `<div class="rslot empty"><span>${t('road.empty')}</span></div>` : `<div class="rslot">${kcard(g, u, { size: 'road' })}</div>`)).join('');
  const eye = g.hasKC(v, 'eye') && S.kdeck.length
    ? `<div class="eye" title="Old King’s Eye">${S.kdeck.slice(0, 2).map((u) => kcard(g, u, { size: 'xs' })).join('')}</div>` : '';
  const bids = S.order.filter((pid) => g.zone(g.zk.bid(pid)).length).map((pid) => {
    const u = g.zone(g.zk.bid(pid))[0];
    const show = S.bidsOpen || (canSee(pid));
    return `<div class="bid f-${g.P(pid).faction}">${pchip(g, pid)}${fcard(g, u, { size: 'xs', down: !show, owner: g.P(pid).faction, str: show })}</div>`;
  }).join('');
  const dk = S.kdeck.length ? `<div class="kdeck" title="${t('road.deck')}">${kcard(g, S.kdeck[0], { size: 'road', down: true })}<b>${S.kdeck.length}</b></div>` : '<div class="kdeck empty"></div>';
  const disc = S.kdiscard.length ? `<button class="kdisc" data-act="zone" data-zone="kdiscard" title="${t('road.discard')}">${kcard(g, S.kdiscard[S.kdiscard.length - 1], { size: 'xs' })}<b>${S.kdiscard.length}</b></button>` : '';
  return `<h3>${t('road.title')}</h3><div class="road">${dk}<div class="rslots">${slots}</div></div>
    <div class="road-meta">${eye}${disc}</div>${bids ? `<div class="bids">${bids}</div>` : ''}`;
}

// ----------------------------------------------------------------------------- Councils
export function councilsPanel(g) {
  const S = g.S;
  return `<h3>${t('council.title')}</h3><div class="councils">` + COUNCILS.map((cn) => {
    const cards = g.zone(g.zk.council(cn)).slice();
    const byOwner = {};
    for (const u of cards) (byOwner[g.C(u).owner] = byOwner[g.C(u).owner] || []).push(u);
    const votes = S.order.map((pid) => ({ pid, v: g.councilVotes(pid, cn), m: g.councilMarkers(cn, pid) })).filter((x) => x.v > 0 || x.m > 0);
    const grp = Object.keys(byOwner).map((o) => `<div class="cg f-${g.P(+o).faction}">${byOwner[o].map((u) => fcard(g, u, { size: 'xs', str: false })).join('')}</div>`).join('');
    const vt = votes.map((x) => `<span class="vt f-${g.P(x.pid).faction}" title="${esc(g.P(x.pid).name)}">${emblem(g.P(x.pid).faction)}<b>${x.v}</b>${x.m ? `<i class="mkr">◆${x.m}</i>` : ''}</span>`).join('');
    return `<div class="council cn-${cn}" data-tg="c:${cn}"><div class="ch"><span class="cn-ic"></span><b>${t('council.' + cn)}</b><div class="vts">${vt}</div></div>
      <div class="cbody">${grp || `<span class="muted">${t('empty')}</span>`}</div><div class="chint">${t('council.hint.' + cn)}</div></div>`;
  }).join('') + '</div>';
}

// ----------------------------------------------------------------------------- Map
// mode 'up': Supporters and face-up Active cards (left side slot); 'dn': face-down cards (right side slot).
// Returns '' when the player has nothing in that slot.
function groupHtml(g, r, pid, mode) {
  const S = g.S;
  const f = g.P(pid).faction;
  const R = S.region[r];
  const sup = R.sup[pid] || 0;
  const fresh = Math.min(sup, R.fresh[pid] || 0);
  if (mode === 'up') {
    const act = g.zone(g.zk.active(r)).filter((u) => g.C(u).owner === pid);
    if (!sup && !act.length) return '';
    let discs = '';
    for (let i = 0; i < sup; i++) discs += `<i class="disc f-${f}${i < fresh ? ' fresh' : ''}"></i>`;
    const cards = act.map((u) => fcard(g, u, { size: 'mini', str: true })).join('');
    return `<div class="pg f-${f}" data-tg="p:${pid}"><span class="pg-tag">${emblem(f)}<b>${esc(g.P(pid).name)}</b></span>`
      + `${discs ? `<span class="pg-sup" title="${t('sup')}: ${sup} (${t('map.fresh')} ${fresh})">${discs}</span>` : ''}<span class="pg-cards">${cards}</span></div>`;
  }
  const down = g.zone(g.zk.down(r)).filter((u) => g.C(u).owner === pid);
  if (!down.length) return '';
  // Face-down cards stay hidden from everyone but their owner (see canSee).
  const cards = down.map((u) => (canSee(pid)
    ? fcard(g, u, { size: 'mini', str: true, cls: 'dn', badge: '<b class="bd dnb">↓</b>' })
    : fcard(g, u, { size: 'mini', down: true, owner: f }))).join('');
  return `<div class="pg pg-dn f-${f}" data-tg="p:${pid}"><span class="pg-tag">${emblem(f)}<b>${esc(g.P(pid).name)}</b></span><span class="pg-cards">${cards}</span></div>`;
}

// pos: 'la' | 'lb' — the Location on the left or right half of its Region.
function locHtml(g, loc, pos) {
  const S = g.S;
  const heralds = S.order.filter((pid) => S.herald[pid] === loc).map((pid) => `<span class="hrl f-${g.P(pid).faction}" title="${t('map.herald')}: ${esc(g.P(pid).name)}">${tok('marker_' + g.P(pid).faction)}</span>`).join('');
  const kcs = g.zone(g.zk.locKC(loc)).map((u) => kcard(g, u, { size: 'xs' })).join('');
  const marks = S.order.filter((pid) => (S.lmark[loc][pid] || 0) > 0).map((pid) => `<span class="lmk f-${g.P(pid).faction}" title="${t('council.marker')}">◆${S.lmark[loc][pid]}</span>`).join('');
  return `<div class="loc loc-${loc} ${pos}" data-tg="l:${loc}" title="${esc(t('loc.reward.' + loc))}">
    <div class="ln"><b>${t('loc.' + loc)}</b><span class="lrw">${t('loc.short.' + loc)}</span></div>
    <div class="lx">${heralds}${kcs}${marks}</div></div>`;
}

export function regionHtml(g, r) {
  const S = g.S;
  const cl = S.clash && S.clash.region === r ? S.clash : null;
  const idx = S.clashOrder.indexOf(r);
  let marker = '';
  if (S.clashOrder.length) marker = tok(S.resolved[r] ? 'clash_done' : 'clash' + (idx + 1), 'cm');
  const regKC = g.zone(g.zk.regKC(r)).map((u) => kcard(g, u, { size: 'xs' })).join('');
  let totals = '';
  if (cl) {
    const tt = g.clashTotals();
    totals = `<div class="tot"><span class="tl">${t('map.clash', { n: cl.n })}</span>` + cl.participants.map((pid) => `<span class="tv f-${g.P(pid).faction}">${emblem(g.P(pid).faction)}<b>${tt[pid] || 0}</b></span>`).join('') + '</div>';
  }
  // Layout: [left slot: Active + Supporters] [Location half] [Location half] [right slot: face-down].
  const up = S.order.map((pid) => groupHtml(g, r, pid, 'up')).join('');
  const dn = S.order.map((pid) => groupHtml(g, r, pid, 'dn')).join('');
  const [locA, locB] = REGIONS[r].locs;
  return `<section class="region rg-${r}${cl ? ' hot' : ''}${S.resolved[r] ? ' done' : ''}" data-tg="r:${r}">
    <header class="rg-hd">${marker}<b class="rn">${t('region.' + r)}</b>${regKC ? `<span class="rkc">${regKC}</span>` : ''}${totals}</header>
    <div class="rg-slot sl-up${up ? '' : ' empty'}" data-hint="${t('map.active')}">${up}</div>
    ${locHtml(g, locA, 'la')}${locHtml(g, locB, 'lb')}
    <div class="rg-slot sl-dn${dn ? '' : ' empty'}" data-hint="${t('map.down')}">${dn}</div></section>`;
}

export function mapPanel(g) {
  return [0, 1, 2].map((r) => regionHtml(g, r)).join('');
}

// ----------------------------------------------------------------------------- player board
function supplyHtml(g, pid) {
  const list = g.zone(g.zk.supply(pid)).map((u) => anyCard(g, u, { size: 'xs' })).join('');
  return list ? `<div class="supply" title="${t('supply')}">${list}</div>` : '';
}

export function boardHtml(g, pid, o = {}) {
  const S = g.S;
  const p = g.P(pid);
  const f = p.faction;
  const n = g.slotCount(pid);
  let slots = '';
  for (let i = 0; i < Math.min(3, n); i++) {
    const k = g.kcAt(pid, i);
    const occ = g.occAt(pid, i);
    const occHtml = occ != null ? fcard(g, occ, { size: 'occ', str: true }) : '';
    slots += `<div class="slot slot${i}${k == null ? ' emptyslot' : ''}" data-tg="s:${pid}:${i}">${k != null ? kcard(g, k, { size: 'fill' }) : `<span class="ph-text">${t('me.slot', { n: i + 1 })}</span>`}${occHtml ? `<div class="occ" title="${t('me.occ')}">${occHtml}</div>` : ''}</div>`;
  }
  const tacs = S.tactics[pid].map((tc, i) => `<div class="tslot ts${i}">${tacticEl(g, pid, tc)}</div>`).join('');
  const kfHold = S.kf.holder === pid;
  const kf = kfHold ? `<div class="kfmark" title="${t('me.kfHolder')}">${tok('favour')}<span>${'●'.repeat(Math.max(0, S.kf.uses))}</span></div>` : '';
  const sups = `<div class="supbox">${Array.from({ length: p.boardSup }, () => `<i class="disc f-${f}"></i>`).join('')}</div>`;
  const hl = S.herald[pid];
  const herald = hl ? `<div class="hbox" title="${t('map.herald')}">${t('me.heraldPlaced', { loc: t('loc.' + hl) })}</div>` : '';
  const door = g.hasHQ(pid, 'door') ? `<div class="doorm">◆${S.door[pid] || 0}</div>` : '';
  return `<div class="pboard f-${f}${o.cls ? ' ' + o.cls : ''}">${slots}${tacs}${kf}${sups}${herald}${door}</div>`;
}

function chip(icon, val, extra = '', attrs = '') {
  return `<span class="chip ${extra}" ${attrs}>${icon}<b>${val}</b></span>`;
}

export function statsHtml(g, pid) {
  const p = g.P(pid);
  const S = g.S;
  const deck = g.zone(g.zk.deck(pid)).length;
  const disc = g.zone(g.zk.discard(pid)).length;
  const lost = g.zone(g.zk.lost(pid)).length;
  const hand = g.zone(g.zk.hand(pid)).length + g.zone(g.zk.bid(pid)).length;
  const sop = g.zone(g.zk.sop(pid)).length;
  const btn = (zone, label, n) => `<button class="chip btn" data-act="zone" data-zone="${zone}" data-pid="${pid}" title="${label}"><span class="ci">${label}</span><b>${n}</b></button>`;
  return `<div class="stats">
    ${chip(tok('inf1'), p.inf, 'inf', `title="${t('inf')}" data-k="inf:${pid}" data-v="${p.inf}"`)}${chip(tok('lore'), p.lore, 'lore', `title="${t('lore')}" data-k="lore:${pid}" data-v="${p.lore}"`)}
    ${chip('<span class="ci">✋</span>', `${hand}/${p.handSize}`, 'hand', `title="${t('handSize')}"`)}
    <span class="chip deckc" title="${t('deck')}"><span class="ci">${t('deck')}</span><b>${deck}</b></span>
    ${btn('discard', t('discard'), disc)}${btn('lost', t('lost'), lost)}${btn('sop', t('sop'), sop)}
    <span class="chip" title="${t('sup')}">${emblem(p.faction)}<b>${p.boardSup}</b><span class="ci">+${p.lostSup} ${t('lost').toLowerCase()}</span></span>
    <span class="chip"><span class="ci">#</span><b>${S.order.indexOf(pid) + 1}</b></span>
  </div>`;
}

// ----------------------------------------------------------------------------- dock: the board in focus
// Shows player `pid`'s board. Only the viewer sees their own hand face-up; everyone else's is face-down.
export function mePanel(g, pid) {
  const p = g.P(pid);
  const who = p.type === 'ai' ? 'AI · ' + t('level.' + (p.level || 'normal')) : t('type.human');
  const back = humanPids().length && pid !== viewerPid() ? `<button class="chip btn" data-act="viewMine">${t('me.backToMine')}</button>` : '';
  // The back chip sits right after the name so it does not take a line of its own.
  // The board gets its own box, so CSS can fit it to the height left under the header and supply (.me-board in style.css).
  return `<div class="me-hd"><span class="pname f-${p.faction}">${emblem(p.faction)}<b>${esc(p.name)}</b><em>${t('faction.' + p.faction)}</em><small class="ptype">${who}</small></span>${back}${statsHtml(g, pid)}</div>
    <div class="me-board">${boardHtml(g, pid, { cls: 'own' })}</div>${supplyHtml(g, pid)}`;
}

export function handPanel(g, pid) {
  const p = g.P(pid);
  const open = canSee(pid);
  const zone = g.zone(g.zk.hand(pid));
  // Hidden hands keep engine order: sorting by Strength would reveal what the cards are.
  const cards = open
    ? handSorted(g, pid).map((u) => fcard(g, u, { size: 'hand', str: false })).join('')
    : zone.map((u) => fcard(g, u, { size: 'hand', down: true, owner: p.faction })).join('');
  const bid = g.zone(g.zk.bid(pid));
  const bidH = open
    ? bid.map((u) => fcard(g, u, { size: 'hand', str: false, cls: 'bidc' })).join('')
    : bid.map((u) => fcard(g, u, { size: 'hand', down: true, owner: p.faction, cls: 'bidc' })).join('');
  const label = open ? t('hand') : `${esc(p.name)} · ${t('hand')}`;
  // --hn / --hsep let the CSS fit the cards to the row (see the desktop hand rule in style.css).
  const fit = `--hn:${zone.length + bid.length};--hsep:${bid.length ? 46 : 0}px`;
  return `<div class="hand-hd"><b>${label}</b> <span>${zone.length}/${p.handSize}</span></div><div class="hand" style="${fit}">${cards || `<span class="muted">${t('zone.empty')}</span>`}${bidH ? `<div class="bidsep"></div>${bidH}` : ''}</div>`;
}

export { handSorted, canSee, has, pspan, FACTION_INFO, KF_DEFS, LOC_IDS };

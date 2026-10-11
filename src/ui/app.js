// UI controller: screens, rendering, input handling, AI pacing, saving, hot-seat, modals and zoom.

import { $, $$, esc, sleep, store, IMG } from './util.js';
import { t, setLang, lang } from './i18n.js';
import { ui, savePrefs, sessionG, humanPids, isHotseat, viewerPid } from './state.js';
import * as P from './panels.js';
import { renderLog } from './log.js';
import * as D from './decision.js';
import * as M from './menu.js';
import { Session } from '../engine/index.js';
import { cardFacts, tacticFacts, anyCard, emblem, tok, pspan } from './cards.js';
import { TACTIC_DEFS } from '../data/tactics.js';

const SPEED = { instant: 0, fast: 140, normal: 480, slow: 1100 };
const ZONES = { discard: 'discard', lost: 'lost', sop: 'sop' };
let setup = null;
let gameToken = 0;
const lastHtml = new Map();
let logCount = -1;
let zoomTimer = null;
let pressTimer = null;
let suppressClick = false;
let toastTimer = null;
let drag = null;
let lastReqKey = null;

// ----------------------------------------------------------------------------- helpers
function setHtml(id, html) {
  if (lastHtml.get(id) === html) return false;
  lastHtml.set(id, html);
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
  return true;
}

export function toast(msg, ms = 2600) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const savedInfo = () => {
  const s = store.get('save', null);
  if (!s || !s.settings) return null;
  return { round: s.round || 1 };
};

function persist() {
  const s = ui.session;
  if (!s) return;
  if (s.done) { store.del('save'); return; }
  const data = s.serialize();
  data.round = Math.max(1, s.game.S.round);
  store.set('save', data);
}

// ----------------------------------------------------------------------------- shell
function shell() {
  $('#app').innerHTML = `
    <div id="screen-menu"></div>
    <div id="screen-game" hidden data-tab="board">
      <header id="topbar"></header>
      <main id="main">
        <aside id="left"><section id="road"></section><section id="councils"></section>
          <section id="logp"><h3>${t('log.title')}</h3><ol id="log"></ol></section></aside>
        <section id="center"><div id="map"></div></section>
        <section id="opps"></section>
      </main>
      <section id="decision"></section>
      <footer id="dock"><div id="me"></div><div id="handp"></div></footer>
      <nav id="tabs"></nav>
    </div>
    <div id="modal" hidden></div><div id="zoom" hidden></div><div id="curtain" hidden></div><div id="toast"></div>`;
  lastHtml.clear();
  logCount = -1;
}

function showScreen(name) {
  ui.screen = name;
  $('#screen-menu').hidden = name !== 'menu';
  $('#screen-game').hidden = name !== 'game';
  document.body.dataset.screen = name;
}

// ----------------------------------------------------------------------------- menu
export function showMenu() {
  gameToken++;
  closeModal();
  hideZoom();
  $('#curtain').hidden = true;
  setup = setup || M.loadSetup();
  renderMenu();
  showScreen('menu');
}

function renderMenu() {
  $('#screen-menu').innerHTML = M.menuHtml(setup, savedInfo());
}

function menuClick(e) {
  const seg = e.target.closest('.seg button');
  if (seg) {
    const name = seg.parentElement.dataset.seg;
    const v = seg.dataset.v;
    if (name === 'n') { setup.n = +v; M.fixFactions(setup); }
    else if (name === 'length') setup.length = v;
    else if (name === 'order') setup.order = v;
    else if (name === 'speed') { ui.prefs.speed = v; savePrefs(); }
    else if (name === 'lang') { ui.prefs.lang = v; setLang(v); savePrefs(); shell(); showMenu(); return true; }
    else if (/^type\d$/.test(name)) setup.seats[+name.slice(4)].type = v;
    else if (/^level\d$/.test(name)) setup.seats[+name.slice(5)].level = v;
    M.saveSetup(setup);
    renderMenu();
    return true;
  }
  const fb = e.target.closest('.fbtn');
  if (fb) {
    const i = +fb.dataset.seat;
    const f = fb.dataset.fac;
    const other = setup.seats.slice(0, setup.n).findIndex((s, j) => j !== i && s.faction === f);
    if (other >= 0) setup.seats[other].faction = setup.seats[i].faction; // swap
    setup.seats[i].faction = f;
    M.saveSetup(setup);
    renderMenu();
    return true;
  }
  return false;
}

// ----------------------------------------------------------------------------- game lifecycle
function newSession(opts) {
  gameToken++;
  try {
    ui.session = new Session(opts);
  } catch (err) {
    console.error(err);
    toast('Error: ' + (err && err.message));
    return false;
  }
  const hs = humanPids();
  ui.viewer = hs.length ? hs[0] : 0;
  ui.locked = false;
  ui.reqKey = null;
  ui.gameOverShown = false;
  ui.tab = 'board';
  lastHtml.clear();
  logCount = -1;
  shell();
  showScreen('game');
  $('#screen-game').dataset.tab = 'board';
  persist();
  render();
  pump();
  return true;
}

function startGame() {
  M.fixFactions(setup);
  M.saveSetup(setup);
  const n = parseInt(setup.seed, 10);
  const seed = Number.isFinite(n) && setup.seed !== '' ? n >>> 0 : (Math.random() * 4294967296) >>> 0;
  ui.lastStart = { settings: M.settingsFrom(setup), seed };
  newSession({ settings: ui.lastStart.settings, seed });
}

function continueGame() {
  const s = store.get('save', null);
  if (!s) return;
  ui.lastStart = { settings: s.settings, seed: s.seed };
  newSession({ settings: s.settings, seed: s.seed, responses: s.responses });
}

// ----------------------------------------------------------------------------- AI pacing
async function pump() {
  if (ui.pumping) return;
  const s = ui.session;
  if (!s) return;
  ui.pumping = true;
  const token = gameToken;
  let steps = 0;
  try {
    while (ui.session === s && token === gameToken && !s.done && s.req && s.isAI()) {
      const before = s.log.length;
      try { s.stepAI(); } catch (e) { console.error(e); toast('Engine error: ' + e.message, 6000); break; }
      steps++;
      const speed = SPEED[ui.prefs.speed] ?? SPEED.normal;
      const grew = s.log.length > before;
      if (speed === 0) {
        if (steps % 12 === 0) { render(); await sleep(0); }
      } else {
        render();
        await sleep(grew ? speed : (steps % 6 === 0 ? 16 : 0));
      }
    }
  } finally {
    ui.pumping = false;
  }
  if (ui.session !== s || token !== gameToken) return;
  persist();
  render();
  checkCurtain();
  if (s.done) onGameOver();
}

function checkCurtain() {
  const s = ui.session;
  const cur = $('#curtain');
  if (!s || !s.req || s.isAI() || !isHotseat()) { cur.hidden = true; ui.locked = false; return; }
  const pid = s.req.pid;
  if (pid === ui.viewer) { cur.hidden = true; ui.locked = false; return; }
  ui.locked = true;
  const g = s.game;
  cur.hidden = false;
  cur.innerHTML = `<div class="curtain-box f-${g.P(pid).faction}">${emblem(g.P(pid).faction, 'big')}<h2>${t('hot.pass', { name: esc(g.P(pid).name) })}</h2><p>${t('hot.hint')}</p><button class="primary big" data-act="ready" data-pid="${pid}">${t('hot.ready')}</button></div>`;
}

function submit(ans) {
  const s = ui.session;
  if (!s || !s.req) return;
  if (ans === undefined) { render(); return; }
  const err = s.respond(ans);
  if (err) { toast('✗ ' + err); render(); return; }
  ui.sel = [];
  persist();
  render();
  if (s.done) { onGameOver(); return; }
  checkCurtain();
  pump();
}

function doUndo() {
  const s = ui.session;
  if (!s || !s.canUndo) return;
  gameToken++;
  ui.pumping = false;
  closeModal();
  s.undo();
  ui.reqKey = null;
  ui.gameOverShown = false;
  lastHtml.clear();
  logCount = -1;
  persist();
  render();
  checkCurtain();
  pump();
}

// ----------------------------------------------------------------------------- rendering
function humanReq() {
  const s = ui.session;
  return s && s.req && !s.isAI() ? s.req : null;
}

export function render() {
  const s = ui.session;
  if (!s || ui.screen !== 'game') return;
  const g = s.game;
  const req = humanReq();
  D.syncReq(req);
  setHtml('topbar', P.topbar(g, s.req));
  setHtml('road', P.roadPanel(g));
  setHtml('councils', P.councilsPanel(g));
  setHtml('map', P.mapPanel(g));
  setHtml('me', P.mePanel(g));
  setHtml('handp', P.handPanel(g, req));
  setHtml('opps', P.oppsPanel(g, s.req));
  setHtml('tabs', ['board', 'me', 'opps', 'log'].map((k) => `<button data-act="tab" data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${t('tab.' + k)}</button>`).join(''));

  // decision panel
  let dec;
  if (s.done) dec = `<div class="dec-wait"><b>${t('phase.end')}</b><button class="primary" data-act="showEnd">${t('end.title')}</button></div>`;
  else if (req) dec = D.decisionHtml(g, req);
  else if (s.req) dec = D.waitingHtml(g, s.req, g.P(s.req.pid).name);
  else dec = '';
  const decEl = $('#decision');
  const body0 = decEl.querySelector('.dec-body');
  const sc = body0 ? body0.scrollTop : 0;
  const changed = setHtml('decision', dec);
  if (changed && ui.reqKey === lastReqKey) { const b = decEl.querySelector('.dec-body'); if (b) b.scrollTop = sc; }
  lastReqKey = ui.reqKey;
  decEl.className = req ? 'active f-' + g.P(req.pid).faction : (s.req ? 'ai' : '');
  if (ui.decCollapsed) decEl.classList.add('collapsed');

  // log
  if (g.logEntries.length !== logCount) {
    logCount = g.logEntries.length;
    const ol = $('#log');
    const stick = ol.scrollTop + ol.clientHeight >= ol.scrollHeight - 40;
    ol.innerHTML = renderLog(g);
    if (stick) ol.scrollTop = ol.scrollHeight;
  }
  applyHighlights(g, req);
}

function applyHighlights(g, req) {
  const targets = D.targetMap(g, req);
  ui.targets = targets;
  const selT = D.selectedTargets(req);
  const placed = req && req.type === 'assign' && ui.asg ? new Set(ui.asg.slots.filter((u) => u != null)) : null;
  const root = $('#screen-game');
  const dragOn = !!placed;
  for (const el of root.querySelectorAll('[data-tg]')) {
    if (el.closest('#decision')) continue;
    const tg = el.dataset.tg;
    const pick = targets.has(tg);
    el.classList.toggle('pick', pick);
    let sel = selT.has(tg);
    if (req && req.type === 'assign' && tg.startsWith('u:')) {
      const u = +tg.slice(2);
      sel = ui.asg.held === u;
      el.classList.toggle('placed', placed.has(u));
    } else if (el.classList.contains('placed')) el.classList.remove('placed');
    el.classList.toggle('sel', sel);
    if (req && req.ordered && sel && tg.startsWith('u:')) {
      const opt = req.options.find((o) => o.kind === 'card' && 'u:' + o.uid === tg);
      const i = opt ? ui.sel.indexOf(opt.id) : -1;
      if (i >= 0) el.dataset.ord = String(i + 1);
    } else if (el.dataset.ord) delete el.dataset.ord;
    if (dragOn && pick && tg.startsWith('u:')) el.setAttribute('draggable', 'true');
    else if (el.getAttribute('draggable') === 'true') el.removeAttribute('draggable');
  }
  root.classList.toggle('choosing', !!req);
}

// ----------------------------------------------------------------------------- modals
function openModal(html, cls = '') {
  const m = $('#modal');
  m.className = cls;
  m.innerHTML = `<div class="modal-back" data-act="closeModal"></div><div class="modal-box">${html}<button class="x" data-act="closeModal" aria-label="${t('close')}">✕</button></div>`;
  m.hidden = false;
  ui.modal = cls || true;
}
function closeModal() {
  const m = $('#modal');
  if (m) { m.hidden = true; m.innerHTML = ''; }
  ui.modal = null;
}

function gameMenuModal() {
  const seg = (name, val, items) => `<div class="seg" data-seg="${name}">${items.map(([v, l]) => `<button class="${String(val) === String(v) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  openModal(`<h2>${t('top.menu')}</h2>
    <div class="gm">
      <button class="big" data-act="closeModal">▶ ${t('back')}</button>
      <button class="big" data-act="save">💾 ${t('top.save')}</button>
      <button class="big" data-act="rules">❓ ${t('menu.rules')}</button>
      <button class="big" data-act="restart">↻ ${t('top.restart')}</button>
      <button class="big" data-act="tomenu">⌂ ${t('end.menu')}</button>
    </div>
    <div class="row"><label>${t('menu.speed')}</label>${seg('gspeed', ui.prefs.speed, ['instant', 'fast', 'normal', 'slow'].map((l) => [l, t('menu.speed.' + l)]))}</div>
    <div class="row"><label>${t('menu.lang')}</label>${seg('glang', lang, [['vi', 'Tiếng Việt'], ['en', 'English']])}</div>
    <div class="row chk"><label><input type="checkbox" data-gchk="confirmPicks" ${ui.prefs.confirmPicks ? 'checked' : ''}> ${t('menu.confirmPicks')}</label></div>`, 'm-menu');
}

function rulesModal() {
  openModal(`<h2>${t('menu.rules')}</h2><div class="refs">
    <img src="${IMG('ref/ref_sequence.webp')}" alt="Sequence of play"><img src="${IMG('ref/ref_actions.webp')}" alt="Actions reference"></div>`, 'm-rules');
}

function zoneModal(zone, pid) {
  const s = ui.session;
  const g = s.game;
  let uids;
  let title;
  if (zone === 'kdiscard') { uids = g.S.kdiscard.slice().reverse(); title = t('road.discard'); }
  else { uids = g.zone(`p${pid}:${ZONES[zone]}`).slice(); title = `${g.P(pid).name} · ${t(zone)}`; }
  const grid = uids.length ? uids.map((u) => anyCard(g, u, { size: g.C(u).kind === 'k' ? 'kc' : 'md', str: true })).join('') : `<p class="muted">${t('zone.empty')}</p>`;
  openModal(`<h2>${esc(title)} <small>(${uids.length})</small></h2><div class="zgrid">${grid}</div>`, 'm-zone');
}

function endModal() {
  const s = ui.session;
  const g = s.game;
  const res = g.S.result;
  if (!res) return;
  ui.gameOverShown = true;
  const rows = res.ranking.map((pid, i) => {
    const sc = res.scores.find((x) => x.pid === pid);
    return `<tr class="${i === 0 ? 'win' : ''} f-${g.P(pid).faction}"><td>${i + 1}</td><td class="nm">${emblem(g.P(pid).faction)}<b>${esc(g.P(pid).name)}</b></td><td>${sc.inf}</td><td>${sc.lore}${sc.bonus ? ` <small>(+${sc.bonus})</small>` : ''}</td><td class="tot">${sc.total}</td></tr>`;
  }).join('');
  openModal(`<h2>${t('end.title')}</h2><p class="winner">🏆 ${t('end.winner', { name: esc(g.P(res.winner).name) })}</p>
    <table class="score"><thead><tr><th></th><th>${t('end.score')}</th><th>${t('end.inf')}</th><th>${t('end.lore')}</th><th>${t('end.total')}</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="fine">${t('end.bonusNote')}</p>
    <div class="menu-actions"><button class="big go" data-act="again">${t('end.again')}</button><button class="big ghost" data-act="tomenu">${t('end.menu')}</button><button class="big ghost" data-act="closeModal">${t('end.view')}</button></div>`, 'm-end');
}

function onGameOver() {
  store.del('save');
  if (!ui.gameOverShown) endModal();
}

// ----------------------------------------------------------------------------- zoom
function zoomContent(g, el) {
  if (el.classList.contains('tac')) {
    const tid = el.dataset.tid;
    const pid = +el.dataset.tpid;
    const d = TACTIC_DEFS[tid];
    const rows = tacticFacts(g, pid, tid).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    return `<img src="${IMG(d.img)}" alt=""><div class="zt"><h4>${esc(d.name)}</h4><table>${rows}</table></div>`;
  }
  const uid = +el.dataset.uid;
  const c = g.C(uid);
  if (!c) return null;
  const rows = D_cardRows(g, uid);
  return `<img src="${IMG(c.def.img)}" alt=""><div class="zt"><h4>${esc(c.def.name)}</h4><table>${rows}</table></div>`;
}
const D_cardRows = (g, uid) => cardFacts(g, uid).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');

function showZoom(el, pinned, ev) {
  const s = ui.session;
  if (!s || !el) return;
  const g = s.game;
  let html;
  if (typeof el === 'number') {
    const c = g.C(el);
    if (!c) return;
    html = `<img src="${IMG(c.def.img)}" alt=""><div class="zt"><h4>${esc(c.def.name)}</h4><table>${D_cardRows(g, el)}</table></div>`;
  } else {
    if (el.classList.contains('back')) return;
    html = zoomContent(g, el);
  }
  if (!html) return;
  const z = $('#zoom');
  const landscape = (typeof el === 'number' ? g.C(el).kind === 'k' : el.classList.contains('kc'));
  z.className = (pinned ? 'pinned ' : '') + (landscape ? 'land' : 'port');
  z.innerHTML = html;
  z.hidden = false;
  z.style.left = z.style.right = '';
  if (!pinned && ev) {
    const right = ev.clientX < window.innerWidth / 2;
    z.style[right ? 'right' : 'left'] = '16px';
  }
}
function hideZoom() {
  clearTimeout(zoomTimer);
  const z = $('#zoom');
  if (z) { z.hidden = true; z.innerHTML = ''; }
}
const zoomable = (e) => e.target.closest('.card:not(.back), .kc:not(.back), .tac');

// ----------------------------------------------------------------------------- events
function doAct(name, el) {
  const s = ui.session;
  switch (name) {
    case 'start': startGame(); break;
    case 'continue': continueGame(); break;
    case 'rules': rulesModal(); break;
    case 'menu': gameMenuModal(); break;
    case 'closeModal': closeModal(); break;
    case 'save': persist(); toast(t('top.saved')); break;
    case 'undo': doUndo(); break;
    case 'restart': closeModal(); if (ui.lastStart) newSession({ settings: ui.lastStart.settings, seed: ui.lastStart.seed }); break;
    case 'again': closeModal(); if (ui.lastStart) newSession({ settings: ui.lastStart.settings, seed: (Math.random() * 4294967296) >>> 0 }); break;
    case 'tomenu': closeModal(); ui.session = null; shell(); showMenu(); break;
    case 'showEnd': endModal(); break;
    case 'tab': ui.tab = el.dataset.tab; $('#screen-game').dataset.tab = ui.tab; render(); break;
    case 'togdec': ui.decCollapsed = !ui.decCollapsed; $('#decision').classList.toggle('collapsed', ui.decCollapsed); break;
    case 'ready': ui.viewer = +el.dataset.pid; ui.locked = false; $('#curtain').hidden = true; lastHtml.clear(); render(); break;
    case 'zone': zoneModal(el.dataset.zone, +el.dataset.pid); break;
    case 'confirm': { const req = humanReq(); if (req) submit(D.confirmAnswer(s.game, req)); break; }
    case 'clearsel': { const req = humanReq(); D.clearSel(req); render(); break; }
    case 'unfocus': ui.focus = null; render(); break;
    default: break;
  }
}

function onClick(e) {
  if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
  const el = e.target;
  if (ui.screen === 'menu') {
    if (menuClick(e)) return;
    const a = el.closest('[data-act]');
    if (a) doAct(a.dataset.act, a);
    return;
  }
  // modal controls (segmented controls in the in-game menu)
  const seg = el.closest('#modal .seg button');
  if (seg) {
    const name = seg.parentElement.dataset.seg;
    if (name === 'gspeed') { ui.prefs.speed = seg.dataset.v; savePrefs(); }
    if (name === 'glang') { ui.prefs.lang = seg.dataset.v; setLang(seg.dataset.v); savePrefs(); lastHtml.clear(); const l = $('#logp h3'); if (l) l.textContent = t('log.title'); logCount = -1; render(); }
    gameMenuModal();
    return;
  }
  const act = el.closest('[data-act]');
  if (act) { doAct(act.dataset.act, act); return; }
  const zl = el.closest('[data-zoom]');
  if (zl) { showZoom(+zl.dataset.zoom, true); return; }
  if (!$('#zoom').hidden && $('#zoom').classList.contains('pinned')) { hideZoom(); return; }

  const s = ui.session;
  const g = s && s.game;
  const req = humanReq();
  if (!req) {
    const z = zoomable(e);
    if (z && ui.screen === 'game') showZoom(z, true);
    return;
  }
  const opt = el.closest('#decision [data-opt]');
  if (opt) { submit(D.pickOption(g, req, opt.dataset.opt)); return; }
  const dist = el.closest('#decision [data-dist]');
  if (dist && req.type === 'distribute') { const d = dist.dataset.d; D.distAdjust(req, +dist.dataset.dist, d === 'max' ? 'max' : +d); render(); return; }
  const hold = el.closest('#decision [data-hold]');
  if (hold && req.type === 'assign') { ui.asg.held = ui.asg.held === +hold.dataset.hold ? null : +hold.dataset.hold; render(); return; }
  const aslot = el.closest('#decision [data-aslot]');
  if (aslot && req.type === 'assign') { D.assignSlot(req, +aslot.dataset.aslot); render(); return; }
  if (el.closest('#decision')) { if (el.closest('.dec-hd')) doAct('togdec'); return; }

  // board targets: climb from the closest data-tg to find a pickable one
  let n = el.closest('[data-tg]');
  while (n) {
    const tg = n.dataset.tg;
    if (ui.targets && ui.targets.has(tg)) { submit(D.targetClick(g, req, tg)); return; }
    n = n.parentElement ? n.parentElement.closest('[data-tg]') : null;
  }
  const z = zoomable(e);
  if (z) showZoom(z, true);
}

function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('contextmenu', (e) => {
    const z = ui.screen === 'game' ? zoomable(e) : null;
    if (z) { e.preventDefault(); showZoom(z, true); }
  });
  const canHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
  if (canHover) {
    document.addEventListener('mouseover', (e) => {
      if (ui.screen !== 'game') return;
      const z = zoomable(e);
      clearTimeout(zoomTimer);
      if (z && (!$('#zoom').classList.contains('pinned') || $('#zoom').hidden)) zoomTimer = setTimeout(() => showZoom(z, false, e), 260);
    });
    document.addEventListener('mouseout', (e) => {
      const z = $('#zoom');
      if (z && !z.classList.contains('pinned')) { clearTimeout(zoomTimer); if (!zoomable({ target: e.relatedTarget || document.body })) hideZoom(); }
    });
  }
  // long-press = zoom on touch screens
  document.addEventListener('touchstart', (e) => {
    if (ui.screen !== 'game') return;
    const z = zoomable(e);
    clearTimeout(pressTimer);
    if (!z) return;
    pressTimer = setTimeout(() => { suppressClick = true; showZoom(z, true); }, 480);
  }, { passive: true });
  for (const ev of ['touchend', 'touchmove', 'touchcancel']) document.addEventListener(ev, () => clearTimeout(pressTimer), { passive: true });

  document.addEventListener('input', (e) => {
    const nm = e.target.closest('[data-name]');
    if (nm && setup) { setup.seats[+nm.dataset.name].name = nm.value; M.saveSetup(setup); }
    const sd = e.target.closest('[data-seed]');
    if (sd && setup) setup.seed = sd.value.replace(/[^0-9]/g, '');
  });
  document.addEventListener('change', (e) => {
    const c = e.target.closest('[data-chk]');
    if (c && setup) {
      if (c.dataset.chk === 'advanced') setup.advanced = c.checked;
      else if (c.dataset.chk === 'confirmPicks') { ui.prefs.confirmPicks = c.checked; savePrefs(); }
      M.saveSetup(setup);
    }
    const gc = e.target.closest('[data-gchk]');
    if (gc) { ui.prefs.confirmPicks = gc.checked; savePrefs(); render(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('#zoom').hidden) hideZoom(); else if (ui.modal) closeModal(); }
    else if ((e.key === 'Enter') && ui.screen === 'game' && !ui.modal && !e.target.closest('input,button,[role=button]')) {
      const req = humanReq();
      if (req && D.canConfirm(ui.session.game, req) && (req.type !== 'select' || req.max > 1 || ui.sel.length)) submit(D.confirmAnswer(ui.session.game, req));
    }
  });
  // drag & drop for face-down placement
  document.addEventListener('dragstart', (e) => {
    const req = humanReq();
    if (!req || req.type !== 'assign') return;
    const h = e.target.closest('[data-hold], .card[data-uid]');
    if (!h) return;
    const uid = h.dataset.hold != null ? +h.dataset.hold : +h.dataset.uid;
    if (!req.cards.includes(uid)) return;
    drag = uid;
    ui.asg.held = uid;
    try { e.dataTransfer.setData('text/plain', String(uid)); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* ignore */ }
  });
  document.addEventListener('dragover', (e) => {
    if (drag != null && e.target.closest('[data-aslot], [data-tg^="r:"]')) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    const req = humanReq();
    if (drag == null || !req || req.type !== 'assign') return;
    const slot = e.target.closest('[data-aslot]');
    const reg = e.target.closest('[data-tg^="r:"]');
    let si = -1;
    if (slot) si = +slot.dataset.aslot;
    else if (reg) si = req.slots.findIndex((s) => s.region === +reg.dataset.tg.slice(2));
    if (si >= 0) { e.preventDefault(); D.assignDrop(req, drag, si); render(); }
    drag = null;
  });
  document.addEventListener('dragend', () => { drag = null; });
}

// ----------------------------------------------------------------------------- boot
export function boot() {
  setLang(ui.prefs.lang);
  document.documentElement.lang = ui.prefs.lang;
  shell();
  bindEvents();
  showMenu();
  window.__tokc = { ui, render, get session() { return ui.session; } };
}

export { sessionG, pspan, tok };

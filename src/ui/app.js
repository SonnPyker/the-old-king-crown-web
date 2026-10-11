// UI controller: screens, rendering, input handling, AI pacing, saving, hot-seat, modals and zoom.

import { $, $$, esc, sleep, store, IMG } from './util.js';
import { t, setLang, lang } from './i18n.js';
import { ui, savePrefs, sessionG, humanPids, isHotseat, viewerPid } from './state.js';
import * as P from './panels.js';
import { renderLog } from './log.js';
import * as D from './decision.js';
import * as M from './menu.js';
import { Session } from '../engine/index.js';
import { cardFacts, tacticFacts, cardDesc, cardFlavour, tacticDesc, descBlock, zoomFace, anyCard, emblem, tok, pspan } from './cards.js';
import { TACTIC_DEFS } from '../data/tactics.js';
import { GLOSSARY, GLOSSARY_GROUPS, GLOSSARY_BY_FORM } from '../data/glossary.js';

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
let popKey = null;
let lastPhase = null;
const faceOf = new Map(); // card uid -> 'b' | 'f' as last rendered (drives the reveal flip)
const seenIn = new Map(); // container id -> Set of card uids last rendered there (drives the deal-in)
const lastK = new Map(); // stat key -> last value (drives the bump and the +N float)

// ----------------------------------------------------------------------------- helpers
function setHtml(id, html) {
  if (lastHtml.get(id) === html) return false;
  lastHtml.set(id, html);
  const el = document.getElementById(id);
  if (el) el.innerHTML = markCards(id, html);
  return true;
}

// Tags cards that just appeared in a container (deal-in) or were turned face-up (reveal).
// Only the class attribute changes, so the markup and the engine state are untouched.
function markCards(id, html) {
  const prev = seenIn.get(id);
  const cur = new Set();
  const out = html.replace(/<div class="((?:card|kc)[^"]*)" data-uid="(\d+)"/g, (m, cls, u) => {
    const uid = +u;
    cur.add(uid);
    const face = cls.split(' ').includes('back') ? 'b' : 'f';
    const before = faceOf.get(uid);
    faceOf.set(uid, face);
    if (before === 'b' && face === 'f') return `<div class="${cls} reveal" data-uid="${u}"`;
    if (prev && !prev.has(uid)) return `<div class="${cls} enter" data-uid="${u}"`;
    return m;
  });
  seenIn.set(id, cur);
  return out;
}

// Which player's board the dock shows: follow the player to act when the turn changes, else the chosen board.
function focusPid(s) {
  const turn = s.req ? s.req.pid : null;
  if (turn != null && turn !== ui.activePid) {
    ui.activePid = turn;
    ui.boardPid = turn;
    ui.turnFlip = true;
  }
  const n = s.game.S.players.length;
  return ui.boardPid != null && ui.boardPid < n ? ui.boardPid : viewerPid();
}

function setDrawer(open) {
  ui.prefs.drawer = open;
  savePrefs();
  const sg = $('#screen-game');
  if (sg) sg.dataset.drawer = open ? 'open' : 'closed';
}

// Floating "+N" over a stat that just went up.
function flyText(el, text) {
  const r = el.getBoundingClientRect();
  const f = document.createElement('span');
  f.className = 'fly';
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`;
  f.style.top = `${r.top}px`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 1300);
}

function bumpStats() {
  for (const el of document.querySelectorAll('[data-k]')) {
    const k = el.dataset.k;
    const v = +el.dataset.v;
    const was = lastK.get(k);
    lastK.set(k, v);
    if (was === undefined || was === v) continue;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    if (v > was) flyText(el, `+${v - was}`);
  }
}

// Season/Year banner when the phase or the year changes.
function phaseBanner(s) {
  const S = s.game.S;
  if (S.phase === 'end') return;
  const cur = S.phase === 'setup' ? 'spring' : S.phase;
  const key = `${S.round}:${cur}`;
  if (lastPhase === null) { lastPhase = key; return; }
  if (key === lastPhase) return;
  lastPhase = key;
  const b = $('#banner');
  if (!b) return;
  b.textContent = `${t('phase.' + cur)} · ${t('top.round', { round: Math.max(1, S.round), max: s.game.maxRounds() })}`;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
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
    <div id="screen-game" hidden data-tab="board" data-drawer="${ui.prefs.drawer === false ? 'closed' : 'open'}">
      <header id="topbar"></header>
      <main id="main">
        <aside id="left"><div class="drawer-in"><section id="road"></section><section id="councils"></section>
          <section id="logp"><h3>${t('log.title')}</h3><ol id="log"></ol></section></div></aside>
        <section id="center"><div id="map"></div></section>
      </main>
      <button id="drawerBtn" data-act="drawer" title="${t('drawer.toggle')}" aria-label="${t('drawer.toggle')}"></button>
      <section id="decision"></section>
      <footer id="dock"><div id="me"></div><div id="handp"></div></footer>
      <nav id="tabs"></nav>
    </div>
    <div id="banner"></div>
    <div id="modal" hidden></div><div id="zoom" hidden></div><div id="curtain" hidden></div><div id="toast"></div>`;
  lastHtml.clear();
  seenIn.clear();
  faceOf.clear();
  lastK.clear();
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
  ui.aiError = null;
  ui.gameOverShown = false;
  ui.tab = 'board';
  ui.boardPid = null;
  ui.activePid = null;
  ui.turnFlip = false;
  lastPhase = null;
  popKey = null;
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
// Every call starts a new run. A run that is still sleeping when a newer one starts stops as soon as it
// wakes, so a new game or an undo can restart the AI even while the previous loop is still alive.
let pumpRun = 0;
async function pump() {
  const s = ui.session;
  if (!s) return;
  const run = ++pumpRun;
  const token = gameToken;
  const current = () => run === pumpRun && ui.session === s && token === gameToken;
  let steps = 0;
  ui.aiError = null;
  try {
    while (current() && !s.done && s.req && s.isAI()) {
      const before = s.log.length;
      s.stepAI();
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
  } catch (e) {
    // Without this the panel would keep saying "thinking" with nothing left running.
    console.error(e);
    if (current()) { ui.aiError = e.message; toast('Engine error: ' + e.message, 6000); }
  }
  if (!current()) return;
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
  const pid = focusPid(s);
  setHtml('topbar', P.topbar(g, s.req));
  setHtml('road', P.roadPanel(g));
  setHtml('councils', P.councilsPanel(g));
  setHtml('map', P.mapPanel(g));
  setHtml('me', P.mePanel(g, pid));
  setHtml('handp', P.handPanel(g, pid));
  setHtml('tabs', ['board', 'me', 'log'].map((k) => `<button data-act="tab" data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${t('tab.' + k)}</button>`).join(''));
  if (ui.turnFlip) {
    ui.turnFlip = false;
    for (const el of [$('#me'), $('#handp')]) {
      el.classList.remove('turning');
      void el.offsetWidth;
      el.classList.add('turning');
    }
  }

  // decision panel
  let dec;
  if (s.done) dec = `<div class="dec-wait"><b>${t('phase.end')}</b><button class="primary" data-act="showEnd">${t('end.title')}</button></div>`;
  else if (req) dec = D.decisionHtml(g, req);
  else if (s.req) dec = D.waitingHtml(g, s.req, g.P(s.req.pid).name, ui.aiError);
  else dec = '';
  const decEl = $('#decision');
  const body0 = decEl.querySelector('.dec-body');
  const sc = body0 ? body0.scrollTop : 0;
  const changed = setHtml('decision', dec);
  if (changed && ui.reqKey === lastReqKey) { const b = decEl.querySelector('.dec-body'); if (b) b.scrollTop = sc; }
  lastReqKey = ui.reqKey;
  // the popup pops in once per new decision; keep the class while the same decision is re-rendered
  const fresh = !!req && ui.reqKey !== popKey;
  const keep = decEl.classList.contains('pop-in');
  if (fresh) { popKey = ui.reqKey; ui.decCollapsed = false; } // a new decision always opens, even if it was folded
  decEl.className = req ? 'active f-' + g.P(req.pid).faction : (s.req ? 'ai' : '');
  if (ui.decCollapsed) decEl.classList.add('collapsed');
  if (fresh || (keep && req)) decEl.classList.add('pop-in');

  // log
  if (g.logEntries.length !== logCount) {
    logCount = g.logEntries.length;
    const ol = $('#log');
    const stick = ol.scrollTop + ol.clientHeight >= ol.scrollHeight - 40;
    ol.innerHTML = renderLog(g);
    if (stick) ol.scrollTop = ol.scrollHeight;
  }
  applyHighlights(g, req);
  phaseBanner(s);
  bumpStats();
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
  openModal(`<h2>${t('menu.rules')}</h2>
    <div class="gm"><button class="big" data-act="glossary">📖 ${t('gloss.open')}</button></div>
    <div class="refs">
    <img src="${IMG('ref/ref_sequence.webp')}" alt="Sequence of play"><img src="${IMG('ref/ref_actions.webp')}" alt="Actions reference"></div>`, 'm-rules');
}

// Glossary: the game terms as they are printed on the cards (English), with the Vietnamese name and the meaning.
const glossRow = (e) => `<tr><td><b class="term">${esc(e.en)}</b></td><td>${esc(e.vi)}</td><td>${esc((e.def && (lang === 'en' ? e.def.en : e.def.vi)) || '')}</td></tr>`;
const groupTitle = (gid) => ({
  round: t('gloss.group.round'), map: t('gloss.group.map'), zone: t('gloss.group.zone'),
  res: t('gloss.group.res'), act: t('gloss.group.act'), unit: t('gloss.group.unit'),
})[gid];
function glossaryModal() {
  const groups = GLOSSARY_GROUPS.map((gid) => `<section class="gl-group"><h3>${groupTitle(gid)}</h3>
    <table class="gl"><thead><tr><th>${t('gloss.col.en')}</th><th>${t('gloss.col.vi')}</th><th>${t('gloss.col.def')}</th></tr></thead>
    <tbody>${GLOSSARY.filter((e) => e.group === gid).map(glossRow).join('')}</tbody></table></section>`).join('');
  openModal(`<h2>${t('gloss.title')}</h2>
    <p class="fine">${t('gloss.note')}</p>
    <div class="gl-tools"><button class="big ghost" data-act="rules">◀ ${t('back')}</button><input type="search" class="gl-filter" data-gfilter placeholder="${t('gloss.filter')}" aria-label="${t('gloss.filter')}"></div>
    <div class="gl-body">${groups}</div>
    <p class="muted gl-none" hidden>${t('gloss.none')}</p>`, 'm-gloss');
}
// Shows only the glossary rows that contain the search text, and hides the groups left empty.
function filterGlossary(q) {
  const needle = q.trim().toLowerCase();
  for (const row of $$('#modal .gl tbody tr')) row.hidden = !!needle && !row.textContent.toLowerCase().includes(needle);
  for (const sec of $$('#modal .gl-group')) sec.hidden = !sec.querySelector('tbody tr:not([hidden])');
  $('#modal .gl-none').hidden = $$('#modal .gl tbody tr:not([hidden])').length > 0;
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
    return `${zoomFace(d.img, d.name)}<div class="zt"><h4>${esc(d.name)}</h4><table>${rows}</table>${descBlock(tacticDesc(tid), t('step.' + d.step))}</div>`;
  }
  return cardZoomHtml(g, +el.dataset.uid);
}
const D_cardRows = (g, uid) => cardFacts(g, uid).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
function cardZoomHtml(g, uid) {
  const c = g.C(uid);
  if (!c) return null;
  return `${zoomFace(c.def.img, c.def.name)}<div class="zt"><h4>${esc(c.def.name)}</h4><table>${D_cardRows(g, uid)}</table>${descBlock(cardDesc(g, uid), '', cardFlavour(g, uid))}</div>`;
}

function showZoom(el, pinned, ev) {
  const s = ui.session;
  if (!s || !el) return;
  const g = s.game;
  let html;
  if (typeof el === 'number') {
    html = cardZoomHtml(g, el);
  } else {
    if (el.classList.contains('back')) return;
    html = zoomContent(g, el);
  }
  if (!html) return;
  // a pinned zoom must not be replaced by a hover timer that was started before the click
  if (pinned) clearTimeout(zoomTimer);
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
  hideTerm();
  const z = $('#zoom');
  if (z) { z.hidden = true; z.innerHTML = ''; }
}

// A game term (**Term** in the card text) shows its glossary meaning in a popover when tapped or clicked.
// Touch screens have no hover, so the native title tooltip is only a desktop extra.
function showTerm(el) {
  const word = el.textContent.trim();
  const entry = GLOSSARY_BY_FORM.get(word.toLowerCase());
  if (!entry) return;
  let tip = $('#termtip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'termtip';
    tip.className = 'termtip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
  }
  const def = lang === 'en' ? entry.def.en : entry.def.vi;
  // the word as printed on the card, then the name of its glossary entry in the current language
  // (a form can map to another entry, e.g. Start of Year to Round)
  const name = lang === 'en' ? entry.en : entry.vi;
  const named = name && name.toLowerCase() !== word.toLowerCase();
  tip.innerHTML = `<b>${esc(word)}</b>${named ? ` <span>(${esc(name)})</span>` : ''}<p>${esc(def)}</p>`;
  tip.hidden = false;
  // below the term, or above it when there is no room below; kept inside the screen
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const below = r.bottom + 8;
  const above = r.top - h - 8;
  tip.style.top = (below + h > window.innerHeight - 8 && above > 8 ? above : below) + 'px';
  tip.style.left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8) + 'px';
}
function hideTerm() {
  const tip = $('#termtip');
  if (tip) tip.hidden = true;
}
const zoomable = (e) => e.target.closest('.card:not(.back), .kc:not(.back), .tac');

// ----------------------------------------------------------------------------- events
function doAct(name, el) {
  const s = ui.session;
  switch (name) {
    case 'start': startGame(); break;
    case 'continue': continueGame(); break;
    case 'rules': rulesModal(); break;
    case 'glossary': glossaryModal(); break;
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
    case 'drawer': setDrawer(!ui.prefs.drawer); break;
    case 'viewMine': ui.boardPid = viewerPid(); render(); break;
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
  // a game term opens its popover and leaves the zoom and the decision alone
  const term = el.closest('.term');
  if (term) { showTerm(term); return; }
  if (el.closest('#termtip')) { hideTerm(); return; }
  hideTerm();
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
  // a player chip switches the dock to that player's board, unless it is the target being chosen
  const bv = el.closest('[data-bview]');
  if (bv && !(req && ui.targets && ui.targets.has('p:' + bv.dataset.bview))) {
    const pid = +bv.dataset.bview;
    if (ui.boardPid !== pid) { ui.boardPid = pid; render(); }
    return;
  }
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
    const gf = e.target.closest('[data-gfilter]');
    if (gf) filterGlossary(gf.value);
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
  // the term popover is placed by coordinates, so it closes when the page moves
  window.addEventListener('scroll', hideTerm, { capture: true, passive: true });
  window.addEventListener('resize', hideTerm);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const tip = $('#termtip');
      if (tip && !tip.hidden) hideTerm();
      else if (!$('#zoom').hidden) hideZoom();
      else if (ui.modal) closeModal();
    }
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

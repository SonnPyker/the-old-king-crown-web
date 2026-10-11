// Main menu: game setup (seats, factions, AI level, options), continue saved game, language, rules sheets.

import { esc, store } from './util.js';
import { t, lang, LANGS } from './i18n.js';
import { ui } from './state.js';
import { emblem } from './cards.js';
import { FACTIONS, FACTION_INFO } from '../data/constants.js';

const DEFAULT_NAMES = { vi: ['Bạn', 'Máy 1', 'Máy 2', 'Máy 3'], en: ['You', 'CPU 1', 'CPU 2', 'CPU 3'] };

export function defaultSetup() {
  const names = DEFAULT_NAMES[lang] || DEFAULT_NAMES.en;
  return {
    n: 3,
    seats: [
      { type: 'human', faction: 'nobility', level: 'normal', name: names[0] },
      { type: 'ai', faction: 'uprising', level: 'normal', name: names[1] },
      { type: 'ai', faction: 'clans', level: 'normal', name: names[2] },
      { type: 'ai', faction: 'gathering', level: 'normal', name: names[3] },
    ],
    length: 'standard', advanced: false, order: 'random', seed: '',
  };
}

export function loadSetup() {
  const s = store.get('setup', null);
  const d = defaultSetup();
  if (!s || !Array.isArray(s.seats) || s.seats.length !== 4) return d;
  return Object.assign(d, s, { seed: '' });
}

export function saveSetup(s) { store.set('setup', s); }

// Make factions unique among the active seats (swap if a duplicate was picked).
export function fixFactions(setup, changed) {
  const used = new Set();
  const seats = setup.seats.slice(0, setup.n);
  if (changed != null) used.add(seats[changed].faction);
  seats.forEach((s, i) => {
    if (i === changed) return;
    if (used.has(s.faction)) s.faction = FACTIONS.find((f) => !used.has(f) && !seats.some((x, j) => j !== i && x.faction === f)) || FACTIONS.find((f) => !used.has(f));
    used.add(s.faction);
  });
}

export function settingsFrom(setup) {
  const players = setup.seats.slice(0, setup.n).map((s, i) => ({
    faction: s.faction, type: s.type, level: s.level, name: (s.name || '').trim() || (s.type === 'human' ? `P${i + 1}` : `AI ${i + 1}`),
  }));
  return { players, length: setup.length, advanced: !!setup.advanced, order: setup.order };
}

const seg = (name, val, items) => `<div class="seg" data-seg="${name}">${items.map(([v, label]) => `<button class="${String(val) === String(v) ? 'on' : ''}" data-v="${v}">${label}</button>`).join('')}</div>`;

export function menuHtml(setup, saved) {
  const seats = setup.seats.slice(0, setup.n).map((s, i) => {
    const fac = FACTIONS.map((f) => {
      const taken = setup.seats.slice(0, setup.n).some((x, j) => j !== i && x.faction === f);
      return `<button class="fbtn f-${f}${s.faction === f ? ' on' : ''}${taken ? ' taken' : ''}" data-seat="${i}" data-fac="${f}" title="${t('faction.' + f)}">${emblem(f)}<span>${t('faction.' + f)}</span></button>`;
    }).join('');
    const lv = s.type === 'ai' ? seg(`level${i}`, s.level, ['easy', 'normal', 'hard'].map((l) => [l, t('level.' + l)])) : '';
    return `<div class="seat f-${s.faction}">
      <div class="seat-hd"><span class="sn">${i + 1}</span>
        <input class="nm" maxlength="14" data-name="${i}" value="${esc(s.name)}" placeholder="${t('menu.name')}">
        ${seg(`type${i}`, s.type, [['human', t('type.human')], ['ai', t('type.ai')]])}${lv}</div>
      <div class="facs">${fac}</div>
      <p class="fdesc">${t('faction.desc.' + s.faction)}</p></div>`;
  }).join('');
  const saveBox = saved
    ? `<button class="big cont" data-act="continue">${t('menu.continue')}<small>${t('menu.saved', { round: saved.round })}</small></button>` : '';
  return `<div class="menu"><div class="menu-card">
    <div class="menu-logo"><h1>${t('app.title')}</h1><p>${t('app.sub')}</p></div>
    ${saveBox}
    <h2>${t('menu.new')}</h2>
    <div class="row"><label>${t('menu.players')}</label>${seg('n', setup.n, [[2, '2'], [3, '3'], [4, '4']])}</div>
    <div class="seats">${seats}</div>
    <p class="hint">${t('menu.hotseat.hint')}</p>
    <div class="row"><label>${t('menu.length')}</label>${seg('length', setup.length, ['short', 'standard', 'extended'].map((l) => [l, t('menu.length.' + l)]))}</div>
    <div class="row"><label>${t('menu.order')}</label>${seg('order', setup.order, [['random', t('menu.order.random')], ['seat', t('menu.order.seat')]])}</div>
    <div class="row chk"><label><input type="checkbox" data-chk="advanced" ${setup.advanced ? 'checked' : ''}> ${t('menu.advanced')}</label><small>${t('menu.advanced.desc')}</small></div>
    <div class="row"><label>${t('menu.speed')}</label>${seg('speed', ui.prefs.speed, ['instant', 'fast', 'normal', 'slow'].map((l) => [l, t('menu.speed.' + l)]))}</div>
    <div class="row"><label>${t('menu.lang')}</label>${seg('lang', lang, LANGS.map((l) => [l, l === 'vi' ? 'Tiếng Việt' : 'English']))}</div>
    <div class="row chk"><label><input type="checkbox" data-chk="confirmPicks" ${ui.prefs.confirmPicks ? 'checked' : ''}> ${t('menu.confirmPicks')}</label></div>
    <div class="row"><label>${t('menu.seed')}</label><input class="seed" data-seed value="${esc(setup.seed)}" placeholder="${t('menu.seed.hint')}" inputmode="numeric"></div>
    <div class="menu-actions"><button class="big go" data-act="start">${t('menu.start')}</button><button class="big ghost" data-act="rules">${t('menu.rules')}</button></div>
    <p class="fine">Fan project · artwork &amp; rules belong to the original publisher of The Old King’s Crown — personal use only.</p>
  </div></div>`;
}

export { FACTION_INFO };

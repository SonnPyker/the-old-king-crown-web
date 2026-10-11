// HTML builders for cards, Kingdom Cards, tactic tiles and tokens.

import { esc, IMG, cls } from './util.js';
import { t, lang } from './i18n.js';
import { TACTIC_DEFS } from '../data/tactics.js';
import { FACTION_INFO } from '../data/constants.js';
import { ARCH_DESC, COMMAND_DESC, TRAIT_DESC } from '../data/descriptions.js';
import { FACE_TEXT } from '../data/face_text.js';
import { GLOSSARY_BY_FORM } from '../data/glossary.js';

export const cardName = (g, uid) => g.C(uid).def.name;
export const cname = (g, u) => (u == null || !g.C(u) ? '' : `<a class="cn" data-zoom="${u}">${esc(g.C(u).def.name)}</a>`);
export const facOf = (g, uid) => { const c = g.C(uid); return c.def.faction || (c.owner != null ? g.P(c.owner).faction : 'nobility'); };

export const tok = (name, c = '') => `<img class="tok ${c}" src="${IMG('tokens/' + name + '.webp')}" alt="" draggable="false">`;
export const emblem = (f, c = '') => tok('emblem_' + f, 'emb ' + c);

// A face-up (or face-down) Faction Card. o: { size, down, str, inf, extra, owner (faction for backs), title }
export function fcard(g, uid, o = {}) {
  const c = g.C(uid);
  const d = c.def;
  const f = d.faction;
  const size = o.size || 'md';
  if (o.down) {
    return `<div class="card back f-${o.owner || f} sz-${size} ${o.cls || ''}" data-uid="${uid}" data-tg="u:${uid}" data-down="1"><img src="${IMG('cards/back_' + (o.owner || f) + '.webp')}" alt="" draggable="false">${o.badge || ''}</div>`;
  }
  const v = c.kind === 'f' ? g.view(uid) : null;
  let badges = '';
  if (o.str && v) badges += `<b class="bd str${v.str !== d.str ? ' mod' : ''}">${v.str}</b>`;
  if (o.inf !== false && c.inf > 0) badges += `<b class="bd cinf">${tok('inf1')}${c.inf}</b>`;
  if (v && v.blank) badges += `<b class="bd blank" title="blank">∅</b>`;
  if (c.becomes && c.becomesRound === g.S.round) badges += `<b class="bd mirror" title="${esc(c.becomes.name)}">⟲</b>`;
  const title = d.name + (v ? ` · ${t('str')} ${v.str}` : '');
  return `<div class="card f-${f} sz-${size} ${o.cls || ''}" data-uid="${uid}" data-tg="u:${uid}" title="${esc(title)}"><img src="${IMG(d.img)}" alt="${esc(d.name)}" draggable="false">${badges}${o.badge || ''}</div>`;
}

// Kingdom Card (landscape).
export function kcard(g, uid, o = {}) {
  const c = g.C(uid);
  const d = c.def;
  const size = o.size || 'md';
  if (o.down) return `<div class="kc back sz-${size} ${o.cls || ''}" data-uid="${uid}" data-tg="u:${uid}"><img src="${IMG('cards/back_kingdom.webp')}" alt="" draggable="false"></div>`;
  const own = c.owner != null && g.P(c.owner) ? `<i class="own f-${g.P(c.owner).faction}"></i>` : '';
  return `<div class="kc suit-${d.suit} sz-${size} ${o.cls || ''}" data-uid="${uid}" data-tg="u:${uid}" title="${esc(d.name)}"><img src="${IMG(d.img)}" alt="${esc(d.name)}" draggable="false">${own}${o.badge || ''}</div>`;
}

export const anyCard = (g, uid, o = {}) => (g.C(uid).kind === 'k' ? kcard(g, uid, o) : fcard(g, uid, o));

export function tacticEl(g, pid, tac, o = {}) {
  const d = TACTIC_DEFS[tac.id];
  const f = g.P(pid).faction;
  const state = tac.burned ? 'burned' : tac.exhausted ? 'exhausted' : '';
  let mk = '';
  if (d.markers > 0 && !tac.burned) {
    for (let i = 0; i < d.markers; i++) mk += `<i class="mk${i < tac.markers ? ' on' : ''}"></i>`;
    mk = `<span class="mks">${mk}</span>`;
  }
  const src = tac.exhausted || tac.burned ? d.back : d.img;
  return `<div class="tac f-${f} ${state} ${o.cls || ''}" data-tid="${tac.id}" data-tpid="${pid}" data-tg="t:${pid}:${tac.id}" title="${esc(d.name)}"><img src="${IMG(src)}" alt="${esc(d.name)}" draggable="false">${mk}</div>`;
}

export const factionColor = (f) => FACTION_INFO[f].color;
export const pname = (g, pid) => g.P(pid).name;
export function pchip(g, pid, o = {}) {
  const p = g.P(pid);
  return `<span class="pchip f-${p.faction}${o.cls ? ' ' + o.cls : ''}" data-tg="p:${pid}">${emblem(p.faction)}<b>${esc(p.name)}</b></span>`;
}
export const pspan = (g, pid) => `<span class="pn f-${g.P(pid).faction}">${esc(g.P(pid).name)}</span>`;

// Strength/type summary shown next to the big preview.
export function cardFacts(g, uid) {
  const c = g.C(uid);
  const d = c.def;
  const rows = [];
  if (c.kind === 'f') {
    const v = g.view(uid);
    if (d.cost) rows.push([t('zoom.cost'), `${d.cost} ${t('lore')}`]);
    rows.push([t('zoom.str'), v.str !== d.str ? `${v.str} (${d.str})` : `${v.str}`]);
    if (v.arch) rows.push(['', t('arch.' + v.arch)]);
    const tr = [];
    if (v.inv) tr.push(t('trait.inv'));
    if (v.res) tr.push(t('trait.res'));
    if (v.path) tr.push(t('trait.path'));
    if (tr.length) rows.push([t('zoom.traits'), tr.join(', ')]);
    const cm = Array.from(new Set(v.cmds.map((x) => t('cmd.' + x.c)))).join(', ');
    if (cm) rows.push(['', cm]);
    rows.push([t('votes'), v.votes]);
    rows.push([t('lore'), v.lore]);
    if (c.inf > 0) rows.push([t('inf'), c.inf]);
  } else {
    rows.push([t('zoom.suit'), t('suit.' + d.suit)]);
    if (c.owner != null && g.P(c.owner)) rows.push([t('kc.owner'), g.P(c.owner).name]);
  }
  return rows;
}

export function tacticFacts(g, pid, tid) {
  const tac = g.S.tactics[pid].find((x) => x.id === tid);
  const rows = [];
  if (tac) {
    if (tac.burned) rows.push(['', t('me.burned')]);
    else if (tac.exhausted) rows.push(['', t('me.exhausted')]);
    if (TACTIC_DEFS[tid].markers > 0 && !tac.burned) rows.push(['', t('me.markers', { n: tac.markers })]);
  }
  return rows;
}

// Printed card text (data/face_text.js) in the current language. The zoom only has Vietnamese and English.
const faceLang = () => (lang === 'en' ? 'en' : 'vi');
const pickLang = (o) => (o ? (lang === 'en' ? o.en : o.vi) : '');
const faceOf = (img) => FACE_TEXT[img] || null;

// Zoom text for a card: its printed box. Basic cards also explain their commands and traits, which are not printed as text.
export function cardDesc(g, uid) {
  const c = g.C(uid);
  const face = faceOf(c.def.img);
  const printed = face ? face.p[faceLang()] : [];
  if (c.kind === 'k' || (face && face.t !== 'bas')) return printed;
  const v = g.view(uid);
  if (v.blank) return [t('zoom.blank')];
  const out = [...printed];
  if (v.arch) out.push(pickLang(ARCH_DESC[v.arch]));
  for (const cm of new Set(v.cmds.map((x) => x.c))) out.push(pickLang(COMMAND_DESC[cm]));
  if (v.inv) out.push(pickLang(TRAIT_DESC.inv));
  if (v.res) out.push(pickLang(TRAIT_DESC.res));
  if (v.path) out.push(pickLang(TRAIT_DESC.path));
  return out.filter(Boolean);
}

export const cardFlavour = (g, uid) => { const face = faceOf(g.C(uid).def.img); return face ? face.f[faceLang()] : ''; };
export const tacticDesc = (tid) => { const face = faceOf(TACTIC_DEFS[tid].img); return face ? face.p[faceLang()] : []; };

// Game terms are marked **Term** in the data. They stay in English, in bold; the glossary definition is the tooltip.
export function richText(s) {
  return String(s).split(/(\*\*[^*]+\*\*)/).map((p) => {
    if (!p.startsWith('**')) return esc(p);
    const word = p.slice(2, -2);
    const entry = GLOSSARY_BY_FORM.get(word.toLowerCase());
    const def = entry ? pickLang(entry.def) : '';
    return `<b class="term"${def ? ` title="${esc(def)}"` : ''}>${esc(word)}</b>`;
  }).join('');
}

// A block of description paragraphs for the zoom panel (empty string when there is nothing to show).
export const descBlock = (paras, head = '', flavour = '') => (paras.length || head || flavour
  ? `<div class="zd">${head ? `<p class="zs">${esc(head)}</p>` : ''}${paras.map((p) => `<p>${richText(p)}</p>`).join('')}${flavour ? `<p class="zf">${esc(flavour)}</p>` : ''}</div>`
  : '');

// The card face shown in the zoom: the printed image as it is, so the English on the card stays readable.
// The Vietnamese text is in the description panel (descBlock), not drawn over the card.
export function zoomFace(img, alt = '') {
  const face = faceOf(img);
  return `<div class="zface" style="--ar:${face ? face.ar : 0.5836}"><img src="${IMG(img)}" alt="${esc(alt)}" draggable="false"></div>`;
}

export { cls };

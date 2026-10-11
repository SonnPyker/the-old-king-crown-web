// Shared UI state (a single mutable object — the UI is re-rendered from it and from the engine state).

import { store, isTouch } from './util.js';

export const ui = {
  screen: 'menu', // 'menu' | 'game'
  session: null,
  settings: null,
  prefs: Object.assign({ lang: 'vi', speed: 'normal', confirmPicks: isTouch(), drawer: true }, store.get('prefs', {})),
  viewer: 0,
  boardPid: null, // whose board the dock shows (null = follow the active player)
  activePid: null, // last player seen acting, to detect a turn change
  locked: false, // hot-seat privacy curtain
  reqKey: null, // identifies the request the interaction state below belongs to
  sel: [], // select: chosen option ids (in click order)
  asg: null, // assign: { slots:[uid|null], held:uid|null }
  dist: null, // distribute: counts[]
  focus: null, // target key whose actions are being filtered in the action list
  tab: 'board', // mobile tab
  modal: null, // { type, ... }
  thinking: false,
  aiError: null, // set when the AI loop threw; the decision panel shows it instead of "thinking"
  gameOverShown: false,
  hover: null,
};

export function savePrefs() { store.set('prefs', ui.prefs); }

export const sessionG = () => (ui.session ? ui.session.game : null);

export function humanPids() {
  const g = sessionG();
  if (!g) return [];
  return g.S.players.map((p, i) => (p.type === 'human' ? i : -1)).filter((i) => i >= 0);
}
export const isHotseat = () => humanPids().length > 1;

// The player whose information is shown on screen.
export function viewerPid() {
  const hs = humanPids();
  if (!hs.length) return 0;
  if (hs.length === 1) return hs[0];
  return hs.includes(ui.viewer) ? ui.viewer : hs[0];
}

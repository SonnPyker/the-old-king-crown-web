// Small DOM / storage helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const store = {
  get(key, dflt = null) {
    try { const v = localStorage.getItem('tokc.' + key); return v == null ? dflt : JSON.parse(v); } catch (e) { return dflt; }
  },
  set(key, val) {
    try { localStorage.setItem('tokc.' + key, JSON.stringify(val)); return true; } catch (e) { return false; }
  },
  del(key) { try { localStorage.removeItem('tokc.' + key); } catch (e) { /* ignore */ } },
};

export const isTouch = () => {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
};

export function cls(...a) { return a.filter(Boolean).join(' '); }
export const IMG = (p) => `assets/${p}`;

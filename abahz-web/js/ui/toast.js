// Messages courts non bloquants, annoncés aux lecteurs d'écran.

import { h } from '../core/dom.js';

let zone = null;

/**
 * @param {string} message
 * @param {'info'|'success'|'error'} [kind]
 */
export function toast(message, kind = 'info', duration = 3500) {
  if (!zone) {
    zone = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(zone);
  }
  const el = h('div', { class: `toast toast-${kind}` }, message);
  zone.append(el);
  setTimeout(() => el.remove(), duration);
}

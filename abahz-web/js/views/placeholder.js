// Écran affiché pour les routes pas encore livrées.

import { h } from '../core/dom.js';

export function placeholder(root) {
  root.replaceChildren(h('div', { class: 'page' },
    h('p', { class: 'empty' }, 'Écran en construction.')));
}

// Titre et sous-titre de la barre haute des sous-écrans (AbahzTopBar), modifiables par la vue.

import { store } from '../core/store.js';

/** @param {{title?: string, subtitle?: string}} header */
export function setHeader(header) {
  store.emit('header', header);
}

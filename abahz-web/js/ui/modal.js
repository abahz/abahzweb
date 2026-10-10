// Modales avec l'élément natif <dialog>, confirmation comprise.

import { h } from '../core/dom.js';

/**
 * Ouvre une modale et résout avec la valeur du bouton choisi (null si fermée par Échap).
 * `pick` : sélecteur d'éléments du corps qui ferment la modale avec leur `data-value` (liste d'options).
 * `onOpen(dialog, close)` : branchement de la logique d'un formulaire ; `close(value)` ferme la modale.
 * @param {{title: string, body?: any, actions: {label: string, value: any, kind?: string, submit?: boolean}[], className?: string, pick?: string, onOpen?: Function}} opts
 */
export function modal({ title, body, actions, className = '', pick, onOpen }) {
  return new Promise((resolve) => {
    let result = null;
    const close = (value) => { result = value; dlg.close(); };
    const dlg = h('dialog', { class: `modal ${className}`, 'aria-labelledby': 'modal-title' },
      h('h2', { id: 'modal-title' }, title),
      body ? h('div', { class: 'modal-body' }, body) : null,
      h('div', { class: 'modal-actions' },
        actions.map((a) => h('button', {
          type: 'button',
          class: `btn ${a.kind ? 'btn-' + a.kind : ''}`,
          // `handler(close)` : l'action valide d'abord et ne ferme que si tout est correct.
          onclick: () => (a.handler ? a.handler(close) : close(a.value)),
        }, a.label))));
    if (pick) {
      dlg.addEventListener('click', (ev) => {
        const el = ev.target instanceof Element && ev.target.closest(pick);
        if (el && dlg.contains(el)) close(el.dataset.value);
      });
    }
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    onOpen?.(dlg, close);
  });
}

/**
 * Demande une confirmation. Résout true si l'utilisateur confirme.
 * @param {string} message
 * @param {{title?: string, ok?: string, danger?: boolean}} [opts]
 */
export async function confirm(message, { title = 'Confirmer', ok = 'Confirmer', danger = false } = {}) {
  const value = await modal({
    title,
    body: h('p', {}, message),
    actions: [
      { label: 'Annuler', value: false },
      { label: ok, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  });
  return value === true;
}

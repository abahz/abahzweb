// Composants partagés, calqués sur ui/components/AbahzComponents.kt (Android).

import { h } from '../core/dom.js';
import { icon, iconBadge } from './icons.js';
import { modal } from './modal.js';

/** EmptyState : grande pastille, titre, message, action facultative. */
export function emptyState(iconName, title, message, action) {
  return h('div', { class: 'empty-state' },
    iconBadge(iconName, 'round xl muted-badge'),
    h('p', { class: 't-title-md' }, title),
    message && h('p', { class: 'muted t-body-md' }, message),
    action);
}

/** StatusPill : petite étiquette de statut (En stock, Rupture, En attente…). */
export function pill(text, kind = '') {
  return h('span', { class: `status-pill ${kind}` }, text);
}

/** ManagedListItem : pastille, titre, sous-titre, actions modifier / supprimer. */
export function listItem({ icon: iconName, title, subtitle, onClick, onEdit, onDelete, trailing, data = {} }) {
  const attrs = { class: `list-item${onClick ? ' clickable' : ''}`, ...data };
  if (onClick) { attrs.role = 'button'; attrs.tabindex = '0'; }
  const el = h('div', attrs,
    iconBadge(iconName),
    h('div', { class: 'list-text' },
      h('p', { class: 't-title-sm ellipsis' }, title),
      subtitle && h('p', { class: 'muted t-body-md ellipsis' }, subtitle)),
    h('div', { class: 'list-trail' },
      trailing,
      onEdit && h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Modifier', onclick: (e) => { e.stopPropagation(); onEdit(); } }, icon('edit')),
      onDelete && h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Supprimer', onclick: (e) => { e.stopPropagation(); onDelete(); } }, icon('delete'))));
  if (onClick) {
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });
  }
  return el;
}

/** ConfirmDeleteDialog : icône, titre, message, bouton rouge. */
export async function confirmDelete(title, message, confirmLabel = 'Supprimer') {
  const value = await modal({
    title,
    className: 'modal-center',
    body: [h('div', { class: 'modal-icon danger' }, icon('delete')), h('p', {}, message)],
    actions: [
      { label: 'Annuler', value: false },
      { label: confirmLabel, value: true, kind: 'danger' },
    ],
  });
  return value === true;
}

/** ExtendedFloatingActionButton propre à un écran (le bouton global « + Produit » ne sert qu'à l'accueil). */
export function fab(label, onClick, iconName = 'plus') {
  return h('button', { type: 'button', class: 'fab', onclick: onClick }, icon(iconName), label);
}

/**
 * Mise en page des écrans hors connexion : sur PC, panneau de marque à gauche et formulaire à droite ;
 * sur mobile, le panneau est masqué (le formulaire garde son bandeau).
 */
export function authLayout(content) {
  return h('div', { class: 'auth-layout' },
    h('aside', { class: 'auth-aside' },
      h('div', { class: 'auth-brand' },
        h('span', { class: 'hero-logo' }, h('img', { src: 'icons/logo.webp', alt: '', width: 42, height: 42 })),
        h('strong', {}, 'ABAHZ')),
      h('div', { class: 'auth-pitch' },
        h('p', { class: 'auth-claim' }, 'La caisse et le stock de votre boutique, même sans Internet.'),
        h('ul', { class: 'auth-points' },
          ['Ventes, factures et reçus imprimables', 'Stock, catégories et alertes de rupture',
            'Dettes clients, dépenses et rapports PDF', 'Hors ligne : tout se synchronise au retour du réseau']
            .map((t) => h('li', {}, icon('check'), t)))),
      h('p', { class: 'auth-foot' }, `© ${new Date().getFullYear()} ABAHZ · Caisse et stock`)),
    h('div', { class: 'auth-main' }, content));
}

/** FilterChip : puce sélectionnable avec coche. */
export function chip(label, selected, onClick) {
  return h('button', {
    type: 'button', class: `chip${selected ? ' selected' : ''}`, 'aria-pressed': String(selected), onclick: onClick,
  }, selected && icon('check'), label);
}

/** « Voir plus » pour les listes paginées par 50 (PRD 5.4). */
export function moreButton(shown, total, onClick) {
  if (shown >= total) return null;
  return h('button', { type: 'button', class: 'btn more', onclick: onClick }, `Voir plus (${total - shown})`);
}

/** Petite fenêtre de saisie d'un nom (catégorie, unité). Résout avec le texte, ou null. */
export async function promptName({ title, label, value = '', ok = 'Ajouter', iconName }) {
  const input = h('input', { id: 'prompt-name', name: 'name', placeholder: ' ', value, required: true, autocomplete: 'off' });
  const field = h('div', { class: 'field' }, input, h('label', { for: 'prompt-name' }, label));
  queueMicrotask(() => input.focus());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.closest('dialog')?.querySelector('.btn-primary')?.click(); }
  });
  const res = await modal({
    title,
    className: 'modal-center',
    body: [iconName && h('div', { class: 'modal-icon' }, icon(iconName)), field],
    actions: [{ label: 'Annuler', value: null }, { label: ok, value: 'ok', kind: 'primary' }],
  });
  const text = input.value.trim();
  return res === 'ok' && text ? text : null;
}

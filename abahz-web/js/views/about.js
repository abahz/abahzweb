// #/a-propos — « À propos d'Abahz », calqué sur AboutScreen (Android) (ABT-01).

import { h } from '../core/dom.js';
import { store } from '../core/store.js';

export function render(root) {
  const { version, androidAppUrl } = store.get('config');
  root.replaceChildren(h('div', { class: 'page info-page' },
    h('section', { class: 'center about-head' },
      h('img', { src: 'icons/logo.webp', alt: 'Logo Abahz', width: 84, height: 84 }),
      h('h1', { class: 't-title-lg' }, 'ABAHZ ERP / POS'),
      h('p', { class: 'muted' }, `Version web ${version}`)),
    h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, 'À propos de l\'application'),
      h('p', { class: 'muted' }, 'Abahz est une solution moderne de gestion commerciale, point de vente (POS) et Business Intelligence (BI) conçue pour les boutiques, magasins et grossistes. Elle intègre un mode 100% offline-first pour sécuriser toutes vos transactions même sans connexion internet.')),
    h('section', { class: 'card' },
      h('h2', { class: 'section-title' }, 'Fonctionnalités clés'),
      ['📦 Gestion avancée des stocks et produits', '🛒 Encaissement rapide et impression de tickets en FC',
        '📊 Tableaux de bord et indicateurs BI', '🔄 Synchronisation cloud sécurisée avec Supabase']
        .map((t) => h('p', { class: 'muted' }, t))),
    androidAppUrl && h('a', { class: 'btn btn-lg', href: androidAppUrl, target: '_blank', rel: 'noopener' }, 'Télécharger l\'app Android'),
    h('p', { class: 'center muted t-body-sm' }, `© ${new Date().getFullYear()} Abahz Inc. Tous droits réservés.`)));
}

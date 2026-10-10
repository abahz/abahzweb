// #/fournisseur — « Espace Fournisseurs », calqué sur SupplierScreen (Android) (SUP-01).

import { h } from '../core/dom.js';
import { store } from '../core/store.js';
import { icon, iconBadge } from '../ui/icons.js';

/** Message prérempli, comme l'app. Fonction pure (testée). */
export function supplierMessage(shop, user) {
  return ['Bonjour,', 'Je suis grossiste et souhaite vendre sur Abahz et devenir fournisseur pour plusieurs boutiques.', '',
    `- Nom de la boutique : ${shop?.name || 'Boutique Abahz'}`,
    `- Adresse : ${(shop?.address || '').trim() || 'Adresse non renseignée'}`,
    `- Nom du responsable : ${user?.name || 'Responsable'}`].join('\n');
}

export function render(root) {
  const { user, shop } = store.get('session');
  const phone = store.get('config').partnersWhatsApp || '243846077619';
  root.replaceChildren(h('div', { class: 'page info-page' },
    h('section', { class: 'shop-hero center' },
      iconBadge('truck', 'round xl'),
      h('h1', { class: 't-title-lg' }, 'Devenez Fournisseur Partenaire'),
      h('p', {}, 'Voulez-vous devenir fournisseur d\'ABAHZ ? Abahz vous met en contact avec des millions de clients et propulse votre catalogue.')),
    h('ul', { class: 'card checks' },
      ['Touchez les boutiques qui utilisent Abahz', 'Présentez votre catalogue', 'Échangez directement avec les commerçants']
        .map((t) => h('li', {}, icon('check'), t))),
    h('a', { class: 'btn btn-lg btn-whatsapp', target: '_blank', rel: 'noopener',
      href: `https://wa.me/${phone}?text=${encodeURIComponent(supplierMessage(shop, user))}` }, icon('phone'), 'Nous contacter sur WhatsApp')));
}

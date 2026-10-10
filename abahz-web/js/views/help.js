// #/aide — « Aide & Support », calqué sur HelpScreen (Android) (HLP-01). Réponses adaptées au site.

import { h } from '../core/dom.js';
import { store } from '../core/store.js';
import { icon, iconBadge } from '../ui/icons.js';

const FAQ = [
  ['Comment enregistrer une vente en FC ?', 'Sur l\'accueil, touchez les produits pour les ajouter au panier, ouvrez le panier puis « Valider la commande ». La facture s\'affiche : vous pouvez l\'imprimer ou la partager.'],
  ['Le site fonctionne-t-il sans internet ?', 'Oui. Une fois ouvert une première fois, le site garde vos produits et vos ventes dans le navigateur. Les ventes faites hors ligne partent automatiquement dès que la connexion revient (voir Profil → Synchro).'],
  ['Comment ajouter ou modifier un produit ?', 'Depuis l\'accueil, le bouton « + Produit » (administrateur) permet de saisir le nom, le prix d\'achat, le prix de vente et le stock. Le menu ⋮ d\'une carte permet de la modifier.'],
  ['Comment gérer les rôles des utilisateurs ?', 'En tant qu\'administrateur, ouvrez Profil → Personnel pour ajouter des caissiers ou modifier leur rôle. L\'ajout demande une connexion internet.'],
  ['Comment obtenir un rapport en PDF ?', 'Dans Profil, choisissez la période puis « Rapport BI PDF ». Dans la fenêtre d\'impression, choisissez « Enregistrer en PDF ».'],
];

export function render(root) {
  const phone = store.get('config').supportWhatsApp || '243846770619';
  root.replaceChildren(h('div', { class: 'page info-page' },
    h('h2', { class: 'section-title' }, 'Foire Aux Questions (FAQ)'),
    FAQ.map(([q, a]) => h('details', { class: 'card faq' }, h('summary', {}, q), h('p', { class: 'muted' }, a))),
    h('section', { class: 'card center' },
      iconBadge('help', 'round'),
      h('p', { class: 't-title-sm' }, 'Besoin d\'assistance supplémentaire ?'),
      h('p', { class: 'muted' }, 'Notre équipe technique est disponible pour vous accompagner 7j/7.'),
      h('a', { class: 'btn btn-lg btn-whatsapp', target: '_blank', rel: 'noopener',
        href: `https://wa.me/${phone}?text=${encodeURIComponent('Bonjour, j\'ai besoin d\'aide avec l\'application Abahz.')}` },
      icon('phone'), 'Contacter le support WhatsApp'))));
}

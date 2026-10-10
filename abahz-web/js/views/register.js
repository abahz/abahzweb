// #/inscription — calqué sur RegisterScreen (Android) : étape 1 la boutique, étape 2 le gérant (AUTH-02 à AUTH-04).

import { h, formData } from '../core/dom.js';
import { register } from '../core/auth.js';
import { navigate } from '../core/router.js';
import { field } from '../ui/field.js';
import { icon, iconBadge } from '../ui/icons.js';
import { offlineDialog } from './auth.js';
import { authLayout } from '../ui/components.js';

/** ShopType de l'app Android. */
const SHOP_TYPES = ['Alimentation', 'Electronique', 'Vêtements', 'Meubles', 'Cosmétiques',
  'Divers', 'Jouets', 'Livres', 'Autres'];

/** ShopCurrency de l'app Android : valeur enregistrée → libellé. */
const CURRENCIES = [['FC', 'Francs Congolais (FC)'], ['$', 'Dollars Américains ($)']];

function step(badge, n, title, ...fields) {
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, iconBadge(badge, 'sm'),
      h('div', {}, h('small', {}, `Étape ${n}`), h('h2', { class: 't-title-md' }, title))),
    ...fields);
}

export function render(root) {
  const error = h('p', { class: 'error-box', role: 'alert' });
  const label = 'Créer la boutique & Démarrer';
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, label);

  const form = h('form', { class: 'page-narrow register' },
    h('header', { class: 'subbar' },
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': 'Retour', onclick: () => navigate('/connexion'),
      }, icon('back')),
      h('div', { class: 'sub-title' },
        h('strong', {}, 'Créer votre boutique'),
        h('span', {}, 'La boutique, puis le compte gérant'))),
    step('store', 1, 'Informations de la boutique',
      field({ id: 'shopName', label: 'Nom de la boutique *', icon: 'business', required: true, autocomplete: 'organization' }),
      field({ id: 'category', label: 'Catégorie de commerce', icon: 'category', options: SHOP_TYPES.map((t) => [t, t]) }),
      field({ id: 'devise', label: 'Devise de comptabilité *', icon: 'money', options: CURRENCIES }),
      field({ id: 'address', label: 'Adresse physique', icon: 'place', autocomplete: 'street-address' }),
      h('div', { class: 'field-row' },
        field({ id: 'rccm', label: 'RCCM (Optionnel)' }),
        field({ id: 'idNat', label: 'ID Nat (Optionnel)' }))),
    step('admin', 2, 'Compte administrateur (gérant)',
      field({ id: 'name', label: 'Nom complet *', icon: 'person', required: true, autocomplete: 'name' }),
      field({ id: 'email', label: 'Email *', icon: 'email', type: 'email', inputmode: 'email', required: true, autocomplete: 'username' }),
      field({ id: 'phone', label: 'Téléphone (Optionnel)', icon: 'badge', type: 'tel', inputmode: 'tel', autocomplete: 'tel' }),
      field({ id: 'password', label: 'Mot de passe *', icon: 'lock', type: 'password', required: true, minlength: '6', autocomplete: 'new-password' })),
    error,
    submit);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    if (!form.reportValidity()) return;
    if (!navigator.onLine) { offlineDialog(); return; }
    submit.disabled = true;
    submit.replaceChildren(h('span', { class: 'spinner', 'aria-label': 'Création…' }));
    try {
      await register(formData(form));
    } catch (err) {
      if (err.offline) offlineDialog();
      else error.textContent = err.message;
      submit.disabled = false;
      submit.replaceChildren(label);
    }
  });

  root.replaceChildren(authLayout(form));
}

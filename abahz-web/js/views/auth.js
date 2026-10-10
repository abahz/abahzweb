// #/connexion — calqué sur AuthScreen (Android) : bandeau de marque, e-mail + mot de passe (AUTH-01, AUTH-04, AUTH-07).

import { h, formData } from '../core/dom.js';
import { signIn } from '../core/auth.js';
import { OFFLINE_MESSAGE } from '../core/api.js';
import { store } from '../core/store.js';
import { field } from '../ui/field.js';
import { modal } from '../ui/modal.js';
import { authLayout } from '../ui/components.js';

/** AlertDialog « Hors connexion » de l'app Android. */
export function offlineDialog() {
  return modal({
    title: 'Hors connexion',
    body: h('p', {}, OFFLINE_MESSAGE),
    actions: [{ label: 'OK', value: true, kind: 'primary' }],
  });
}

export function render(root) {
  const error = h('p', { class: 'error-box', role: 'alert' });
  const label = 'Connexion';
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg', disabled: true }, label);
  const support = store.get('config').supportWhatsApp;

  const email = field({
    id: 'email', label: 'Email *', icon: 'email', type: 'email', inputmode: 'email',
    autocomplete: 'username', required: true,
  });
  const password = field({
    id: 'password', label: 'Mot de passe *', icon: 'lock', type: 'password',
    autocomplete: 'current-password', required: true,
  });

  const form = h('form', { class: 'page-narrow', novalidate: true },
    h('div', { class: 'hero' },
      h('div', { class: 'hero-logo' }, h('img', { src: 'icons/logo.webp', alt: 'Logo Abahz', width: 42, height: 42 })),
      h('h1', { class: 't-headline' }, 'Bon retour sur Abahz 👋'),
      h('p', { class: 't-body-md' }, 'Pilotez vos ventes, stocks et multi-boutiques en temps réel, où que vous soyez.')),
    h('div', { class: 'card' },
      email,
      password,
      h('a', {
        class: 'link-end t-label-md',
        href: `https://wa.me/${support}?text=${encodeURIComponent('Bonjour, j\'ai oublié mon mot de passe ABAHZ.')}`,
        target: '_blank', rel: 'noopener',
      }, 'Mot de passe oublié ?')),
    error,
    h('div', { class: 'stack' },
      submit,
      h('a', { href: '#/inscription', class: 'btn btn-lg' }, 'Créer votre boutique')));

  // Comme Android : bouton actif seulement quand les deux champs sont remplis.
  form.addEventListener('input', () => {
    const { email: e, password: p } = formData(form);
    submit.disabled = !e || !p;
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    if (!navigator.onLine) { offlineDialog(); return; }
    const { email: e, password: p } = formData(form);
    submit.disabled = true;
    submit.replaceChildren(h('span', { class: 'spinner', 'aria-label': 'Connexion…' }));
    try {
      await signIn(e, p);
      // le routeur redirige vers l'accueil dès que la session existe
    } catch (err) {
      if (err.offline) offlineDialog();
      else {
        error.textContent = err.status === 400 && /credential|invalid/i.test(err.message)
          ? 'Email ou mot de passe incorrect.'
          : err.message;
      }
      submit.disabled = false;
      submit.replaceChildren(label);
    }
  });

  root.replaceChildren(authLayout(form));
  form.elements.email.focus();
}

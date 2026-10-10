// Déconnexion guidée (AUTH-06, NFR-11) : avertit s'il reste des opérations à synchroniser.

import { h } from '../core/dom.js';
import { signOut, pendingCount } from '../core/auth.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { settings } from '../core/settings.js';

export async function logout() {
  const pending = await pendingCount();
  const shared = h('input', { type: 'checkbox', id: 'shared-device', checked: settings().sharedDevice });
  const body = h('div', {},
    pending
      ? h('p', { class: 'warning' },
        `Attention : ${pending} opération(s) ne sont pas encore envoyées au serveur. `
        + 'Si vous vous déconnectez maintenant, elles seront perdues. '
        + 'Reconnectez-vous à Internet et attendez la synchronisation.')
      : h('p', {}, 'Voulez-vous vous déconnecter ?'),
    h('label', { class: 'check' }, shared,
      ' Appareil partagé : effacer toutes les données de la boutique sur cet appareil'));

  const choice = await modal({
    title: 'Déconnexion',
    body,
    actions: [
      { label: 'Annuler', value: null },
      pending
        ? { label: 'Se déconnecter quand même', value: 'force', kind: 'danger' }
        : { label: 'Se déconnecter', value: 'ok', kind: 'danger' },
    ],
  });
  if (!choice) return;
  try {
    await signOut({ purge: shared.checked, force: choice === 'force' });
  } catch (err) {
    toast(err.message, 'error');
  }
}

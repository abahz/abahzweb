// #/personnel (ADMIN) — calqué sur UserScreen (Android) (USR-01 à USR-03).
// Ajouter, modifier ou supprimer un membre exige le réseau, comme dans l'app.

import { h, formData } from '../core/dom.js';
import { store } from '../core/store.js';
import { repo } from '../core/repo.js';
import { ROLES, validateMember, deleteBlocker, roleBlocker, addMember, updateMember, removeMember } from '../services/staff.js';
import { offlineDialog } from './auth.js';
import { setHeader } from '../ui/header.js';
import { icon } from '../ui/icons.js';
import { field } from '../ui/field.js';
import { modal } from '../ui/modal.js';
import { emptyState, listItem, confirmDelete, fab, pill } from '../ui/components.js';
import { toast } from '../ui/toast.js';

const usersRepo = repo('users');

export async function render(root) {
  let users = [];
  const list = h('div', { class: 'list wrap-sub' });
  root.replaceChildren(h('div', { class: 'page' }, list), fab('Membre', () => edit(null), 'person'));

  async function load() {
    users = (await usersRepo.all()).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    setHeader({ subtitle: `${users.length} membre(s)` });
    if (!users.length) {
      list.replaceChildren(emptyState('group', 'Aucun membre du personnel',
        'Créez un compte pour chaque caissier : il se connectera avec son email.'));
      return;
    }
    const me = store.get('session')?.user?.id;
    list.replaceChildren(...users.map((u) => listItem({
      icon: u.role === 'ADMIN' ? 'admin' : 'store',
      title: `${u.name}${u.id === me ? ' (vous)' : ''}`,
      subtitle: [u.code && `Code ${u.code}`, u.email, u.phone].filter((x) => x && String(x).trim()).join(' • '),
      trailing: u.role === 'ADMIN' ? pill('ADMIN', 'role-admin') : pill('CAISSE', 'success'),
      onEdit: () => edit(u),
      onDelete: () => remove(u),
    })));
  }

  async function edit(u) {
    let role = u?.role === 'ADMIN' ? 'ADMIN' : 'CASHIER';
    let busy = false;
    const error = h('p', { class: 'error-box', role: 'alert' });
    const segs = ROLES.map(([value, label]) => h('button', {
      type: 'button', class: `seg${value === role ? ' selected' : ''}`, 'aria-pressed': String(value === role),
      onclick: () => {
        role = value;
        error.textContent = '';
        segs.forEach((s, i) => { const on = ROLES[i][0] === role; s.classList.toggle('selected', on); s.setAttribute('aria-pressed', String(on)); });
      },
    }, label));
    const form = h('form', { class: 'checkout-form', novalidate: true },
      field({ id: 'us-name', label: 'Nom *', icon: 'person', value: u?.name || '', autocomplete: 'off' }),
      // La connexion se fait par e-mail ; l'e-mail et le mot de passe ne se saisissent qu'à la création.
      field({ id: 'us-email', label: 'Email *', icon: 'email', type: 'email', inputmode: 'email', value: u?.email || '',
        disabled: !!u, autocomplete: 'off' }),
      !u && field({ id: 'us-password', label: 'Mot de passe *', icon: 'lock', type: 'password', autocomplete: 'new-password' }),
      h('p', { class: 't-label-lg' }, 'Rôle *'),
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Rôle' }, segs),
      error);
    form.addEventListener('input', () => { error.textContent = ''; });
    form.addEventListener('submit', (e) => e.preventDefault());

    async function save(close) {
      if (busy) return;
      if (!navigator.onLine) { offlineDialog(); return; }
      const v = formData(form);
      const input = { name: v['us-name'], email: v['us-email'] ?? u?.email, password: form.elements['us-password']?.value || '', role };
      const msg = validateMember({ ...input, editing: !!u, users }) || (u && roleBlocker(u, role, users, store.get('session')?.user?.id));
      if (msg) { error.textContent = msg; return; }
      busy = true;
      try {
        if (u) await updateMember(u, input);
        else await addMember(input, users);
        close(true);
        toast(u ? 'Membre mis à jour.' : `Compte créé : ${input.email.trim().toLowerCase()}`);
      } catch (err) {
        error.textContent = err.message || 'Erreur lors de l\'enregistrement de l\'utilisateur';
        busy = false;
      }
    }

    await modal({
      title: u ? 'Modifier le membre' : 'Ajouter un membre',
      body: [h('div', { class: 'modal-icon' }, icon('badge')), form],
      onOpen: () => form.elements['us-name'].focus(),
      actions: [{ label: 'Annuler', value: null }, { label: u ? 'Enregistrer' : 'Ajouter', kind: 'primary', handler: save }],
    });
  }

  async function remove(u) {
    const blocked = deleteBlocker(u, users, store.get('session')?.user?.id);
    if (blocked) { toast(blocked, 'error', 5000); return; }
    if (!(await confirmDelete('Supprimer ce membre ?', `L'utilisateur « ${u.name} » sera supprimé.`))) return;
    if (!navigator.onLine) { offlineDialog(); return; }
    try {
      await removeMember(u);
      toast(`${u.name} a été retiré du personnel.`);
    } catch (err) {
      toast(err.message || 'Erreur lors de la suppression de l\'utilisateur', 'error', 5000);
    }
  }

  const offs = [store.subscribe('users', load)];
  await load();
  return () => offs.forEach((off) => off());
}

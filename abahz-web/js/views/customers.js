// #/clients — calqué sur CustomerScreen (Android) (CUS-01, CUS-02).
// Tout membre crée et modifie ; seule l'ADMIN supprime (règles RLS du lot 0).

import { h, formData } from '../core/dom.js';
import { store } from '../core/store.js';
import { customersRepo } from '../core/repo.js';
import { normalize } from '../core/format.js';
import { setHeader } from '../ui/header.js';
import { field } from '../ui/field.js';
import { modal } from '../ui/modal.js';
import { emptyState, listItem, confirmDelete, fab, moreButton } from '../ui/components.js';

const PAGE = 50;

/** Recherche par nom ou téléphone, tri alphabétique. Fonction pure (testée). */
export function searchCustomers(customers, query) {
  const q = normalize(query);
  const digits = String(query || '').replace(/\D/g, '');
  return customers
    .filter((c) => !q || normalize(c.name).includes(q) || (digits && String(c.phone || '').replace(/\D/g, '').includes(digits)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
}

export async function render(root) {
  const isAdmin = store.isAdmin;
  let rows = [];
  let query = '';
  let limit = PAGE;

  const search = h('input', { type: 'search', class: 'list-search', placeholder: 'Rechercher un client', 'aria-label': 'Rechercher un client' });
  const list = h('div', { class: 'list' });
  const footer = h('div', { class: 'grid-footer' });
  root.replaceChildren(h('div', { class: 'page' }, search, list, footer), fab('Client', () => edit(null), 'person'));

  function paint() {
    setHeader({ subtitle: `${rows.length} client(s)` });
    search.hidden = !rows.length;
    if (!rows.length) {
      list.replaceChildren(emptyState('people', 'Aucun client',
        'Enregistrez vos clients fidèles pour les ventes à crédit et le suivi des dettes.'));
      footer.replaceChildren();
      return;
    }
    const found = searchCustomers(rows, query);
    list.replaceChildren(...found.slice(0, limit).map((c) => listItem({
      icon: 'person',
      title: c.name,
      subtitle: [c.phone, c.address].filter((x) => x && String(x).trim()).join(' • '),
      onEdit: () => edit(c),
      onDelete: isAdmin ? () => remove(c) : null,
    })));
    if (!found.length) list.append(emptyState('search_off', 'Aucun client trouvé', 'Essayez un autre nom ou numéro.'));
    footer.replaceChildren(moreButton(limit, found.length, () => { limit += PAGE; paint(); }) || '');
  }

  async function load() {
    rows = await customersRepo.all();
    paint();
  }

  async function edit(c) {
    const error = h('p', { class: 'error-box', role: 'alert' });
    const form = h('form', { class: 'checkout-form', novalidate: true },
      field({ id: 'cu-name', label: 'Nom du client *', icon: 'person', value: c?.name || '', autocomplete: 'off' }),
      field({ id: 'cu-phone', label: 'Téléphone', icon: 'phone', type: 'tel', inputmode: 'tel', value: c?.phone || '' }),
      field({ id: 'cu-address', label: 'Adresse', icon: 'place', value: c?.address || '' }),
      error);
    form.addEventListener('input', () => { error.textContent = ''; });
    form.addEventListener('submit', (e) => e.preventDefault());

    async function save(close) {
      const v = formData(form);
      const name = String(v['cu-name'] || '').trim();
      if (!name) { error.textContent = 'Le nom du client est obligatoire.'; return; }
      if (rows.some((x) => x.id !== c?.id && normalize(x.name) === normalize(name))) {
        error.textContent = `Le client « ${name} » existe déjà.`;
        return;
      }
      await customersRepo.save({
        ...(c || { notes: 0 }), name, phone: String(v['cu-phone'] || '').trim(), address: String(v['cu-address'] || '').trim(),
      });
      close(true);
    }

    await modal({
      title: c ? 'Modifier le client' : 'Ajouter un client',
      body: form,
      onOpen: () => form.elements['cu-name'].focus(),
      actions: [{ label: 'Annuler', value: null }, { label: c ? 'Enregistrer' : 'Ajouter', kind: 'primary', handler: save }],
    });
  }

  async function remove(c) {
    if (await confirmDelete('Supprimer le client ?', `Le client « ${c.name} » sera supprimé.`)) await customersRepo.remove(c);
  }

  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { query = search.value; limit = PAGE; paint(); }, 150);
  });

  const offs = [store.subscribe('customer', load)];
  await load();
  return () => { clearTimeout(timer); offs.forEach((off) => off()); };
}

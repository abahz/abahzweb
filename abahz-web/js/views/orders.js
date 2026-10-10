// #/ventes — calqué sur OrderScreen (Android) (ORD-01, ORD-02, ORD-06).

import { h, on } from '../core/dom.js';
import { store } from '../core/store.js';
import { SYNC } from '../core/db.js';
import { ordersRepo } from '../core/repo.js';
import { fc, dayLabel, time, normalize } from '../core/format.js';
import { navigate } from '../core/router.js';
import { cancelSale } from '../services/checkout.js';
import { invoiceNumber } from '../services/invoice.js';
import { icon, iconBadge } from '../ui/icons.js';
import { emptyState, pill, moreButton, confirmDelete, chip } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { PERIODS, inPeriod, periodLabel } from '../services/stats.js';

const PAGE = 50;

/** Plus récentes d'abord, puis N° décroissant (comme Android). Fonction pure (testée). */
export const sortOrders = (orders) =>
  [...orders].sort((a, b) => (Number(b.created) - Number(a.created)) || (Number(b.fid) - Number(a.fid)));

/** Recherche par N° de facture ou client. Fonction pure (testée). */
export function searchOrders(orders, query) {
  const q = normalize(query);
  if (!q) return orders;
  return orders.filter((o) => String(o.fid) === q.replace(/^n°?\s*/, '') || normalize(o.customer).includes(q));
}

/** Pastille de synchronisation d'une facture (ORD-01). */
function syncPill(o) {
  if (o._sync === SYNC.ERROR) return pill('Erreur', 'error');
  if (o._sync === SYNC.PENDING) return pill('En attente', 'warning');
  return null;
}

export async function render(root) {
  const isAdmin = store.isAdmin;
  let orders = [];
  let limit = PAGE;
  let query = '';
  let period = 'all';
  let pickedDay = '';

  const hero = h('section', { class: 'sales-hero' });
  const search = h('input', {
    type: 'search', class: 'list-search', placeholder: 'Rechercher un N° ou un client', 'aria-label': 'Rechercher une facture',
  });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Période' });
  const dayInput = h('input', { type: 'date', class: 'list-search', 'aria-label': 'Choisir un jour', hidden: true,
    onchange: () => { pickedDay = dayInput.value; limit = PAGE; paint(); } });
  const list = h('div', { class: 'list' });
  const footer = h('div', { class: 'grid-footer' });
  root.replaceChildren(h('div', { class: 'page' }, hero, chips, dayInput, search, list, footer));

  function paint() {
    const today = orders.filter((o) => dayLabel(o.created) === 'Aujourd\'hui');
    hero.replaceChildren(
      h('div', {},
        h('p', { class: 't-label-lg' }, 'Ventes du jour'),
        h('p', { class: 't-headline-md' }, fc(today.reduce((s, o) => s + Number(o.total || 0), 0))),
        h('p', { class: 't-body-sm' }, `${today.length} facture(s) • ${orders.length} au total`)),
      iconBadge('trending', 'hero-badge'));

    if (!orders.length) {
      search.hidden = true;
      list.replaceChildren(emptyState('receipt', 'Aucune facture enregistrée', 'Les ventes validées depuis le panier apparaîtront ici.'));
      footer.replaceChildren();
      return;
    }
    search.hidden = false;
    chips.replaceChildren(...PERIODS.map(([k, l]) => chip(l, k === period, () => { period = k; limit = PAGE; paint(); })));
    dayInput.hidden = period !== 'custom';
    const found = searchOrders(orders.filter((o) => inPeriod(o.created, period, pickedDay)), query);
    const shown = found.slice(0, limit);
    const frag = document.createDocumentFragment();
    let day = null;
    for (const o of shown) {
      const label = dayLabel(o.created);
      if (label !== day) {
        day = label;
        const sum = found.filter((x) => dayLabel(x.created) === label).reduce((s, x) => s + Number(x.total || 0), 0);
        frag.append(h('div', { class: 'day-head' }, h('span', {}, label), h('span', {}, fc(sum))));
      }
      frag.append(h('div', { class: 'list-item clickable', 'data-id': o.id, role: 'button', tabindex: '0' },
        iconBadge('receipt'),
        h('div', { class: 'list-text' },
          h('p', { class: 't-title-sm' }, `Facture N° ${invoiceNumber(o)}`),
          h('p', { class: 'muted t-body-md ellipsis' }, `${o.customer || 'Client Divers'}${o.created > 0 ? ' • ' + time(o.created) : ''}`),
          syncPill(o)),
        h('div', { class: 'list-trail' },
          h('span', { class: 't-title-sm primary nowrap' }, fc(o.total)),
          isAdmin && h('button', { type: 'button', class: 'icon-btn danger', 'data-del': o.id, 'aria-label': 'Supprimer' }, icon('delete')))));
    }
    if (!found.length) frag.append(emptyState('search_off', 'Aucune facture trouvée', period === 'all' ? 'Essayez un autre N° ou un autre client.' : `Aucune vente pour : ${periodLabel(period, pickedDay)[0]}.`));
    list.replaceChildren(frag);
    footer.replaceChildren(moreButton(limit, found.length, () => { limit += PAGE; paint(); }) || '');
  }

  async function load() {
    orders = sortOrders(await ordersRepo.all());
    paint();
  }

  async function remove(id) {
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    const ok = await confirmDelete('Supprimer la facture ?',
      `La facture N° ${invoiceNumber(o)} sera supprimée et le stock des articles restauré.`);
    if (!ok) return;
    await cancelSale(o);
    toast(`Facture N° ${o.fid} supprimée.`);
  }

  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { query = search.value; limit = PAGE; paint(); }, 150);
  });

  const offs = [
    on(list, 'click', '[data-del]', (ev, btn) => { ev.stopPropagation(); remove(btn.dataset.del); }),
    on(list, 'click', '.list-item', (ev, el) => { if (!ev.target.closest('[data-del]')) navigate(`/facture/${encodeURIComponent(el.dataset.id)}`); }),
    on(list, 'keydown', '.list-item', (ev, el) => { if (ev.key === 'Enter') navigate(`/facture/${encodeURIComponent(el.dataset.id)}`); }),
    store.subscribe('orders', load),
  ];
  await load();
  return () => offs.forEach((off) => off());
}

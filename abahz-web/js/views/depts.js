// #/dettes — calqué sur DeptScreen (Android) (DPT-01 à DPT-04).

import { h } from '../core/dom.js';
import { store } from '../core/store.js';
import { deptsRepo, ordersRepo, orderItemsRepo, productsRepo, repo } from '../core/repo.js';
import { fc, dateTime, parseNumber } from '../core/format.js';
import { navigate } from '../core/router.js';
import { orderOfDept, deptBalance, validatePayment, halfOf, reminderLink, payDept, UNKNOWN } from '../services/depts.js';
import { invoiceLines } from '../services/invoice.js';
import { setHeader } from '../ui/header.js';
import { icon, iconBadge } from '../ui/icons.js';
import { field } from '../ui/field.js';
import { modal } from '../ui/modal.js';
import { emptyState, confirmDelete } from '../ui/components.js';
import { toast } from '../ui/toast.js';

const paymentsRepo = repo('dept_payment');
const nameOf = (d) => (d.name && String(d.name).trim()) || UNKNOWN;
const info = (label, value, cls = '') => h('div', { class: `info-row ${cls}` }, h('span', {}, label), h('strong', {}, value));

export async function render(root) {
  const isAdmin = store.isAdmin;
  let depts = [];
  let ctx = { orders: [], itemsByOrder: new Map(), products: new Map(), payments: [] };

  const hero = h('section', { class: 'sales-hero debt-hero' });
  const list = h('div', { class: 'list' });
  root.replaceChildren(h('div', { class: 'page' }, hero, list));

  function details(d) {
    const order = orderOfDept(d, ctx.orders);
    const lines = order ? invoiceLines(ctx.itemsByOrder.get(order.id) || [], ctx.products) : [];
    return { order, lines, ...deptBalance(d, order) };
  }

  function card(d) {
    const { order, lines, initial } = details(d);
    const when = order?.created || d.created;
    return h('div', { class: 'list-item clickable debt-card', role: 'button', tabindex: '0', onclick: () => showDetails(d),
      onkeydown: (e) => { if (e.key === 'Enter') showDetails(d); } },
    iconBadge('person', 'round warn-badge'),
    h('div', { class: 'list-text' },
      h('p', { class: 't-title-sm ellipsis' }, nameOf(d)),
      h('p', { class: 'muted t-body-sm' }, [`Facture N° ${d.fid}`, when > 0 ? dateTime(when) : ''].filter(Boolean).join(' • ')),
      d.phone && h('p', { class: 'muted t-body-sm' }, `Tél: ${d.phone}`),
      lines.length > 0 && h('p', { class: 'muted t-body-sm clamp-2' }, lines.map((l) => `${l.qty}× ${l.name}`).join(', '))),
    h('div', { class: 'debt-trail' },
      h('span', { class: 't-title-md debt-amount nowrap' }, fc(d.amount)),
      order && initial > Number(d.amount) && h('span', { class: 'muted small nowrap' }, `sur ${fc(initial)}`),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'icon-btn pay-btn', 'aria-label': 'Rembourser',
          onclick: (e) => { e.stopPropagation(); repay(d); } }, icon('payments')),
        isAdmin && h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Supprimer',
          onclick: (e) => { e.stopPropagation(); remove(d); } }, icon('delete')))));
  }

  function paint() {
    setHeader({ subtitle: `${depts.length} dette(s) en cours` });
    hero.hidden = !depts.length;
    if (!depts.length) {
      list.replaceChildren(emptyState('check', 'Aucune dette en cours', 'Les ventes à crédit apparaîtront ici jusqu\'à leur remboursement.'));
      return;
    }
    hero.replaceChildren(
      h('div', {},
        h('p', { class: 't-label-lg' }, 'Total à recouvrer'),
        h('p', { class: 't-headline-md' }, fc(depts.reduce((s, d) => s + (Number(d.amount) || 0), 0))),
        h('p', { class: 't-body-sm' }, `${depts.length} client(s) concerné(s)`)),
      iconBadge('money_off', 'hero-badge'));
    list.replaceChildren(...depts.map(card));
  }

  async function load() {
    const [d, orders, items, products, payments] = await Promise.all([
      deptsRepo.all(), ordersRepo.all(), orderItemsRepo.all(), productsRepo.all(), paymentsRepo.all()]);
    const itemsByOrder = new Map();
    for (const it of items) itemsByOrder.set(it.oid, [...(itemsByOrder.get(it.oid) || []), it]);
    ctx = { orders, itemsByOrder, products: new Map(products.map((p) => [p.id, p])), payments };
    depts = d.sort((a, b) => Number(b.created) - Number(a.created));
    paint();
  }

  // Détail : qui a pris quoi, quand, ce qui a été payé et ce qui reste.
  async function showDetails(d) {
    const { order, lines, initial, paid } = details(d);
    const history = ctx.payments.filter((p) => p.dept_id === d.id).sort((a, b) => Number(a.created) - Number(b.created));
    const link = reminderLink(d, store.get('session')?.shop?.name);
    const when = order?.created || d.created;
    const body = h('div', { class: 'debt-detail' },
      info('Client', nameOf(d)),
      d.phone && info('Téléphone', d.phone),
      info('Date de la vente', when > 0 ? dateTime(when) : '—'),
      h('hr'),
      h('p', { class: 't-title-sm' }, 'Articles pris'),
      lines.length
        ? lines.map((l) => h('div', { class: 'info-row' },
          h('span', {}, h('strong', {}, l.name), h('br'), h('small', { class: 'muted' }, `${l.qty} × ${fc(l.unitPrice)}`)),
          h('strong', {}, fc(l.total))))
        : h('p', { class: 'muted t-body-sm' }, 'Détail de la facture introuvable (vente supprimée ou pas encore synchronisée).'),
      h('hr'),
      info('Total de la facture', fc(initial)),
      info('Déjà payé', fc(paid)),
      history.length > 0 && h('div', { class: 'pay-history' },
        h('p', { class: 'muted small' }, 'Remboursements'),
        history.map((p) => info(p.created > 0 ? dateTime(p.created) : '—', fc(p.amount), 'muted'))),
      info('Reste à payer', fc(d.amount), 'debt-total'));

    const res = await modal({
      title: `Dette — Facture N° ${d.fid}`,
      className: 'debt-modal',
      body,
      actions: [
        order && { label: 'Facture', value: 'invoice' },
        link && { label: 'Relancer', value: 'remind' },
        { label: 'Fermer', value: null },
        { label: 'Rembourser', value: 'pay', kind: 'success' },
      ].filter(Boolean),
    });
    if (res === 'invoice') navigate(`/facture/${encodeURIComponent(order.id)}`);
    else if (res === 'remind') open(link, '_blank', 'noopener');
    else if (res === 'pay') repay(d);
  }

  // « Remboursement de dette » : Total ou Moitié, jamais plus que le reste à payer.
  async function repay(d) {
    const error = h('p', { class: 'error-box', role: 'alert' });
    const amount = field({ id: 'pay-amount', label: `Montant du remboursement (${store.get('session')?.shop?.devise || 'FC'})`,
      icon: 'payments', inputmode: 'numeric', value: String(d.amount) });
    const input = amount.querySelector('input');
    const set = (v) => { input.value = String(v); error.textContent = ''; };
    input.addEventListener('input', () => { error.textContent = ''; });
    let busy = false;

    async function confirm(close) {
      if (busy) return;
      const n = parseNumber(input.value);
      const msg = validatePayment(d, n);
      if (msg) { error.textContent = msg; return; }
      busy = true;
      try {
        const left = await payDept(d, n);
        close(true);
        toast(left === 0 ? `Dette de ${nameOf(d)} soldée.` : `Paiement enregistré. Reste ${fc(left)}.`);
      } catch (err) {
        error.textContent = err.message;
        busy = false;
      }
    }

    await modal({
      title: 'Remboursement de dette',
      body: h('div', { class: 'checkout-form' },
        h('p', { class: 't-title-sm' }, `Client : ${nameOf(d)}`),
        h('p', { class: 'muted t-body-md' }, `Reste à payer : ${fc(d.amount)}`),
        amount,
        h('div', { class: 'row gap-8' },
          h('button', { type: 'button', class: 'btn grow', onclick: () => set(d.amount) }, `Total (${fc(d.amount)})`),
          h('button', { type: 'button', class: 'btn grow', onclick: () => set(halfOf(d.amount)) }, 'Moitié')),
        error),
      onOpen: () => input.select(),
      actions: [{ label: 'Annuler', value: null }, { label: 'Valider le paiement', kind: 'success', handler: confirm }],
    });
  }

  async function remove(d) {
    const ok = await confirmDelete('Supprimer la dette ?',
      `La dette de « ${nameOf(d)} » sera supprimée sans enregistrer de paiement.`);
    if (ok) await deptsRepo.remove(d);
  }

  const offs = ['dept', 'dept_payment', 'orders', 'orderitem'].map((t) => store.subscribe(t, load));
  await load();
  return () => offs.forEach((off) => off());
}

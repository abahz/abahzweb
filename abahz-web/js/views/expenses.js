// #/depenses (ADMIN) — calqué sur ExpenseScreen et ExpenseFormDialog (Android) (EXP-01, EXP-02).

import { h, formData } from '../core/dom.js';
import { store } from '../core/store.js';
import { expensesRepo } from '../core/repo.js';
import { fc, date } from '../core/format.js';
import { parseAmount } from './product-form.js';
import { setHeader } from '../ui/header.js';
import { iconBadge } from '../ui/icons.js';
import { field } from '../ui/field.js';
import { modal } from '../ui/modal.js';
import { emptyState, listItem, confirmDelete, fab, moreButton } from '../ui/components.js';

const PAGE = 50;

/** Contrôle de la fenêtre de saisie. Renvoie un message, ou null. Fonction pure (testée). */
export function validateExpense({ name, price }) {
  if (!String(name || '').trim()) return 'Le motif est obligatoire.';
  if (price == null || price <= 0) return 'Saisissez un montant supérieur à 0.';
  return null;
}

/** Fenêtre « Ajouter une dépense » / « Modifier la dépense ». Résout avec la dépense enregistrée, ou null. */
export async function expenseDialog(expense = null) {
  const currency = store.get('session')?.shop?.devise || store.get('config').currency;
  const error = h('p', { class: 'error-box', role: 'alert' });
  const form = h('form', { class: 'checkout-form', novalidate: true },
    field({ id: 'ex-name', label: 'Motif * (ex : Transport, Loyer)', icon: 'receipt', value: expense?.name || '', autocomplete: 'off' }),
    field({ id: 'ex-note', label: 'Note / Description', icon: 'edit', value: expense?.note || '' }),
    field({ id: 'ex-price', label: `Montant * (${currency})`, icon: 'payments', inputmode: 'numeric', value: expense?.price > 0 ? String(expense.price) : '' }),
    error);
  form.addEventListener('input', () => { error.textContent = ''; });
  form.addEventListener('submit', (e) => e.preventDefault());

  let saved = null;
  async function save(close) {
    const v = formData(form);
    const input = { name: String(v['ex-name'] || '').trim(), note: String(v['ex-note'] || '').trim(), price: parseAmount(v['ex-price']) };
    const msg = validateExpense(input);
    if (msg) { error.textContent = msg; return; }
    saved = await expensesRepo.save({ ...(expense || {}), ...input });
    close(true);
  }

  await modal({
    title: expense ? 'Modifier la dépense' : 'Ajouter une dépense',
    body: form,
    onOpen: () => form.elements['ex-name'].focus(),
    actions: [{ label: 'Annuler', value: null }, { label: expense ? 'Enregistrer' : 'Ajouter', kind: 'primary', handler: save }],
  });
  return saved;
}

export async function render(root) {
  let rows = [];
  let limit = PAGE;
  const hero = h('section', { class: 'sales-hero expense-hero' });
  const list = h('div', { class: 'list wrap-sub' });
  const footer = h('div', { class: 'grid-footer' });
  root.replaceChildren(h('div', { class: 'page' }, hero, list, footer), fab('Dépense', () => expenseDialog()));

  function paint() {
    setHeader({ subtitle: `${rows.length} dépense(s)` });
    hero.hidden = !rows.length;
    if (!rows.length) {
      list.replaceChildren(emptyState('receipt', 'Aucune dépense',
        'Notez vos frais (transport, loyer, électricité…) pour suivre votre rentabilité.'));
      footer.replaceChildren();
      return;
    }
    hero.replaceChildren(
      h('div', {},
        h('p', { class: 't-label-lg' }, 'Total des dépenses'),
        h('p', { class: 't-headline-md' }, fc(rows.reduce((s, x) => s + (Number(x.price) || 0), 0)))),
      iconBadge('payments', 'hero-badge'));
    list.replaceChildren(...rows.slice(0, limit).map((x) => listItem({
      icon: 'receipt',
      title: x.name,
      subtitle: [x.note, x.created > 0 ? date(x.created) : ''].filter((s) => s && String(s).trim()).join(' • '),
      trailing: h('span', { class: 't-title-sm nowrap expense-amount' }, fc(x.price)),
      onEdit: () => expenseDialog(x),
      onDelete: () => remove(x),
    })));
    footer.replaceChildren(moreButton(limit, rows.length, () => { limit += PAGE; paint(); }) || '');
  }

  async function load() {
    rows = (await expensesRepo.all()).sort((a, b) => Number(b.created) - Number(a.created));
    paint();
  }

  async function remove(x) {
    if (await confirmDelete('Supprimer la dépense ?', `La dépense « ${x.name} » sera supprimée.`)) await expensesRepo.remove(x);
  }

  const offs = [store.subscribe('expenses', load)];
  await load();
  return () => offs.forEach((off) => off());
}

// #/panier — calqué sur CartScreen + CheckoutDialog (Android) (CRT-01 à CRT-08).

import { h, on, formData } from '../core/dom.js';
import { store } from '../core/store.js';
import { productsRepo, customersRepo } from '../core/repo.js';
import { cartItems, setCartQty, removeFromCart } from '../core/cart.js';
import { fc, qty as fmtQty, parseNumber } from '../core/format.js';
import { navigate } from '../core/router.js';
import { settings } from '../core/settings.js';
import { cartLines, cartTotal, minFinalTotal, validateCheckout, checkout, WALK_IN } from '../services/checkout.js';
import { setHeader } from '../ui/header.js';
import { icon } from '../ui/icons.js';
import { field } from '../ui/field.js';
import { modal } from '../ui/modal.js';
import { emptyState, confirmDelete, listItem } from '../ui/components.js';

const webImage = (p) => [p.url, p.image].find((u) => /^https?:\/\//.test(u || ''));

export async function render(root) {
  let lines = [];
  const list = h('div', { class: 'cart-list' });
  // Mobile : barre de total fixée en bas ; PC : carte récapitulative à droite de la liste.
  const summary = h('aside', { class: 'cart-summary', 'aria-label': 'Récapitulatif' });
  const page = h('div', { class: 'page cart-page' }, list, summary);
  root.replaceChildren(page);

  function row(l) {
    const p = l.product;
    const over = l.qty > (Number(p.qty) || 0);
    const src = !settings().dataSaver && webImage(p);
    return h('div', { class: 'cart-row', 'data-pid': l.pid },
      h('div', { class: 'cart-thumb' }, src ? h('img', { src, alt: '' }) : icon('inventory')),
      h('div', { class: 'cart-text' },
        h('p', { class: 't-title-sm ellipsis' }, p.name),
        h('p', { class: 'muted t-body-sm' }, `${fc(l.price)} / u`),
        h('p', { class: 't-title-sm primary' }, fc(l.total)),
        over && h('p', { class: 'stock-warn' }, icon('warning'), `Stock disponible : ${fmtQty(p.qty)}`)),
      h('div', { class: 'stepper' },
        h('button', {
          type: 'button', class: `icon-btn${l.qty > 1 ? '' : ' danger'}`, 'data-act': 'dec',
          'aria-label': l.qty > 1 ? 'Diminuer' : 'Retirer',
        }, icon(l.qty > 1 ? 'minus' : 'delete')),
        h('input', {
          class: 'qty-input', 'data-act': 'set', value: String(l.qty), inputmode: 'numeric',
          'aria-label': `Quantité de ${p.name}`, size: 3,
        }),
        h('button', { type: 'button', class: 'icon-btn filled', 'data-act': 'inc', 'aria-label': 'Augmenter' }, icon('plus'))));
  }

  async function load() {
    const [cart, products] = await Promise.all([cartItems(), productsRepo.all()]);
    const byId = new Map(products.map((p) => [p.id, p]));
    lines = cartLines(cart.sort((a, b) => a.added - b.added), byId);
    const count = lines.reduce((s, l) => s + l.qty, 0);
    setHeader({ subtitle: lines.length ? `${fmtQty(count)} article(s)` : '' });

    if (!lines.length) {
      list.replaceChildren(emptyState('cart', 'Votre panier est vide',
        'Touchez un produit sur l\'accueil pour l\'ajouter au panier.',
        h('button', { type: 'button', class: 'btn btn-tonal', onclick: () => navigate('/accueil') }, 'Voir les produits')));
      summary.hidden = true;
      page.classList.add('is-empty');
      return;
    }
    list.replaceChildren(...lines.map(row));
    summary.hidden = false;
    page.classList.remove('is-empty');
    summary.replaceChildren(
      h('h2', { class: 't-title-md show-lg' }, 'Récapitulatif'),
      h('div', { class: 'info-row show-lg' }, h('span', {}, 'Articles'), h('strong', {}, fmtQty(count))),
      h('div', { class: 'info-row show-lg' }, h('span', {}, 'Produits différents'), h('strong', {}, String(lines.length))),
      h('div', { class: 'cart-total' }, h('p', { class: 'muted t-body-md' }, 'Total à payer'), h('p', { class: 't-headline primary' }, fc(cartTotal(lines)))),
      h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: openCheckout }, 'Valider la commande'));
  }

  async function askRemove(l) {
    if (await confirmDelete('Retirer du panier ?', `« ${l.product.name} » sera retiré du panier.`, 'Retirer')) {
      await removeFromCart(l.pid);
    }
  }

  // Un seul écouteur pour toute la liste (délégation, PRD 6.4).
  const offs = [
    on(list, 'click', '[data-act]', async (ev, btn) => {
      const l = lines.find((x) => x.pid === btn.closest('.cart-row').dataset.pid);
      if (!l || btn.dataset.act === 'set') return;
      if (btn.dataset.act === 'inc') await setCartQty(l.pid, l.qty + 1);
      else if (l.qty > 1) await setCartQty(l.pid, l.qty - 1);
      else await askRemove(l);
    }),
    on(list, 'change', '.qty-input', async (ev, input) => {
      const l = lines.find((x) => x.pid === input.closest('.cart-row').dataset.pid);
      const n = parseNumber(input.value);
      // Quantités entières : l'app Android tronque les décimales (PRD §9, point 11).
      if (!Number.isInteger(n) || n < 0) { input.value = String(l.qty); return; }
      if (n === 0) { input.value = String(l.qty); await askRemove(l); return; }
      await setCartQty(l.pid, n);
    }),
    store.subscribe('cart', load),
    store.subscribe('products', load),
  ];

  // ───── Validation de la commande ─────
  async function openCheckout() {
    const total = cartTotal(lines);
    const role = store.role;
    const maxPct = store.get('config').maxDiscountPercentage ?? 20;
    const min = minFinalTotal(total, role, maxPct);
    const customers = (await customersRepo.all()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    let credit = false;
    let busy = false;

    const error = h('p', { class: 'error-box', role: 'alert' });
    const cash = h('button', { type: 'button', class: 'seg selected', 'aria-pressed': 'true' }, icon('payments'), 'Cash');
    const debt = h('button', { type: 'button', class: 'seg debt', 'aria-pressed': 'false' }, icon('receipt'), 'Dette');
    const nameField = field({ id: 'co-name', label: 'Nom du client *', icon: 'person', autocomplete: 'off' });
    const pickBtn = h('button', { type: 'button', class: 'field-trail icon-btn primary', 'aria-label': 'Choisir client' }, icon('chevron'));
    nameField.classList.add('has-trail');
    nameField.append(pickBtn);
    const phoneField = field({ id: 'co-phone', label: 'Téléphone du client *', icon: 'phone', type: 'tel', inputmode: 'tel' });
    phoneField.hidden = true;
    const currency = store.get('session')?.shop?.devise || store.get('config').currency;
    const totalField = field({
      id: 'co-total', label: `Montant final (${currency}) *`, icon: 'payments', inputmode: 'numeric', value: String(total),
    });
    const form = h('form', { class: 'checkout-form', novalidate: true },
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Mode de paiement' }, cash, debt),
      nameField, phoneField, totalField,
      min > 0 && min < total && h('p', { class: 'muted t-body-sm' }, `Rabais maximum ${maxPct} % : au moins ${fc(min)}.`),
      error);

    const setMode = (isCredit) => {
      credit = isCredit;
      error.textContent = '';
      cash.classList.toggle('selected', !credit);
      debt.classList.toggle('selected', credit);
      cash.setAttribute('aria-pressed', String(!credit));
      debt.setAttribute('aria-pressed', String(credit));
      phoneField.hidden = !credit;
    };
    form.addEventListener('input', () => { error.textContent = ''; });
    cash.addEventListener('click', () => setMode(false));
    debt.addEventListener('click', () => setMode(true));

    // « Sélectionner un client » : Client Divers ou un client enregistré.
    pickBtn.addEventListener('click', async () => {
      const picked = await modal({
        title: 'Sélectionner un client',
        className: 'picker',
        body: h('div', { class: 'list' },
          listItem({ icon: 'storefront', title: WALK_IN, subtitle: 'Vente au comptoir', data: { 'data-value': '' } }),
          h('hr'),
          customers.length
            ? customers.map((c) => listItem({ icon: 'person', title: c.name, subtitle: c.phone, data: { 'data-value': c.id } }))
            : h('p', { class: 'muted' }, 'Aucun client enregistré')),
        actions: [{ label: 'Fermer', value: null }],
        pick: '.list-item',
      });
      if (picked == null) return;
      const c = customers.find((x) => x.id === picked);
      form.elements['co-name'].value = c ? c.name : WALK_IN;
      form.elements['co-phone'].value = c?.phone || '';
      error.textContent = '';
    });

    async function confirm(close) {
      if (busy) return; // double appui : une seule vente (CartScreen Android)
      error.textContent = '';
      const v = formData(form);
      const finalTotal = parseNumber(v['co-total']);
      const input = { lines, total, finalTotal, credit, name: v['co-name'] || WALK_IN, phone: v['co-phone'], role, maxPct };
      const msg = validateCheckout(input);
      if (msg) { error.textContent = msg; return; }
      busy = true;
      try {
        const order = await checkout(input);
        close('done');
        navigate(`/facture/${encodeURIComponent(order.id)}`, { replace: true });
      } catch (err) {
        error.textContent = err.message || 'La vente n\'a pas pu être enregistrée.';
        busy = false;
      }
    }
    form.addEventListener('submit', (e) => e.preventDefault());

    await modal({
      title: 'Validation de la commande',
      className: 'checkout',
      body: form,
      actions: [
        { label: 'Annuler', value: null },
        { label: 'Confirmer', kind: 'primary', handler: confirm },
      ],
    });
  }

  await load();
  return () => offs.forEach((off) => off());
}

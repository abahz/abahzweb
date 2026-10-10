// Tests du lot 2 : vente, rabais, crédit, facture, synchronisation, colonnes absentes, filtres.

import { dayLabel, setCurrency } from '../js/core/format.js';
import { cartLines, cartTotal, minFinalTotal, validateCheckout, buildSale, stockAfterSale, WALK_IN } from '../js/services/checkout.js';
import { invoiceLines, invoiceText, invoiceNumber, stripAccents } from '../js/services/invoice.js';
import { shouldApplyRemote, fromRemote, isTransient } from '../js/core/sync.js';
import { missingColumnOf, cleanRow } from '../js/core/remote.js';
import { ApiError } from '../js/core/api.js';
import { filterProducts, categoriesOf } from '../js/views/home.js';
import { sortOrders, searchOrders } from '../js/views/orders.js';
import { parseAmount, parseStock } from '../js/views/product-form.js';

/** @param {(name: string, fn: Function) => void} test @param {(a: any, b: any) => void} eq */
export function lot2(test, eq) {
  const ok = (cond, msg) => { if (!cond) throw new Error(msg || 'condition fausse'); };

  test('dayLabel : Aujourd\'hui, Hier, date longue', () => {
    const now = new Date(2026, 9, 10, 12, 0).getTime();
    eq(dayLabel(new Date(2026, 9, 10, 8, 5).getTime(), now), 'Aujourd\'hui');
    eq(dayLabel(new Date(2026, 9, 9, 23, 59).getTime(), now), 'Hier');
    eq(dayLabel(new Date(2026, 9, 6, 10, 0).getTime(), now), 'Mardi 6 octobre 2026');
    eq(dayLabel(0, now), 'Date inconnue');
  });

  const P1 = { id: 'p1', name: 'Sucre', price: 2500, coast: 2000, qty: 10, category: 'Alimentation' };
  const P2 = { id: 'p2', name: 'Huile', price: 6000, coast: 5000, qty: 1, category: 'Alimentation' };
  const byId = new Map([[P1.id, P1], [P2.id, P2]]);

  test('panier : lignes, total, produit supprimé ignoré', () => {
    const lines = cartLines([{ pid: 'p1', qty: 2 }, { pid: 'p2', qty: 1 }, { pid: 'absent', qty: 3 }], byId);
    eq(lines.length, 2);
    eq(lines[0].total, 5000);
    eq(cartTotal(lines), 11000);
  });

  test('rabais : plafond CASHIER 20 %, ADMIN libre (CRT-06)', () => {
    eq(minFinalTotal(10000, 'CASHIER', 20), 8000);
    eq(minFinalTotal(10001, 'CASHIER', 20), 8001);
    eq(minFinalTotal(10000, 'ADMIN', 20), 0);
  });

  test('validation : rabais, crédit, quantités', () => {
    const lines = cartLines([{ pid: 'p1', qty: 4 }], byId); // 10 000
    const base = { lines, total: 10000, credit: false, name: '', phone: '', role: 'CASHIER', maxPct: 20 };
    eq(validateCheckout({ ...base, finalTotal: 10000 }), null);
    eq(validateCheckout({ ...base, finalTotal: 8000 }), null);
    ok(validateCheckout({ ...base, finalTotal: 7999 }).includes('20 %'), 'rabais au-delà du plafond refusé');
    eq(validateCheckout({ ...base, finalTotal: 5000, role: 'ADMIN' }), null);
    ok(validateCheckout({ ...base, finalTotal: 10000, credit: true, name: WALK_IN, phone: '0812' }).includes('nom du client'));
    ok(validateCheckout({ ...base, finalTotal: 10000, credit: true, name: 'Kahindo', phone: '' }).includes('téléphone'));
    eq(validateCheckout({ ...base, finalTotal: 10000, credit: true, name: 'Kahindo', phone: '0812345678' }), null);
    ok(validateCheckout({ ...base, lines: cartLines([{ pid: 'p1', qty: 1.5 }], byId), finalTotal: 3750 }).includes('décimales'));
    ok(validateCheckout({ ...base, lines: [], finalTotal: 0 }).includes('vide'));
    ok(validateCheckout({ ...base, finalTotal: NaN }).includes('invalide'));
  });

  test('vente : lignes figées, rabais, dette, nouveau client', () => {
    let n = 0;
    const uuid = () => 'id' + (++n);
    const lines = cartLines([{ pid: 'p1', qty: 2 }, { pid: 'p2', qty: 1 }], byId); // 11 000
    const sale = buildSale({ lines, total: 11000, finalTotal: 10000, credit: true, name: 'Kahindo', phone: '0812',
      customers: [], shopId: 's1', fid: 42, now: 1000, uuid });
    eq(sale.order.total, 10000);
    eq(sale.order.discount, 1000);
    eq(sale.order.status, 'CREDIT');
    eq(sale.order.fid, 42);
    eq(sale.order._provisional, true);
    eq(sale.items.length, 2);
    eq(sale.items[0].price, 2500);
    eq(sale.items[0].coast, 2000);
    eq(sale.items[0].name, 'Sucre');
    eq(sale.items[0].oid, sale.order.id);
    eq(sale.dept.amount, 10000);
    eq(sale.dept.order_id, sale.order.id);
    eq(sale.newCustomer.name, 'Kahindo');
    eq(sale.order.customer_id, sale.newCustomer.id);
  });

  test('vente : Client Divers comptant, client existant réutilisé', () => {
    let n = 0;
    const uuid = () => 'id' + (++n);
    const lines = cartLines([{ pid: 'p1', qty: 1 }], byId);
    const walkIn = buildSale({ lines, total: 2500, finalTotal: 2500, credit: false, name: '', phone: '',
      customers: [], shopId: 's1', fid: 1, now: 1, uuid });
    eq(walkIn.order.customer, WALK_IN);
    eq(walkIn.dept, null);
    eq(walkIn.newCustomer, null);
    eq(walkIn.order.discount, 0);
    const known = buildSale({ lines, total: 2500, finalTotal: 2500, credit: false, name: 'kahindo ', phone: '',
      customers: [{ id: 'c9', name: 'Kahindo', phone: '0999' }], shopId: 's1', fid: 2, now: 1, uuid });
    eq(known.newCustomer, null);
    eq(known.order.customer_id, 'c9');
  });

  test('stock : un seul décrément, jamais négatif (section 9, point 1)', () => {
    eq(stockAfterSale(10, 2), 8);
    eq(stockAfterSale(1, 3), 0);
    eq(stockAfterSale('5', 1), 4);
  });

  test('facture : lignes figées, repli sur le produit, texte partagé', () => {
    const lines = invoiceLines([
      { pid: 'p1', qty: 2, price: 2400, name: 'Sucre 1 kg' },
      { pid: 'p2', qty: 1, price: 0, name: '' },
    ], byId);
    eq(lines[0].name, 'Sucre 1 kg');
    eq(lines[0].total, 4800);
    eq(lines[1].name, 'Huile');
    eq(lines[1].unitPrice, 6000);
    setCurrency('FC');
    const text = invoiceText({ shop: { name: 'Boutique' }, order: { fid: 7, created: 0, customer: 'Ali', total: 10000, discount: 800 }, lines });
    ok(text.includes('FACTURE N° 7'), 'numéro');
    ok(text.includes('Rabais : 800 FC'), 'rabais');
    ok(text.includes('TOTAL À PAYER : 10 000 FC'), 'total');
    eq(invoiceNumber({ fid: 3, _provisional: true }), '3 (provisoire)');
    eq(stripAccents('Électronique à crédit'), 'Electronique a credit');
  });

  test('synchro : la ligne locale en attente n\'est jamais écrasée (PRD 7.4)', () => {
    eq(shouldApplyRemote(null, { updated: 1 }), true);
    eq(shouldApplyRemote({ _sync: 1, updated: 1 }, { updated: 99 }), false);
    eq(shouldApplyRemote({ _sync: 2, updated: 1 }, { updated: 99 }), false);
    eq(shouldApplyRemote({ _sync: 3, updated: 1 }, { updated: 99 }), false);
    eq(shouldApplyRemote({ _sync: 0, updated: 5 }, { updated: 9 }), true);
    eq(shouldApplyRemote({ _sync: 0, updated: 9 }, { updated: 5 }), false);
    const row = fromRemote({ id: 'u', password: 'x', admin: 'y', activeSessionToken: 't', name: 'A' });
    eq('password' in row || 'admin' in row || 'activeSessionToken' in row, false);
    eq(row._sync, 0);
  });

  test('synchro : erreurs passagères ou refusées', () => {
    eq(isTransient(new ApiError('réseau', 0)), true);
    eq(isTransient(new ApiError('serveur', 503)), true);
    eq(isTransient(new ApiError('refusé', 400)), false);
    eq(isTransient(new ApiError('interdit', 403)), false);
    eq(isTransient(new TypeError('x')), true);
  });

  test('colonnes absentes : détection PGRST204 et nettoyage', () => {
    const err = new ApiError('Could not find the \'currentUserRole\' column of \'shops\' in the schema cache', 400, { code: 'PGRST204' });
    eq(missingColumnOf(err), 'currentUserRole');
    eq(missingColumnOf(new ApiError('x', 400, { code: '23505' })), null);
    const row = cleanRow({ id: 1, a: 2, _sync: 1, _provisional: true, b: undefined, c: 3 }, ['c']);
    eq(JSON.stringify(row), '{"id":1,"a":2}');
  });

  test('accueil : filtre catégorie + recherche sans accents', () => {
    const list = [P1, P2, { id: 'p3', name: 'Téléphone', category: 'Électronique' }];
    eq(filterProducts(list, { query: 'tele' }).length, 1);
    eq(filterProducts(list, { query: 'ELECTRO' }).length, 1);
    eq(filterProducts(list, { category: 'Alimentation' }).length, 2);
    eq(filterProducts(list, { category: 'Alimentation', query: 'huile' }).length, 1);
    eq(categoriesOf(list).join(','), 'Alimentation,Électronique');
  });

  test('ventes : tri et recherche par N° ou client', () => {
    const orders = [{ id: 'a', fid: 1, created: 10, customer: 'Ali' }, { id: 'b', fid: 2, created: 30, customer: 'Béatrice' },
      { id: 'c', fid: 3, created: 30, customer: 'Client Divers' }];
    eq(sortOrders(orders).map((o) => o.id).join(''), 'cba');
    eq(searchOrders(orders, '2')[0].id, 'b');
    eq(searchOrders(orders, 'N° 3')[0].id, 'c');
    eq(searchOrders(orders, 'beatrice')[0].id, 'b');
  });

  test('formulaire produit : montants entiers, stock décimal', () => {
    eq(parseAmount('12 500'), 12500);
    eq(parseAmount('12,5'), null);
    eq(parseAmount('-3'), null);
    eq(parseStock('1,5'), 1.5);
    eq(parseStock('abc'), null);
  });
}

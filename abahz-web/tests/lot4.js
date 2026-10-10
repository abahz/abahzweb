// Tests du lot 4 : périodes, indicateurs, synchronisation, fournisseur.

import { setCurrency } from '../js/core/format.js';
import { inPeriod, periodLabel, buildReport, pct, parseDay } from '../js/services/stats.js';
import { touchedBy } from '../js/core/sync.js';
import { describeOp } from '../js/views/sync.js';
import { supplierMessage } from '../js/views/supplier.js';

/** @param {(name: string, fn: Function) => void} test @param {(a: any, b: any) => void} eq */
export function lot4(test, eq) {
  setCurrency('FC');
  const now = new Date(2026, 9, 8, 15, 0).getTime(); // jeudi 8 octobre 2026
  const at = (y, m, d, hh = 10) => new Date(y, m, d, hh).getTime();

  test('périodes : jour, semaine (lundi → dimanche), mois, année, tout', () => {
    eq(inPeriod(at(2026, 9, 8, 0), 'day', '', now), true);
    eq(inPeriod(at(2026, 9, 7, 23), 'day', '', now), false);
    eq(inPeriod(at(2026, 9, 5, 0), 'week', '', now), true);   // lundi
    eq(inPeriod(at(2026, 9, 11, 23), 'week', '', now), true); // dimanche
    eq(inPeriod(at(2026, 9, 4, 23), 'week', '', now), false); // dimanche précédent
    eq(inPeriod(at(2026, 9, 1), 'month', '', now), true);
    eq(inPeriod(at(2025, 9, 8), 'month', '', now), false);
    eq(inPeriod(at(2026, 0, 1), 'year', '', now), true);
    eq(inPeriod(0, 'year', '', now), false);
    eq(inPeriod(0, 'all', '', now), true);
  });

  test('périodes : jour choisi', () => {
    eq(parseDay('2026-10-06'), at(2026, 9, 6, 0));
    eq(inPeriod(at(2026, 9, 6, 18), 'custom', '2026-10-06', now), true);
    eq(inPeriod(at(2026, 9, 7, 1), 'custom', '2026-10-06', now), false);
    eq(inPeriod(at(2026, 9, 7, 1), 'custom', '', now), true); // pas encore de date : tout
  });

  test('libellés des périodes, comme le rapport Android', () => {
    eq(periodLabel('day', '', now)[0], 'Journée du 08/10/2026');
    eq(periodLabel('week', '', now)[0], 'Semaine du 05/10/2026 au 11/10/2026');
    eq(periodLabel('month', '', now)[0], 'Mois d\'octobre 2026');
    eq(periodLabel('month', '', at(2026, 2, 3))[0], 'Mois de mars 2026');
    eq(periodLabel('year', '', now)[1], 'l\'année 2026');
    eq(periodLabel('custom', '2026-10-06', now)[0], 'Journée du 06/10/2026');
    eq(periodLabel('all', '', now)[0], 'Ensemble de l\'activité');
  });

  const products = [
    { id: 'p1', name: 'Sucre', unity: 'Kg', price: 3000, coast: 2000, qty: 10 },
    { id: 'p2', name: 'Huile', unity: 'L', price: 6000, coast: 5000, qty: 2 },
    { id: 'p3', name: 'Savon', unity: 'Pièce', price: 1500, coast: 1000, qty: 0 },
  ];
  const orders = [
    { id: 'o1', fid: 1, total: 12000, created: at(2026, 9, 8) },
    { id: 'o2', fid: 2, total: 6000, created: at(2026, 9, 2) },
    { id: 'o3', fid: 3, total: 50000, created: at(2026, 8, 30) }, // septembre : hors du mois
  ];
  const items = [
    { oid: 'o1', pid: 'p1', qty: 2, price: 3000, coast: 2000 },
    { oid: 'o1', pid: 'p2', qty: 1, price: 6000, coast: 5500 }, // prix d'achat figé ≠ produit actuel
    { oid: 'o2', pid: 'p1', qty: 2 },                           // vente Android : sans prix figé
    { oid: 'o3', pid: 'p2', qty: 8, price: 6000, coast: 5000 },
  ];
  const expenses = [{ price: 4000, created: at(2026, 9, 3) }, { price: 9000, created: at(2026, 8, 3) }];
  const depts = [{ amount: 6000, created: at(2026, 9, 2) }];

  test('indicateurs du mois = calcul manuel', () => {
    const r = buildReport({ products, orders, items, expenses, depts, period: 'month', day: '', now });
    eq(r.totalSales, 18000);
    eq(r.salesCount, 2);
    eq(r.averageBasket, 9000);
    eq(r.totalExpenses, 4000);
    eq(r.totalDepts, 6000);
    eq(r.netProfit, 14000);
    eq(pct(r.margin), '77,8 %');
    eq(r.stockValue, 3000 * 10 + 6000 * 2);
    eq(r.purchaseValue, 2000 * 10 + 5000 * 2);
    eq(r.lowStock.map((p) => p.id).join(','), 'p3,p2');
    eq(r.topByQty[0].id, 'p1');
    eq(r.topByQty[0].qty, 4);
    eq(r.topByQty[0].margin, 4000);            // 2×1000 figé + 2×1000 produit
    eq(r.topByMargin.map((x) => `${x.id}:${x.margin}`).join(','), 'p1:4000,p2:500');
  });

  test('indicateurs : période vide, marge nulle, déficit', () => {
    const r = buildReport({ products: [], orders, items, expenses, depts, period: 'custom', day: '2026-10-04', now });
    eq(r.salesCount, 0); eq(r.averageBasket, 0); eq(r.margin, 0); eq(pct(-12.345), '-12,3 %');
    const all = buildReport({ products, orders, items, expenses, depts, period: 'all', day: '', now });
    eq(all.totalSales, 68000); eq(all.totalExpenses, 13000);
  });

  test('synchro : libellés et lignes touchées par une opération', () => {
    const sale = { op: 'rpc', fn: 'create_order', id: 'o9', table: 'orders',
      payload: { p_order: { fid: 4, total: 12500 }, p_items: [{ id: 'i1', pid: 'p1' }], p_dept: { id: 'd1' } } };
    eq(describeOp(sale), 'Vente N° 4 — 12 500 FC');
    eq(touchedBy(sale).map((x) => x.join(':')).join(','), 'orders:o9,orderitem:i1,products:p1,dept:d1');
    const pay = { op: 'rpc', fn: 'pay_dept', id: 'd1', table: 'dept', payload: { p_payment: { id: 'pp', amount: 5000 } } };
    eq(describeOp(pay), 'Remboursement de dette — 5 000 FC');
    eq(touchedBy(pay).map((x) => x.join(':')).join(','), 'dept_payment:pp,dept:d1');
    eq(describeOp({ op: 'upsert', table: 'customer', id: 'c', payload: { name: 'Ali' } }), 'Client : Ali');
    eq(describeOp({ op: 'delete', table: 'expenses', id: 'e' }), 'Suppression : dépense');
    eq(touchedBy({ op: 'image', table: 'products', id: 'p1' }).length, 2);
  });

  test('fournisseur : message prérempli comme l\'app', () => {
    eq(supplierMessage({ name: 'Chez Abi', address: ' ' }, { name: 'Kahindo' }),
      'Bonjour,\nJe suis grossiste et souhaite vendre sur Abahz et devenir fournisseur pour plusieurs boutiques.\n\n'
      + '- Nom de la boutique : Chez Abi\n- Adresse : Adresse non renseignée\n- Nom du responsable : Kahindo');
  });
}

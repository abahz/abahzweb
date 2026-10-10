// Rapport exécutif A4 (DSH-07), même plan que ShopReport (Android). Imprimé par window.print() :
// « Enregistrer en PDF » dans la fenêtre d'impression du navigateur.

import { h } from '../core/dom.js';
import { fc, qty, date, dateTime } from '../core/format.js';
import { periodLabel, pct } from './stats.js';

const BLANK = '………………';
const or = (v, d = BLANK) => (v && String(v).trim()) || d;
const s = (n, word) => (Math.abs(n) >= 2 ? `${word}s` : word);
const num = (n) => qty(Math.round(Number(n) || 0));

function table(head, rows, totals, right = []) {
  const cell = (tag) => (v, i) => h(tag, { class: right.includes(i) ? 'r' : '' }, v);
  return h('table', {},
    h('thead', {}, h('tr', {}, head.map(cell('th')))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map(cell('td'))))),
    totals && h('tfoot', {}, h('tr', {}, totals.map(cell('th')))));
}

/** Construit le document du rapport. */
export function reportSheet(r, { shop, role, period, day, now = Date.now() }) {
  const [label, phrase] = periodLabel(period, day, now);
  const name = or(shop?.name, 'Boutique ABAHZ');
  const cur = shop?.devise || 'FC';
  let n = 0;
  const art = (title) => h('h3', {}, `Article ${++n} — ${title}`);
  const p = (...parts) => h('p', {}, ...parts);
  const b = (t) => h('strong', {}, t);
  const list = (items) => h('ul', {}, items.map((x) => h('li', {}, ...x)));

  return h('article', { class: 'report' },
    h('p', { class: 'c' }, b('RÉPUBLIQUE DÉMOCRATIQUE DU CONGO')),
    h('h2', { class: 'c' }, 'RAPPORT D\'ACTIVITÉ ET DE GESTION'),
    h('p', { class: 'c' }, `${name} — ${label}`),
    h('h4', {}, 'IDENTIFICATION DE L\'ÉTABLISSEMENT'),
    p(b('L\'Établissement : '), `${name}, ${or(shop?.category, 'commerce général').toLowerCase()}, sis à ${or(shop?.address)}, `
      + `RCCM n° ${or(shop?.rccm)}, Id. Nat. n° ${or(shop?.idNat)}, ci-après « l'Établissement » ;`),
    p(b('Le Propriétaire : '), `${or(shop?.owner)} ;`),
    p(b('Le Rédacteur : '), `utilisateur au rôle ${role || 'ADMIN'}, rapport édité le ${date(now)} à ${dateTime(now).slice(11)} au moyen de l'application ABAHZ.`),
    h('h4', {}, 'IL EST RENDU COMPTE DE CE QUI SUIT :'),

    art('Objet'),
    p(`Le présent rapport rend compte de l'activité commerciale et de la situation financière de l'Établissement pour ${phrase}. `
      + `Il porte sur les ventes, les dépenses, l'état du stock et les créances clients. Tous les montants sont exprimés en ${cur}.`),

    art('Ventes et chiffre d\'affaires'),
    r.salesCount
      ? p('Sur la période, l\'Établissement a réalisé ', b(`${r.salesCount} ${s(r.salesCount, 'vente')}`), ' pour un chiffre d\'affaires de ',
        b(fc(r.totalSales)), ', soit un panier moyen de ', b(fc(r.averageBasket)), '.')
      : p('Aucune vente n\'a été enregistrée sur la période.'),

    art('Dépenses et résultat net'),
    p('Les dépenses d\'exploitation s\'élèvent à ', b(fc(r.totalExpenses)), '. Le résultat net, égal aux recettes diminuées des dépenses, est de ',
      b(fc(r.netProfit)), ', soit une marge nette de ', b(pct(r.margin)), '.'),
    r.netProfit >= 0
      ? p('L\'activité est jugée ', b('viable'), ' sur la période : les recettes couvrent l\'ensemble des dépenses enregistrées.')
      : p('L\'activité est jugée ', b('déficitaire'), ' sur la période : les dépenses dépassent les recettes. '
        + 'Il est recommandé de réduire les charges ou d\'augmenter le volume des ventes.'),
    table(['Indicateur', 'Montant'], [
      ['Recettes (chiffre d\'affaires)', fc(r.totalSales)], ['Dépenses d\'exploitation', fc(r.totalExpenses)],
      ['Créances clients de la période', fc(r.totalDepts)], ['Marge nette', pct(r.margin)]],
    ['Résultat net', fc(r.netProfit)], [1]),

    art('Produits les plus vendus'),
    r.topByQty.length
      ? [p('Les produits les plus vendus sur la période sont :'),
        list(r.topByQty.map((x) => [b(x.name), ` : ${num(x.qty)} ${x.unity || s(x.qty, 'unité')} ${s(x.qty, 'vendu')}, marge brute de ${fc(x.margin)}`])),
        p('Les produits ayant dégagé la plus forte marge brute sont :'),
        list(r.topByMargin.map((x) => [b(x.name), ` : ${fc(x.margin)}`]))]
      : p('Aucun produit n\'a été vendu sur la période.'),

    art('État du stock'),
    r.products.length
      ? [p('Le stock compte ', b(`${r.products.length} ${s(r.products.length, 'référence')}`), ' pour un total de ',
        b(`${num(r.stockQty)} ${s(r.stockQty, 'article')}`), '. Il est valorisé à ', b(fc(r.purchaseValue)), ' au prix d\'achat et à ',
        b(fc(r.stockValue)), ' au prix de vente, soit une marge potentielle de ', b(fc(r.stockValue - r.purchaseValue)), '.'),
      r.lowStock.length
        ? [p('Les articles suivants sont en rupture ou à un niveau critique (deux unités ou moins) et doivent être réapprovisionnés :'),
          list(r.lowStock.map((x) => [b(x.name), ` : ${num(x.qty)} ${x.unity || ''} en stock — ${Number(x.qty) <= 0 ? 'rupture' : 'niveau critique'}`]))]
        : p('Aucun article n\'est en rupture ni à un niveau critique.'),
      art('Inventaire détaillé'),
      p(`L'inventaire ci-dessous est arrêté à la date d'édition du rapport ; les valeurs sont exprimées en ${cur}.`),
      table(['Produit', 'Unité', 'Qté', 'P. achat', 'P. vente', 'Val. achat', 'Val. vente'],
        [...r.products].sort((a, b2) => String(a.name).localeCompare(String(b2.name), 'fr')).map((x) => [x.name, x.unity || '', num(x.qty),
          num(x.coast), num(x.price), num(x.coast * x.qty), num(x.price * x.qty)]),
        ['TOTAL', '', num(r.stockQty), '', '', num(r.purchaseValue), num(r.stockValue)], [2, 3, 4, 5, 6])]
      : p('Aucun produit n\'est enregistré dans le stock.'),

    art('Détail des ventes'),
    r.orders.length
      ? [p('Le tableau ci-dessous reprend les ventes de la période, de la plus récente à la plus ancienne :'),
        table(['N°', 'Date', 'Client', `Total (${cur})`],
          [...r.orders].sort((a, b2) => b2.created - a.created).map((o) => [`#${o.fid}`, dateTime(o.created), or(o.customer, 'Client comptoir'), num(o.total)]),
          ['TOTAL', '', `${r.salesCount} ${s(r.salesCount, 'vente')}`, num(r.totalSales)], [3])]
      : p('Aucune vente n\'est à détailler sur la période.'),

    art('Détail des dépenses'),
    r.expenses.length
      ? [p('Les dépenses de la période se répartissent comme suit :'),
        table(['Date', 'Motif', 'Note / description', `Montant (${cur})`],
          [...r.expenses].sort((a, b2) => b2.created - a.created).map((x) => [date(x.created), x.name, or(x.note, '—'), num(x.price)]),
          ['TOTAL', '', '', num(r.totalExpenses)], [3])]
      : p('Aucune dépense n\'a été enregistrée sur la période.'),

    art('Créances clients'),
    r.depts.length
      ? [p('Les crédits accordés aux clients sur la période totalisent ', b(fc(r.totalDepts)), ', répartis sur ',
        b(`${r.depts.length} ${s(r.depts.length, 'dossier')}`), ' :'),
      table(['Date', 'Client / débiteur', 'Téléphone', `Montant (${cur})`],
        r.depts.map((d) => [date(d.created), d.name, or(d.phone, '—'), num(d.amount)]), ['TOTAL', '', '', num(r.totalDepts)], [3])]
      : p('Aucune créance client n\'a été enregistrée sur la période.'),

    art('Dispositions finales'),
    p(`Le résultat net présenté à l'article 3 ne déduit pas le coût d'achat des marchandises vendues ; il ne constitue pas un bilan comptable. `
      + 'Le présent rapport est établi à partir des données enregistrées dans l\'application ABAHZ. '
      + 'Il est confidentiel et destiné à la direction de l\'Établissement.'),
    p(`Fait à ${BLANK}, le ${date(now)}`),
    h('div', { class: 'signs' },
      h('div', {}, b('LE GÉRANT'), h('br'), 'Nom : ……………………………', h('br'), h('small', {}, '(nom et signature)')),
      h('div', {}, b('LE PROPRIÉTAIRE'), h('br'), or(shop?.owner, 'Nom : ……………………………'), h('br'),
        h('small', {}, '(« lu et approuvé », signature et cachet)'))));
}

/** Imprime un nœud seul (facture ou rapport) au format demandé ; `page` : règle @page propre à ce document. */
export function printNode(node, paper = 'A4', page = '') {
  const area = h('div', { class: `print-area paper-${paper}` }, node);
  document.body.append(area);
  // CSP « style-src 'self' » : pas de <style> en ligne ; la règle passe par le CSSOM de print.css.
  const sheet = page && [...document.styleSheets].find((x) => /print\.css$/.test(x.href || ''));
  const at = sheet ? sheet.insertRule(`@page { ${page} }`, sheet.cssRules.length) : -1;
  const done = () => {
    area.remove();
    removeEventListener('afterprint', done);
    if (at >= 0 && sheet.cssRules[at]) { sheet.deleteRule(at); }
  };
  addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 60_000); // navigateurs sans « afterprint »
}

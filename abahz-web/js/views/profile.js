// #/profil — ProfileScreen (Android) : carte boutique, raccourcis, alertes stock et tableau de bord
// (DSH-01 à DSH-09). Les chiffres financiers sont réservés à l'ADMIN (PRD §11).

import { h } from '../core/dom.js';
import { store } from '../core/store.js';
import { productsRepo, ordersRepo, orderItemsRepo, expensesRepo, deptsRepo } from '../core/repo.js';
import { fc, qty as fmtQty } from '../core/format.js';
import { PERIODS, buildReport, periodLabel, pct } from '../services/stats.js';
import { icon, iconBadge } from '../ui/icons.js';
import { chip, pill } from '../ui/components.js';
import { logout } from '../ui/logout.js';
import { toast } from '../ui/toast.js';

const ROLE_LABEL = { ADMIN: 'Administrateur', CASHIER: 'Caissier' };
const LOW_SHOWN = 3;

/** Raccourcis « Pilotage & Gestion Rapide », dans l'ordre d'Android ; admin = réservé à l'ADMIN (PRD §2). */
const QUICK = [
  { label: 'Personnel', icon: 'group', path: '/personnel', admin: true },
  { label: 'Catégories', icon: 'category', path: '/categories', admin: true },
  { label: 'Clients', icon: 'people', path: '/clients' },
  { label: 'Dettes', icon: 'money_off', path: '/dettes' },
  { label: 'Dépense', icon: 'receipt', expense: true, admin: true },
  { label: 'Unités', icon: 'scale', path: '/unites', admin: true },
  { label: 'Synchro', icon: 'sync', path: '/sync' },
  { label: 'Paramètres', icon: 'settings', path: '/parametres' },
  { label: 'Aide', icon: 'help', path: '/aide' },
  { label: 'À propos', icon: 'info', path: '/a-propos' },
];

// Période choisie, gardée le temps de la session (Mois par défaut, comme l'app).
let period = 'month';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let day = today();

const orNA = (v, fallback) => (v && String(v).trim()) || fallback;
/** Barre de la jauge ; largeur par le CSSOM (CSP sans styles en ligne). */
function gaugeBar(ratio) {
  const bar = h('span');
  bar.style.width = `${Math.min(100, ratio * 100).toFixed(1)}%`;
  return bar;
}
const row = (label, value, cls = '') => h('div', { class: `info-row ${cls}` }, h('span', {}, label), h('strong', {}, value));

async function addExpense() {
  const { expenseDialog } = await import('./expenses.js');
  if (await expenseDialog()) toast('Dépense enregistrée avec succès !');
}

export async function render(root) {
  const { user, shop } = store.get('session');
  const isAdmin = user.role === 'ADMIN';
  let data = null;

  const hero = h('section', { class: 'shop-hero' },
    h('div', { class: 'row' },
      iconBadge('storefront', 'round'),
      h('div', {},
        h('h1', { class: 't-title-lg' }, shop?.name || 'Boutique Abahz'),
        h('div', { class: 'pills' },
          h('span', { class: 'pill-tag' }, ROLE_LABEL[user.role] || user.role),
          h('span', { class: 'pill-tag' }, orNA(shop?.category, 'Général'))))),
    h('div', {},
      h('p', { class: 'info' }, icon('place'), orNA(shop?.address, 'Adresse non renseignée')),
      h('p', { class: 'info' }, icon('badge'),
        `RCCM ${orNA(shop?.rccm, 'N/A')} • ID Nat ${orNA(shop?.idNat, 'N/A')}`),
      h('p', { class: 'info' }, icon('person'), [user.name, user.email].filter(Boolean).join(' · '))));

  const quick = h('section', { class: 'hide-lg' }, // PC : ces liens sont dans la barre latérale
    h('h2', { class: 'section-title' }, 'Pilotage & Gestion Rapide'),
    h('nav', { class: 'quick', 'aria-label': 'Gestion' },
      QUICK.filter((q) => isAdmin || !q.admin).map((q) => (q.expense
        ? h('a', { href: '#/profil', onclick: (e) => { e.preventDefault(); addExpense(); } }, iconBadge(q.icon, 'round sm'), q.label)
        : h('a', { href: '#' + q.path }, iconBadge(q.icon, 'round sm'), q.label)))));

  const alerts = h('section', { class: 'stock-alert' });
  const board = h('div', { class: 'board' });
  root.replaceChildren(h('div', { class: 'page' },
    hero, quick, alerts, board,
    h('button', { type: 'button', class: 'btn btn-lg logout hide-lg', onclick: logout }, icon('logout'), 'Déconnexion')));

  // « Alertes stock » (DSH-03) : visible par tous, comme dans l'app.
  function paintAlerts() {
    const low = data.lowStock;
    alerts.hidden = !low.length;
    if (!low.length) return;
    alerts.replaceChildren(
      h('div', { class: 'row' }, iconBadge('warning', 'alert-badge'),
        h('div', {}, h('p', { class: 't-title-sm' }, 'Alertes stock'),
          h('p', { class: 't-body-sm' }, `${low.length} article(s) en rupture ou critique`))),
      ...low.slice(0, LOW_SHOWN).map((p) => row(p.name, `${fmtQty(Number(p.qty) || 0)} ${p.unity || ''}`.trim())),
      low.length > LOW_SHOWN ? h('a', { href: '#/accueil', class: 'see-all' }, `… et ${low.length - LOW_SHOWN} autres. Voir le stock complet`) : '');
  }

  function kpi(title, value, sub, iconName, cls, path) {
    return h('a', { class: `kpi ${cls}`, href: '#' + path },
      h('span', { class: 'kpi-head' }, h('span', {}, title), icon(iconName)),
      h('strong', {}, value), h('span', { class: 'muted t-body-sm' }, sub));
  }

  function paintBoard() {
    const r = data;
    const [label] = periodLabel(period, day);
    const short = PERIODS.find(([k]) => k === period)[1];
    const viable = r.netProfit >= 0;
    const dayInput = h('input', { type: 'date', class: 'list-search', value: day, max: today(), 'aria-label': 'Choisir un jour',
      onchange: (e) => { if (e.target.value) { day = e.target.value; load(); } } });

    board.replaceChildren(
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Business Intelligence'),
        h('span', { class: 'muted t-body-sm' }, period === 'custom' ? label : 'Filtre temporel')),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Période' },
        PERIODS.map(([k, l]) => chip(l, k === period, () => { period = k; load(); }))),
      period === 'custom' ? dayInput : '',
      h('div', { class: 'kpis' },
        kpi('Chiffre d\'affaires', fc(r.totalSales), `${r.salesCount} ventes • Panier ${fc(r.averageBasket)}`, 'chart', 'k-success', '/ventes'),
        kpi('Valeur du stock', fc(r.stockValue), `${r.products.length} produits`, 'inventory', 'k-primary', '/accueil'),
        kpi('Dépenses', fc(r.totalExpenses), 'Frais opérationnels', 'receipt', 'k-error', '/depenses'),
        kpi('Dettes clients', fc(r.totalDepts), 'Crédits accordés', 'money_off', 'k-warning', '/dettes')),
      h('section', { class: 'card viability' },
        h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Viabilité & rentabilité'),
          pill(viable ? 'VIABLE' : 'DÉFICITAIRE', viable ? 'success' : 'error')),
        r.totalSales > 0 && h('div', { class: `gauge${viable ? '' : ' bad'}` },
          gaugeBar(r.totalExpenses / r.totalSales)),
        row('Recettes totales', fc(r.totalSales)),
        row('Dépenses d\'exploitation', fc(r.totalExpenses)),
        row(`Résultat net (${short})`, fc(r.netProfit)),
        row('Marge bénéficiaire nette', pct(r.margin)),
        h('p', { class: 'muted t-body-sm' }, viable
          ? `Activité saine et rentable sur la période (${short}) : le résultat net est positif.`
          : `Attention : activité déficitaire sur la période (${short}), les dépenses dépassent les recettes.`)),
      h('h2', { class: 'section-title' }, 'Rapports'),
      h('button', { type: 'button', class: 'btn btn-lg', onclick: printReport }, icon('print'), 'Rapport BI PDF'),
      h('p', { class: 'muted t-body-sm' }, `${label} — rapport exécutif A4. Dans la fenêtre d'impression, choisissez « Enregistrer en PDF ».`));
  }

  async function printReport() {
    const { reportSheet, printNode } = await import('../services/report.js');
    printNode(reportSheet(data, { shop, role: user.role, period, day }), 'A4', 'size: A4; margin: 15mm;');
  }

  async function load() {
    const [products, orders, items, expenses, depts] = await Promise.all(isAdmin
      ? [productsRepo.all(), ordersRepo.all(), orderItemsRepo.all(), expensesRepo.all(), deptsRepo.all()]
      : [productsRepo.all(), [], [], [], []]);
    const threshold = store.get('config').lowStockThreshold ?? 2;
    data = buildReport({ products, orders, items, expenses, depts, period, day, threshold });
    paintAlerts();
    if (isAdmin) paintBoard();
  }

  const offs = ['products', 'orders', 'orderitem', 'expenses', 'dept'].map((t) => store.subscribe(t, load));
  await load();
  return () => offs.forEach((off) => off());
}

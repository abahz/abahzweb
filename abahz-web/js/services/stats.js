// Indicateurs du tableau de bord et du rapport (DSH-04 à DSH-08), calqués sur ReportPeriod,
// ReportData et ShopReport (Android). Fonctions pures, testées.

import { date } from '../core/format.js';

export const PERIODS = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année'], ['all', 'Tout'], ['custom', 'Choisir…']];

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d; };

/** Lundi 0 h de la semaine de `ms` (semaine française, comme le Calendar d'Android en fr). */
function weekStart(ms) {
  const d = startOfDay(ms);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** « 2026-10-06 » (champ date) → horodatage local à 0 h, ou null. */
export function parseDay(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null;
}

/** L'horodatage tombe-t-il dans la période ? (ReportPeriod.contains) */
export function inPeriod(ts, period, day, now = Date.now()) {
  if (period === 'all') return true;
  const t = Number(ts);
  if (!(t > 0)) return false;
  const a = new Date(t);
  const b = new Date(now);
  switch (period) {
    case 'day': return startOfDay(t).getTime() === startOfDay(now).getTime();
    case 'week': return weekStart(t).getTime() === weekStart(now).getTime();
    case 'month': return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
    case 'year': return a.getFullYear() === b.getFullYear();
    case 'custom': {
      const d = parseDay(day);
      return d == null || startOfDay(t).getTime() === d;
    }
    default: return true;
  }
}

/** [libellé court, groupe nominal] de la période, comme describePeriod (ShopReport). */
export function periodLabel(period, day, now = Date.now()) {
  const n = new Date(now);
  switch (period) {
    case 'day': return [`Journée du ${date(now)}`, `la journée du ${date(now)}`];
    case 'week': {
      const s = weekStart(now);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      const txt = `semaine du ${date(s)} au ${date(e)}`;
      return [`S${txt.slice(1)}`, `la ${txt}`];
    }
    case 'month': {
      const m = `${MONTHS[n.getMonth()]} ${n.getFullYear()}`;
      const of = /^[aeiouyéèh]/.test(m) ? 'd\'' : 'de ';
      return [`Mois ${of}${m}`, `le mois ${of}${m}`];
    }
    case 'year': return [`Année ${n.getFullYear()}`, `l'année ${n.getFullYear()}`];
    case 'custom': {
      const d = date(parseDay(day) ?? now);
      return [`Journée du ${d}`, `la journée du ${d}`];
    }
    default: return ['Ensemble de l\'activité', 'l\'ensemble de l\'activité enregistrée'];
  }
}

const sum = (rows, f) => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);

/**
 * Données de la période et indicateurs (ReportData.forPeriod + ShopReport).
 * Marge brute d'une ligne : prix et prix d'achat figés sur la vente, sinon ceux du produit actuel.
 */
export function buildReport({ products, orders, items, expenses, depts, period, day, now = Date.now(), threshold = 2 }) {
  const inP = (r) => inPeriod(r.created, period, day, now);
  const o = orders.filter(inP);
  const ids = new Set(o.map((x) => x.id));
  const it = items.filter((x) => ids.has(x.oid));
  const ex = expenses.filter(inP);
  const de = depts.filter(inP);

  const totalSales = sum(o, 'total');
  const totalExpenses = sum(ex, 'price');
  const netProfit = totalSales - totalExpenses;

  const byId = new Map(products.map((p) => [p.id, p]));
  const sold = new Map();
  for (const x of it) {
    const p = byId.get(x.pid);
    const q = Number(x.qty) || 0;
    const price = x.coast != null ? Number(x.price) || 0 : Number(p?.price) || 0;
    const coast = x.coast != null ? Number(x.coast) || 0 : Number(p?.coast) || 0;
    const cur = sold.get(x.pid) || { id: x.pid, name: p?.name || x.name || 'Article', unity: p?.unity || '', qty: 0, margin: 0 };
    cur.qty += q;
    cur.margin += (price - coast) * q;
    sold.set(x.pid, cur);
  }
  const top = (k) => [...sold.values()].sort((a, b) => b[k] - a[k]).slice(0, 5);

  return {
    orders: o, items: it, expenses: ex, depts: de, products,
    totalSales,
    salesCount: o.length,
    averageBasket: o.length ? Math.floor(totalSales / o.length) : 0,
    totalExpenses,
    totalDepts: sum(de, 'amount'),
    netProfit,
    margin: totalSales > 0 ? (netProfit / totalSales) * 100 : 0,
    stockQty: sum(products, 'qty'),
    stockValue: products.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.qty) || 0), 0),
    purchaseValue: products.reduce((s, p) => s + (Number(p.coast) || 0) * (Number(p.qty) || 0), 0),
    lowStock: products.filter((p) => (Number(p.qty) || 0) <= threshold).sort((a, b) => a.qty - b.qty),
    topByQty: top('qty'),
    topByMargin: top('margin'),
  };
}

/** « 12,5 % » comme String.format("%.1f %%") en français. */
export const pct = (v) => `${(Math.round(v * 10) / 10).toFixed(1).replace('.', ',')} %`;

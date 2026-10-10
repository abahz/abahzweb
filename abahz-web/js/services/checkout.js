// Vente et annulation (CRT-04 à CRT-08, ORD-06). Les règles sont des fonctions pures, testées ;
// `checkout` et `cancelSale` écrivent tout en UNE transaction IndexedDB : si une étape échoue, rien n'est écrit.

import { tx, req, SYNC } from '../core/db.js';
import { store } from '../core/store.js';
import { written, payloadOf } from '../core/repo.js';
import { fc } from '../core/format.js';

export const WALK_IN = 'Client Divers';

/** Lignes du panier avec leur produit ; un produit supprimé entre-temps n'est pas facturé (comme Android). */
export function cartLines(cart, productsById) {
  return cart
    .map((c) => ({ pid: c.pid, qty: Number(c.qty) || 0, product: productsById.get(c.pid) }))
    .filter((l) => l.product && l.qty > 0)
    .map((l) => ({ ...l, price: Number(l.product.price) || 0, total: (Number(l.product.price) || 0) * l.qty }));
}

export const cartTotal = (lines) => lines.reduce((s, l) => s + l.total, 0);

/** Montant final minimum autorisé : plafond de rabais pour le CASHIER (CRT-06). */
export function minFinalTotal(total, role, maxPct) {
  if (role === 'ADMIN') return 0;
  return Math.ceil(total * (1 - (Number(maxPct) || 0) / 100));
}

/**
 * Contrôle métier de la fenêtre « Validation de la commande ». Renvoie un message, ou null si tout va bien.
 * @param {{lines: any[], total: number, finalTotal: number, credit: boolean, name: string, phone: string, role: string, maxPct: number}} v
 */
export function validateCheckout({ lines, total, finalTotal, credit, name, phone, role, maxPct }) {
  if (!lines.length) return 'Votre panier est vide.';
  if (lines.some((l) => !Number.isInteger(l.qty))) {
    return 'Les quantités décimales ne sont pas encore prises en charge (l\'app Android les arrondirait).';
  }
  if (!Number.isFinite(finalTotal) || finalTotal < 0) return 'Montant final invalide.';
  const min = minFinalTotal(total, role, maxPct);
  if (finalTotal < min) return `Le rabais ne peut pas dépasser ${maxPct} % : montant final minimum ${fc(min)}.`;
  if (credit) {
    const n = String(name || '').trim();
    if (!n || n.toLowerCase() === WALK_IN.toLowerCase()) return 'Une vente à crédit exige le nom du client.';
    if (!String(phone || '').trim()) return 'Le téléphone du client est obligatoire pour une dette.';
  }
  return null;
}

/**
 * Construit les lignes de la vente. Fonction pure : `uuid` et `now` sont injectés pour les tests.
 * Prix d'achat (`coast`) et nom figés sur chaque ligne (section 9, point 7).
 */
export function buildSale({ lines, total, finalTotal, credit, name, phone, customers, shopId, fid, now, uuid }) {
  const clientName = String(name || '').trim() || WALK_IN;
  const isWalkIn = clientName.toLowerCase() === WALK_IN.toLowerCase();
  const known = isWalkIn ? null
    : customers.find((c) => String(c.name).trim().toLowerCase() === clientName.toLowerCase());
  const newCustomer = !isWalkIn && !known
    ? { id: uuid(), name: clientName, phone: String(phone || '').trim(), address: '', notes: 0, shopid: shopId, created: now, updated: now }
    : null;

  const order = {
    id: uuid(), fid, customer: clientName, customer_id: known?.id ?? newCustomer?.id ?? null,
    total: finalTotal, discount: Math.max(0, total - finalTotal), status: credit ? 'CREDIT' : 'PAID',
    shopid: shopId, created: now, updated: now, _provisional: true,
  };
  const items = lines.map((l) => ({
    id: uuid(), pid: l.pid, oid: order.id, qty: l.qty, price: l.price,
    coast: Number(l.product.coast) || 0, name: l.product.name || '',
    shopid: shopId, created: now, updated: now,
  }));
  const dept = credit
    ? { id: uuid(), fid, name: clientName, phone: String(phone || known?.phone || '').trim(), amount: finalTotal,
      order_id: order.id, shopid: shopId, created: now, updated: now }
    : null;
  return { order, items, dept, newCustomer };
}

/** Stock après la vente, jamais négatif (comme OrderRepository.saveOrder). */
export const stockAfterSale = (qty, sold) => Math.max(0, (Number(qty) || 0) - sold);

/**
 * Enregistre la vente localement, en une transaction, puis la met en file pour `create_order`.
 * Résout APRÈS l'écriture durable (NFR-05) avec la commande créée.
 */
export async function checkout({ lines, total, finalTotal, credit, name, phone }) {
  const shopId = store.shopId;
  const now = Date.now();
  const stores = ['orders', 'orderitem', 'products', 'dept', 'customer', 'cart', 'outbox'];
  const sale = await tx(stores, 'readwrite', async (s) => {
    const orders = await req(s.orders.getAll());
    const fid = orders.filter((o) => o.shopid === shopId).reduce((m, o) => Math.max(m, Number(o.fid) || 0), 0) + 1;
    const customers = (await req(s.customer.getAll())).filter((c) => c.shopid === shopId && c._sync !== SYNC.DELETED);
    const built = buildSale({ lines, total, finalTotal, credit, name, phone, customers, shopId, fid, now, uuid: () => crypto.randomUUID() });

    if (built.newCustomer) {
      s.customer.put({ ...built.newCustomer, _sync: SYNC.PENDING });
      s.outbox.add({ table: 'customer', op: 'upsert', id: built.newCustomer.id, payload: payloadOf(built.newCustomer), tries: 0 });
    }
    s.orders.put({ ...built.order, _sync: SYNC.PENDING });
    for (const it of built.items) s.orderitem.put({ ...it, _sync: SYNC.PENDING });
    if (built.dept) s.dept.put({ ...built.dept, _sync: SYNC.PENDING });

    // Un seul décrément de stock, local, pour l'affichage ; le serveur décrémente dans create_order.
    for (const it of built.items) {
      const p = await req(s.products.get(it.pid));
      if (p) s.products.put({ ...p, qty: stockAfterSale(p.qty, it.qty), _sync: SYNC.PENDING });
    }
    s.cart.clear();
    s.outbox.add({
      table: 'orders', op: 'rpc', fn: 'create_order', id: built.order.id, tries: 0,
      payload: {
        p_order: payloadOf(built.order),
        p_items: built.items.map(payloadOf),
        p_dept: built.dept ? payloadOf(built.dept) : null,
      },
    });
    return built;
  });
  store.set('cartCount', 0);
  written('orders', 'orderitem', 'products', 'dept', 'customer', 'cart');
  return sale.order;
}

/**
 * Annulation ADMIN (ORD-06), comme Android : stock restauré, dette liée, lignes et facture supprimées,
 * aucune dépense. Envoyée par `cancel_order`.
 */
export async function cancelSale(order) {
  const stores = ['orders', 'orderitem', 'products', 'dept', 'outbox'];
  await tx(stores, 'readwrite', async (s) => {
    const items = (await req(s.orderitem.getAll())).filter((i) => i.oid === order.id && i._sync !== SYNC.DELETED);
    const depts = (await req(s.dept.getAll()))
      .filter((d) => d.order_id === order.id || d.id === `dept_${order.id}`);
    const restored = [];
    for (const it of items) {
      const p = await req(s.products.get(it.pid));
      if (!p) continue;
      const next = { ...p, qty: (Number(p.qty) || 0) + Number(it.qty), updated: Date.now(), _sync: SYNC.PENDING };
      s.products.put(next);
      restored.push(payloadOf(next));
      s.orderitem.put({ ...it, _sync: SYNC.DELETED });
    }
    for (const d of depts) s.dept.put({ ...d, _sync: SYNC.DELETED });
    s.orders.put({ ...order, _sync: SYNC.DELETED });
    s.outbox.add({
      table: 'orders', op: 'rpc', fn: 'cancel_order', id: order.id, tries: 0,
      payload: { p_id: order.id },
      extra: { deptIds: depts.map((d) => d.id), products: restored, itemIds: items.map((i) => i.id) },
    });
  });
  written('orders', 'orderitem', 'products', 'dept');
}

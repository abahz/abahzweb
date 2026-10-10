// Dettes et remboursements (DPT-01 à DPT-04). Règles pures testées ; `payDept` écrit en une transaction
// et met le paiement en file pour `pay_dept` (repli Android tant que le lot 0 n'est pas appliqué).

import { tx, req, SYNC } from '../core/db.js';
import { store } from '../core/store.js';
import { written, payloadOf } from '../core/repo.js';
import { fc, phone as normPhone } from '../core/format.js';

export const UNKNOWN = 'Client Inconnu';

/**
 * Vente à l'origine d'une dette : `order_id`, puis l'id « dept_<vente> » d'Android, puis le N° de facture.
 * Fonction pure (testée).
 */
export function orderOfDept(dept, orders) {
  return orders.find((o) => o.id === dept.order_id)
    || orders.find((o) => `dept_${o.id}` === dept.id)
    || orders.find((o) => Number(o.fid) === Number(dept.fid) && o.shopid === dept.shopid)
    || null;
}

/** Montant de départ et déjà payé, comme DeptScreen. Fonction pure (testée). */
export function deptBalance(dept, order) {
  const amount = Number(dept.amount) || 0;
  const initial = order ? Math.max(Number(order.total) || 0, amount) : amount;
  return { initial, paid: Math.max(0, initial - amount), remaining: amount };
}

/**
 * Contrôle du « Remboursement de dette ». Renvoie un message, ou null. Fonction pure (testée).
 * Entiers uniquement : Android lit les chiffres seuls (« -500 » augmentait la dette).
 */
export function validatePayment(dept, amount) {
  if (!Number.isInteger(amount) || amount <= 0) return 'Saisissez un montant supérieur à 0.';
  const rest = Number(dept.amount) || 0;
  if (amount > rest) return `Le montant ne peut pas dépasser le reste à payer (${fc(rest)}).`;
  return null;
}

/** Moitié arrondie à l'unité inférieure, comme `dept.amount / 2` (Long) dans l'app. */
export const halfOf = (amount) => Math.floor((Number(amount) || 0) / 2);

/** Lien WhatsApp de relance (DPT-04), ou null sans numéro valide. Fonction pure (testée). */
export function reminderLink(dept, shopName) {
  const tel = normPhone(dept.phone);
  if (!tel) return null;
  const text = `Bonjour ${dept.name || ''}, il reste ${fc(dept.amount)} à payer pour la facture N° ${dept.fid}`
    + `${shopName ? ` chez ${shopName}` : ''}. Merci.`;
  return `https://wa.me/${tel.slice(1)}?text=${encodeURIComponent(text)}`;
}

/**
 * Enregistre un remboursement localement (paiement conservé, dette diminuée ou supprimée si soldée)
 * et le met en file. Renvoie le reste à payer.
 */
export async function payDept(dept, amount) {
  const msg = validatePayment(dept, amount);
  if (msg) throw new Error(msg);
  const now = Date.now();
  const payment = { id: crypto.randomUUID(), dept_id: dept.id, amount, shopid: dept.shopid || store.shopId, created: now, updated: now };
  const remaining = await tx(['dept', 'dept_payment', 'outbox'], 'readwrite', async (s) => {
    const cur = await req(s.dept.get(dept.id));
    if (!cur || cur._sync === SYNC.DELETED) throw new Error('Cette dette n\'existe plus.');
    const left = (Number(cur.amount) || 0) - amount;
    if (left < 0) throw new Error(validatePayment(cur, amount));
    s.dept_payment.put({ ...payment, _sync: SYNC.PENDING });
    const next = { ...cur, amount: left, updated: now };
    s.dept.put({ ...next, _sync: left === 0 ? SYNC.DELETED : SYNC.PENDING });
    s.outbox.add({
      table: 'dept', op: 'rpc', fn: 'pay_dept', id: dept.id, tries: 0,
      payload: { p_payment: payloadOf(payment) },
      extra: { dept: payloadOf(next) },
    });
    return left;
  });
  written('dept', 'dept_payment');
  return remaining;
}

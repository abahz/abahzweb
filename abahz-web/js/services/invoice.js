// Facture : lignes affichées et texte à partager (ORD-03, ORD-05). Fonctions pures, testées.

import { fc, qty as fmtQty, dateTime } from '../core/format.js';

/**
 * Lignes de facture, comme `invoiceLines` (Android) : nom et prix figés sur la ligne de vente,
 * sinon repli sur le produit actuel (anciennes ventes).
 */
export function invoiceLines(items, productsById) {
  return items.map((it) => {
    const product = productsById.get(it.pid);
    const frozen = it.name && String(it.name).trim();
    const name = frozen ? it.name : (product?.name || 'Article');
    const unitPrice = frozen ? Number(it.price) || 0 : Number(it.price || product?.price) || 0;
    const q = Number(it.qty) || 0;
    return { name, qty: q, unitPrice, total: unitPrice * q };
  });
}

/** Retire les accents (« Imprimer sans accents » d'Android, pour les imprimantes qui les lisent mal). */
export function stripAccents(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, '\'');
}

/** N° affiché : « 42 » ou « 42 (provisoire) » tant que le serveur ne l'a pas confirmé (PRD 7.5). */
export function invoiceNumber(order) {
  return order._provisional ? `${order.fid} (provisoire)` : String(order.fid);
}

/** Texte de la facture pour WhatsApp ou le partage natif. */
export function invoiceText({ shop, order, lines }) {
  const out = [];
  out.push(`*${shop?.name || 'Ma Boutique'}*`);
  if (shop?.address) out.push(shop.address);
  out.push('');
  out.push(`FACTURE N° ${invoiceNumber(order)}`);
  out.push(`Date : ${dateTime(order.created)}`);
  out.push(`Client : ${order.customer || 'Client Divers'}`);
  out.push('');
  for (const l of lines) out.push(`${l.name} × ${fmtQty(l.qty)} = ${fc(l.total)}`);
  const sum = lines.reduce((s, l) => s + l.total, 0);
  if (Number(order.discount) > 0 || sum !== Number(order.total)) {
    out.push('');
    out.push(`Sous-total : ${fc(sum)}`);
    out.push(`Rabais : ${fc(sum - Number(order.total))}`);
  }
  out.push('');
  out.push(`*TOTAL À PAYER : ${fc(order.total)}*`);
  out.push('Merci pour votre achat !');
  return out.join('\n');
}

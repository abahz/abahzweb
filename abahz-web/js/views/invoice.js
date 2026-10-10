// #/facture/:id — calqué sur InvoiceScreen (Android) (ORD-03 à ORD-06).

import { h } from '../core/dom.js';
import { store } from '../core/store.js';
import { SYNC } from '../core/db.js';
import { ordersRepo, orderItemsRepo, productsRepo } from '../core/repo.js';
import { fc, qty as fmtQty, dateTime } from '../core/format.js';
import { navigate } from '../core/router.js';
import { settings } from '../core/settings.js';
import { cancelSale } from '../services/checkout.js';
import { invoiceLines, invoiceText, invoiceNumber, stripAccents } from '../services/invoice.js';
import { setHeader } from '../ui/header.js';
import { icon } from '../ui/icons.js';
import { pill, confirmDelete } from '../ui/components.js';
import { toast } from '../ui/toast.js';

/** Imprime une copie de la facture au format choisi (58 mm, 80 mm ou A4), sans accents si demandé. */
async function printInvoice(sheet) {
  const { paper, stripAccents: plain } = settings();
  const copy = sheet.cloneNode(true);
  if (plain) {
    const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeValue = stripAccents(n.nodeValue);
  }
  (await import('../services/report.js')).printNode(copy, paper);
}

async function share(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

export async function render(root, params) {
  const shop = store.get('session')?.shop || {};

  async function paint() {
    const order = await ordersRepo.get(params.id);
    if (!order) {
      root.replaceChildren(h('div', { class: 'page' }, h('p', { class: 'empty' }, 'Facture introuvable.')));
      return;
    }
    const [items, products] = await Promise.all([orderItemsRepo.all(), productsRepo.all()]);
    const lines = invoiceLines(items.filter((i) => i.oid === order.id), new Map(products.map((p) => [p.id, p])));
    const sum = lines.reduce((s, l) => s + l.total, 0);
    const discount = sum - Number(order.total);
    setHeader({ title: `Facture N° ${invoiceNumber(order)}`, subtitle: dateTime(order.created) });

    const ids = [shop.rccm && `RCCM: ${shop.rccm}`, shop.idNat && `ID.NAT: ${shop.idNat}`].filter(Boolean).join(' | ');
    const sheet = h('article', { class: 'invoice' },
      h('header', { class: 'inv-shop' },
        h('h1', {}, shop.name || 'Ma Boutique'),
        shop.address && h('p', {}, shop.address),
        ids && h('p', { class: 'small' }, ids)),
      h('div', { class: 'inv-box' },
        h('div', { class: 'row' }, h('strong', {}, `FACTURE N° ${invoiceNumber(order)}`), h('span', {}, dateTime(order.created))),
        h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Client :'), h('strong', {}, order.customer || 'Client Divers'))),
      h('div', { class: 'inv-head' }, h('span', {}, 'DESIGNATION ARTICLE'), h('span', {}, 'QTÉ'), h('span', {}, `TOTAL (${shop.devise || 'FC'})`)),
      ...lines.map((l) => h('div', { class: 'inv-line' },
        h('div', { class: 'row' }, h('strong', {}, l.name), h('span', {}, `× ${fmtQty(l.qty)}`), h('strong', { class: 'primary' }, fc(l.total))),
        h('p', { class: 'small muted' }, `P.U : ${fc(l.unitPrice)}`))),
      discount > 0 && h('div', { class: 'inv-sub' },
        h('div', { class: 'row' }, h('span', {}, 'Sous-total'), h('span', {}, fc(sum))),
        h('div', { class: 'row' }, h('span', {}, 'Rabais'), h('span', {}, `- ${fc(discount)}`))),
      h('div', { class: 'inv-total' }, h('span', {}, 'TOTAL À PAYER'), h('strong', {}, fc(order.total))),
      h('p', { class: 'inv-thanks' }, 'Merci pour votre achat !'));

    const status = order._sync === SYNC.ERROR ? pill('Erreur de synchronisation — voir Synchro', 'error')
      : order._sync === SYNC.PENDING ? pill(order._provisional ? 'En attente — N° provisoire' : 'En attente de synchronisation', 'warning')
        : null;

    root.replaceChildren(h('div', { class: 'page invoice-page' },
      status && h('div', { class: 'no-print center' }, status),
      sheet,
      h('div', { class: 'invoice-actions no-print' },
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: () => printInvoice(sheet) }, icon('print'), 'Imprimer'),
        h('button', { type: 'button', class: 'btn btn-lg', onclick: () => share(invoiceText({ shop, order, lines })) }, icon('share'), 'Partager'),
        store.isAdmin && h('button', {
          type: 'button', class: 'btn btn-lg logout',
          onclick: async () => {
            const ok = await confirmDelete('Supprimer la facture ?',
              `La facture N° ${invoiceNumber(order)} sera supprimée et le stock des articles restauré.`);
            if (!ok) return;
            await cancelSale(order);
            toast(`Facture N° ${order.fid} supprimée.`);
            navigate('/ventes', { replace: true });
          },
        }, icon('delete'), 'Supprimer'))));
  }

  const off = store.subscribe('orders', paint);
  await paint();
  return off;
}

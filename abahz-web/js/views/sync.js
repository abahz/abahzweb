// #/sync — opérations en attente et refusées, « Réessayer » / « Abandonner » (SYN-01).

import { h } from '../core/dom.js';
import { store } from '../core/store.js';
import { tx, req, getMeta } from '../core/db.js';
import { fc, dateTime } from '../core/format.js';
import { flush, pull, retryFailed, abandonFailed } from '../core/sync.js';
import { setHeader } from '../ui/header.js';
import { icon, iconBadge } from '../ui/icons.js';
import { emptyState, pill, confirmDelete } from '../ui/components.js';
import { offlineDialog } from './auth.js';
import { toast } from '../ui/toast.js';

const TABLES = {
  products: 'produit', category: 'catégorie', unity: 'unité', customer: 'client', expenses: 'dépense',
  dept: 'dette', users: 'membre', orders: 'facture', orderitem: 'ligne de facture', dept_payment: 'remboursement',
};

/** Libellé lisible d'une opération de l'outbox. Fonction pure (testée). */
export function describeOp(op) {
  const p = op.payload || {};
  switch (op.fn || op.op) {
    case 'create_order': return `Vente N° ${p.p_order?.fid ?? '?'} — ${fc(p.p_order?.total)}`;
    case 'cancel_order': return 'Suppression d\'une facture';
    case 'pay_dept': return `Remboursement de dette — ${fc(p.p_payment?.amount)}`;
    case 'image': return 'Photo d\'un produit';
    case 'delete': return `Suppression : ${TABLES[op.table] || op.table}`;
    default: return `${TABLES[op.table] || op.table} : ${p.name || p.customer || op.id}`.replace(/^./, (c) => c.toUpperCase());
  }
}

const whenOf = ({ payload: p = {} }) => Number(p.updated || p.p_order?.created || p.p_payment?.created || 0);

export async function render(root) {
  const head = h('section', { class: 'card sync-head' });
  const list = h('div', { class: 'list wrap-sub' });
  root.replaceChildren(h('div', { class: 'page' }, head, list));

  async function load() {
    const ops = (await tx('outbox', 'readonly', (s) => req(s.outbox.getAll()))).sort((a, b) => a.seq - b.seq);
    const failed = ops.filter((o) => o.failed);
    const last = await getMeta('lastPull');
    setHeader({ subtitle: `${ops.length} opération(s) en attente` });
    head.replaceChildren(
      h('div', { class: 'row' }, iconBadge('sync'),
        h('div', { class: 'grow' },
          h('p', { class: 't-title-sm' }, navigator.onLine ? 'En ligne' : 'Hors ligne'),
          h('p', { class: 'muted t-body-sm' }, last ? `Dernière réception : ${dateTime(last)}` : 'Aucune réception pour l\'instant'),
          failed.length > 0 && h('p', { class: 't-body-sm error-text' }, `${failed.length} opération(s) refusée(s) par le serveur`))),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: syncNow }, icon('sync'), 'Synchroniser maintenant'));

    if (!ops.length) {
      list.replaceChildren(emptyState('check', 'Tout est synchronisé', 'Aucune opération n\'attend d\'être envoyée.'));
      return;
    }
    list.replaceChildren(...ops.map((o) => h('div', { class: 'list-item sync-op' },
      iconBadge(o.failed ? 'error' : 'schedule', o.failed ? 'err-badge' : ''),
      h('div', { class: 'list-text' },
        h('p', { class: 't-title-sm' }, describeOp(o)),
        whenOf(o) > 0 && h('p', { class: 'muted t-body-sm' }, dateTime(whenOf(o))),
        o.failed ? pill('Erreur', 'error') : pill('En attente', 'warning'),
        o.lastError && h('p', { class: 't-body-sm error-text' }, o.lastError),
        o.failed && h('div', { class: 'row gap-8' },
          h('button', { type: 'button', class: 'btn', onclick: () => retry(o) }, 'Réessayer'),
          h('button', { type: 'button', class: 'btn danger-text', onclick: () => abandon(o) }, 'Abandonner'))))));
  }

  async function syncNow() {
    if (!navigator.onLine) { offlineDialog(); return; }
    try {
      await flush();
      await pull();
      toast('Synchronisation terminée.');
    } catch (err) {
      toast(err.message || 'La synchronisation a échoué.', 'error', 5000);
    }
    load();
  }

  async function retry(o) {
    if (!navigator.onLine) { offlineDialog(); return; }
    await retryFailed(o.seq);
    load();
  }

  async function abandon(o) {
    if (!navigator.onLine) { offlineDialog(); return; }
    const ok = await confirmDelete('Abandonner l\'opération ?',
      `« ${describeOp(o)} » ne sera pas envoyée. La modification faite sur cet appareil sera remplacée par les données du serveur.`,
      'Abandonner');
    if (!ok) return;
    try { await abandonFailed(o.seq); } catch (err) { toast(err.message, 'error', 5000); }
    load();
  }

  const offs = [store.subscribe('outbox', load), store.subscribe('pulling', load)];
  addEventListener('online', load);
  addEventListener('offline', load);
  await load();
  return () => { offs.forEach((off) => off()); removeEventListener('online', load); removeEventListener('offline', load); };
}

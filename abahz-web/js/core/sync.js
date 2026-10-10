// Synchronisation offline-first (PRD §7) : envoi de l'outbox (flush) et réception (pull).

import { tx, req, getMeta, setMeta, SYNC } from './db.js';
import { rest, rpc, upload, ApiError } from './api.js';
import { writeRow } from './remote.js';
import { store } from './store.js';

/** Tables lues depuis Supabase, dans l'ordre (références avant les lignes qui les utilisent). */
export const PULL_TABLES = ['category', 'unity', 'products', 'customer', 'users', 'expenses',
  'orders', 'orderitem', 'dept', 'dept_payment'];
const PAGE = 500;
const HISTORY_DAYS = 90;                 // ventes préchargées (PRD 5.4)
const FULL_REFRESH_MS = 6 * 3600_000;    // relecture complète : lignes Android avec updated = 0, suppressions
const RETRY_DELAYS = [5_000, 30_000, 120_000, 600_000];

let flushing = null;
let failures = 0;
let retryTimer = null;

// ───────────── Règles pures (testées) ─────────────

/**
 * Faut-il appliquer une ligne distante ? Une ligne locale en attente (_sync 1, 2 ou 3) n'est jamais
 * écrasée : elle partira d'abord (PRD 7.4). Sinon, dernière écriture gagnante sur `updated`.
 */
export function shouldApplyRemote(local, remote) {
  if (!local) return true;
  if (local._sync && local._sync !== SYNC.DONE) return false;
  return Number(remote.updated || 0) >= Number(local.updated || 0);
}

/** Ligne distante prête pour IndexedDB : sans champs sensibles, marquée synchronisée. */
export function fromRemote(row) {
  const { password, admin, activeSessionToken, ...rest } = row;
  return { ...rest, _sync: SYNC.DONE };
}

/** Erreur passagère (réseau, serveur) : on réessaiera plus tard ; sinon la donnée est refusée. */
export function isTransient(err) {
  return !(err instanceof ApiError) || err.status === 0 || err.status >= 500
    || err.status === 401 || err.status === 408 || err.status === 429;
}

/** Fonction ou table absente côté serveur (lot 0 pas encore appliqué). */
function isMissing(err) {
  return err instanceof ApiError && (err.status === 404
    || ['PGRST202', 'PGRST205', '42883', '42P01'].includes(err.body?.code));
}

// ───────────── Envoi ─────────────

async function outboxEntries() {
  return tx('outbox', 'readonly', (s) => req(s.outbox.getAll()));
}

/** Met à jour l'état local d'une entité après l'envoi (synchronisée, supprimée ou en erreur). */
async function settle(table, id, { deleted = false, error = false } = {}) {
  const rest = (await outboxEntries()).filter((o) => o.id === id && o.table === table && !o.failed);
  if (rest.length && !error) return; // d'autres écritures de la même ligne attendent encore
  await tx(table, 'readwrite', async (s) => {
    const row = await req(s[table].get(id));
    if (!row) return;
    if (deleted) s[table].delete(id);
    else s[table].put({ ...row, _sync: error ? SYNC.ERROR : SYNC.DONE });
  });
}

/**
 * Après une vente ou une annulation envoyée : les produits touchés redeviennent « synchronisés », avec le
 * stock renvoyé par le serveur s'il y en a un — sauf s'ils ont encore une écriture en attente.
 */
async function releaseProducts(pids, stock) {
  const pending = new Set((await outboxEntries()).filter((o) => o.table === 'products').map((o) => o.id));
  const server = new Map((Array.isArray(stock) ? stock : []).map((x) => [x.id, Number(x.qty)]));
  await tx('products', 'readwrite', async (s) => {
    for (const id of new Set(pids)) {
      if (pending.has(id)) continue;
      const p = await req(s.products.get(id));
      if (p) s.products.put({ ...p, qty: server.has(id) ? server.get(id) : p.qty, _sync: SYNC.DONE });
    }
  });
  store.emit('products');
}

/** Vente envoyée comme Android tant que create_order n'existe pas en base (stock en valeur absolue). */
async function legacySale({ p_order: order, p_items: items, p_dept: dept }) {
  await writeRow('orders', { ...order, sync: 0 });
  for (const it of items) await writeRow('orderitem', { ...it, oid: order.id, shopid: order.shopid, sync: 0 });
  if (dept) await writeRow('dept', { ...dept, sync: 0 });
  const ids = items.map((i) => i.pid);
  const products = await tx('products', 'readonly', (s) => Promise.all(ids.map((id) => req(s.products.get(id)))));
  for (const p of products.filter(Boolean)) {
    const { _sync, ...row } = p;
    await writeRow('products', { ...row, sync: 0 });
  }
  return { id: order.id, fid: order.fid, stock: [] };
}

async function legacyCancel({ p_id: id }, extra) {
  for (const t of ['dept', 'orderitem', 'orders']) {
    const filter = t === 'orders' ? `id=eq.${encodeURIComponent(id)}`
      : t === 'orderitem' ? `oid=eq.${encodeURIComponent(id)}`
        : `id=in.(${['dept_' + id, ...(extra?.deptIds || [])].map(encodeURIComponent).join(',')})`;
    await rest(t, filter, { method: 'DELETE' });
  }
  for (const p of extra?.products || []) await writeRow('products', { ...p, sync: 0 });
  return { stock: [] };
}

/**
 * Remboursement envoyé comme Android tant que pay_dept n'existe pas : dette en valeur absolue,
 * supprimée une fois soldée ; le paiement n'est conservé que si la table dept_payment existe.
 */
async function legacyPayDept({ p_payment: payment }, extra) {
  const dept = extra?.dept;
  if (dept && Number(dept.amount) <= 0) {
    await rest('dept', `id=eq.${encodeURIComponent(dept.id)}`, { method: 'DELETE' });
  } else if (dept) {
    await writeRow('dept', { ...dept, sync: 0 });
  }
  try {
    await writeRow('dept_payment', payment);
  } catch (err) {
    if (!isMissing(err)) throw err;
  }
  return { dept_id: payment.dept_id, amount: dept ? Number(dept.amount) : 0, settled: !!dept && Number(dept.amount) <= 0 };
}

/** Exécute une opération de l'outbox. */
async function send(op) {
  switch (op.op) {
    case 'upsert':
      await writeRow(op.table, op.payload);
      return settle(op.table, op.id);
    case 'delete':
      await rest(op.table, `id=eq.${encodeURIComponent(op.id)}`, { method: 'DELETE' });
      return settle(op.table, op.id, { deleted: true });
    case 'image': {
      const blob = await tx('blobs', 'readonly', (s) => req(s.blobs.get(op.id)));
      if (!blob) return null;
      const url = await upload('Products', `prod_${op.id}_${Date.now()}.jpg`, blob.data);
      const product = await tx('products', 'readonly', (s) => req(s.products.get(op.id)));
      if (product) {
        const next = { ...product, url, image: '', updated: Date.now() };
        await writeRow('products', { ...next, sync: 0, _sync: undefined });
        await tx(['products', 'blobs'], 'readwrite', (s) => { s.products.put(next); s.blobs.delete(op.id); });
        store.emit('products');
      }
      return null;
    }
    case 'rpc':
      return sendRpc(op);
    default:
      throw new ApiError(`Opération inconnue : ${op.op}`, 400);
  }
}

async function sendRpc(op) {
  let result;
  try {
    result = await rpc(op.fn, op.payload);
  } catch (err) {
    if (!isMissing(err)) throw err;
    if (op.fn === 'create_order') result = await legacySale(op.payload);
    else if (op.fn === 'cancel_order') result = await legacyCancel(op.payload, op.extra);
    else if (op.fn === 'pay_dept') result = await legacyPayDept(op.payload, op.extra);
    else throw err;
  }
  if (op.fn === 'create_order') {
    const { p_order: order, p_items: items, p_dept: dept } = op.payload;
    await tx(['orders', 'orderitem', 'dept'], 'readwrite', async (s) => {
      const o = await req(s.orders.get(order.id));
      if (o) s.orders.put({ ...o, fid: result?.fid ?? o.fid, _provisional: false, _sync: SYNC.DONE });
      for (const it of items) {
        const row = await req(s.orderitem.get(it.id));
        if (row) s.orderitem.put({ ...row, _sync: SYNC.DONE });
      }
      if (dept) {
        const d = await req(s.dept.get(dept.id));
        if (d) s.dept.put({ ...d, fid: result?.fid ?? d.fid, _sync: SYNC.DONE });
      }
    });
    await releaseProducts(items.map((i) => i.pid), result?.stock);
    store.emit('orders');
    store.emit('dept');
  } else if (op.fn === 'cancel_order') {
    const { deptIds = [], itemIds = [], products = [] } = op.extra || {};
    await tx(['orders', 'orderitem', 'dept'], 'readwrite', (s) => {
      s.orders.delete(op.id);
      for (const id of itemIds) s.orderitem.delete(id);
      for (const id of deptIds) s.dept.delete(id);
    });
    await releaseProducts(products.map((p) => p.id), result?.stock);
    store.emit('orders');
    store.emit('dept');
  } else if (op.fn === 'pay_dept') {
    await settlePayment(op, result);
  }
  return result;
}

/** Après un remboursement envoyé : paiement synchronisé, dette alignée sur le serveur ou retirée si soldée. */
async function settlePayment(op, result) {
  const { p_payment: payment } = op.payload;
  const waiting = (await outboxEntries()).some((o) => o.table === 'dept' && o.id === op.id && o.seq !== op.seq && !o.failed);
  await tx(['dept', 'dept_payment'], 'readwrite', async (s) => {
    const p = await req(s.dept_payment.get(payment.id));
    if (p) s.dept_payment.put({ ...p, _sync: SYNC.DONE });
    if (waiting) return; // un autre paiement de la même dette attend encore
    const d = await req(s.dept.get(op.id));
    if (!d) return;
    if (result?.settled || d._sync === SYNC.DELETED) s.dept.delete(op.id);
    else s.dept.put({ ...d, amount: result?.amount ?? d.amount, _sync: SYNC.DONE });
  });
  store.emit('dept');
  store.emit('dept_payment');
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  const delay = RETRY_DELAYS[Math.min(failures, RETRY_DELAYS.length) - 1] || RETRY_DELAYS[0];
  retryTimer = setTimeout(() => flush(), delay);
}

/**
 * Envoie l'outbox dans l'ordre, une opération à la fois. S'arrête à la première erreur passagère
 * (nouvel essai après 5 s, 30 s, 2 min, 10 min). Une donnée refusée (4xx) est mise de côté.
 */
export function flush() {
  if (flushing) return flushing;
  if (!store.get('session') || !navigator.onLine) return Promise.resolve();
  flushing = (async () => {
    try {
      const queue = (await outboxEntries()).filter((o) => !o.failed).sort((a, b) => a.seq - b.seq);
      for (const op of queue) {
        try {
          await send(op);
          await tx('outbox', 'readwrite', (s) => s.outbox.delete(op.seq));
          failures = 0;
        } catch (err) {
          if (isTransient(err)) { failures++; scheduleRetry(); break; }
          await tx('outbox', 'readwrite', (s) => s.outbox.put({
            ...op, failed: true, tries: (op.tries || 0) + 1, lastError: err.message,
          }));
          await settle(op.table, op.id, { error: true });
          store.emit(op.table);
        }
      }
    } finally {
      flushing = null;
      store.emit('outbox');
    }
  })();
  return flushing;
}

/** Remet en file une opération refusée (écran Synchronisation). */
export async function retryFailed(seq) {
  await tx('outbox', 'readwrite', async (s) => {
    const op = await req(s.outbox.get(seq));
    if (op) s.outbox.put({ ...op, failed: false });
  });
  return flush();
}

/** Lignes locales qu'une opération a modifiées : [table, id]. Fonction pure (testée). */
export function touchedBy(op) {
  const p = op.payload || {};
  const x = op.extra || {};
  if (op.fn === 'create_order') {
    return [['orders', op.id], ...p.p_items.map((i) => ['orderitem', i.id]), ...p.p_items.map((i) => ['products', i.pid]),
      ...(p.p_dept ? [['dept', p.p_dept.id]] : [])];
  }
  if (op.fn === 'cancel_order') {
    return [['orders', op.id], ...(x.itemIds || []).map((id) => ['orderitem', id]), ...(x.deptIds || []).map((id) => ['dept', id]),
      ...(x.products || []).map((r) => ['products', r.id])];
  }
  if (op.fn === 'pay_dept') return [['dept_payment', p.p_payment.id], ['dept', op.id]];
  if (op.op === 'image') return [['products', op.id], ['blobs', op.id]];
  return [[op.table, op.id]];
}

/**
 * Abandonne une opération refusée : la modification locale est effacée, puis une relecture complète
 * remet les données du serveur (écran Synchronisation).
 */
export async function abandonFailed(seq) {
  const op = await tx('outbox', 'readonly', (s) => req(s.outbox.get(seq)));
  if (!op) return;
  await tx('outbox', 'readwrite', (s) => s.outbox.delete(seq));
  const rest = await outboxEntries();
  const busy = (t, id) => rest.some((o) => touchedBy(o).some(([t2, id2]) => t2 === t && id2 === id));
  const rows = touchedBy(op).filter(([t, id]) => !busy(t, id));
  const tables = [...new Set(rows.map(([t]) => t))];
  if (tables.length) {
    await tx(tables, 'readwrite', (s) => { for (const [t, id] of rows) s[t].delete(id); });
  }
  await setMeta('pull:full', 0);
  for (const t of tables) store.emit(t);
  store.emit('outbox');
  return pull();
}

// ───────────── Réception ─────────────

let pulling = null;

async function pullTable(table, shopId, { full }) {
  const key = `pull:${table}`;
  const last = full ? 0 : Number((await getMeta(key)) || 0);
  const filters = [`shopid=eq.${encodeURIComponent(shopId)}`];
  if (last) filters.push(`updated=gt.${last}`);
  const windowStart = Date.now() - HISTORY_DAYS * 86_400_000;
  if (['orders', 'orderitem', 'dept_payment'].includes(table)) filters.push(`created=gt.${windowStart}`);

  let maxUpdated = last;
  const seen = new Set();
  let changed = false;
  for (let offset = 0; ; offset += PAGE) {
    const rows = await rest(table, `${filters.join('&')}&order=updated.asc,id.asc&limit=${PAGE}&offset=${offset}`);
    if (!rows.length) break;
    await tx(table, 'readwrite', async (s) => {
      for (const remote of rows) {
        seen.add(remote.id);
        maxUpdated = Math.max(maxUpdated, Number(remote.updated || 0));
        const local = await req(s[table].get(remote.id));
        if (shouldApplyRemote(local, remote)) { s[table].put(fromRemote(remote)); changed = true; }
      }
    });
    if (rows.length < PAGE) break;
  }

  // Relecture complète : une ligne synchronisée absente du serveur a été supprimée ailleurs.
  if (full) {
    await tx(table, 'readwrite', async (s) => {
      const locals = await req(s[table].getAll());
      for (const l of locals) {
        const inWindow = !['orders', 'orderitem', 'dept_payment'].includes(table) || Number(l.created) > windowStart;
        if (l.shopid === shopId && inWindow && !seen.has(l.id) && (!l._sync || l._sync === SYNC.DONE)) {
          s[table].delete(l.id);
          changed = true;
        }
      }
    });
  }
  await setMeta(key, maxUpdated);
  if (changed) store.emit(table);
}

/** Suppressions faites ailleurs, si la table tombstones existe (lot 0). */
async function pullTombstones(shopId) {
  const last = Number((await getMeta('pull:tombstones')) || 0);
  const rows = await rest('tombstones', `shopid=eq.${encodeURIComponent(shopId)}&deleted_at=gt.${last}&order=deleted_at.asc&limit=${PAGE}`);
  let max = last;
  for (const t of rows) {
    max = Math.max(max, Number(t.deleted_at));
    if (!PULL_TABLES.includes(t.table_name)) continue;
    await tx(t.table_name, 'readwrite', async (s) => {
      const l = await req(s[t.table_name].get(t.id));
      if (l && (!l._sync || l._sync === SYNC.DONE)) s[t.table_name].delete(t.id);
    });
    store.emit(t.table_name);
  }
  await setMeta('pull:tombstones', max);
}

/**
 * Lit les changements de la boutique. `onProgress(table, index, total)` sert à l'écran de chargement.
 */
export function pull({ onProgress } = {}) {
  if (pulling) return pulling;
  const shopId = store.shopId;
  if (!shopId || !navigator.onLine) return Promise.resolve();
  pulling = (async () => {
    store.set('pulling', true);
    try {
      const lastFull = Number((await getMeta('pull:full')) || 0);
      const full = Date.now() - lastFull > FULL_REFRESH_MS;
      // Tables absentes : réessayées à chaque relecture complète (le lot 0 a pu être appliqué entre-temps).
      const missingTables = full ? [] : ((await getMeta('missingTables')) || []);
      if (full) await setMeta('missingTables', []);
      for (const [i, table] of PULL_TABLES.entries()) {
        onProgress?.(table, i, PULL_TABLES.length);
        if (missingTables.includes(table)) continue;
        try {
          await pullTable(table, shopId, { full });
        } catch (err) {
          if (!isMissing(err)) throw err;
          missingTables.push(table); // ex. dept_payment avant le lot 0
          await setMeta('missingTables', missingTables);
        }
      }
      try { await pullTombstones(shopId); } catch (err) { if (!isMissing(err)) throw err; }
      if (full) await setMeta('pull:full', Date.now());
      await setMeta('lastPull', Date.now());
    } finally {
      pulling = null;
      store.set('pulling', false);
    }
  })();
  return pulling;
}

/** Premier chargement fait ? (sinon l'accueil affiche la progression) */
export async function hasPulled() {
  return Boolean(await getMeta('lastPull'));
}

// ───────────── Déclencheurs ─────────────

let started = false;

/** Lance la synchronisation : au démarrage, au retour en ligne, au premier plan, toutes les 60 s. */
export function startSync() {
  if (started) return;
  started = true;
  const tick = () => {
    if (document.visibilityState !== 'visible' || !store.get('session')) return;
    flush().then(() => pull()).catch((err) => console.warn('Synchronisation :', err.message));
  };
  addEventListener('online', tick);
  document.addEventListener('visibilitychange', tick);
  setInterval(tick, 60_000);
  store.subscribe('session', (s) => { if (s) tick(); });
  tick();
}

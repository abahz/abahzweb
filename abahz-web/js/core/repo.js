// Dépôt générique d'une table : l'écriture locale et l'opération d'envoi partent dans la même
// transaction IndexedDB (PRD 7.1), puis l'écran est notifié et la synchronisation relancée.

import { tx, req, SYNC } from './db.js';
import { store } from './store.js';

/** Lignes visibles d'une boutique : on masque celles supprimées localement en attente d'envoi. */
export const visible = (rows, shopId) => rows.filter((r) => r.shopid === shopId && r._sync !== SYNC.DELETED);

/** Après une écriture : rafraîchir les écrans abonnés et lancer l'envoi sans l'attendre. */
export function written(...tables) {
  for (const t of new Set(tables)) store.emit(t);
  store.emit('outbox');
  import('./sync.js').then((m) => m.flush()).catch(() => { /* hors ligne : la file attendra */ });
}

/** Ligne prête pour l'outbox : `sync` à 0 comme Android l'attend une fois envoyée. */
export function payloadOf(row) {
  const out = { ...row, sync: 0 };
  for (const k of Object.keys(out)) if (k.startsWith('_')) delete out[k];
  return out;
}

/** Ajoute une écriture dans les stores ouverts d'une transaction (entité + outbox). */
export function queueUpsert(stores, table, row) {
  stores[table].put({ ...row, _sync: SYNC.PENDING });
  stores.outbox.add({ table, op: 'upsert', id: row.id, payload: payloadOf(row), tries: 0 });
}

export function queueDelete(stores, table, row) {
  stores[table].put({ ...row, _sync: SYNC.DELETED });
  stores.outbox.add({ table, op: 'delete', id: row.id, tries: 0 });
}

/**
 * @param {string} table nom de la table Supabase / du store local
 */
export function repo(table) {
  return {
    table,

    /** Toutes les lignes de la boutique courante. */
    async all() {
      const rows = await tx(table, 'readonly', (s) => req(s[table].getAll()));
      return visible(rows, store.shopId);
    },

    async get(id) {
      const row = await tx(table, 'readonly', (s) => req(s[table].get(id)));
      return row && row._sync !== SYNC.DELETED ? row : null;
    },

    /** Crée ou met à jour ; complète id, boutique et horodatages. Renvoie la ligne enregistrée. */
    async save(data) {
      const now = Date.now();
      const row = {
        ...data,
        id: data.id || crypto.randomUUID(),
        shopid: data.shopid || store.shopId,
        created: data.created || now,
        updated: now,
      };
      await tx([table, 'outbox'], 'readwrite', (s) => queueUpsert(s, table, row));
      written(table);
      return row;
    },

    async remove(row) {
      await tx([table, 'outbox'], 'readwrite', (s) => queueDelete(s, table, { ...row, updated: Date.now() }));
      written(table);
    },
  };
}

export const productsRepo = repo('products');
export const categoriesRepo = repo('category');
export const unitsRepo = repo('unity');
export const customersRepo = repo('customer');
export const ordersRepo = repo('orders');
export const orderItemsRepo = repo('orderitem');
export const deptsRepo = repo('dept');
export const expensesRepo = repo('expenses');

// Accès IndexedDB en Promises. Base « abahz », migrations numérotées.

const DB_NAME = 'abahz';

/** Tables copiées depuis Supabase (mêmes noms que côté serveur). */
export const ENTITIES = [
  'products', 'category', 'unity', 'orders', 'orderitem',
  'customer', 'expenses', 'dept', 'dept_payment', 'users',
];

/** États de synchronisation locaux (champ _sync). */
export const SYNC = { DONE: 0, PENDING: 1, ERROR: 2, DELETED: 3 };

// migrations[i] fait passer la base de la version i à i + 1. Ne jamais modifier une migration publiée.
const migrations = [
  (db) => {
    for (const name of ENTITIES) {
      const s = db.createObjectStore(name, { keyPath: 'id' });
      s.createIndex('shopid', 'shopid');
      s.createIndex('created', 'created');
      s.createIndex('_sync', '_sync');
    }
    db.createObjectStore('cart', { keyPath: 'pid' });
    db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true }).createIndex('table', 'table');
    db.createObjectStore('blobs', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },
];

let dbPromise = null;

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, migrations.length);
    req.onupgradeneeded = (ev) => {
      for (let v = ev.oldVersion; v < migrations.length; v++) migrations[v](req.result, req.transaction);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; }; // autre onglet plus récent
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error); };
    req.onblocked = () => console.warn('IndexedDB bloquée : fermez les autres onglets ABAHZ.');
  });
  return dbPromise;
}

/** Transforme une requête IndexedDB en Promise. */
export function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Exécute `fn(stores)` dans une transaction et résout APRÈS `oncomplete`
 * (l'écriture est alors durable). Si `fn` lève une erreur, rien n'est écrit.
 * Dans `fn`, n'attendre que des requêtes IndexedDB (sinon la transaction se ferme).
 * @template T
 * @param {string|string[]} names
 * @param {'readonly'|'readwrite'} mode
 * @param {(stores: Record<string, IDBObjectStore>, t: IDBTransaction) => T|Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function tx(names, mode, fn) {
  const db = await open();
  const list = [].concat(names);
  return new Promise((resolve, reject) => {
    // « strict » : la fin de transaction attend l'écriture sur le disque. Par défaut Chrome
    // répond avant (« relaxed ») : une batterie qui lâche après la facture perdrait la vente.
    // Les navigateurs sans cette option ignorent le troisième argument.
    const t = db.transaction(list, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction annulée'));
    const stores = Object.fromEntries(list.map((n) => [n, t.objectStore(n)]));
    Promise.resolve()
      .then(() => fn(stores, t))
      .then((r) => { result = r; }, (err) => {
        try { t.abort(); } catch { /* déjà terminée */ }
        reject(err);
      });
  });
}

export const get = (store, key) => tx(store, 'readonly', (s) => req(s[store].get(key)));
export const getAll = (store) => tx(store, 'readonly', (s) => req(s[store].getAll()));
export const count = (store) => tx(store, 'readonly', (s) => req(s[store].count()));
export const put = (store, value) => tx(store, 'readwrite', (s) => req(s[store].put(value)));
export const del = (store, key) => tx(store, 'readwrite', (s) => req(s[store].delete(key)));
export const clear = (store) => tx(store, 'readwrite', (s) => req(s[store].clear()));

export async function getMeta(key) {
  return (await get('meta', key))?.value;
}
export function setMeta(key, value) {
  return put('meta', { key, value });
}
export function delMeta(key) {
  return del('meta', key);
}

/** Supprime toute la base locale (appareil partagé). */
export async function destroy() {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = r.onblocked = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

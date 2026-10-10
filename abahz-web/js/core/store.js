// État global minimal + publication/abonnement.
// Les données métier restent dans IndexedDB ; ici : session, rôle, boutique, panier, réseau.

const state = {
  config: null,
  session: null,     // { access_token, refresh_token, expires_at, user, shop }
  cartCount: 0,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,        // opérations dans l'outbox
};
const listeners = new Map();

export const store = {
  get(key) { return state[key]; },

  set(key, value) {
    state[key] = value;
    this.emit(key, value);
  },

  /** Notifie les abonnés d'une clé (aussi utilisé pour les tables : 'products', 'orders'…). */
  emit(key, value) {
    for (const fn of listeners.get(key) || []) {
      try { fn(value); } catch (err) { console.error(err); }
    }
  },

  /** @returns {() => void} désabonnement */
  subscribe(key, fn) {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key).delete(fn);
  },

  get role() { return state.session?.user?.role ?? null; },
  get isAdmin() { return this.role === 'ADMIN'; },
  get shopId() { return state.session?.user?.shopid ?? null; },
};

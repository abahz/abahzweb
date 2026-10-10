// Routage par hash (#/accueil) avec garde de rôle et nettoyage des vues.

import { store } from './store.js';

/**
 * public : accessible sans session · admin : réservé à l'ADMIN
 * tab : onglet de la barre basse mis en évidence
 */
export const routes = [
  { path: '/connexion', view: 'auth.js', title: 'Connexion', public: true },
  { path: '/inscription', view: 'register.js', title: 'Inscription', public: true },
  { path: '/accueil', view: 'home.js', title: 'ABAHZ', tab: 'accueil' },
  { path: '/panier', view: 'cart.js', title: 'Panier' },
  { path: '/ventes', view: 'orders.js', title: 'Ventes', tab: 'ventes' },
  { path: '/facture/:id', view: 'invoice.js', title: 'Facture', tab: 'ventes' },
  { path: '/fournisseur', view: 'supplier.js', title: 'Espace Fournisseurs', tab: 'fournisseur' },
  { path: '/profil', view: 'profile.js', title: 'Profil', tab: 'profil' },
  { path: '/dettes', view: 'depts.js', title: 'Dettes & crédits' },
  { path: '/clients', view: 'customers.js', title: 'Clients' },
  { path: '/aide', view: 'help.js', title: 'Aide & Support' },
  { path: '/a-propos', view: 'about.js', title: 'À propos' },
  { path: '/parametres', view: 'settings.js', title: 'Paramètres' },
  { path: '/sync', view: 'sync.js', title: 'Synchronisation' },
  { path: '/produit/nouveau', view: 'product-form.js', title: 'Ajouter un produit', admin: true },
  { path: '/produit/:id', view: 'product-form.js', title: 'Modifier le produit', admin: true },
  { path: '/categories', view: 'categories.js', title: 'Catégories', admin: true },
  { path: '/unites', view: 'units.js', title: 'Unités', admin: true },
  { path: '/depenses', view: 'expenses.js', title: 'Dépenses', admin: true },
  { path: '/personnel', view: 'users.js', title: 'Personnel', admin: true },
];

export const HOME = '/accueil';
export const LOGIN = '/connexion';

/**
 * Trouve la route d'un chemin. Fonction pure (testée).
 * @returns {{route: object, params: Record<string,string>} | null}
 */
export function match(path) {
  const parts = path.split('/').filter(Boolean);
  for (const route of routes) {
    const pattern = route.path.split('/').filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params = {};
    const ok = pattern.every((seg, i) => {
      if (seg.startsWith(':')) { params[seg.slice(1)] = decodeURIComponent(parts[i]); return true; }
      return seg === parts[i];
    });
    if (ok) return { route, params };
  }
  return null;
}

/**
 * Décide où aller. Fonction pure (testée).
 * @param {string} path
 * @param {{loggedIn: boolean, role: string|null}} who
 * @returns {{redirect: string} | {route: object, params: object}}
 */
export function resolve(path, { loggedIn, role }) {
  const found = match(path);
  if (!loggedIn) return found?.route.public ? found : { redirect: LOGIN };
  if (!found || found.route.public) return { redirect: HOME };
  if (found.route.admin && role !== 'ADMIN') return { redirect: HOME };
  return found;
}

export function currentPath() {
  return location.hash.replace(/^#/, '') || HOME;
}

export function navigate(path, { replace = false } = {}) {
  if (replace) location.replace('#' + path);
  else location.hash = path;
}

let cleanup = null;
let renderId = 0;

/**
 * Démarre le routeur.
 * @param {HTMLElement} root zone <main>
 * @param {(route: object) => void} onRoute appelé à chaque écran (titre, onglet actif)
 */
export function start(root, onRoute) {
  async function render() {
    const id = ++renderId;
    const session = store.get('session');
    const target = resolve(currentPath(), { loggedIn: !!session, role: store.role });
    if ('redirect' in target) return navigate(target.redirect, { replace: true });

    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;
    onRoute(target.route);
    root.setAttribute('aria-busy', 'true');
    try {
      const mod = await import(`../views/${target.route.view}`);
      if (id !== renderId) return; // un autre écran a été demandé entre-temps
      const result = await mod.render(root, target.params);
      if (id !== renderId) { if (typeof result === 'function') result(); return; }
      cleanup = result;
    } catch (err) {
      console.error(err);
      if (id !== renderId) return;
      const { placeholder } = await import('../views/placeholder.js');
      placeholder(root, target.route.title);
    } finally {
      if (id === renderId) root.removeAttribute('aria-busy');
    }
    root.focus({ preventScroll: true });
    scrollTo(0, 0);
  }
  addEventListener('hashchange', render);
  // Re-rendre seulement si la connexion ou le rôle change (pas à chaque rafraîchissement du jeton).
  let who = '';
  store.subscribe('session', (s) => {
    const next = `${!!s}|${s?.user?.role ?? ''}`;
    if (next !== who) { who = next; render(); }
  });
  who = `${!!store.get('session')}|${store.role ?? ''}`;
  render();
}

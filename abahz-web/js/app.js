// Démarrage : configuration, base locale, session, coquille, routeur, Service Worker.

import { h, qs } from './core/dom.js';
import { store } from './core/store.js';
import { open, count } from './core/db.js';
import { loadSettings } from './core/settings.js';
import { refreshCartCount } from './core/cart.js';
import { startSync } from './core/sync.js';
import { configure } from './core/api.js';
import { restore, token, refresh, completeGoogleSignIn } from './core/auth.js';
import { start, navigate, currentPath, HOME } from './core/router.js';
import { setCurrency } from './core/format.js';
import { icon, iconBadge } from './ui/icons.js';
import { logout } from './ui/logout.js';

/** Onglets de MainScreen (Android) : icône pleine si actif, contour sinon. `full` : libellé de la barre latérale (PC). */
const TABS = [
  { id: 'accueil', path: '/accueil', label: 'Accueil', full: 'Catalogue', icon: 'home' },
  { id: 'ventes', path: '/ventes', label: 'Ventes', full: 'Ventes', icon: 'chart' },
  { id: 'fournisseur', path: '/fournisseur', label: 'Fourn.', full: 'Fournisseurs', icon: 'truck' },
  { id: 'profil', path: '/profil', label: 'Profil', full: 'Tableau de bord', icon: 'person' },
];

/** Sections en plus de la barre latérale (PC) ; sur mobile, ces écrans s'ouvrent depuis le Profil. */
const NAV_GROUPS = [
  ['Gestion', [
    { path: '/clients', label: 'Clients', icon: 'people' },
    { path: '/dettes', label: 'Dettes & crédits', icon: 'money_off' },
    { path: '/depenses', label: 'Dépenses', icon: 'receipt', admin: true },
    { path: '/personnel', label: 'Personnel', icon: 'group', admin: true },
    { path: '/categories', label: 'Catégories', icon: 'category', admin: true },
    { path: '/unites', label: 'Unités', icon: 'scale', admin: true },
  ]],
  ['Système', [
    { path: '/sync', label: 'Synchronisation', icon: 'sync' },
    { path: '/parametres', label: 'Paramètres', icon: 'settings' },
    { path: '/aide', label: 'Aide & Support', icon: 'help' },
    { path: '/a-propos', label: 'À propos', icon: 'info' },
  ]],
];

const ROLE_LABEL = { ADMIN: 'Administrateur', CASHIER: 'Caissier' };

async function loadConfig() {
  const res = await fetch('config.json', { cache: 'no-cache' });
  return res.json();
}

/**
 * Barre haute (MainTopBar / AbahzTopBar), barre basse et bouton « + Produit » (NAV-01 à NAV-03).
 * Écrans principaux : marque ABAHZ + nom de la boutique. Sous-écrans : flèche retour + titre.
 */
function buildShell() {
  const main = qs('#topbar-main');
  const badge = h('span', { class: 'badge', hidden: true });
  const cart = h('a', { href: '#/panier', class: 'icon-btn', 'aria-label': 'Panier' }, icon('cart'), badge);
  qs('#top-actions').replaceChildren(cart);

  const fab = qs('#fab');
  fab.replaceChildren(icon('plus'), 'Produit');
  fab.setAttribute('aria-label', 'Ajouter un produit');

  // Retour : écran précédent de l'application si possible, sinon l'accueil (NAV-04).
  // La pile évite de sortir du site quand la page a été ouverte directement sur un sous-écran.
  const stack = [currentPath()];
  addEventListener('hashchange', () => {
    const p = currentPath();
    if (stack[stack.length - 2] === p) stack.pop();
    else if (stack[stack.length - 1] !== p) stack.push(p);
  });
  const back = () => { if (stack.length > 1) history.back(); else navigate(HOME, { replace: true }); };

  // Une seule navigation : barre basse (mobile), rail (tablette), barre latérale complète (PC).
  // Les éléments `nav-extra` ne s'affichent que sur PC (voir base.css).
  const tabs = qs('#tabs');
  function paintTabs(route) {
    const session = store.get('session');
    const isAdmin = session?.user?.role === 'ADMIN';
    const user = session?.user;
    tabs.replaceChildren(
      h('div', { class: 'nav-brand nav-extra' },
        h('img', { src: 'icons/logo.webp', alt: '', width: 36, height: 36 }),
        h('div', { class: 'brand-title' }, h('strong', {}, 'ABAHZ'), session?.shop?.name && h('span', {}, session.shop.name))),
      h('p', { class: 'nav-section nav-extra' }, 'Principal'),
      ...TABS.map((t) => {
        const on = t.id === route.tab;
        return h('a', { href: '#' + t.path, 'aria-current': on ? 'page' : null },
          h('span', { class: 'pill' }, icon(on ? t.icon : t.icon + '_o')),
          h('span', { class: 'lbl-short' }, t.label),
          h('span', { class: 'lbl-full' }, t.full));
      }),
      ...NAV_GROUPS.flatMap(([title, links]) => [
        h('p', { class: 'nav-section nav-extra' }, title),
        ...links.filter((l) => isAdmin || !l.admin).map((l) =>
          h('a', { href: '#' + l.path, class: 'nav-extra', 'aria-current': route.path === l.path ? 'page' : null },
            h('span', { class: 'pill' }, icon(l.icon)), h('span', {}, l.label))),
      ]),
      user && h('div', { class: 'nav-foot nav-extra' },
        h('span', { class: 'avatar', 'aria-hidden': 'true' }, (user.name || user.email || '?').trim().charAt(0).toUpperCase()),
        h('div', { class: 'brand-title' }, h('strong', { class: 'ellipsis' }, user.name || user.email), h('span', {}, ROLE_LABEL[user.role] || user.role)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Déconnexion', title: 'Déconnexion', onclick: logout }, icon('logout'))));
  }

  store.subscribe('cartCount', (n) => {
    badge.hidden = !n;
    badge.textContent = n > 99 ? '99+' : String(n);
  });

  // Recherche de l'accueil (MainTopBar Android) : la barre haute devient un champ arrondi.
  const searchBtn = h('button', { type: 'button', class: 'icon-btn hide-lg', 'aria-label': 'Rechercher' }, icon('search'));
  let current = null;

  // PC : champ de recherche toujours visible et bouton d'ajout dans la barre haute (pas de bouton flottant).
  const topInput = h('input', {
    type: 'search', class: 'search-input', placeholder: 'Rechercher un produit ou une catégorie…',
    'aria-label': 'Rechercher un produit', autocomplete: 'off',
  });
  let topTimer = null;
  topInput.addEventListener('input', () => {
    clearTimeout(topTimer);
    topTimer = setTimeout(() => store.set('search', topInput.value), 150);
  });
  topInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { topInput.value = ''; store.set('search', ''); } });
  const topSearch = h('label', { class: 'search-wrap top-search show-lg' }, icon('search'), topInput);
  const addBtn = h('a', { href: '#/produit/nouveau', class: 'btn btn-primary show-lg admin-only' }, icon('plus'), 'Ajouter un produit');

  function brand() {
    const shopName = store.get('session')?.shop?.name;
    const tab = TABS.find((t) => t.id === current?.tab);
    const home = current?.path === HOME;
    main.replaceChildren(iconBadge('storefront', 'brand hide-lg'),
      h('div', { class: 'brand-title hide-lg' }, h('strong', {}, 'ABAHZ'), shopName && h('span', {}, shopName)),
      h('h1', { class: 'page-title show-lg' }, tab?.full || current?.title || 'ABAHZ'),
      ...(home ? [topSearch] : []));
    qs('#top-actions').replaceChildren(...(home ? [searchBtn] : []), cart, ...(home ? [addBtn] : []));
  }

  function openSearch() {
    const input = h('input', {
      type: 'search', class: 'search-input', placeholder: 'Rechercher…', 'aria-label': 'Rechercher un produit',
      value: store.get('search') || '', autocomplete: 'off',
    });
    const clear = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Effacer', hidden: !input.value },
      icon('close'));
    let timer = null;
    input.addEventListener('input', () => {
      clear.hidden = !input.value;
      clearTimeout(timer);
      timer = setTimeout(() => store.set('search', input.value), 150); // PRD-03 : délai 150 ms
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });
    clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; store.set('search', ''); input.focus(); });
    main.replaceChildren(
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fermer la recherche', onclick: closeSearch }, icon('back')),
      h('div', { class: 'search-wrap' }, icon('search'), input));
    qs('#top-actions').replaceChildren(clear);
    fab.hidden = true;
    input.focus();
  }

  function closeSearch() {
    store.set('search', '');
    brand();
    fab.hidden = current?.path !== HOME;
  }
  searchBtn.addEventListener('click', openSearch);

  // Titre et sous-titre des sous-écrans, modifiables par la vue (« 3 article(s) », « Facture N° 42 »…).
  store.subscribe('header', ({ title, subtitle } = {}) => {
    const box = main.querySelector('.sub-title');
    if (!box) return;
    if (title) box.firstChild.textContent = title;
    const span = box.querySelector('span') || box.appendChild(h('span'));
    span.textContent = subtitle ?? store.get('session')?.shop?.name ?? '';
  });

  return (route) => {
    current = route;
    topInput.value = '';
    if (store.get('search')) store.set('search', '');
    if (route.tab && !route.path.includes(':')) {
      brand();
    } else {
      const shopName = store.get('session')?.shop?.name;
      main.replaceChildren(
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Retour', onclick: back }, icon('back')),
        h('div', { class: 'sub-title' }, h('strong', {}, route.title), shopName && h('span', {}, shopName)));
      qs('#top-actions').replaceChildren(cart);
    }
    document.title = route.title && route.title !== 'ABAHZ' ? `${route.title} · ABAHZ` : 'ABAHZ';
    fab.hidden = route.path !== HOME;
    paintTabs(route);
  };
}


/** Classes du <body> selon la session : masque la coquille hors connexion et les actions ADMIN. */
function applySessionClasses(session) {
  document.body.classList.toggle('logged-out', !session);
  document.body.classList.toggle('is-admin', session?.user?.role === 'ADMIN');
}

/** Bandeau réseau (NAV-05). */
function watchNetwork() {
  const banner = qs('#net');
  async function paint() {
    let pending = 0;
    try { pending = await count('outbox'); } catch { /* base pas encore prête */ }
    store.set('pending', pending);
    const online = navigator.onLine;
    store.set('online', online);
    const plural = pending > 1 ? 's' : '';
    if (!online) {
      banner.textContent = pending
        ? `Hors ligne — ${pending} opération${plural} en attente` : 'Hors ligne';
    } else if (pending) {
      banner.textContent = `Synchronisation — ${pending} opération${plural} en attente`;
    }
    banner.hidden = online && !pending;
    banner.classList.toggle('net-offline', !online);
  }
  addEventListener('online', paint);
  addEventListener('offline', paint);
  store.subscribe('outbox', paint);
  paint();
}

async function boot() {
  const config = await loadConfig();
  store.set('config', config);
  setCurrency(config.currency);
  configure(config, { token, refresh });
  await open();

  store.subscribe('session', (s) => {
    applySessionClasses(s);
    setCurrency(s?.shop?.devise || config.currency); // devise de la boutique (FC ou $), comme Android
  });
  const onRoute = buildShell();
  // Retour de Google : session ouverte, ou compte sans boutique envoyé vers l'inscription.
  const google = await completeGoogleSignIn();
  if (google) navigate(google === 'register' ? '/inscription' : HOME, { replace: true });
  await restore();
  applySessionClasses(store.get('session'));
  setCurrency(store.get('session')?.shop?.devise || config.currency);
  await loadSettings();
  await refreshCartCount();
  watchNetwork();

  if (!location.hash) navigate(store.get('session') ? HOME : '/connexion', { replace: true });
  start(qs('#app'), onRoute);
  startSync();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker :', err));
  }
}

if (!window.abahzUnsupported) boot().catch((err) => {
  console.error(err);
  qs('#app').replaceChildren(h('section', { class: 'page' },
    h('h1', { class: 't-headline' }, 'ABAHZ ne peut pas démarrer'),
    h('p', {}, err.message || String(err)),
    h('button', { type: 'button', class: 'btn btn-primary', onclick: () => location.reload() }, 'Réessayer')));
});

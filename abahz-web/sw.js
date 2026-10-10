// Service Worker : met en cache les fichiers statiques pour le hors ligne (NFR-04).
// Incrémenter VERSION à chaque déploiement : l'ancien cache est alors supprimé.

const VERSION = 'abahz-v0.9.0';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/logo.webp',
  'icons/google.svg',
  'css/base.css',
  'css/components.css',
  'css/print.css',
  'css/screens.css',
  'js/app.js',
  'js/compat.js',
  'js/core/api.js',
  'js/core/auth.js',
  'js/core/cart.js',
  'js/core/db.js',
  'js/core/dom.js',
  'js/core/format.js',
  'js/core/remote.js',
  'js/core/repo.js',
  'js/core/router.js',
  'js/core/settings.js',
  'js/core/store.js',
  'js/core/sync.js',
  'js/services/checkout.js',
  'js/services/depts.js',
  'js/services/invoice.js',
  'js/services/report.js',
  'js/services/staff.js',
  'js/services/stats.js',
  'js/ui/components.js',
  'js/ui/field.js',
  'js/ui/header.js',
  'js/ui/icons.js',
  'js/ui/logout.js',
  'js/ui/modal.js',
  'js/ui/toast.js',
  'js/views/about.js',
  'js/views/auth.js',
  'js/views/cart.js',
  'js/views/categories.js',
  'js/views/customers.js',
  'js/views/depts.js',
  'js/views/expenses.js',
  'js/views/help.js',
  'js/views/home.js',
  'js/views/invoice.js',
  'js/views/orders.js',
  'js/views/placeholder.js',
  'js/views/product-form.js',
  'js/views/profile.js',
  'js/views/ref-list.js',
  'js/views/register.js',
  'js/views/settings.js',
  'js/views/supplier.js',
  'js/views/sync.js',
  'js/views/units.js',
  'js/views/users.js',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const { request } = ev;
  const url = new URL(request.url);
  // Seuls les fichiers de l'application passent par le cache ; Supabase va toujours au réseau.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // config.json : réseau d'abord (pour prendre une nouvelle configuration), cache en secours.
  if (url.pathname.endsWith('/config.json')) {
    ev.respondWith(fetch(request)
      .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(request, copy)); return res; })
      .catch(() => caches.match(request)));
    return;
  }

  // Le reste : cache d'abord, puis réseau (mis en cache pour la prochaine fois).
  ev.respondWith(caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(request, copy)); }
    return res;
  })));
});

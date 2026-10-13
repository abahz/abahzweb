// Service worker de retrait. L'ancienne app web (gestion) avait installé un service worker qui
// sert son propre site depuis le cache. Les navigateurs relisent /sw.js : cette version vide
// tous les caches, se désinstalle et recharge les onglets ouverts sur la landing page.

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: 'window' }); })
      .then(function (clients) { clients.forEach(function (c) { c.navigate(c.url); }); })
  );
});

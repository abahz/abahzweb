// Landing ABAHZ : année du pied de page, retrait de l'ancien service worker et barre d'action mobile.
// L'inscription (connexion Google + création de la boutique) se fait sur inscription.html.

(function () {
  'use strict';

  var copy = document.getElementById('copy');
  if (copy) copy.textContent = '© ' + new Date().getFullYear() + ' Abahz Inc. Tous droits réservés.';

  // L'ancienne app web avait un service worker qui garde l'ancien site en cache : on le retire.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (r) { r.unregister(); });
    }).catch(function () {});
  }

  // Barre mobile : masquée quand le formulaire est à l'écran (elle le recouvrirait).
  var sticky = document.getElementById('sticky');
  var early = document.getElementById('acces');
  if (sticky && early && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      sticky.classList.toggle('hide', entries[0].isIntersecting);
    }, { threshold: 0.15 }).observe(early);
  }
})();

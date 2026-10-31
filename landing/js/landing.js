// Landing ABAHZ : demande d'accès gratuit (Gmail + numéro WhatsApp) et barre d'action mobile.
// Pas de serveur : le formulaire ouvre WhatsApp vers l'administration avec un message prérempli.
// L'administration active l'accès Google Play avec l'adresse Gmail, puis envoie le lien sur WhatsApp.

(function () {
  'use strict';

  var WHATSAPP = '243846696889';

  var copy = document.getElementById('copy');
  if (copy) copy.textContent = '© ' + new Date().getFullYear() + ' Abahz Inc. Tous droits réservés.';

  // L'ancienne app web avait un service worker qui garde l'ancien site en cache : on le retire.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (r) { r.unregister(); });
    }).catch(function () {});
  }

  // Numéro → chiffres au format international, RDC par défaut (+243).
  // Accepte « 0971234567 », « 971234567 », « +243 97 123 4567 », « 00243… », ou un numéro étranger complet.
  function normalize(raw) {
    var d = String(raw || '').replace(/[^\d+]/g, '');
    var intl = d.charAt(0) === '+' || d.indexOf('00') === 0;
    d = d.replace(/\D/g, '').replace(/^00/, '');
    if (!intl) {
      if (d.indexOf('243') === 0 && d.length === 12) return d;
      if (d.charAt(0) === '0') d = d.slice(1);
      return d.length === 9 ? '243' + d : null;
    }
    if (d.indexOf('243') === 0) return d.length === 12 ? d : null;
    return d.length >= 8 && d.length <= 15 ? d : null;
  }

  // Adresse e-mail en minuscules, format simple ; null si invalide.
  function normalizeEmail(raw) {
    var e = String(raw || '').trim().toLowerCase();
    return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e) ? e : null;
  }

  var form = document.getElementById('lead');
  var msg = document.getElementById('lead-msg');
  var phone = document.getElementById('phone');
  var email = document.getElementById('email');
  var name = document.getElementById('name');

  function say(text, kind) { msg.textContent = text; msg.className = 'lead-msg ' + (kind || ''); }

  function sendWhatsapp(mail, num, who) {
    var text = 'Bonjour ABAHZ, je veux l’accès gratuit à l’application de gestion.\n' +
      'Mon Gmail : ' + mail + '\n' +
      'Mon numéro WhatsApp : +' + num + (who ? '\nMa boutique : ' + who : '');
    window.location.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text);
  }

  // Clavier mobile : « Suivant » sur Gmail puis WhatsApp passe au champ suivant au lieu d'envoyer.
  [[email, phone], [phone, name]].forEach(function (pair) {
    if (pair[0] && pair[1]) pair[0].addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); pair[1].focus(); }
    });
  });

  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var mail = normalizeEmail(email.value);
    var num = normalize(phone.value);
    var who = name.value.trim().slice(0, 80);
    if (!mail) {
      email.setAttribute('aria-invalid', 'true');
      say('Adresse Gmail invalide. Exemple : neema@gmail.com', 'err');
      email.focus();
      return;
    }
    email.removeAttribute('aria-invalid');
    if (!num) {
      phone.setAttribute('aria-invalid', 'true');
      say('Numéro invalide. Exemple : 97 123 4567', 'err');
      phone.focus();
      return;
    }
    phone.removeAttribute('aria-invalid');
    say('Nous ouvrons WhatsApp : appuyez sur « Envoyer » pour réserver votre place.', 'ok');
    setTimeout(function () { sendWhatsapp(mail, num, who); }, 700);
  });

  // Barre mobile : masquée quand le formulaire est à l'écran (elle le recouvrirait).
  var sticky = document.getElementById('sticky');
  var early = document.getElementById('acces');
  if (sticky && early && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      sticky.classList.toggle('hide', entries[0].isIntersecting);
    }, { threshold: 0.15 }).observe(early);
  }
})();

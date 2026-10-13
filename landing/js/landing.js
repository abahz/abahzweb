// Landing ABAHZ : inscription des précurseurs (numéro WhatsApp) et barre d'action mobile.
// Le numéro part dans la table Supabase `precurseurs` (insertion seule, voir
// supabase/precurseurs.sql). Si l'envoi échoue, on ouvre WhatsApp avec un
// message prérempli : aucun contact n'est perdu.

(function () {
  'use strict';

  var SUPABASE_URL = 'https://qvjynsbvcbhmrzwaodyv.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2anluc2J2Y2JobXJ6d2FvZHl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MjU3MzAsImV4cCI6MjEwNDQwMTczMH0.uGn2X9HtRJ_CKwpHKT4E_z_i5d1nT7k2YXcQTeUgwcQ';
  var WHATSAPP = '243846770619';

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

  var form = document.getElementById('lead');
  var msg = document.getElementById('lead-msg');
  var phone = document.getElementById('phone');
  var name = document.getElementById('name');

  function say(text, kind) { msg.textContent = text; msg.className = 'lead-msg ' + (kind || ''); }

  function whatsappFallback(num, who) {
    var text = 'Bonjour ABAHZ, je veux devenir précurseur. Mon numéro WhatsApp : +' + num + (who ? ' (' + who + ')' : '');
    window.location.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text);
  }

  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var num = normalize(phone.value);
    var who = name.value.trim().slice(0, 80);
    if (!num) {
      phone.setAttribute('aria-invalid', 'true');
      say('Numéro invalide. Exemple : 97 123 4567', 'err');
      phone.focus();
      return;
    }
    phone.removeAttribute('aria-invalid');
    var btn = form.querySelector('button');
    btn.disabled = true;
    say('Envoi…');

    fetch(SUPABASE_URL + '/rest/v1/precurseurs', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ whatsapp: num, nom: who || null, source: location.hostname || null })
    }).then(function (res) {
      // 409 : numéro déjà inscrit, c'est aussi une réussite pour le visiteur.
      if (res.ok || res.status === 409) {
        form.reset();
        say('Merci ! Vous êtes sur la liste. Nous vous écrirons sur WhatsApp au +' + num + '.', 'ok');
      } else {
        throw new Error('HTTP ' + res.status);
      }
    }).catch(function () {
      say('Connexion difficile : nous ouvrons WhatsApp pour finaliser.', 'err');
      setTimeout(function () { whatsappFallback(num, who); }, 900);
    }).then(function () { btn.disabled = false; });
  });

  // Barre mobile : masquée quand le formulaire est à l'écran (elle le recouvrirait).
  var sticky = document.getElementById('sticky');
  var early = document.getElementById('precurseur');
  if (sticky && early && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      sticky.classList.toggle('hide', entries[0].isIntersecting);
    }, { threshold: 0.15 }).observe(early);
  }
})();

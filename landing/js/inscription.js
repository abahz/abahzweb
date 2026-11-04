// Inscription ABAHZ en libre-service : connexion Google (Supabase Auth, flux PKCE) puis création
// de la boutique avec la fonction serveur create_shop, la même que celle de l'application.
// Le commerçant installe ensuite l'app et se connecte avec le même compte Google : sa boutique est déjà là.
// Pas de bibliothèque : appels directs aux API REST de Supabase (la CSP n'autorise que nos scripts).

(function () {
  'use strict';

  var CONFIG = {
    supabaseUrl: 'https://qvjynsbvcbhmrzwaodyv.supabase.co',
    // Clé publique (publishable) : elle ne donne aucun droit sans session. Les règles RLS protègent les données.
    supabaseKey: 'sb_publishable_Ect4c52_YJaTxLeFgZtpSQ_a66jKqYX',
    // Lien Google Play : à renseigner avec l'applicationId réel, ex. 'https://play.google.com/store/apps/details?id=com.abahz.app'.
    playUrl: null,
    // Test fermé : lien du Google Group des testeurs (ex. 'https://groups.google.com/g/abahz-testeurs').
    // Tant qu'il est vide, le commerçant envoie son Gmail vérifié à l'administration sur WhatsApp.
    testersGroupUrl: null,
    // true tant que l'app est en test fermé ; false après publication en production (lien Play public).
    closedTest: true,
    whatsapp: '243846696889'
  };

  var KEY_VERIFIER = 'abahz.pkce';
  var KEY_SESSION = 'abahz.session';
  var REDIRECT = location.origin + location.pathname;

  var $ = function (id) { return document.getElementById(id); };
  var steps = ['s-loading', 's-login', 's-form', 's-pending', 's-done', 's-error'];
  var session = null;

  function show(id) {
    steps.forEach(function (s) { var el = $(s); if (el) el.hidden = s !== id; });
    var who = $('who');
    if (who) who.hidden = !session || id === 's-login';
    window.scrollTo(0, 0);
  }

  // ---------- Stockage (navigation privée : peut être indisponible) ----------
  function store(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }

  // ---------- PKCE ----------
  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function randomVerifier() { var a = new Uint8Array(48); crypto.getRandomValues(a); return b64url(a); }
  function challenge(verifier) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
      .then(function (h) { return b64url(new Uint8Array(h)); });
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // ---------- API Supabase ----------
  function api(path, opts) {
    opts = opts || {};
    var headers = { apikey: CONFIG.supabaseKey, Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (session && !opts.anon) headers.Authorization = 'Bearer ' + session.token;
    return fetch(CONFIG.supabaseUrl + path, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) {
          var err = new Error((j && (j.message || j.msg || j.error_description || j.error)) || ('Erreur ' + r.status));
          err.status = r.status;
          err.code = j && (j.code || j.error_code);
          throw err;
        }
        return j;
      });
    });
  }

  function signIn() {
    var verifier = randomVerifier();
    store(KEY_VERIFIER, verifier);
    if (load(KEY_VERIFIER) !== verifier) {
      return fail('Votre navigateur bloque le stockage temporaire (navigation privée ?). Ouvrez cette page dans Chrome normal.');
    }
    challenge(verifier).then(function (c) {
      location.href = CONFIG.supabaseUrl + '/auth/v1/authorize?provider=google' +
        '&redirect_to=' + encodeURIComponent(REDIRECT) +
        '&code_challenge=' + c + '&code_challenge_method=s256' +
        '&prompt=select_account';
    });
  }

  function exchange(code) {
    var verifier = load(KEY_VERIFIER);
    store(KEY_VERIFIER, null);
    if (!verifier) return Promise.reject(new Error('Connexion interrompue. Recommencez.'));
    return api('/auth/v1/token?grant_type=pkce', { anon: true, body: { auth_code: code, code_verifier: verifier } })
      .then(function (j) {
        var meta = (j.user && j.user.user_metadata) || {};
        session = {
          token: j.access_token,
          expires: Date.now() + (j.expires_in || 3600) * 1000,
          id: j.user.id,
          email: String(j.user.email || '').toLowerCase(),
          name: meta.full_name || meta.name || ''
        };
        store(KEY_SESSION, JSON.stringify(session));
      });
  }

  function signOut() {
    var s = session;
    session = null;
    store(KEY_SESSION, null);
    if (s) fetch(CONFIG.supabaseUrl + '/auth/v1/logout', {
      method: 'POST', headers: { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + s.token }
    }).catch(function () {});
  }

  // ---------- Parcours ----------
  function fail(text) {
    $('error-text').textContent = text;
    show('s-error');
  }

  function handleError(e) {
    if (e && (e.status === 401 || /jwt/i.test(e.message))) {
      signOut();
      say('Votre session a expiré. Reconnectez-vous.', 'err', 'login-msg');
      return show('s-login');
    }
    if (e instanceof TypeError) return fail('Pas de connexion internet. Vérifiez votre réseau, puis réessayez.');
    fail(e && e.message ? e.message : 'Une erreur est survenue.');
  }

  // Le compte Google a-t-il déjà une boutique ? Même règle que current_user_id() : par identifiant, puis par Gmail.
  function route() {
    show('s-loading');
    $('who-email').textContent = session.email;
    var or = '(id.eq.' + session.id + ',email.eq."' + session.email.replace(/"/g, '') + '")';
    return api('/rest/v1/users?select=id,shopid,status,role&or=' + encodeURIComponent(or) + '&limit=1')
      .then(function (rows) {
        var me = rows && rows[0];
        if (!me) return startForm();
        if (me.status !== 'ACTIVE') return show('s-pending');
        return api('/rest/v1/shops?select=name&id=eq.' + encodeURIComponent(me.shopid))
          .then(function (shops) { done((shops && shops[0] && shops[0].name) || 'votre boutique', null, true); });
      })
      .catch(handleError);
  }

  function startForm() {
    var admin = $('admin');
    if (admin && !admin.value) admin.value = session.name;
    show('s-form');
    $('shop').focus();
  }

  function done(shopName, phone, existing) {
    $('done-title').textContent = existing
      ? 'Vous avez déjà une boutique : « ' + shopName + ' ».'
      : 'Votre boutique « ' + shopName + ' » est prête.';
    $('done-email').textContent = session.email;

    var group = $('step-group'), play = $('step-play'), wa = $('step-wa');
    var viaGroup = CONFIG.closedTest && !!CONFIG.testersGroupUrl;
    group.hidden = !viaGroup;
    if (CONFIG.testersGroupUrl) $('group-link').href = CONFIG.testersGroupUrl;
    play.hidden = !CONFIG.playUrl;
    if (CONFIG.playUrl) $('play-link').href = CONFIG.playUrl;
    // Test fermé sans groupe (testeurs ajoutés à la main) ou lien Play inconnu :
    // l'administration reçoit le Gmail vérifié sur WhatsApp.
    wa.hidden = !((CONFIG.closedTest && !viaGroup) || !CONFIG.playUrl);
    var text = 'Bonjour ABAHZ, j’ai créé ma boutique sur abahz.com.\n' +
      'Boutique : ' + shopName + '\n' +
      'Mon Gmail : ' + session.email + (phone ? '\nMon WhatsApp : ' + phone : '') +
      '\nMerci de m’envoyer le lien d’installation.';
    $('wa-link').href = 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(text);
    show('s-done');
  }

  // ---------- Formulaire ----------
  // Numéro → chiffres au format international, RDC par défaut (+243). null si invalide.
  function normalizePhone(raw) {
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
  // Format déjà utilisé par la plupart des boutiques (factures) : 0971234567 en RDC, +… ailleurs.
  function displayPhone(intl) { return intl.indexOf('243') === 0 ? '0' + intl.slice(3) : '+' + intl; }

  function say(text, kind, id) {
    var el = $(id || 'form-msg');
    el.textContent = text;
    el.className = 'lead-msg ' + (kind || '');
  }

  function invalid(input, text) {
    input.setAttribute('aria-invalid', 'true');
    say(text, 'err');
    input.focus();
  }

  function submit(e) {
    e.preventDefault();
    var shop = $('shop'), admin = $('admin'), phone = $('phone'), btn = $('create');
    ['shop', 'admin', 'phone'].forEach(function (id) { $(id).removeAttribute('aria-invalid'); });

    var name = shop.value.trim().replace(/\s+/g, ' ');
    var who = admin.value.trim().replace(/\s+/g, ' ');
    var num = normalizePhone(phone.value);
    if (name.length < 2) return invalid(shop, 'Indiquez le nom de votre boutique.');
    if (who.length < 2) return invalid(admin, 'Indiquez votre nom (le gérant).');
    if (!num) return invalid(phone, 'Numéro invalide. Exemple : 97 123 4567');

    var devise = (document.querySelector('input[name="devise"]:checked') || {}).value || 'FC';
    var payload = {
      p_shop: {
        id: uuid(),
        name: name.slice(0, 80),
        type: 'BASIC',
        phone: displayPhone(num),
        address: $('address').value.trim().slice(0, 160),
        category: $('category').value || 'Autres',
        devise: devise
      },
      p_admin_name: who.slice(0, 80)
    };

    btn.disabled = true;
    say('Création de votre boutique…', 'ok');
    api('/rest/v1/rpc/create_shop', { body: payload })
      .then(function () { done(payload.p_shop.name, '+' + num, false); })
      .catch(function (err) {
        // Déjà rattaché (double clic, autre onglet, boutique créée depuis l'app) : on relit l'état réel.
        if (err.code === '23505') return route();
        if (err.code === '22023') return say(err.message, 'err');
        if (err.code === '42501') return say('Ce compte doit être un compte Google. Reconnectez-vous avec Gmail.', 'err');
        handleError(err);
      })
      .then(function () { btn.disabled = false; });
  }

  // ---------- Démarrage ----------
  function init() {
    $('google').addEventListener('click', signIn);
    $('retry').addEventListener('click', function () { session ? route() : show('s-login'); });
    $('switch').addEventListener('click', function () { signOut(); show('s-login'); });
    $('signup').addEventListener('submit', submit);

    var q = new URLSearchParams(location.search);
    var h = new URLSearchParams(location.hash.slice(1));
    var code = q.get('code');
    var oauthError = q.get('error_description') || h.get('error_description');
    if (code || oauthError || q.get('error') || h.get('error')) history.replaceState(null, '', REDIRECT);

    if (oauthError) {
      say('Connexion Google annulée ou refusée. Réessayez.', 'err', 'login-msg');
      return show('s-login');
    }
    if (code) {
      show('s-loading');
      return exchange(code).then(route).catch(function (e) {
        say(e.message || 'Connexion impossible. Réessayez.', 'err', 'login-msg');
        show('s-login');
      });
    }

    try { session = JSON.parse(load(KEY_SESSION) || 'null'); } catch (e) { session = null; }
    if (session && session.expires > Date.now() + 60000) return route();
    session = null;
    store(KEY_SESSION, null);
    show('s-login');
  }

  var copy = $('copy');
  if (copy) copy.textContent = '© ' + new Date().getFullYear() + ' Abahz Inc. Tous droits réservés.';
  init();
})();

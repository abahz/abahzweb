// Landing ABAHZ : demande d'accès gratuit (Gmail + numéro WhatsApp), panier du matériel et barre d'action mobile.
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

  // Panier du matériel : la commande ouvre WhatsApp vers l'administration avec la liste préremplie.
  // Les produits et leurs prix sont lus dans le HTML (data-id, data-name, data-price).
  var STORE = 'abahz-panier';

  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function money(n) { return n.toLocaleString('fr-FR') + ' $'; }

  // Catalogue lu depuis les cartes produits.
  var catalog = {};
  $$('.product').forEach(function (el) {
    catalog[el.dataset.id] = { name: el.dataset.name, price: Number(el.dataset.price) || 0 };
  });

  // Panier : { id: quantité }, gardé dans le navigateur quand c'est possible.
  var cart = {};
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    Object.keys(saved).forEach(function (id) {
      var q = Math.floor(saved[id]);
      if (catalog[id] && q > 0) cart[id] = Math.min(q, 99);
    });
  } catch (e) { cart = {}; }

  function save() { try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch (e) {} }

  function lines() {
    return Object.keys(cart).map(function (id) {
      return { id: id, name: catalog[id].name, price: catalog[id].price, qty: cart[id] };
    });
  }
  function total() { return lines().reduce(function (s, l) { return s + l.price * l.qty; }, 0); }
  function count() { return lines().reduce(function (s, l) { return s + l.qty; }, 0); }

  var list = document.getElementById('cart-items');
  var empty = document.getElementById('cart-empty');
  var order = document.getElementById('order');
  var orderMsg = document.getElementById('order-msg');
  var drawer = document.getElementById('cart');
  var backdrop = document.getElementById('cart-backdrop');
  if (!list || !order || !drawer) return;

  function render() {
    var ls = lines();
    $$('[data-cart-count]').forEach(function (el) { el.textContent = count(); });
    $$('[data-cart-total]').forEach(function (el) { el.textContent = money(total()); });
    empty.hidden = ls.length > 0;
    order.hidden = ls.length === 0;
    list.textContent = '';
    ls.forEach(function (l) {
      var li = document.createElement('li');
      var itemName = document.createElement('b');
      itemName.textContent = l.name;
      var sum = document.createElement('span');
      sum.className = 'line-total';
      sum.textContent = money(l.price * l.qty);
      var unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = money(l.price) + ' l’unité';
      var qty = document.createElement('div');
      qty.className = 'qty';
      qty.innerHTML = '<button type="button" data-dec aria-label="Retirer un">−</button><span></span><button type="button" data-inc aria-label="Ajouter un">+</button>';
      qty.querySelector('span').textContent = l.qty;
      qty.dataset.id = l.id;
      li.append(itemName, sum, unit, qty);
      list.appendChild(li);
    });
  }

  function setQty(id, q) {
    if (q <= 0) delete cart[id]; else cart[id] = Math.min(q, 99);
    save();
    render();
  }

  list.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var id = btn.parentNode.dataset.id;
    setQty(id, (cart[id] || 0) + (btn.hasAttribute('data-inc') ? 1 : -1));
  });

  $$('[data-add]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.closest('.product').dataset.id;
      setQty(id, (cart[id] || 0) + 1);
      btn.textContent = 'Ajouté ✓';
      btn.classList.add('added');
      setTimeout(function () { btn.textContent = 'Ajouter'; btn.classList.remove('added'); }, 1200);
    });
  });

  // Tiroir du panier
  var opener = null;

  function openCart() {
    opener = document.activeElement;
    backdrop.hidden = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cart-lock');
    drawer.focus();
  }
  function closeCart() {
    backdrop.hidden = true;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cart-lock');
    if (opener && opener.focus) opener.focus();
  }

  $$('[data-open-cart]').forEach(function (b) { b.addEventListener('click', openCart); });
  $$('[data-close-cart]').forEach(function (b) { b.addEventListener('click', closeCart); });
  backdrop.addEventListener('click', closeCart);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeCart();
  });

  // Commande sur WhatsApp
  order.addEventListener('submit', function (e) {
    e.preventDefault();
    var ls = lines();
    if (!ls.length) return;
    // Nom et adresse obligatoires : sans eux, la commande ne peut pas être livrée.
    var nameInput = document.getElementById('order-name');
    var addrInput = document.getElementById('order-address');
    var who = nameInput.value.trim().slice(0, 80);
    var addr = addrInput.value.trim().slice(0, 160);
    nameInput.removeAttribute('aria-invalid');
    addrInput.removeAttribute('aria-invalid');
    if (who.length < 2) {
      nameInput.setAttribute('aria-invalid', 'true');
      orderMsg.textContent = 'Indiquez votre nom pour commander.';
      orderMsg.className = 'lead-msg err';
      nameInput.focus();
      return;
    }
    if (addr.length < 5) {
      addrInput.setAttribute('aria-invalid', 'true');
      orderMsg.textContent = 'Indiquez votre adresse de livraison (avenue, quartier, ville).';
      orderMsg.className = 'lead-msg err';
      addrInput.focus();
      return;
    }
    var text = 'Bonjour ABAHZ, je veux commander :\n' +
      ls.map(function (l) { return '• ' + l.qty + ' × ' + l.name + ' (' + money(l.price * l.qty) + ')'; }).join('\n') +
      '\nTotal : ' + money(total()) +
      '\nNom du client : ' + who +
      '\nAdresse de livraison : ' + addr;
    orderMsg.textContent = 'Nous ouvrons WhatsApp : appuyez sur « Envoyer » pour passer la commande.';
    orderMsg.className = 'lead-msg ok';
    setTimeout(function () {
      window.location.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text);
    }, 700);
  });

  render();
})();

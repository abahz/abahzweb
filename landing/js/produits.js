// Page Produits ABAHZ : panier.
// Pas de serveur : la commande ouvre WhatsApp vers l'administration avec la liste préremplie.
// Les produits et leurs prix sont lus dans le HTML (data-id, data-name, data-price).

(function () {
  'use strict';

  var WHATSAPP = '243846696889';
  var STORE = 'abahz-panier';

  var copy = document.getElementById('copy');
  if (copy) copy.textContent = '© ' + new Date().getFullYear() + ' Abahz Inc. Tous droits réservés.';

  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function money(n) { return n.toLocaleString('fr-FR') + ' $'; }

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
  var msg = document.getElementById('order-msg');

  function render() {
    var ls = lines();
    $$('[data-cart-count]').forEach(function (el) { el.textContent = count(); });
    $$('[data-cart-total]').forEach(function (el) { el.textContent = money(total()); });
    empty.hidden = ls.length > 0;
    order.hidden = ls.length === 0;
    list.textContent = '';
    ls.forEach(function (l) {
      var li = document.createElement('li');
      var name = document.createElement('b');
      name.textContent = l.name;
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
      li.append(name, sum, unit, qty);
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
  var drawer = document.getElementById('cart');
  var backdrop = document.getElementById('cart-backdrop');
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
      msg.textContent = 'Indiquez votre nom pour commander.';
      msg.className = 'lead-msg err';
      nameInput.focus();
      return;
    }
    if (addr.length < 5) {
      addrInput.setAttribute('aria-invalid', 'true');
      msg.textContent = 'Indiquez votre adresse de livraison (avenue, quartier, ville).';
      msg.className = 'lead-msg err';
      addrInput.focus();
      return;
    }
    var text = 'Bonjour ABAHZ, je veux commander :\n' +
      ls.map(function (l) { return '• ' + l.qty + ' × ' + l.name + ' (' + money(l.price * l.qty) + ')'; }).join('\n') +
      '\nTotal : ' + money(total()) +
      '\nNom du client : ' + who +
      '\nAdresse de livraison : ' + addr;
    msg.textContent = 'Nous ouvrons WhatsApp : appuyez sur « Envoyer » pour passer la commande.';
    msg.className = 'lead-msg ok';
    setTimeout(function () {
      window.location.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text);
    }, 700);
  });

  render();
})();

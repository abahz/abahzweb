// Script classique (ES5) chargé avant app.js : détecte un navigateur incapable de faire tourner
// ABAHZ (Opera Mini, modules ES ou IndexedDB absents) et affiche un message clair (NFR-06).
(function () {
  // Compléments pour les navigateurs du PRD plus anciens que ce que le code utilise :
  // replaceChildren (Chrome 86, Samsung Internet 14), crypto.randomUUID (Chrome 92, Firefox 95,
  // et absent hors HTTPS). Sans eux, aucun écran ne s'affiche et aucune vente ne s'enregistre.
  function replaceChildren() {
    while (this.lastChild) this.removeChild(this.lastChild);
    this.append.apply(this, arguments);
  }
  [window.Element, window.Document, window.DocumentFragment].forEach(function (C) {
    if (C && !C.prototype.replaceChildren) C.prototype.replaceChildren = replaceChildren;
  });
  var cr = window.crypto;
  if (cr && !cr.randomUUID && cr.getRandomValues) {
    cr.randomUUID = function () {
      var b = cr.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 15) | 64; // version 4
      b[8] = (b[8] & 63) | 128; // variante RFC 4122
      var h = '';
      for (var i = 0; i < 16; i++) h += (i === 4 || i === 6 || i === 8 || i === 10 ? '-' : '') + (b[i] + 256).toString(16).slice(1);
      return h;
    };
  }

  var ua = navigator.userAgent || '';
  var operaMini = /Opera Mini|OPiOS/i.test(ua) || Object.prototype.toString.call(window.operamini) === '[object OperaMini]';
  var script = document.createElement('script');
  var modules = 'noModule' in script;
  var idb = !!window.indexedDB;
  // <dialog> (fenêtres de validation, confirmations) : Firefox 98 et plus.
  var dialog = typeof window.HTMLDialogElement === 'function';
  // Fichier ouvert par double-clic : Chrome bloque les modules en file://, la page resterait vide.
  var file = location.protocol === 'file:';
  if (!operaMini && modules && idb && dialog && !file) return;
  window.abahzUnsupported = true;

  document.addEventListener('DOMContentLoaded', function () {
    var main = document.getElementById('app');
    if (!main) return;
    var box = document.createElement('section');
    box.className = 'page';
    var title = document.createElement('h1');
    title.appendChild(document.createTextNode(file ? 'Ouvrir ABAHZ par un serveur' : 'Navigateur non pris en charge'));
    var text = document.createElement('p');
    text.appendChild(document.createTextNode(file
      ? 'Ce fichier ne peut pas s\'ouvrir directement. Dans un terminal : cd D:\\WEBAPP\\Abahz\\tools puis npm run dev, et ouvrez http://localhost:8765.'
      : operaMini
      ? 'Opera Mini ne permet pas d\'utiliser ABAHZ. Ouvrez cette page avec Chrome, Samsung Internet ou Firefox.'
      : 'Votre navigateur est trop ancien pour ABAHZ. Mettez à jour Chrome, Samsung Internet ou Firefox.'));
    box.appendChild(title);
    box.appendChild(text);
    while (main.firstChild) main.removeChild(main.firstChild);
    main.appendChild(box);
  });
})();

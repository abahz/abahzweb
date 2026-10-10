// Construction du DOM sans innerHTML : tout texte passe par des nœuds texte (anti-XSS).

/**
 * Crée un élément. Les attributs `onclick`, `onsubmit`… reçoivent une fonction ;
 * les propriétés non textuelles (checked, value…) sont posées en propriété.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} children chaînes, nombres, nœuds, tableaux, null
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (typeof v !== 'string' && k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

/** Ajoute des enfants (texte échappé par construction). */
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Délégation d'événements : un seul écouteur pour toute une liste.
 * @returns {() => void} fonction de retrait
 */
export function on(root, type, selector, handler) {
  const listener = (ev) => {
    const target = ev.target instanceof Element ? ev.target.closest(selector) : null;
    if (target && root.contains(target)) handler(ev, target);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}

/** Lit les champs nommés d'un formulaire en objet simple. */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
  }
  return out;
}

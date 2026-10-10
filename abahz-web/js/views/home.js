// #/accueil — catalogue, calqué sur HomeScreen + ProductCard (Android) (PRD-01 à PRD-08).

import { h, on } from '../core/dom.js';
import { store } from '../core/store.js';
import { tx, req } from '../core/db.js';
import { productsRepo } from '../core/repo.js';
import { cartItems, toggleCart, removeFromCart } from '../core/cart.js';
import { fc, qty, normalize } from '../core/format.js';
import { settings } from '../core/settings.js';
import { navigate } from '../core/router.js';
import { icon } from '../ui/icons.js';
import { modal } from '../ui/modal.js';
import { emptyState, pill, chip, moreButton, confirmDelete } from '../ui/components.js';
import { toast } from '../ui/toast.js';

const PAGE = 50;

// Texte de recherche de chaque produit, calculé une fois par objet : retirer les accents de
// 2 000 noms à chaque frappe coûtait ~75 ms sur un téléphone d'entrée de gamme. Un produit
// modifié est un nouvel objet (relu dans la base) : son texte est alors recalculé.
const searchText = new WeakMap();
const textOf = (p) => {
  let t = searchText.get(p);
  if (t === undefined) {
    t = `${normalize(p.name)}\n${normalize(p.category)}`;
    searchText.set(p, t);
  }
  return t;
};

/** Filtre de l'accueil : catégorie puis texte (nom ou catégorie, sans casse ni accents). Fonction pure (testée). */
export function filterProducts(products, { category = null, query = '' } = {}) {
  const q = normalize(query);
  return products.filter((p) => (category == null || p.category === category) && (!q || textOf(p).includes(q)));
}

/** Catégories présentes dans le catalogue, triées (comme Android). */
export const categoriesOf = (products) =>
  [...new Set(products.map((p) => p.category).filter((c) => c && c.trim()))].sort((a, b) => a.localeCompare(b, 'fr'));

/** Image affichable : seulement une URL web (Android écrit parfois un chemin local du téléphone dans `image`). */
const webImage = (p) => [p.url, p.image].find((u) => /^https?:\/\//.test(u || ''));

export async function render(root) {
  const isAdmin = store.isAdmin;
  const threshold = store.get('config').lowStockThreshold ?? 2;
  let products = [];
  let inCart = new Set();
  let blobs = new Map();
  let category = null;
  let limit = PAGE;
  const urls = [];

  const chips = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Catégories' });
  const grid = h('div', { class: 'product-grid' });
  const footer = h('div', { class: 'grid-footer' });
  root.replaceChildren(h('div', { class: 'page home' }, chips, grid, footer));

  function imageOf(p) {
    if (settings().dataSaver) return h('span', { class: 'initial' }, (p.name || '?').trim().charAt(0).toUpperCase());
    const src = webImage(p) || blobs.get(p.id);
    if (src) return h('img', { src, alt: '', loading: 'lazy', decoding: 'async' });
    return icon('inventory');
  }

  function card(p) {
    const selected = inCart.has(p.id);
    const stock = Number(p.qty) || 0;
    const status = stock <= 0 ? pill('Rupture', 'error')
      : stock <= threshold ? pill('Stock bas', 'warning') : pill('En stock', 'success');
    return h('article', { class: `product-card${selected ? ' selected' : ''}`, 'data-id': p.id },
      h('div', { class: 'product-media' },
        imageOf(p),
        status,
        isAdmin && h('button', { type: 'button', class: 'card-menu', 'data-menu': p.id, 'aria-label': 'Plus d\'options' }, icon('more_vert'))),
      h('p', { class: 'product-name' }, p.name),
      h('div', { class: 'product-foot' },
        h('div', { class: 'product-meta' },
          h('strong', {}, fc(p.price)),
          h('span', {}, `${qty(stock)} ${p.unity || 'pcs'}`)),
        h('button', {
          type: 'button', class: `cart-toggle${selected ? ' on' : ''}`, 'data-toggle': p.id,
          'aria-label': selected ? 'Retirer du panier' : 'Ajouter au panier', 'aria-pressed': String(selected),
        }, icon(selected ? 'check' : 'add_cart'))));
  }

  function paint() {
    const cats = categoriesOf(products);
    if (category && !cats.includes(category)) category = null;
    chips.hidden = !cats.length;
    chips.replaceChildren(
      chip('Tout', category == null, () => { category = null; limit = PAGE; paint(); }),
      ...cats.map((c) => chip(c, category === c, () => { category = category === c ? null : c; limit = PAGE; paint(); })));

    const list = filterProducts(products, { category, query: store.get('search') || '' });
    if (!list.length) {
      const loading = !products.length && store.get('pulling');
      grid.replaceChildren(loading
        ? emptyState('sync', 'Chargement du catalogue…', 'Les produits de la boutique arrivent.')
        : !products.length
          ? emptyState('inventory', 'Aucun produit', isAdmin
            ? 'Ajoutez votre premier produit avec le bouton « Produit ».' : 'Le catalogue de la boutique est vide.')
          : emptyState('search_off', 'Aucun produit trouvé', 'Essayez un autre mot ou une autre catégorie.'));
      grid.classList.add('is-empty');
      footer.replaceChildren();
      return;
    }
    grid.classList.remove('is-empty');
    const frag = document.createDocumentFragment();
    for (const p of list.slice(0, limit)) frag.append(card(p));
    grid.replaceChildren(frag);
    footer.replaceChildren(moreButton(limit, list.length, () => { limit += PAGE; paint(); }) || '');
  }

  async function load() {
    const [rows, cart, pending] = await Promise.all([
      productsRepo.all(),
      cartItems(),
      tx('blobs', 'readonly', (s) => req(s.blobs.getAll())),
    ]);
    products = rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
    inCart = new Set(cart.map((c) => c.pid));
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    blobs = new Map(pending.map((b) => { const u = URL.createObjectURL(b.data); urls.push(u); return [b.id, u]; }));
    paint();
  }

  async function openMenu(id) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const choice = await modal({
      title: p.name || 'Options du produit',
      body: h('div', { class: 'menu-list' },
        h('button', { type: 'button', class: 'menu-item', 'data-value': 'edit' }, icon('edit'), 'Modifier'),
        h('button', { type: 'button', class: 'menu-item danger', 'data-value': 'delete' }, icon('delete'), 'Supprimer')),
      actions: [{ label: 'Annuler', value: null }],
      pick: '.menu-item',
    });
    if (choice === 'edit') navigate(`/produit/${encodeURIComponent(p.id)}`);
    if (choice === 'delete' && await confirmDelete('Supprimer le produit ?', `Le produit « ${p.name} » sera supprimé.`)) {
      await productsRepo.remove(p);
      await removeFromCart(p.id);
      toast('Produit supprimé.');
    }
  }

  const offs = [
    on(grid, 'click', '[data-menu]', (ev, btn) => { ev.stopPropagation(); openMenu(btn.dataset.menu); }),
    on(grid, 'click', '.product-card', async (ev, el) => {
      if (ev.target.closest('[data-menu]')) return;
      await toggleCart(el.dataset.id);
    }),
    store.subscribe('products', load),
    store.subscribe('cart', async () => { inCart = new Set((await cartItems()).map((c) => c.pid)); paint(); }),
    store.subscribe('search', () => { limit = PAGE; paint(); }),
    store.subscribe('pulling', paint),
  ];
  await load();
  return () => { offs.forEach((off) => off()); urls.forEach((u) => URL.revokeObjectURL(u)); };
}

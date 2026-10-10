// Panier local à l'appareil, jamais synchronisé (comme les Carts Android).

import { tx, req } from './db.js';
import { store } from './store.js';

async function changed() {
  const items = await tx('cart', 'readonly', (s) => req(s.cart.getAll()));
  store.set('cartCount', Math.round(items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0)));
  store.emit('cart');
  return items;
}

export const cartItems = () => tx('cart', 'readonly', (s) => req(s.cart.getAll()));
export const refreshCartCount = changed;

/** Toucher une carte produit : ajoute (quantité 1) ou retire (PRD-02). Renvoie true si ajouté. */
export async function toggleCart(pid) {
  const added = await tx('cart', 'readwrite', async (s) => {
    const existing = await req(s.cart.get(pid));
    if (existing) { s.cart.delete(pid); return false; }
    s.cart.put({ pid, qty: 1, added: Date.now() });
    return true;
  });
  await changed();
  return added;
}

/** Fixe la quantité ; 0 ou moins retire l'article. */
export async function setCartQty(pid, qty) {
  await tx('cart', 'readwrite', async (s) => {
    const existing = await req(s.cart.get(pid));
    if (qty <= 0) s.cart.delete(pid);
    else s.cart.put({ ...(existing || { pid, added: Date.now() }), qty });
  });
  await changed();
}

export async function removeFromCart(pid) {
  await setCartQty(pid, 0);
}

// Tests du lot 5 : performances sans changement de comportement.

import { filterProducts } from '../js/views/home.js';

/** @param {(name: string, fn: Function) => void} test @param {(a: any, b: any) => void} eq */
export function lot5(test, eq) {
  test('recherche : texte mis en cache par produit, recalculé pour un produit modifié', () => {
    const before = { id: 'p1', name: 'Huile Végétale', category: 'Alimentation' };
    eq(filterProducts([before], { query: 'vegetale' }).length, 1);
    eq(filterProducts([before], { query: 'vegetale' }).length, 1); // deuxième passage : depuis le cache
    const after = { ...before, name: 'Savon' };                    // relu dans la base : nouvel objet
    eq(filterProducts([after], { query: 'vegetale' }).length, 0);
    eq(filterProducts([after], { query: 'aliment' }).length, 1);
    eq(filterProducts([after], { query: 'savon alimentation' }).length, 0); // jamais à cheval sur deux champs
    eq(filterProducts(Array.from({ length: 2000 }, (_, i) => ({ id: i, name: `Sucre ${i}`, category: '' })), { query: 'sucre 199' }).length, 11);
  });
}

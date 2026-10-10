// #/categories — ADMIN (REF-01, REF-02).

import { categoriesRepo } from '../core/repo.js';
import { refListView } from './ref-list.js';

export const render = refListView({
  repo: categoriesRepo,
  field: 'category',
  icon: 'category',
  noun: 'Catégorie',
  plural: 'catégorie(s)',
  fem: true,
  label: 'Nom de la catégorie',
  emptyTitle: 'Aucune catégorie',
  emptyMessage: 'Regroupez vos produits par catégorie pour les retrouver plus vite.',
});

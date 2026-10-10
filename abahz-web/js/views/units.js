// #/unites — ADMIN (REF-01, REF-02).

import { unitsRepo } from '../core/repo.js';
import { refListView } from './ref-list.js';

export const render = refListView({
  repo: unitsRepo,
  field: 'unity',
  icon: 'scale',
  noun: 'Unité',
  plural: 'unité(s)',
  fem: true,
  label: 'Nom de l\'unité (ex: Pièce, Kg)',
  emptyTitle: 'Aucune unité',
  emptyMessage: 'Définissez vos unités de vente : pièce, kg, litre, carton…',
});

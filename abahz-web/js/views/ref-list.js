// Écran commun Catégories / Unités, calqué sur CategoryScreen et UnityScreen (Android) (REF-01, REF-02).

import { h } from '../core/dom.js';
import { store } from '../core/store.js';
import { tx, req, SYNC } from '../core/db.js';
import { queueUpsert, written } from '../core/repo.js';
import { setHeader } from '../ui/header.js';
import { emptyState, listItem, confirmDelete, fab, promptName } from '../ui/components.js';
import { toast } from '../ui/toast.js';

/**
 * @param {{repo: object, field: 'category'|'unity', icon: string, noun: string, plural: string,
 *   fem: boolean, emptyTitle: string, emptyMessage: string, label: string}} cfg
 */
export function refListView(cfg) {
  const the = cfg.fem ? 'La' : 'L\'';
  const named = (n) => `${cfg.fem ? 'la' : 'l\''}${cfg.fem ? ' ' : ''}${cfg.noun.toLowerCase()} « ${n} »`;

  return async function render(root) {
    const list = h('div', { class: 'list' });
    root.replaceChildren(h('div', { class: 'page' }, list),
      fab(cfg.noun, () => edit(null)));

    let rows = [];
    let products = [];

    async function load() {
      rows = (await cfg.repo.all()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      products = (await tx('products', 'readonly', (s) => req(s.products.getAll())))
        .filter((p) => p.shopid === store.shopId && p._sync !== SYNC.DELETED);
      setHeader({ subtitle: `${rows.length} ${cfg.plural}` });
      if (!rows.length) {
        list.replaceChildren(emptyState(cfg.icon, cfg.emptyTitle, cfg.emptyMessage));
        return;
      }
      list.replaceChildren(...rows.map((r) => {
        const used = products.filter((p) => p[cfg.field] === r.name).length;
        return listItem({
          icon: cfg.icon,
          title: r.name,
          subtitle: used ? `${used} produit(s)` : null,
          onEdit: () => edit(r),
          onDelete: () => remove(r, used),
        });
      }));
    }

    async function edit(row) {
      const name = await promptName({
        title: row ? `Modifier ${cfg.fem ? 'la' : 'l\''}${cfg.fem ? ' ' : ''}${cfg.noun.toLowerCase()}` : `Ajouter une ${cfg.noun.toLowerCase()}`,
        label: cfg.label,
        value: row?.name || '',
        ok: row ? 'Enregistrer' : 'Ajouter',
        iconName: cfg.icon,
      });
      if (!name || name === row?.name) return;
      if (rows.some((r) => r.id !== row?.id && r.name.toLowerCase() === name.toLowerCase())) {
        toast(`${the}${cfg.fem ? ' ' : ''}${cfg.noun.toLowerCase()} « ${name} » existe déjà.`, 'error');
        return;
      }
      if (!row) { await cfg.repo.save({ name }); return; }

      // Renommage : les produits désignent leur catégorie / unité par son nom ; on les met à jour aussi.
      const now = Date.now();
      const linked = products.filter((p) => p[cfg.field] === row.name);
      await tx([cfg.repo.table, 'products', 'outbox'], 'readwrite', (s) => {
        queueUpsert(s, cfg.repo.table, { ...row, name, updated: now });
        for (const p of linked) queueUpsert(s, 'products', { ...p, [cfg.field]: name, updated: now });
      });
      written(cfg.repo.table, 'products');
    }

    async function remove(row, used) {
      if (used) {
        toast(`Impossible : ${used} produit(s) utilisent encore ${named(row.name)}.`, 'error', 5000);
        return;
      }
      const ok = await confirmDelete(`Supprimer ${cfg.fem ? 'la' : 'l\''}${cfg.fem ? ' ' : ''}${cfg.noun.toLowerCase()} ?`,
        `${the}${cfg.fem ? ' ' : ''}${cfg.noun.toLowerCase()} « ${row.name} » sera supprimée.`);
      if (ok) await cfg.repo.remove(row);
    }

    const offs = [store.subscribe(cfg.repo.table, load), store.subscribe('products', load)];
    await load();
    return () => offs.forEach((off) => off());
  };
}

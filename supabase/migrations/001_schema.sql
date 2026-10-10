-- Lot 0 · 001 — Colonnes optionnelles, historique des remboursements, suppressions synchronisables.
-- Rejouable (IF NOT EXISTS). Aucune colonne renommée ni supprimée : l'app Android actuelle continue de fonctionner.
-- Hypothèse à vérifier sur le schéma réel : les identifiants sont de type text (Android : String).

-- Prix d'achat figé sur la ligne (orderitem.price et orderitem.name existent déjà côté Android).
alter table orderitem add column if not exists coast bigint;

-- Rabais, client et statut de la facture (section 8, points 2 et 8).
alter table orders add column if not exists discount bigint not null default 0;
alter table orders add column if not exists customer_id text;
alter table orders add column if not exists status text not null default 'PAID';
do $$ begin
  alter table orders add constraint orders_status_check check (status in ('PAID', 'CREDIT', 'CANCELLED'));
exception when duplicate_object then null; end $$;

-- Lien dette → facture.
alter table dept add column if not exists order_id text;

-- Historique des remboursements (section 8, point 9).
create table if not exists dept_payment (
  id text primary key,
  dept_id text not null,
  amount bigint not null check (amount > 0),
  shopid text not null,
  sync int not null default 0,
  created bigint not null default 0,
  updated bigint not null default 0
);
create index if not exists dept_payment_shopid_idx on dept_payment (shopid);
create index if not exists dept_payment_dept_idx on dept_payment (dept_id);

-- Suppressions visibles par le pull incrémental du web (PRD 6.3).
create table if not exists tombstones (
  table_name text not null,
  id text not null,
  shopid text not null,
  deleted_at bigint not null,
  primary key (table_name, id)
);
create index if not exists tombstones_pull_idx on tombstones (shopid, deleted_at);

-- Compteur de N° de facture par boutique (PRD 6.5).
create table if not exists shop_counters (
  shopid text primary key,
  last_fid int not null default 0
);

-- Index du pull incrémental (?shopid=eq.X&updated=gt.Y&order=updated.asc).
create index if not exists products_pull_idx on products (shopid, updated);
create index if not exists category_pull_idx on category (shopid, updated);
create index if not exists unity_pull_idx on unity (shopid, updated);
create index if not exists orders_pull_idx on orders (shopid, updated);
create index if not exists orderitem_pull_idx on orderitem (shopid, updated);
create index if not exists orderitem_oid_idx on orderitem (oid);
create index if not exists customer_pull_idx on customer (shopid, updated);
create index if not exists expenses_pull_idx on expenses (shopid, updated);
create index if not exists dept_pull_idx on dept (shopid, updated);
create index if not exists users_shopid_idx on users (shopid);

-- ⚠ NON INCLUS volontairement : passer orderitem.qty en numeric (ventes au poids, section 8 point 11).
-- Android décode orderitem.qty en Long : une quantité décimale ferait échouer sa synchronisation.
-- À faire seulement après la mise à jour Android (voir supabase/ANDROID.md).

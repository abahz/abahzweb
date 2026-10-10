-- Lot 0 · 003 — RLS : chaque utilisateur ne voit et ne modifie que sa boutique (PRD 6.6, section 8 point 6).
-- Compatible avec les parcours Android actuels :
--   · inscription : le compte Auth crée sa boutique (owner = son e-mail) puis sa fiche ADMIN ;
--   · personnel : l'ADMIN insère la fiche d'un employé de sa boutique ;
--   · vente Android : le caissier met à jour products.qty (upsert) — autorisé tant qu'Android n'utilise pas create_order.
-- ⚠ À valider avant production : toute requête Android faite SANS session (ex. checkUserExistsByEmail
--   avant connexion) renverra désormais une liste vide.

create or replace function current_shopid() returns text
language sql stable security definer set search_path = public as $$
  select shopid from users where id = auth.uid()::text limit 1
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid()::text and role = 'ADMIN')
$$;

revoke all on function current_shopid() from public, anon;
revoke all on function is_admin() from public, anon;
grant execute on function current_shopid() to authenticated;
grant execute on function is_admin() to authenticated;

-- Politiques ouvertes trouvées en production le 10/10/2026 (« RLS » pour public, « Allow all authenticated
-- for … », using true). Les politiques s'additionnent : tant qu'elles existent, celles ci-dessous ne
-- protègent rien. Elles sont supprimées ici.
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
            where schemaname = 'public'
              and tablename in ('products', 'category', 'unity', 'orders', 'orderitem', 'customer',
                                'expenses', 'dept', 'shops', 'users')
              and (policyname = 'RLS' or policyname like 'Allow %') loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- Tables de la boutique : lecture et écriture pour tout membre, suppression selon le rôle.
do $$
declare
  t text;
  member_write text[] := array['products', 'orders', 'orderitem', 'customer', 'dept', 'dept_payment'];
  admin_write  text[] := array['category', 'unity', 'expenses'];
  admin_delete text[] := array['products', 'orders', 'orderitem', 'customer', 'category', 'unity', 'expenses'];
begin
  foreach t in array member_write || admin_write loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists shop_select on %I', t);
    execute format('drop policy if exists shop_insert on %I', t);
    execute format('drop policy if exists shop_update on %I', t);
    execute format('drop policy if exists shop_delete on %I', t);

    execute format('create policy shop_select on %I for select to authenticated using (shopid = current_shopid())', t);

    if t = any(admin_write) then
      execute format('create policy shop_insert on %I for insert to authenticated with check (shopid = current_shopid() and is_admin())', t);
      execute format('create policy shop_update on %I for update to authenticated using (shopid = current_shopid() and is_admin()) with check (shopid = current_shopid())', t);
    else
      execute format('create policy shop_insert on %I for insert to authenticated with check (shopid = current_shopid())', t);
      execute format('create policy shop_update on %I for update to authenticated using (shopid = current_shopid()) with check (shopid = current_shopid())', t);
    end if;

    if t = any(admin_delete) then
      execute format('create policy shop_delete on %I for delete to authenticated using (shopid = current_shopid() and is_admin())', t);
    else
      execute format('create policy shop_delete on %I for delete to authenticated using (shopid = current_shopid())', t);
    end if;
  end loop;
end $$;

-- shops : lecture par les membres ; création par le propriétaire (inscription) ; modification par l'ADMIN.
alter table shops enable row level security;
drop policy if exists shops_select on shops;
drop policy if exists shops_insert on shops;
drop policy if exists shops_update on shops;
create policy shops_select on shops for select to authenticated
  using (id = current_shopid() or owner = auth.jwt() ->> 'email');
create policy shops_insert on shops for insert to authenticated
  with check (owner = auth.jwt() ->> 'email' and coalesce(admin, '') = '');
create policy shops_update on shops for update to authenticated
  using (id = current_shopid() and is_admin()) with check (id = current_shopid() and coalesce(admin, '') = '');

-- users : chacun lit sa boutique ; l'inscription crée sa propre fiche ADMIN ; l'ADMIN gère le personnel.
alter table users enable row level security;
drop policy if exists users_select on users;
drop policy if exists users_insert on users;
drop policy if exists users_update on users;
drop policy if exists users_delete on users;
create policy users_select on users for select to authenticated
  using (shopid = current_shopid() or id = auth.uid()::text);
create policy users_insert on users for insert to authenticated
  with check (
    coalesce(password, '') = ''
    and (
      -- inscription : sa propre fiche ADMIN, dans une boutique dont il est propriétaire
      (id = auth.uid()::text and role = 'ADMIN'
        and exists (select 1 from shops s where s.id = shopid and s.owner = auth.jwt() ->> 'email'))
      -- personnel : l'ADMIN ajoute un membre à sa boutique
      or (shopid = current_shopid() and is_admin())
    ));
create policy users_update on users for update to authenticated
  using (shopid = current_shopid() and is_admin())
  with check (shopid = current_shopid() and coalesce(password, '') = '');
create policy users_delete on users for delete to authenticated
  using (shopid = current_shopid() and is_admin() and id <> auth.uid()::text);

-- Tables techniques.
alter table tombstones enable row level security;
drop policy if exists tombstones_select on tombstones;
create policy tombstones_select on tombstones for select to authenticated using (shopid = current_shopid());

alter table shop_counters enable row level security; -- aucune politique : accès via create_order uniquement

-- Interdit de supprimer le dernier ADMIN d'une boutique (USR-03).
create or replace function keep_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'ADMIN' and not exists (
    select 1 from users where shopid = old.shopid and role = 'ADMIN' and id <> old.id
  ) then
    raise exception 'Impossible de supprimer le dernier administrateur de la boutique.' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists users_keep_last_admin on users;
create trigger users_keep_last_admin before delete on users for each row execute function keep_last_admin();

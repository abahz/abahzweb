-- Lot 0 · 002 — `updated` forcé par le serveur et journal des suppressions (PRD 6.3).
-- Android n'alimente pas toujours `updated` (souvent 0) : le pull incrémental du web ne verrait pas ces lignes.

create or replace function now_ms() returns bigint
language sql stable as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function set_updated() returns trigger
language plpgsql as $$
begin
  new.updated := now_ms();
  if tg_op = 'INSERT' and coalesce(new.created, 0) = 0 then new.created := new.updated; end if;
  return new;
end $$;

create or replace function log_tombstone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into tombstones (table_name, id, shopid, deleted_at)
  values (tg_table_name, old.id, old.shopid, now_ms())
  on conflict (table_name, id) do update set deleted_at = excluded.deleted_at;
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['products', 'category', 'unity', 'orders', 'orderitem',
                           'customer', 'expenses', 'dept', 'dept_payment', 'users'] loop
    execute format('drop trigger if exists %I on %I', t || '_set_updated', t);
    execute format('create trigger %I before insert or update on %I for each row execute function set_updated()',
                   t || '_set_updated', t);
    execute format('drop trigger if exists %I on %I', t || '_tombstone', t);
    execute format('create trigger %I after delete on %I for each row execute function log_tombstone()',
                   t || '_tombstone', t);
  end loop;
end $$;

-- Une ligne recréée avec le même id ne doit plus apparaître comme supprimée.
create or replace function clear_tombstone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from tombstones where table_name = tg_table_name and id = new.id;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['products', 'category', 'unity', 'orders', 'orderitem',
                           'customer', 'expenses', 'dept', 'dept_payment', 'users'] loop
    execute format('drop trigger if exists %I on %I', t || '_untombstone', t);
    execute format('create trigger %I after insert on %I for each row execute function clear_tombstone()',
                   t || '_untombstone', t);
  end loop;
end $$;

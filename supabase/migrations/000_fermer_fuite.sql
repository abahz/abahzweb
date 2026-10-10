-- Lot 0 · 000 — Urgence (10/10/2026) : fuite des mots de passe et accès anonyme.
-- Constat en production : users.password et shops.admin contiennent des mots de passe EN CLAIR, et les
-- politiques « RLS » (rôle public, using true) laissent la clé anon (présente dans l'APK et sur le site)
-- lire et modifier toutes les tables.
-- Ni Android ni le web n'utilisent ces deux champs (connexion par Supabase Auth) ni la clé anon seule
-- sur les tables (toutes les requêtes partent après connexion). Rejouable.

-- 1. Effacer les mots de passe stockés dans les tables.
update users set password = '' where coalesce(password, '') <> '';
update shops set admin = '' where coalesce(admin, '') <> '';

-- 2. Empêcher qu'une ancienne version de l'app les réécrive (sans refuser son écriture).
create or replace function blank_secrets() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'users' then new.password := ''; end if;
  if tg_table_name = 'shops' then new.admin := ''; end if;
  return new;
end $$;
drop trigger if exists users_blank_secrets on users;
create trigger users_blank_secrets before insert or update on users for each row execute function blank_secrets();
drop trigger if exists shops_blank_secrets on shops;
create trigger shops_blank_secrets before insert or update on shops for each row execute function blank_secrets();

-- 3. Clé anon : plus aucun accès aux tables, sauf la lecture de app_config (contrôle de version Android).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
grant select on app_config to anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

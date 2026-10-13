-- Liste des précurseurs de la landing page (numéro WhatsApp).
-- Le visiteur anonyme peut seulement insérer : aucune lecture, modification ni suppression.
-- Consultation : tableau Supabase (Table Editor) ou clé service_role.

create table if not exists precurseurs (
  id bigint generated always as identity primary key,
  whatsapp text not null unique check (whatsapp ~ '^[0-9]{8,15}$'),
  nom text check (nom is null or char_length(nom) <= 80),
  source text check (source is null or char_length(source) <= 100),
  created_at timestamptz not null default now()
);

alter table precurseurs enable row level security;

revoke all on precurseurs from anon, authenticated;
grant insert (whatsapp, nom, source) on precurseurs to anon;

drop policy if exists precurseurs_insert_anon on precurseurs;
create policy precurseurs_insert_anon on precurseurs
  for insert to anon with check (true);

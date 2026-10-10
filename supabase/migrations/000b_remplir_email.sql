-- Lot 0 · 000b — Remplir users.email pour les comptes existants (10/10/2026).
-- La colonne a été ajoutée en production (migration 20261010152102 add_users_email_and_shops_devise)
-- mais reste vide pour 7 fiches sur 8. Or Android (signInWithGoogleIdToken) cherche la fiche par e-mail :
-- sans e-mail, un gérant existant est envoyé vers « Créer votre boutique » et crée une SECONDE boutique.
-- On recopie l'e-mail du compte Auth dont l'id est celui de la fiche. Rejouable, ne remplace rien.

update public.users u
   set email = lower(a.email)
  from auth.users a
 where a.id::text = u.id
   and coalesce(a.email, '') <> ''
   and coalesce(u.email, '') = '';

-- Les fiches restantes (id différent du compte Auth : 2 caissiers créés par téléphone) sont à
-- rattacher à la main : demander à chacun l'adresse Google qu'il utilisera, puis
--   update public.users set email = '<adresse>' where id = '<id de la fiche>';

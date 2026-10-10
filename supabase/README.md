# Supabase — migrations ABAHZ

Projet de production : `qvjynsbvcbhmrzwaodyv` (partagé avec l'app Android).

| Fichier | Contenu | État |
|---|---|---|
| `migrations/000_fermer_fuite.sql` | **Urgence** : efface les mots de passe en clair (`users.password`, `shops.admin`), empêche leur réécriture, retire à la clé anon l'accès aux tables (sauf lecture de `app_config`) | **appliqué le 10/10/2026 à 17 h 05** : 0 mot de passe restant, clé anon refusée (401) sauf `app_config` |
| `migrations/000b_remplir_email.sql` | Recopie l'e-mail du compte Auth dans `users.email` (colonne ajoutée le 10/10 à 15 h 21 par une autre session, vide pour 7 fiches sur 8) | **appliqué le 10/10/2026 à 17 h 06** : 3 fiches sur 10 ont un e-mail. Les 5 ADMIN restants sont des comptes **téléphone** (aucun e-mail dans Auth) et les 2 caissiers n'ont pas de compte Auth : à rattacher à la main (voir le fichier) |
| `migrations/001_schema.sql` | Colonnes optionnelles, `dept_payment`, `tombstones`, `shop_counters`, index de pull | rédigé, non appliqué |
| `migrations/002_updated_tombstones.sql` | Triggers `updated` en ms et journal des suppressions | rédigé, non appliqué |
| `migrations/003_rls.sql` | RLS par boutique, rôles ADMIN/CASHIER, dernier ADMIN protégé | rédigé, non appliqué ⚠ voir `ANDROID.md` |
| `migrations/004_rpc.sql` | `create_order`, `cancel_order`, `pay_dept` | rédigé, non appliqué |

## État réel de la production (lu le 10/10/2026, lecture seule)

- Aucune migration appliquée ; aucun trigger, aucun index en dehors des clés primaires.
- **Toutes les tables sont ouvertes** : politiques `RLS` (rôle `public`) et `Allow all authenticated for …`, avec `using true`. Toute personne qui a la clé anon (présente dans l'APK et sur le site) peut lire, modifier et supprimer les données de toutes les boutiques.
- `users.password` est rempli pour 7 fiches sur 8, et `shops.admin` pour 6 boutiques sur 8. Ces champs sont donc lisibles par n'importe qui.
- 2 fiches `users` sur 8 n'ont pas pour `id` l'identifiant de leur compte Auth, et 6 boutiques sur 8 n'ont pas l'e-mail d'un compte comme `owner`. Avec `003` tel quel, ces comptes perdraient l'accès à leur boutique.
- `users.sync` est de type `text`, et non `int`. `users.email` et `shops.devise` ont été ajoutées le 10/10 à 15 h 21 (migration `add_users_email_and_shops_devise`).
- 13 comptes Auth sur 16 n'ont pas confirmé leur e-mail.
- Ventes : 148 factures, aucun N° en double, aucune quantité décimale. Les 16 dettes ont un `id` en `dept_…`.

- À l'inscription, le site écrit `shops.devise`, `shops.idNat` et `users.email`. Le code Android source envoie les mêmes noms et aussi `currentUserRole` et `activeSessionToken`. En base, les colonnes sont `id_nat`, `current_user_role` et `active_session_token`, et `devise` et `email` n'existent pas. Une inscription depuis le site serait refusée (PGRST204). Il faut aussi savoir quelle version d'Android tourne chez les commerçants.

`003` supprime maintenant ces politiques ouvertes. Avant de l'appliquer, il faut rattacher les comptes qui ne correspondent pas, sinon des utilisateurs Android seront bloqués.

## Procédure

1. Exporter le schéma réel → `schema-actuel.sql`, puis corriger les migrations si un type diffère (identifiants `text`, montants `bigint`, horodatages `bigint` en ms).
2. Appliquer 001 → 004 sur un projet **de test** (copie du schéma), dans l'ordre.
3. Rejouer les tests : isolation entre deux boutiques, deux `create_order` simultanés, double appel idempotent, parcours Android (connexion, inscription, vente, ajout d'employé).
4. Seulement ensuite, appliquer en production, de préférence pendant une heure creuse, avec une sauvegarde faite juste avant.

Edge Function `create_staff` : reportée. Android crée déjà le personnel en restaurant la session ADMIN, et la RLS `users_insert` couvre ce parcours.

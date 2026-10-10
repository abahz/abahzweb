# Supabase — migrations ABAHZ

Projet de production : `qvjynsbvcbhmrzwaodyv` (partagé avec l'app Android).

| Fichier | Contenu | État |
|---|---|---|
| `migrations/000_fermer_fuite.sql` | **Urgence** : efface les mots de passe en clair (`users.password`, `shops.admin`), empêche leur réécriture, retire à la clé anon l'accès aux tables (sauf lecture de `app_config`) | rédigé, validé par l'utilisateur, à appliquer |
| `migrations/001_schema.sql` | Colonnes optionnelles, `dept_payment`, `tombstones`, `shop_counters`, index de pull | rédigé, non appliqué |
| `migrations/002_updated_tombstones.sql` | Triggers `updated` en ms et journal des suppressions | rédigé, non appliqué |
| `migrations/003_rls.sql` | RLS par boutique, rôles ADMIN/CASHIER, dernier ADMIN protégé | rédigé, non appliqué ⚠ voir `ANDROID.md` |
| `migrations/004_rpc.sql` | `create_order`, `cancel_order`, `pay_dept` | rédigé, non appliqué |

## État réel de la production (lu le 10/10/2026, lecture seule)

- Aucune migration appliquée ; aucun trigger, aucun index en dehors des clés primaires.
- **Toutes les tables sont ouvertes** : politiques `RLS` (rôle `public`) et `Allow all authenticated for …`, avec `using true`. Toute personne qui a la clé anon (présente dans l'APK et sur le site) peut lire, modifier et supprimer les données de toutes les boutiques.
- `users.password` est rempli pour 7 fiches sur 8, et `shops.admin` pour 6 boutiques sur 8. Ces champs sont donc lisibles par n'importe qui.
- 2 fiches `users` sur 8 n'ont pas pour `id` l'identifiant de leur compte Auth, et 6 boutiques sur 8 n'ont pas l'e-mail d'un compte comme `owner`. Avec `003` tel quel, ces comptes perdraient l'accès à leur boutique.
- `users.sync` est de type `text`, et non `int`. Les colonnes `users.email` et `shops.devise` n'existent pas.
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

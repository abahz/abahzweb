# Changements côté Android liés au lot 0

Projet analysé : `D:\ABIGAEL\Abahz` (com.abahz.abahz). Les migrations `migrations/001` à `004` restent compatibles avec l'app actuelle, sauf les points marqués ⚠.

## Déjà fait dans l'app Android (constaté le 09/10/2026)

- Connexion et inscription par **e-mail** + mot de passe (le PRD parlait de téléphone) ; `users.email`, `shops.owner = e-mail`.
- `Users.password` et `Shop.admin` toujours écrits vides (section 8, point 3).
- Realtime filtré par `shopid` (section 8, point 6).
- `orderitem.price` et `orderitem.name` figés à la vente (section 8, point 7, en partie).
- Devise par boutique : `shops.devise` = `FC` ou `$`.

## À vérifier avant d'appliquer 003_rls.sql ⚠

1. Toute requête faite **sans session** renverra une liste vide une fois la RLS activée. Exemple : `UserRepository.checkUserExistsByEmail` si elle est appelée avant la connexion.
2. Création d'un employé : `signUpAndSaveUser` restaure la session admin **avant** d'insérer la fiche. La politique `users_insert` exige l'ADMIN de la même boutique. C'est compatible, mais à tester.
3. L'inscription insère `shops` puis `users` avec la session du nouveau compte. Si la **confirmation d'e-mail** est activée dans Supabase Auth, il n'y a pas de session et les deux insertions seront refusées. Vérifier ce réglage.

## À changer dans Android (par ordre de priorité)

| # | Changement | Pourquoi | Bloque |
|---|---|---|---|
| ~~1~~ | ~~Second décrément de stock~~ | **Déjà corrigé** (un seul décrément dans `saveOrder`) | — |
| 2 | Annulation : appeler `rpc/cancel_order` (même effet que `deleteOrder`, mais atomique) | La dépense « Annulation » a déjà disparu ; reste l'atomicité | — |
| 3 | Vente : appeler `rpc/create_order` au lieu d'upserts séparés | Stock écrasé entre deux caisses ; N° de facture en double | — |
| 4 | Lire `orderitem.qty` en `Double` **et** ne plus tronquer la quantité du panier (`item.cart.qty.toLong()` dans CartScreen) | Ventes au poids perdues ; prérequis de la colonne `numeric` | Migration `005` |
| 5 | Remboursement : appeler `rpc/pay_dept` | Historique des paiements (`dept_payment`) ; la dette soldée reste supprimée, comme aujourd'hui | — |
| 6 | Appliquer `maxDiscountPercentage` au montant final et l'enregistrer dans `orders.discount` ; écrire `orderitem.coast` | Plafond de rabais lu mais jamais appliqué ; marge exacte | — |

Quand le point 4 est livré et que tous les téléphones sont à jour : migration `005_orderitem_qty_numeric.sql` (`alter table orderitem alter column qty type numeric`) et retrait du contrôle « quantités décimales » dans `create_order`.

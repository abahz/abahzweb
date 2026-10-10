# PRD — ABAHZ Web Low-Tech (JavaScript Vanilla)

**Version 2.0 · 10 oct. 2026 · @Abahz**
Remplace la version 1.0 du 9 oct. 2026. La V1 décrivait l'app Android d'après une analyse ancienne ; cette version part de l'app **telle qu'elle est aujourd'hui** (`D:\ABIGAEL\Abahz`, identique à `Abahz.zip`) et de ce qui est déjà construit côté web.

---

## 1. Vue d'ensemble

ABAHZ Web reproduit dans le navigateur les fonctions de caisse de l'app Android ABAHZ, en HTML, CSS et JavaScript vanilla, sans framework ni étape de build. Il partage le même projet Supabase que l'app mobile (`qvjynsbvcbhmrzwaodyv`) : une boutique peut vendre depuis un téléphone et depuis un PC en même temps.

**Référence.** L'app Android `com.abahz.abahz` (Jetpack Compose, Material 3, Room, Koin, Supabase Auth/Postgrest/Realtime/Storage, Firebase Remote Config) est la référence pour les écrans, les libellés, les données et l'apparence. Quand ce PRD et l'app divergent, l'app fait foi, sauf pour les défauts listés en section 9.

**Pourquoi une version low-tech.** Les commerçants de Béni et du Nord-Kivu utilisent des téléphones d'entrée de gamme, des PC anciens de cybercafé et une connexion 2G/3G instable. La version web doit fonctionner sans installation ni Play Store, et rester utilisable hors ligne.

### Objectifs
1. **Parité** avec l'app Android : vente, stock, dettes, dépenses, personnel et tableau de bord.
2. **Même apparence** que l'app : un commerçant qui passe du téléphone au PC retrouve les mêmes écrans.
3. **Hors ligne complet** après le premier chargement (PWA + IndexedDB).
4. **Léger** : moins de 100 Ko compressés, hors images produits.
5. **Lisible** par un développeur junior : un fichier par écran, aucune dépendance à l'exécution.
6. **Compatibilité totale des données** avec l'app Android : mêmes tables, mêmes champs, mêmes règles.

### Principes low-tech
- Zéro framework, zéro build : modules ES natifs, servis tels quels par n'importe quel hébergeur statique.
- Zéro SDK : `fetch()` direct vers les API REST de Supabase (PostgREST, GoTrue, Storage).
- Polices système, icônes SVG inline (mêmes icônes Material que l'app).
- Mode économie de données : images produits désactivables, compressées avant envoi.
- Impression navigateur : factures et rapports via `window.print()` et CSS `@media print`.

### Périmètre

| Inclus (V1 web) | Exclu ou reporté |
|---|---|
| Connexion e-mail + mot de passe, création de boutique | Mot de passe oublié par e-mail : renvoi vers le support WhatsApp |
| Produits, catégories, unités, images | Mise à jour in-app : inutile sur le web |
| Panier, encaissement comptant ou crédit, montant final modifiable | Impression Bluetooth ESC/POS : P2 via Web Bluetooth (Chrome Android) |
| Ventes, facture imprimable et partageable | Realtime WebSocket : remplacé par un polling léger en V1 |
| Clients, dettes et remboursements, dépenses, personnel | Firebase Remote Config : remplacé par `config.json` |
| Tableau de bord et rapport imprimable (PDF) | Rapport Word (Android) : P2 |
| Espace fournisseur, Aide, À propos | Paiement mobile, module IA : V2/V3 |

---

## 2. Utilisateurs, rôles et permissions

Deux rôles, identiques à `RoleType` Android : **ADMIN** (propriétaire, gérant) et **CASHIER** (caissier). Le rôle est lu dans `users` à la connexion et conservé dans la session locale.

**Personas.** Le propriétaire gère le stock, le personnel et suit la rentabilité depuis son téléphone ou un PC. Le caissier encaisse au comptoir, souvent sur un appareil partagé, avec peu de formation.

| Action | ADMIN | CASHIER |
|---|---|---|
| Voir le catalogue, rechercher, ajouter au panier | Oui | Oui |
| Encaisser une vente (comptant ou crédit) | Oui | Oui |
| Modifier le montant final (rabais) | Oui | Oui, plafonné par `maxDiscountPercentage` |
| Voir les ventes, imprimer et partager une facture | Oui | Oui |
| Supprimer (annuler) une facture | Oui | Non |
| Créer, modifier, supprimer un produit | Oui | Non |
| Gérer catégories et unités | Oui | Non |
| Clients | Oui | Création seule (depuis l'encaissement) |
| Dettes : remboursements | Oui | Oui |
| Dépenses | Oui | Non |
| Personnel | Oui | Non |
| Tableau de bord financier | Oui | **À trancher** (voir section 11) |

Les permissions sont vérifiées à deux niveaux : masquage dans l'interface et politiques RLS côté serveur. Le masquage seul ne suffit pas, car tout le JavaScript est lisible dans le navigateur.

**Écarts avec Android.** L'app montre au caissier les raccourcis Catégories, Unités et Dépense, et tout le tableau de bord ; le web les réserve à l'ADMIN, conformément au tableau ci-dessus. L'app n'a pas de bouton Déconnexion ; le web en a un (appareils partagés).

---

## 3. Apparence et navigation (identiques à l'app)

### 3.1 Thème
Material 3 de l'app (`ui/theme/Color.kt`) : primaire **indigo `#4355B9`**, tertiaire **ambre `#8B5000`**, fond `#FBF8FF`, couleurs de statut succès `#1B6D2F` et alerte `#9A4600`. Mode sombre automatique selon le système, avec la palette sombre de l'app. Formes : 6, 10, 16, 20 et 28 px. Titres en gras. Couleurs dynamiques (fond d'écran) désactivées, comme dans l'app.

### 3.2 Coquille (`MainScreen`)
- **Barre haute claire.** Écrans principaux : pastille boutique indigo, « ABAHZ » en indigo et nom de la boutique dessous ; actions Rechercher (Accueil) et Panier avec badge. Sous-écrans (`AbahzTopBar`) : flèche retour, titre, sous-titre.
- **Barre basse** à 4 onglets avec pastille sur l'onglet actif et icône pleine/contour : Accueil, Ventes, Fourn., Profil. Sur écran ≥ 900 px, elle devient une colonne latérale.
- **Pas de menu latéral.** Les écrans de gestion s'ouvrent depuis les raccourcis « Pilotage & Gestion Rapide » de l'écran Profil.
- **Bouton flottant « + Produit »** sur l'Accueil, pour l'ADMIN.
- **Champs « outlined »** avec icône à gauche et libellé flottant ; œil pour afficher le mot de passe.
- **Fenêtres** au style `AlertDialog` (coins 28 px) ; message « Hors connexion » en fenêtre, comme dans l'app.

### 3.3 Routage
Par hash (`#/accueil`), sans rechargement. Le bouton retour du navigateur ou du téléphone revient à l'écran précédent de l'application, jamais hors du site.

---

## 4. Exigences fonctionnelles

Chaque exigence porte un identifiant et une priorité : **P0** bloquant pour la mise en service, **P1** attendu en V1, **P2** amélioration. Les libellés reprennent ceux de l'app Android.

### 4.1 Navigation

| ID | Exigence | Prio |
|---|---|---|
| NAV-01 | Barre haute selon 3.2 : marque + nom de boutique, Rechercher (Accueil), Panier avec badge = somme des quantités. | P0 |
| NAV-02 | Barre basse : Accueil `#/accueil`, Ventes `#/ventes`, Fourn. `#/fournisseur`, Profil `#/profil` ; colonne latérale ≥ 900 px. | P0 |
| NAV-03 | Raccourcis du Profil, dans l'ordre de l'app : Personnel, Catégories, Clients, Dettes, Dépense, Unités, Aide, À propos ; plus Synchro et Paramètres (web). Filtrés selon le rôle. | P0 |
| NAV-04 | Retour navigateur/téléphone et flèche retour : écran précédent de l'application, sinon l'Accueil. | P0 |
| NAV-05 | Bandeau discret de l'état réseau : « Hors ligne — 3 opérations en attente ». | P1 |
| NAV-06 | Bouton flottant « + Produit » sur l'Accueil (ADMIN). | P0 |

### 4.2 Authentification et boutique (`#/connexion`, `#/inscription`)

| ID | Exigence | Prio |
|---|---|---|
| AUTH-01 | Connexion (`AuthScreen`) : bandeau en dégradé indigo → ambre avec logo, « Bon retour sur Abahz 👋 » ; champs « Email * » et « Mot de passe * » ; bouton « Connexion » actif seulement si les deux champs sont remplis ; bouton « Créer votre boutique ». Supabase Auth par **e-mail + mot de passe**, puis lecture de `users` (par id Auth, sinon par e-mail) pour `shopid` et `role`, et de `shops`. | P0 |
| AUTH-02 | Inscription (`RegisterScreen`) en deux cartes. **Étape 1, Informations de la boutique** : nom*, catégorie de commerce (ShopType : Alimentation, Electronique, Vêtements, Meubles, Cosmétiques, Divers, Jouets, Livres, Autres), devise de comptabilité* (Francs Congolais (FC) ou Dollars Américains ($)), adresse physique, RCCM et ID Nat (optionnels). **Étape 2, Compte administrateur (gérant)** : nom complet*, email*, téléphone (optionnel, web), mot de passe*. Bouton « Créer la boutique & Démarrer ». | P0 |
| AUTH-03 | L'inscription suit l'ordre de l'app : compte Auth, puis ligne `shops` (`owner` = e-mail, type BASIC), puis fiche `users` ADMIN de code `001`. Elle n'envoie que les colonnes existantes, ignore une colonne absente (Android n'envoie jamais ses champs restés à leur valeur par défaut) et peut reprendre un essai interrompu (compte déjà créé). | P0 |
| AUTH-04 | Connexion et inscription exigent le réseau ; sinon fenêtre « Hors connexion » : « Vous êtes hors connexion. Veuillez vérifier votre connexion Internet et réessayer. » | P0 |
| AUTH-05 | La session reste ouverte après fermeture du navigateur ; le jeton est rafraîchi avant expiration. Une session valide permet de travailler hors ligne. | P0 |
| AUTH-06 | Déconnexion (bas du Profil) : efface la session et le panier ; avertit s'il reste des opérations à synchroniser ; option « Appareil partagé » qui efface toutes les données locales. | P0 |
| AUTH-07 | « Mot de passe oublié ? » ouvre le support WhatsApp. | P2 |

### 4.3 Catalogue produits (`#/accueil`, `#/produit/nouveau`, `#/produit/:id`)

| ID | Exigence | Prio |
|---|---|---|
| PRD-01 | Grille de cartes (`ProductCard`) : 2 colonnes sur mobile, 4 à 6 sur PC ; image (ou initiale en mode économie), nom, prix dans la devise de la boutique, stock et unité. États vides « Aucun produit » et « Aucun produit trouvé ». | P0 |
| PRD-02 | Toucher une carte ajoute le produit au panier (quantité 1) ou l'en retire ; la carte sélectionnée est mise en évidence. | P0 |
| PRD-03 | Recherche instantanée (icône de la barre haute) sur le nom et la catégorie, insensible à la casse et aux accents, délai 150 ms. | P0 |
| PRD-04 | ADMIN : menu de carte « Modifier » / « Supprimer » ; suppression après « Supprimer le produit ? ». | P0 |
| PRD-05 | Formulaire (`AddScreen`) : « Nom du produit * », « Prix de vente * », « Prix d'achat », « Quantité en stock » (décimales), « Catégorie » (+ « + Ajouter une catégorie »), « Unité de mesure » (+ « + Ajouter une unité »), image (« Cliquer pour ajouter une image »). Type POS par défaut. | P0 |
| PRD-06 | Image redimensionnée par `<canvas>` à 800 px, JPEG qualité 0,7 (cible < 80 Ko), envoyée au bucket Storage `Products` ; l'URL publique va dans `url`. Hors ligne, l'image attend dans IndexedDB. | P1 |
| PRD-07 | Alerte visuelle sur les produits en stock faible (quantité ≤ 2, comme `LOW_STOCK_THRESHOLD`). | P1 |
| PRD-08 | Filtre par catégorie en puces horizontales (« Tout » + catégories). | P1 |

### 4.4 Panier et encaissement (`#/panier`)

Le panier est local à l'appareil et n'est jamais synchronisé, comme sur Android.

| ID | Exigence | Prio |
|---|---|---|
| CRT-01 | Sous-écran « Panier » (sous-titre « N article(s) ») : lignes avec − / +, retrait après « Retirer du panier ? ». Vide : « Votre panier est vide » et bouton « Voir les produits ». | P0 |
| CRT-02 | Quantité saisissable au clavier. Avertissement si elle dépasse le stock, sans blocage. Quantités décimales : **désactivées tant qu'Android lit `orderitem.qty` en entier** (section 9). | P1 |
| CRT-03 | Récapitulatif fixe en bas : « Total à payer » et bouton « Valider la commande ». | P0 |
| CRT-04 | Fenêtre « Validation de la commande » : « Vente au comptoir » (Client Divers) ou « Sélectionner un client » ou nouveau client (« Nom du client * », « Téléphone du client * ») ; « Montant final (devise) * » modifiable ; choix « Cash » / « Dette » ; Confirmer, Annuler. | P0 |
| CRT-05 | La vente à crédit exige un client nommé et son téléphone. | P0 |
| CRT-06 | Montant final ≥ total × (1 − `maxDiscountPercentage`), 20 % par défaut, pour un CASHIER. | P1 |
| CRT-07 | Confirmer exécute une seule transaction locale : commande, lignes (prix, coût et nom figés), un seul décrément de stock, dette si crédit, client s'il est nouveau, panier vidé ; puis ouverture de la facture. Double appui sans effet. | P0 |
| CRT-08 | La vente fonctionne hors ligne et part dans la file de synchronisation. | P0 |

### 4.5 Ventes et factures (`#/ventes`, `#/facture/:id`)

| ID | Exigence | Prio |
|---|---|---|
| ORD-01 | Liste des factures, plus récentes en premier : « Facture N° X », client, total, date, pastille de synchronisation. Vide : « Aucune facture enregistrée ». En-tête « Ventes du jour ». | P0 |
| ORD-02 | Recherche par N° ou client ; filtre par période. | P1 |
| ORD-03 | Facture (`InvoiceScreen`) : en-tête boutique (nom, adresse, RCCM, ID Nat), « FACTURE N° X », « Client : », date ; lignes DESIGNATION ARTICLE / QTÉ / P.U / TOTAL ; rabais éventuel ; « TOTAL À PAYER ». | P0 |
| ORD-04 | « Imprimer » : `window.print()`, largeur du papier 58 mm, 80 mm ou A4 (choix mémorisé). Option « Imprimer sans accents ». | P0 |
| ORD-05 | « Partager » : `navigator.share` si disponible, sinon lien `https://wa.me/?text=…`. | P1 |
| ORD-06 | ADMIN : « Supprimer la facture ? — La facture N° X sera supprimée et le stock des articles restauré. » Comme Android : stock restauré, dette liée, lignes et facture supprimées, aucune dépense créée. | P0 |
| ORD-07 | Impression directe Bluetooth ESC/POS via Web Bluetooth si le navigateur la supporte. | P2 |

### 4.6 Clients (`#/clients`)

| ID | Exigence | Prio |
|---|---|---|
| CUS-01 | Sous-écran « Clients » (« N client(s) ») : nom, téléphone, adresse, recherche. Vide : « Aucun client ». | P0 |
| CUS-02 | Créer et modifier : « Nom du client * », téléphone, adresse. Supprimer après « Supprimer le client ? ». | P0 |
| CUS-03 | Fiche client : total acheté, dette en cours, dernières factures. | P2 |

### 4.7 Dettes et crédits (`#/dettes`)

| ID | Exigence | Prio |
|---|---|---|
| DPT-01 | Sous-écran « Dettes & crédits » : « Total à recouvrer », « N dette(s) en cours » ; par dette : client, téléphone, « Reste à payer », « Dette — Facture N° X ». Vide : « Aucune dette en cours ». | P0 |
| DPT-02 | Détail : articles pris, date de la vente, total de la facture, déjà payé, reste à payer. | P1 |
| DPT-03 | « Remboursement de dette » : montant avec raccourcis « Total » et « Moitié », « Valider le paiement ». Le montant ne peut pas dépasser le restant. Chaque paiement est conservé dans `dept_payment` ; une dette soldée est supprimée, comme dans l'app. | P0 |
| DPT-04 | « Relancer » : message WhatsApp prérempli avec le montant dû. | P2 |

### 4.8 Dépenses (`#/depenses`)

| ID | Exigence | Prio |
|---|---|---|
| EXP-01 | Sous-écran « Dépenses » (« N dépense(s) ») : motif, note, montant, date ; « Total des dépenses ». Vide : « Aucune dépense ». | P0 |
| EXP-02 | Créer et modifier (`ExpenseFormDialog`) : « Motif * (ex : Transport, Loyer) », « Montant * », « Note / Description ». Supprimer après « Supprimer la dépense ? ». | P0 |

### 4.9 Catégories et unités (`#/categories`, `#/unites`)

| ID | Exigence | Prio |
|---|---|---|
| REF-01 | Listes « Catégories » et « Unités » (« N catégorie(s) », « N unité(s) ») avec création, renommage, suppression après confirmation. Libellé unité : « Nom de l'unité (ex: Pièce, Kg) ». | P0 |
| REF-02 | Suppression refusée si des produits utilisent encore la catégorie ou l'unité (message avec le nombre de produits). | P1 |

### 4.10 Personnel (`#/personnel`, ADMIN)

| ID | Exigence | Prio |
|---|---|---|
| USR-01 | Sous-écran « Personnel » (« N membre(s) ») : nom, code, e-mail, rôle. Vide : « Aucun membre du personnel ». | P0 |
| USR-02 | Ajouter : « Nom * », « Email * », « Mot de passe * », « Rôle * ». Exige le réseau (fenêtre « Hors connexion » sinon). Code attribué automatiquement (max + 1, 3 chiffres). La session ADMIN est conservée. | P0 |
| USR-03 | Supprimer après « Supprimer ce membre ? » ; impossible de supprimer son propre compte ou le dernier ADMIN. | P0 |

### 4.11 Profil et tableau de bord (`#/profil`)

L'écran reprend `ProfileScreen`. Tous les calculs se font dans le navigateur, à partir d'IndexedDB, donc hors ligne.

| ID | Exigence | Prio |
|---|---|---|
| DSH-01 | Carte boutique (`ShopHeroCard`) : nom, rôle et catégorie en pastilles, adresse (« Adresse non renseignée »), « RCCM … • ID Nat … ». | P0 |
| DSH-02 | Raccourcis « Pilotage & Gestion Rapide » (NAV-03), dont « Dépense » qui ouvre la saisie rapide d'une dépense. | P0 |
| DSH-03 | « Alertes stock » : « N article(s) en rupture ou critique », les premiers listés, « … et N autres. Voir le stock complet ». | P1 |
| DSH-04 | Période : Jour, Semaine, Mois (défaut), Année, Tout, « Choisir… » (un jour du calendrier). | P0 |
| DSH-05 | Indicateurs « Business Intelligence » : Chiffre d'affaires (« N ventes • Panier moyen »), Dépenses, Crédits accordés / Dettes clients, Valeur du stock (« N produits »). | P0 |
| DSH-06 | « Viabilité & rentabilité » : Recettes totales, Dépenses d'exploitation, Résultat net (période), Marge bénéficiaire nette en %. | P0 |
| DSH-07 | « Rapports » : rapport exécutif A4 imprimable (`window.print()` → « Enregistrer en PDF »). Word : P2. | P1 |
| DSH-08 | Top 5 produits par quantité et par marge ; graphique SVG des recettes par jour. | P2 |
| DSH-09 | Bouton « Déconnexion » en bas (web, AUTH-06). | P0 |

### 4.12 Fournisseur, Aide, À propos, Paramètres, Synchronisation

| ID | Exigence | Prio |
|---|---|---|
| SUP-01 | « Espace Fournisseurs » : « Devenez Fournisseur Partenaire » et bouton WhatsApp `243846077619` avec message prérempli (boutique, adresse, responsable). | P1 |
| HLP-01 | « Aide & Support » : FAQ et bouton « Contacter le support WhatsApp » (vert WhatsApp). | P1 |
| ABT-01 | « À propos d'Abahz » : version web, mentions, lien vers l'app Android. | P2 |
| SET-01 | « Paramètres » (web) : largeur du papier, impression sans accents, mode économie de données, appareil partagé. | P1 |
| SYN-01 | « Synchronisation » (web) : opérations en attente et en erreur, message, « Réessayer » / « Abandonner ». | P1 |

---

## 5. Modèle de données

Le web lit et écrit les mêmes tables que l'app. Montants : entiers dans la devise de la boutique. Dates : horodatages Unix en millisecondes. Identifiants : **texte** (Android : `order_<ms>_<8 car.>`, `item_<commande>_<produit>`, `dept_<commande>`, UUID ailleurs ; web : UUID partout).

### 5.1 Tables Supabase, telles que l'app les utilise

| Table | Champs | Remarques |
|---|---|---|
| `shops` | id, name, owner (e-mail), type (FREE/BASIC/PREMIUM), rccm, idNat, address, category, devise (`FC` ou `$`), created, updated | `admin` jamais écrit par le web. `currentUserRole` n'existe pas en base. |
| `users` | id (= id Auth), name, phone, email, shopid, role (ADMIN/CASHIER), code, created, updated | `password` et `activeSessionToken` jamais écrits par le web. |
| `products` | id, name, image, url, type (POS/ECO), price, coast (prix d'achat), qty (décimal), category, unity, shopid, created, updated | |
| `category`, `unity` | id, name, shopid, created, updated | |
| `orders` | id, fid (N° de facture), customer (nom), total, shopid, created, updated | |
| `orderitem` | id, pid, oid, qty (**entier côté Android**), price, name, shopid, created, updated | `price` et `name` figés à la vente (déjà fait par Android). |
| `customer` | id, name, phone, address, notes (entier), shopid, created, updated | |
| `expenses` | id, name (motif), note, price, shopid, created, updated | |
| `dept` | id, fid, name, phone, amount (restant dû), shopid, created, updated | Supprimée quand elle est soldée. |

Toutes les tables portent `sync` (entier) côté Android. **Règle d'écriture web** : n'envoyer que les colonnes réellement présentes en base, `sync` à 0 si la colonne existe, jamais `password` ni `admin`.

### 5.2 Ajouts serveur (lot 0, tous optionnels, aucune colonne renommée)
`orderitem.coast`, `orders.discount`, `orders.customer_id`, `orders.status` (PAID/CREDIT), `dept.order_id`, tables `dept_payment`, `tombstones`, `shop_counters`, triggers `updated`, RLS, fonctions `create_order`, `cancel_order`, `pay_dept`. Détail : `supabase/migrations/`.

### 5.3 Base locale IndexedDB `abahz` (version 1)

| Store | Clé | Index | Contenu |
|---|---|---|---|
| products, category, unity, orders, orderitem, customer, expenses, dept, dept_payment, users | id | shopid, created, _sync | Copie locale + `_sync` : 0 synchronisé, 1 en attente, 2 erreur, 3 supprimé en attente |
| cart | pid | — | Panier local `{pid, qty, added}` |
| outbox | seq (auto) | table | File d'écritures `{seq, table, op, id, payload, tries, lastError}` |
| blobs | id | — | Images produits en attente d'envoi |
| meta | key | — | Session, boutique, réglages, date de dernière synchro par table |

### 5.4 Volumétrie
500 à 2 000 produits, 50 à 200 ventes par jour (environ 50 000 factures par an). Listes de 50 lignes avec « Voir plus » ; historique préchargé limité aux 90 derniers jours.

---

## 6. Architecture technique

SPA en modules ES natifs, en quatre couches qui reprennent l'app : vues (écrans Compose), services (ViewModels), dépôts (Repositories), accès aux données (Room + Supabase). Une vue ne parle jamais directement à IndexedDB ni au réseau.

### 6.1 Arborescence
```
abahz-web/
├── index.html              # coquille : barre haute, <main id="app">, bouton flottant, barre basse
├── manifest.webmanifest    # PWA installable, icône = logo de l'app
├── sw.js                   # Service Worker : cache des fichiers statiques (version à incrémenter)
├── config.json             # URL Supabase, clé anon, maxDiscountPercentage, devise par défaut, version
├── icons/logo.webp         # logo de l'app Android
├── css/
│   ├── base.css            # thème Material 3 (clair/sombre), coquille, mise en page
│   ├── components.css      # boutons, cartes, champs outlined, bandeau, raccourcis, fenêtres
│   └── print.css           # ticket 58/80 mm et rapport A4
├── js/
│   ├── app.js              # démarrage, coquille, état réseau
│   ├── compat.js           # avertissement navigateur non supporté (Opera Mini…)
│   ├── core/               # router, store, db, api, auth, sync, dom, format
│   ├── repos/              # un dépôt par table + cart
│   ├── services/           # checkout, stats, invoice, report
│   ├── ui/                 # icons, field, modal, toast, logout
│   └── views/              # un fichier par écran
├── tests/                  # tests sans framework (navigateur et Node)
└── supabase/ (racine du dépôt) # migrations, README, ANDROID.md
```

### 6.2 Contrat d'une vue
Chaque fichier de `views/` exporte `render(root, params)`, construit le DOM et renvoie une fonction de nettoyage que le routeur appelle avant l'écran suivant.

### 6.3 Table des routes

| Route | Vue | Accès |
|---|---|---|
| `#/connexion`, `#/inscription` | auth.js, register.js | Public |
| `#/accueil`, `#/panier` | home.js, cart.js | Tous |
| `#/ventes`, `#/facture/:id` | orders.js, invoice.js | Tous |
| `#/fournisseur`, `#/aide`, `#/a-propos` | supplier.js, help.js, about.js | Tous |
| `#/profil`, `#/parametres`, `#/sync` | profile.js, settings.js, sync.js | Tous |
| `#/dettes`, `#/clients` | depts.js, customers.js | Tous (écriture clients : ADMIN) |
| `#/produit/nouveau`, `#/produit/:id` | product-form.js | ADMIN |
| `#/categories`, `#/unites`, `#/depenses`, `#/personnel` | categories.js, units.js, expenses.js, users.js | ADMIN |

### 6.4 Règles de code
- Pas de `innerHTML` avec des données : tout texte passe par `textContent` via `h()` (anti-XSS).
- Délégation d'événements : un écouteur par liste.
- Rendu par `DocumentFragment` puis un seul `replaceChildren()`.
- Formulaires natifs et validation HTML5, puis contrôle métier en JS.
- Fenêtres avec `<dialog>` natif.
- Compatibilité Chrome 80 : pas de `color-mix()` ni d'autres fonctions CSS récentes sans repli.
- ES2020, `const`/`let`, `async`/`await`, JSDoc pour typer les entités.

### 6.5 Services métier
`checkout.js` porte la vente en une transaction IndexedDB multi-stores : si une étape échoue, rien n'est écrit. `stats.js` calcule les indicateurs en un seul passage. `invoice.js` produit le DOM imprimable et le texte à partager.

### 6.6 Hébergement
Fichiers statiques sur un hébergeur HTTPS (Cloudflare Pages proposé). HTTPS est obligatoire pour le Service Worker et `crypto.randomUUID()` ; `http://localhost` suffit en développement.

---

## 7. Synchronisation offline-first

IndexedDB est la seule source de vérité pour l'interface ; Supabase est la référence partagée entre appareils.

### 7.1 Écriture locale
1. Le dépôt ouvre une transaction sur le store de l'entité et sur `outbox`.
2. Il écrit l'entité avec `updated = Date.now()` et `_sync = 1`.
3. Il ajoute l'opération `{table, op: 'upsert' | 'delete', id, payload}` dans `outbox`.
4. Il publie l'événement ; l'écran se met à jour immédiatement.
5. Il déclenche `sync.flush()` sans l'attendre.

### 7.2 Envoi (flush)
Traitement de `outbox` dans l'ordre de `seq`, une opération à la fois, arrêt au premier échec réseau. Appelé après chaque écriture, sur `online`, au retour au premier plan et toutes les 60 secondes.

| Opération | Requête |
|---|---|
| upsert | `POST /rest/v1/{table}` avec `Prefer: resolution=merge-duplicates,return=minimal` |
| delete | `DELETE /rest/v1/{table}?id=eq.{id}` |
| vente | `POST /rest/v1/rpc/create_order` |
| annulation | `POST /rest/v1/rpc/cancel_order` |
| remboursement | `POST /rest/v1/rpc/pay_dept` |
| image | `POST /storage/v1/object/Products/{nom}` (`x-upsert: true`), puis upsert du produit |

Succès : opération retirée, `_sync = 0`. Erreur 4xx : `_sync = 2`, opération mise de côté avec son message (écran Synchronisation). Erreur 5xx ou réseau : nouvel essai après 5 s, 30 s, 2 min, 10 min. Réponse 401 : rafraîchissement du jeton puis nouvel essai.

### 7.3 Réception (pull)
Au démarrage puis toutes les 60 s si l'onglet est visible : `GET /rest/v1/{table}?shopid=eq.{id}&updated=gt.{dernierPull}&order=updated.asc`, paginé par 500. Les suppressions sont lues dans `tombstones`. Le Realtime d'Android est remplacé par ce polling, plus économe en 2G/3G.

### 7.4 Conflits
Dernière écriture gagnante sur `updated`, comme `syncWithRemote` dans l'app. Une ligne locale encore en attente (`_sync` 1 ou 2) n'est jamais écrasée par le pull.

### 7.5 Stock et N° de facture
- **Stock** : décrément local pour l'affichage ; sur le serveur, `create_order` fait `qty = qty - x` en une transaction et renvoie le stock à jour.
- **N° de facture** : provisoire en local (« N° 42 (provisoire) » hors ligne), définitif par `create_order` (séquence par boutique, qui tient compte des N° déjà pris par Android).

### 7.6 Sécurité côté Supabase
RLS sur toutes les tables (une ligne n'est accessible que si `shopid` = boutique de l'utilisateur) ; suppression de facture, personnel, catégories, unités et dépenses réservés à l'ADMIN ; inscription autorisée pour le propriétaire de la boutique (`owner` = son e-mail).

---

## 8. Exigences non fonctionnelles

| ID | Domaine | Exigence mesurable |
|---|---|---|
| NFR-01 | Poids | JS ≤ 60 Ko et CSS ≤ 15 Ko compressés, mesurés sur la version publiée (`dist/`, regroupée et réduite par `tools/build.mjs`) ; aucune police web ; icônes SVG inline. |
| NFR-02 | Chargement | Premier affichage < 3 s en « Slow 3G » (latence 400 ms, 400 kbit/s, profil WebPageTest) ; suivants < 1 s depuis le cache. Le préréglage « Slow 3G » de Chrome (2 s par aller-retour) rend 3 s physiquement impossible : il sert de cas extrême. |
| NFR-03 | Réactivité | Recherche et ajout au panier < 100 ms avec 2 000 produits sur un Android d'entrée de gamme. |
| NFR-04 | Hors ligne | Tout fonctionne sans réseau après le premier chargement, sauf connexion, inscription et personnel. |
| NFR-05 | Données | Aucune vente perdue (écriture IndexedDB confirmée avant d'afficher la facture). |
| NFR-06 | Navigateurs | Chrome Android ≥ 80, Samsung Internet ≥ 13, Firefox ≥ 98 (fenêtres `<dialog>` ; était 90), Chrome/Edge PC récents. Opera Mini et navigateurs trop anciens : message d'avertissement. |
| NFR-07 | Écrans | De 320 à 1920 px ; cibles tactiles ≥ 44 px. |
| NFR-08 | Accessibilité | Libellé sur chaque champ, contraste AA (clair et sombre), encaissement possible au clavier. |
| NFR-09 | Langue et devise | Français ; montants « 12 500 FC » ou « 12 500 $ » selon `shops.devise` ; dates « 09/10/2026 14:32 ». |
| NFR-10 | Sécurité | HTTPS ; aucun mot de passe stocké ni envoyé dans une table ; seule la clé anon dans le code ; CSP `script-src 'self'`. |
| NFR-11 | Confidentialité | Option « Appareil partagé » : purge des données locales à la déconnexion. |
| NFR-12 | Maintenabilité | Un fichier par écran, < 300 lignes ; toute règle de calcul dans `services/` et testée. |
| NFR-13 | Impression | Facture lisible en 58 mm (32 caractères) et 80 mm (48 caractères). |
| NFR-14 | Apparence | Écrans comparables côte à côte avec l'app Android (couleurs, libellés, disposition). |

---

## 9. État de l'app Android (constaté le 10/10/2026)

La V1 du PRD listait 12 défauts. L'app en a corrigé une partie ; le web s'aligne sur l'app quand c'est fait, et applique la règle corrigée sinon.

| # | Défaut (PRD 1.0) | État Android | Règle web |
|---|---|---|---|
| 1 | Stock décrémenté deux fois par vente | **Corrigé** (un seul décrément dans `saveOrder`) | Un seul décrément |
| 2 | Annulation = dépense « Annulation Facture » | **Corrigé** : facture supprimée, stock restauré, aucune dépense | Même comportement (`cancel_order`) |
| 3 | Mots de passe en clair dans `users`/`shops` | **Corrigé** : toujours vides | Jamais écrits |
| 4 | Stock envoyé en valeur absolue (deux caisses s'écrasent) | **Reste** | Décrément atomique via `create_order` |
| 5 | N° de facture calculé en local (doublons) | **Reste** | N° définitif par séquence serveur |
| 6 | Realtime sans filtre `shopid` | **Corrigé** | Pull filtré + RLS |
| 7 | `orderitem` sans prix figé | **En partie** : `price` et `name` figés ; pas de `coast` | `price`, `name` et `coast` figés |
| 8 | Rabais sans trace ni plafond | **Reste** : `maxDiscountPercentage` lu mais pas appliqué | Plafond appliqué, `orders.discount` renseigné |
| 9 | Dette soldée supprimée, pas d'historique | **Reste** | Dette soldée supprimée (parité) + historique dans `dept_payment` |
| 10 | Création d'employé qui remplace la session admin | **En partie** : session admin restaurée | Même parcours, session conservée |
| 11 | Quantités vendues entières | **Reste** : le panier tronque la quantité (`toLong()`) | Décimales bloquées tant qu'Android ne lit pas `qty` en décimal |
| 12 | Identifiants hétérogènes | **Reste** | UUID pour les nouvelles lignes ; anciens identifiants acceptés |

Les changements à faire côté Android sont détaillés dans `supabase/ANDROID.md`.

---

## 10. Plan de livraison et critères d'acceptation

### 10.1 Lots
1. **Lot 0 — Socle serveur** : migrations 001–004 sur un projet de test, puis production. Porte : deux ventes simultanées sans perte de stock.
2. **Lot 1 — Coquille** : thème, navigation, base locale, connexion, inscription. *(construit)*
3. **Lot 2 — Vendre** : synchronisation de base, catalogue, formulaire produit, catégories, unités, panier, encaissement, ventes, facture, paramètres. Porte : vente complète hors ligne puis synchronisée.
4. **Lot 3 — Gérer** : clients, dettes et remboursements, dépenses, personnel.
5. **Lot 4 — Piloter** : tableau de bord, rapport, écran Synchronisation, fournisseur, aide, à propos.
6. **Lot 5 — Terrain** : test chez 3 commerçants à Béni pendant une semaine. Porte : zéro vente perdue, encaissement aussi rapide qu'avec l'app.

### 10.2 Critères d'acceptation
- [ ] **Vente comptant hors ligne** : 3 produits, Client Divers ; facture affichée, stock baissé une seule fois, pastille « en attente » ; réseau rétabli : vente visible dans Supabase et sur l'app Android en moins de 2 minutes.
- [ ] **Vente à crédit** : client nommé ; dette du montant final dans Dettes avec le N° de facture.
- [ ] **Rabais** : un CASHIER ne peut pas saisir un montant final inférieur à 80 % du total (plafond 20 %).
- [ ] **Remboursement partiel** : restant exact et paiement dans l'historique.
- [ ] **Annulation** : un ADMIN supprime une facture ; stock restauré, vente sortie des recettes sur le web **et** sur l'app, aucune dépense créée.
- [ ] **Deux caisses** : un téléphone et un PC vendent le même produit en même temps ; stock final = initial − somme des deux ventes ; N° de facture distincts.
- [ ] **Droits** : un CASHIER qui tape `#/personnel` revient à l'accueil ; une requête forcée vers `users` est refusée par RLS.
- [ ] **Impression** : facture sur 58 mm sans coupure ; rapport A4 enregistré en PDF depuis Chrome.
- [ ] **Apparence** : connexion, inscription, profil et panier comparés côte à côte avec l'app : mêmes couleurs, libellés et disposition.

### 10.3 Tests
- **Unitaires** : `tests/` (navigateur ou `node tests/run-node.mjs`) sur format, routeur, checkout, stats, périodes, conflits.
- **Intégration** : projet Supabase de test, réinitialisé par script SQL.
- **Manuels** : liste 10.2 rejouée à chaque lot sur un Android d'entrée de gamme, en « Slow 3G » et hors ligne.
- **Indicateurs à 1 mois** : boutiques actives sur le web, part des ventes faites hors ligne, opérations en erreur (cible : 0 non résolue après 24 h).

---

## 11. Décisions

| Sujet | Décision | Date |
|---|---|---|
| Mode de connexion | E-mail + mot de passe, comme l'app | 09/10/2026 |
| Devise | Par boutique (`shops.devise` : FC ou $), comme l'app | 09/10/2026 |
| Application de la migration du lot 0 | Claude, d'abord sur un projet de test | 09/10/2026 |
| Apparence | Identique à l'app Android (thème Material 3 indigo) | 10/10/2026 |
| Menu latéral | Supprimé ; raccourcis dans le Profil, comme l'app | 10/10/2026 |
| Annulation de facture et dette soldée | Suppression, comme l'app (historique des paiements conservé) | 10/10/2026 |

### Questions ouvertes
- Le CASHIER voit-il le tableau de bord financier ? (l'app : oui ; proposition web : non)
- Quand l'app Android sera-t-elle mise à jour pour `create_order`, les quantités décimales et le plafond de rabais (section 9, points 4, 5, 8, 11) ?
- Supabase Auth exige-t-il la confirmation d'e-mail ? (si oui, l'inscription ne peut pas créer la boutique immédiatement, ni sur le web ni sur l'app)
- Quel hébergeur et quel nom de domaine ?

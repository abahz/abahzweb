# ABAHZ Web — Feuille de route

Checklist de réalisation de [prd.md](prd.md) (version 2.0). Une tâche n'est cochée que lorsqu'elle est implémentée **et** vérifiée (test, capture ou démonstration).

**Légende :** P0 bloquant · P1 attendu en V1 · P2 reportable · 🔒 exige l'accès admin à Supabase · → fichier(s) produit(s)

**Référence visuelle et fonctionnelle :** app Android `D:\ABIGAEL\Abahz` (écrans dans `app/src/main/java/com/abahz/abahz/screens/`). Chaque écran web se compare côte à côte avec son équivalent Android.

**Lancer :** `python -m http.server -d abahz-web` puis `http://localhost:8000` · **Tests :** `node abahz-web/tests/run-node.mjs` ou `tests/index.html` · **Version publiée :** `cd tools && npm run build` → `dist/` (voir `tools/README.md`).

## État d'avancement

| Lot | Contenu | État |
|---|---|---|
| Préalables | Accès Supabase, schéma réel, décisions | URL, clé, mode de connexion : faits · accès admin : en attente |
| Lot 0 | Socle serveur Supabase 🔒 | Migrations 001–004 rédigées, **aucune appliquée** |
| Lot 1 | Coquille, thème Android, base locale, auth | Construit ; reste la validation contre Supabase 🔒 |
| Lot 2 | Vendre + synchronisation de base | Construit et vérifié en local ; reste la validation contre Supabase 🔒 |
| Lot 3 | Gérer | Construit et vérifié en local ; reste la validation contre Supabase 🔒 |
| Lot 4 | Piloter, synchro avancée, pages d'information | Construit et vérifié en local ; reste la comparaison avec l'app 🔒 |
| Lot 5 | Terrain et mise en service | Partie locale faite (version publiée, mesures, compatibilité, accessibilité) ; **reste : hébergeur, tests Supabase 🔒, vrais téléphones, commerçants** |

Les lots 0 et 2 avancent en parallèle : tout le lot 2 fonctionne en local ; seule sa porte de sortie exige le serveur.

## Préalables

- [x] URL et clé anon du projet (`qvjynsbvcbhmrzwaodyv`) récupérées dans `app/build.gradle.kts` → `config.json`.
- [x] Mode de connexion de l'app : e-mail + mot de passe.
- [x] Analyse de l'app Android actuelle : écrans, thème, modèle de données, défauts corrigés ou non (PRD §9).
- [ ] 🔒 Connecter le plugin Supabase (autorisation lancée ; adresse de retour `localhost:3118/callback?code=…` à fournir).
- [ ] 🔒 Créer le projet de **test** et y copier le schéma de production.
- [ ] 🔒 Exporter le schéma réel → `supabase/schema-actuel.sql` ; vérifier les types (`id` texte, montants `bigint`, `qty`), la présence de `sync`, `updated`, `devise`, `code`, `email`.
- [ ] 🔒 Vérifier si Supabase Auth exige la confirmation d'e-mail.
- [ ] Trancher : le CASHIER voit-il le tableau de bord financier ? (bloque Lot 4)

## Lot 0 — Socle serveur 🔒

Migrations rejouables dans `supabase/migrations/`, appliquées d'abord sur le projet de test. Détails : `supabase/README.md`, `supabase/ANDROID.md`.

### Rédaction
- [x] `001_schema.sql` : `orderitem.coast`, `orders.discount`/`customer_id`/`status`, `dept.order_id`, tables `dept_payment`, `tombstones`, `shop_counters`, index de pull.
- [x] `002_updated_tombstones.sql` : `updated` forcé en ms par le serveur, journal des suppressions.
- [x] `003_rls.sql` : RLS par boutique, droits ADMIN, inscription par le propriétaire, dernier ADMIN protégé.
- [x] `004_rpc.sql` : `create_order` (atomique, idempotente, N° par boutique), `cancel_order` et `pay_dept` **alignées sur Android** (suppression de la facture annulée et de la dette soldée).
- [x] `ANDROID.md` : changements à faire dans l'app.

### Application et tests
- [ ] Appliquer 001 → 004 sur le projet de test, sans erreur, deux fois de suite (rejouables).
- [ ] Test d'isolation : un utilisateur de la boutique A ne lit ni n'écrit rien de la boutique B.
- [ ] Deux `create_order` simultanés sur le même produit : stock = initial − somme, deux N° distincts.
- [ ] Double appel de `create_order` avec le même `id` : une seule vente.
- [ ] Parcours Android sur le projet de test : connexion, inscription, vente, annulation, ajout d'employé, remboursement.
- [ ] Appliquer en production, avec une sauvegarde juste avant, à une heure creuse.

### Plus tard (après mise à jour Android)
- [ ] `005` : `orderitem.qty` en `numeric` et retrait du blocage des décimales dans `create_order`.
- [ ] Purger les colonnes `users.password` et `shops.admin`.

## Lot 1 — Coquille, thème Android, base locale, authentification

### Socle technique
- [x] Arborescence `abahz-web/`, `index.html` avec CSP, `config.json` (clé anon uniquement), `manifest.webmanifest`, Service Worker versionné (`abahz-v0.2.0`).
- [x] Modules : `dom.js` (sans `innerHTML`), `format.js`, `store.js`, `db.js` (IndexedDB v1 : entités, `cart`, `outbox`, `blobs`, `meta`), `router.js` (garde de rôle), `api.js`, `auth.js`.
- [x] Composants : `icons.js` (icônes Material pleines et contour), `field.js` (champ outlined), `modal.js`, `toast.js`, `logout.js`.
- [x] Avertissement navigateur non supporté / Opera Mini. → `js/compat.js`
- [x] Tests sans framework : `format.js` et `router.js` (11/11). → `tests/`

### Apparence (PRD §3)
- [x] Thème Material 3 de l'app : indigo/ambre, clair et sombre, formes 6–28 px, sans `color-mix()` (Chrome 80).
- [x] Barre haute claire : pastille boutique + « ABAHZ » + nom de la boutique ; sous-écrans avec flèche retour, titre, sous-titre.
- [x] Barre basse à pastille, icônes pleines/contour (Accueil, Ventes, Fourn., Profil) ; colonne latérale ≥ 900 px.
- [x] Bouton flottant « + Produit » sur l'Accueil (ADMIN).
- [x] Logo de l'app comme icône du site et dans le bandeau de connexion.
- [x] Retour : pile d'écrans de l'application, jamais hors du site.

### Authentification (AUTH-01 à AUTH-07)
- [x] Écran de connexion identique à `AuthScreen` (bandeau, champs avec icônes, œil, bouton actif si champs remplis).
- [x] Écran d'inscription identique à `RegisterScreen` (étapes 1 et 2, devise FC/$).
- [x] Fenêtre « Hors connexion » au lieu d'un message dans la page.
- [x] Session conservée et restaurée hors ligne *(vérifié le 09/10, avant la refonte visuelle)*.
- [x] Déconnexion en bas du Profil, avertissement si opérations en attente, purge « Appareil partagé » *(vérifié le 09/10)*.
- [x] Inscription tolérante aux colonnes absentes et reprenable après un essai interrompu (codée).
- [ ] 🔒 Connexion réelle avec un compte de l'app ; rôle, boutique et devise affichés.
- [ ] 🔒 Inscription réelle : compte → `shops` → `users` ADMIN `001`.
- [ ] 🔒 Rafraîchissement du jeton avant expiration et après un 401.

### Profil (partie déjà construite)
- [x] Carte boutique (`ShopHeroCard`) et raccourcis « Pilotage & Gestion Rapide » filtrés selon le rôle.

**Porte de sortie :**
- [ ] 🔒 Connexion avec un compte Android existant.
- [ ] Re-vérifier après la refonte : rechargement hors ligne, déconnexion avec purge, garde CASHIER sur `#/personnel`.
- [x] Captures comparées à l'app : connexion, inscription, profil (clair et sombre), accueil PC, sous-écran.

## Lot 2 — Vendre + synchronisation de base

### Synchronisation de base (PRD §7) → `js/core/sync.js`, `js/core/repo.js`, `js/core/remote.js`
- [x] Dépôt générique : écriture locale + `outbox` dans la même transaction, `_sync = 1`, événement, `flush()` non attendu.
- [x] Écriture « colonnes connues » : colonne refusée (PGRST204) retirée, mémorisée dans `meta`, requête rejouée (inscription comprise).
- [x] `flush()` codé : ordre de `seq`, arrêt au premier échec passager, délais 5 s / 30 s / 2 min / 10 min, 4xx → `_sync = 2` et opération mise de côté.
- [x] **Repli tant que le lot 0 n'est pas appliqué** : si `create_order` / `cancel_order` n'existent pas en base, la vente part comme Android (upserts séparés, stock en valeur absolue).
- [x] Pull codé : pages de 500, ventes des 90 derniers jours, incrémental sur `updated`, relecture complète toutes les 6 h (lignes Android à `updated = 0`, suppressions faites ailleurs), `tombstones` si la table existe, tables absentes ignorées puis réessayées.
- [x] Conflits : dernière écriture gagnante, jamais d'écrasement d'une ligne locale en attente (testé).
- [x] Déclencheurs : démarrage, `online`, retour au premier plan, toutes les 60 s.
- [ ] 🔒 Vérifier flush et pull contre Supabase (projet de test).

### Catalogue (PRD-01 à PRD-08) → `js/views/home.js`, `js/views/product-form.js`
- [x] Grille comme `ProductCard` : pastilles En stock / Stock bas / Rupture, bouton panier, menu ⋮ ADMIN ; états vides ; 50 cartes puis « Voir plus ».
- [x] Toucher une carte ajoute/retire du panier ; carte sélectionnée teintée ; badge à jour.
- [x] Recherche par l'icône de la barre haute (150 ms, sans casse ni accents).
- [x] Puces « Tout » + catégories.
- [x] Formulaire comme `AddScreen` (« Ajouter un produit », « Enregistrer le produit » / « Mettre à jour »), « + Ajouter une catégorie / unité », messages d'erreur d'Android.
- [x] Photo : `<canvas>` 800 px, JPEG 0,7, en attente dans `blobs`, envoyée au bucket `Products` à la synchronisation ; mode économie de données (initiale).
- [x] Mesurer la recherche sur 2 000 produits (< 100 ms) — fait au lot 5 (≤ 50 ms, processeur normal).

### Catégories et unités (REF-01, REF-02) → `js/views/ref-list.js`, `categories.js`, `units.js`
- [x] « N catégorie(s) » / « N unité(s) », bouton flottant, ajout, renommage (les produits liés suivent), suppression confirmée, refus si utilisée (« Impossible : 4 produit(s) utilisent encore… »).

### Panier et encaissement (CRT-01 à CRT-08) → `js/views/cart.js`, `js/services/checkout.js`, `js/core/cart.js`
- [x] Sous-écran « Panier » comme `CartScreen` : − / + / quantité au clavier, corbeille à 1, « Retirer du panier ? », alerte « Stock disponible », récapitulatif fixe.
- [x] « Validation de la commande » : Cash / Dette, « Nom du client * » + « Sélectionner un client » (Client Divers ou client enregistré), « Téléphone du client * » en mode Dette, « Montant final ».
- [x] Dette : nom et téléphone obligatoires ; nouveau client créé automatiquement.
- [x] Plafond de rabais CASHIER, `orders.discount` renseigné, rabais affiché sur la facture.
- [x] `checkout.js` : une transaction, un seul décrément (jamais négatif), `price`/`name`/`coast` figés, N° provisoire, double appui sans effet, facture ouverte après l'écriture.
- [x] Quantités entières uniquement (Android tronque `orderitem.qty`).
- [x] Tests unitaires de `checkout.js` (25/25 au total).

### Ventes et facture (ORD-01 à ORD-07) → `js/views/orders.js`, `js/views/invoice.js`, `js/services/invoice.js`
- [x] Liste comme `OrderScreen` : « Ventes du jour », regroupement Aujourd'hui / Hier / date, pastille « En attente », recherche N° ou client, 50 par page.
- [x] Facture comme `InvoiceScreen` : en-tête boutique, RCCM | ID.NAT, DESIGNATION ARTICLE / QTÉ / TOTAL, P.U, rabais, « TOTAL À PAYER ».
- [x] Impression 58 / 80 mm / A4, sans accents en option ; partage natif ou WhatsApp.
- [x] Suppression ADMIN (liste et facture) → stock restauré localement, `cancel_order` en file.
- [ ] Filtre par période (P1) — repris au Lot 4 avec les périodes du tableau de bord.
- [ ] Impression Bluetooth ESC/POS (P2).

### Paramètres (SET-01) → `js/views/settings.js`, `js/core/settings.js`
- [x] Largeur du papier, impression sans accents, économie de données, appareil partagé (pré-coche la purge à la déconnexion).

**Porte de sortie :**
- [x] Vente comptant hors ligne : facture affichée, stock baissé une fois, pastille « En attente » *(Chrome, Supabase bloqué)*.
- [ ] 🔒 Après reconnexion : vente dans Supabase et sur l'app Android en moins de 2 minutes.
- [x] Vente à crédit : dette liée au client et à la facture.
- [x] Rabais CASHIER plafonné (44 % refusé, 20 % accepté).
- [x] Facture lisible en 58 mm (capture en mode impression).
- [ ] Panier et facture comparés côte à côte avec l'app **sur un vrai téléphone**.

## Lot 3 — Gérer

- [x] **Clients** (CUS-01, CUS-02) comme `CustomerScreen` : « N client(s) », recherche nom ou numéro, « Ajouter un client » / « Modifier le client » (« Nom du client * », téléphone, adresse), doublon refusé, suppression ADMIN seulement (règle RLS du lot 0). → `js/views/customers.js`
- [ ] Fiche client : total acheté, dette, dernières factures (CUS-03, P2).
- [x] **Dettes** (DPT-01 à DPT-04) comme `DeptScreen` : « Total à recouvrer », cartes (facture, date, téléphone, articles, « sur X FC » après un paiement partiel), détail (« Articles pris », « Total de la facture », « Déjà payé », historique des remboursements, « Reste à payer »), lien vers la facture, « Relancer » par WhatsApp. → `js/views/depts.js`, `js/services/depts.js`
- [x] « Remboursement de dette » : « Total » / « Moitié », montant entier jamais supérieur au reste ; paiement gardé dans `dept_payment`, dette soldée supprimée ; envoi par `pay_dept`, **repli Android** (dette en valeur absolue) tant que le lot 0 n'est pas appliqué.
- [x] Suppression d'une dette sans paiement : ADMIN seulement (Android la permet à tous ; écart volontaire).
- [x] **Dépenses** (EXP-01, EXP-02) comme `ExpenseScreen` / `ExpenseFormDialog` : « Total des dépenses », « Motif * (ex : Transport, Loyer) », « Note / Description », « Montant * ». → `js/views/expenses.js` (`expenseDialog` réutilisable pour le raccourci du lot 4)
- [x] **Personnel** (USR-01 à USR-03) comme `UserScreen` : « N membre(s) », pastilles ADMIN / CAISSE, ajout en ligne seulement (fenêtre « Hors connexion »), compte Auth créé **sans toucher à la session ADMIN**, code automatique sur 3 chiffres, mêmes messages d'erreur qu'Android ; impossible de supprimer son compte, de supprimer le dernier ADMIN ou de retirer son propre rôle ADMIN. → `js/views/users.js`, `js/services/staff.js`
- [x] 11 tests unitaires de plus (36/36).
- [ ] 🔒 Ajout réel d'un membre sur le projet de test (dépend du réglage « confirmation par e-mail » de Supabase).
- [ ] Le compte Auth d'un membre supprimé reste dans Supabase (comme Android : aucune clé de service côté client). À traiter par une fonction serveur si besoin.

**Porte de sortie :**
- [x] Remboursement partiel exact et visible dans l'historique *(Chrome, Supabase bloqué : 30 000 → 18 000, paiement listé, `pay_dept` en file)*.
- [x] Dette soldée retirée de la liste.
- [ ] 🔒 Suppression ADMIN d'une facture : vente sortie des recettes **sur l'app Android** (côté web vérifié au lot 2).
- [x] Un CASHIER ne voit ni Personnel ni Dépenses (redirigé), ni suppression de client ou de dette.
- [ ] 🔒 Même refus par une requête forcée (RLS du lot 0, projet de test).

## Lot 4 — Piloter et finaliser la V1

- [x] **Tableau de bord** (DSH-03 à DSH-06) comme `ProfileScreen` : « Alertes stock » (3 premiers, « … et N autres »), périodes Jour / Semaine (lundi → dimanche) / Mois (défaut) / Année / Tout / « Choisir… » (champ date), 4 indicateurs cliquables, « Viabilité & rentabilité » avec jauge et pastille VIABLE / DÉFICITAIRE. → `js/services/stats.js`, `js/views/profile.js`
- [x] Chiffres financiers réservés à l'ADMIN (question ouverte du PRD tranchée par défaut ; l'app les montre à tous). Les alertes stock restent visibles par le caissier.
- [x] **Rapport exécutif A4** (DSH-07), même plan en 10 articles que `ShopReport` : identification, ventes, résultat, top 5 par quantité et par marge, stock, inventaire, détail des ventes, dépenses, créances, signatures ; `window.print()` → « Enregistrer en PDF ». Marge brute calculée sur le prix d'achat figé de la vente (repli sur le produit pour les ventes Android). → `js/services/report.js`
- [x] Saisie rapide d'une dépense depuis le raccourci « Dépense » (ADMIN), « Dépense enregistrée avec succès ! ».
- [x] Filtre par période de la liste des ventes (repris du lot 2).
- [x] **Synchronisation** (SYN-01) : état en ligne, dernière réception, opérations en attente / refusées avec le message du serveur, « Réessayer », « Abandonner » (la modification locale est effacée puis une relecture complète remet les données du serveur), « Synchroniser maintenant ». → `js/views/sync.js`
- [x] **Fournisseur** (SUP-01), **Aide** (HLP-01, FAQ adaptée au site), **À propos** (ABT-01). → `supplier.js`, `help.js`, `about.js`
- [x] Numéros WhatsApp alignés sur l'app : support `243846770619`, partenaires `243846077619` (la config web utilisait le numéro partenaires pour le support).
- [x] 7 tests unitaires de plus (43/43) : périodes, libellés, indicateurs, synchro, message fournisseur.
- [ ] Graphique SVG des recettes par jour (DSH-08, P2) : non fait (poids).
- [x] **Poids** : tranché au lot 5 — version publiée regroupée et réduite : JS 44,7 Ko, CSS 6,9 Ko (source : 62 Ko de JS en 48 fichiers).

**Porte de sortie :**
- [x] Indicateurs égaux à un calcul manuel sur un jeu de test (Chrome et tests unitaires).
- [ ] Indicateurs égaux à ceux de l'app pour la même période (sur un vrai téléphone).
- [x] Rapport A4 enregistré en PDF depuis Chrome (impression headless).
- [x] Opération rejetée visible dans `#/sync`, relançable ou abandonnée.

## Lot 5 — Terrain et mise en service

### Version publiée → `tools/build.mjs`, `tools/serve.mjs`, `tools/_headers`, `tools/README.md`
- [x] Le site reste sans étape de construction ; `npm run build` produit `dist/` : un seul `js/app.js` regroupé et réduit (esbuild), `css/app.css` (3 feuilles d'écran), liste du service worker régénérée, `_headers` (CSP avec `frame-ancestors`, `nosniff`, cache).
- [x] Contrôle de syntaxe pour Chrome 80 / Firefox 90 et du budget de poids à chaque construction (échec si dépassé).
- [x] `dist/` rejoue les parcours des lots 2, 3 et 4 à l'identique de la source.
- [x] `config.json` préchargé et `app.js` en `modulepreload` (`index.html`) : un aller-retour de moins au démarrage.
- [x] Version 0.6.0 (`config.json`, `sw.js`).

### Mesures (Chrome, Supabase bloqué)
- [x] **Poids gzip** : JS 44,7 Ko ≤ 60 · CSS 6,9 Ko ≤ 15 · total 52,4 Ko < 100 · premier chargement 51,2 Ko.
- [x] **Premier affichage** (écran de connexion, serveur gzip HTTP/1.1) : 2,2 s en « Slow 3G » WebPageTest (400 ms, 400 kbit/s) ; 5,4 s avec le préréglage extrême de Chrome (2 s par aller-retour). Source non regroupée : 3,9 s et 15 s.
- [x] **Visites suivantes** (service worker) : Accueil en 0,1 s en Slow 3G, 0,2 s hors ligne.
- [x] **Recherche sur 2 000 produits** : ≤ 50 ms après le délai de frappe de 150 ms (processeur normal). Texte de recherche mis en cache par produit (`home.js`) : −75 ms sur téléphone lent.
- [ ] Recherche avec processeur ralenti ×4 : de 50 à 600 ms selon les essais (mesure instable en simulation) → à mesurer sur un vrai Android d'entrée de gamme.
- [x] **Aucune vente perdue** : navigateur tué 13 à 23 ms après l'affichage de la facture, 4 essais : vente, ligne, stock et file d'envoi intacts au redémarrage. Écritures IndexedDB en `durability: 'strict'` (`db.js`) contre la coupure de courant.

### Compatibilité (NFR-06)
- [x] Chrome 80–85 / Samsung Internet 13 : `replaceChildren` et `crypto.randomUUID` complétés dans `compat.js` (sans eux : aucun écran, aucune vente). Vérifié en retirant ces API avant chargement : parcours des lots 2–4 identiques.
- [x] Firefox < 98 (sans `<dialog>`) : message « navigateur trop ancien ». **PRD : Firefox ≥ 98** (était 90).
- [x] `inset` (Chrome 87) remplacé.
- [ ] Dégradations visuelles connues sur Chrome 80–83 : `gap` des boîtes flex (Chrome 84) et `accent-color` (93) ignorés → éléments serrés, cases à la couleur du système. Non bloquant.
- [ ] Essai réel sur Chrome Android, Samsung Internet, Firefox (seuls Chrome et Edge PC sont installés ici).

### Écrans et accessibilité (NFR-07)
- [x] Contrôle automatique de 18 écrans × 5 largeurs (320, 390, 768, 1280, 1920) × clair/sombre : aucun débordement, aucune zone tactile < 44 px (mesurée au doigt : point visé à ±22 px), aucun texte sous le contraste AA.
- [x] Zones tactiles agrandies sans changer le dessin (pseudo-élément, comme `minimumInteractiveComponentSize` d'Android) : puces, boutons, menus des cartes, « + » du panier, liens.
- [x] Boutons WhatsApp : texte foncé sur le vert de la marque (blanc : contraste 1,98).
- [x] Encaissement au clavier seul (Tab, Entrée, Espace), focus visible à chaque étape : produit → panier → + → Valider → Confirmer → facture.

### Reste à faire
- [ ] 🔒 Tests d'intégration sur le projet de test : sync, RLS, ventes simultanées.
- [ ] Choisir l'hébergeur (statique HTTPS : Netlify ou Cloudflare Pages lisent `_headers`) ; déclarer l'adresse dans Supabase Auth ; publier `dist/`.
- [ ] Essai sur un vrai Android d'entrée de gamme (recherche, Slow 3G réel, impression).
- [ ] Test chez 3 commerçants à Béni pendant une semaine.
- [ ] Suivi du premier mois : boutiques actives, ventes hors ligne, erreurs de synchro.

## Parcours d'acceptation finaux

Voir PRD §10.2 : vente comptant hors ligne, vente à crédit, rabais, remboursement partiel, annulation, deux caisses, droits, impression, apparence.

## Journal

- **09/10/2026** — Lot 1 construit (coquille, base locale, auth) et vérifié dans Chrome headless. Analyse de l'app : connexion par e-mail, devise par boutique. Migrations 001–004 rédigées. Lecture de la base de production refusée par le mode auto.
- **10/10/2026** — Inscription corrigée (`shops.currentUserRole` n'existe pas en base) et rendue reprenable. Refonte visuelle d'après l'app (thème indigo, AuthScreen, RegisterScreen, MainTopBar, ProfileScreen) ; menu latéral supprimé.
- **10/10/2026** — **PRD 2.0 et feuille de route reconstruits** à partir de l'app actuelle : 5 défauts sur 12 déjà corrigés par Android (§9) ; annulation de facture et dette soldée alignées sur l'app (suppression), `cancel_order` et `pay_dept` modifiées en conséquence ; libellés de tous les écrans repris de l'app.
- **10/10/2026** — **Lot 2 construit** : synchronisation (outbox, pull, conflits, colonnes absentes, repli Android tant que le lot 0 n'est pas appliqué), catalogue, recherche, formulaire produit avec photo, catégories, unités, panier, validation de commande, rabais, crédit, ventes, facture, impression 58/80/A4, partage, paramètres. 25 tests unitaires verts ; parcours complet vérifié dans Chrome avec Supabase bloqué. Poids gzip : JS 43,5 Ko, CSS 8,5 Ko (marge réduite pour les lots 3–4). Incident de test : une requête de vente de test a atteint la production avec un faux jeton, refusée (401), rien écrit ; l'outil de test bloque désormais Supabase avant tout chargement.
- **10/10/2026** — **Lot 3 construit** : clients, dettes (détail, historique, remboursement `pay_dept` avec repli Android, relance WhatsApp), dépenses, personnel (ajout en ligne sans perdre la session ADMIN, garde-fous du dernier ADMIN). 36 tests unitaires verts ; parcours ADMIN et CASHIER vérifié dans Chrome avec Supabase bloqué (l'outil de test ignore désormais le cache du service worker). Poids gzip : JS 51,8 Ko sur 60, CSS 7,6 Ko : le lot 4 devra rester sobre.
- **10/10/2026** — **Lot 4 construit** : tableau de bord (alertes stock, périodes, indicateurs, viabilité), rapport exécutif A4 en 10 articles, saisie rapide de dépense, filtre des ventes par période, écran Synchronisation (réessayer / abandonner), Fournisseur, Aide, À propos ; numéro du support corrigé. 43 tests unitaires verts ; parcours vérifié dans Chrome avec Supabase bloqué, PDF généré. Poids : JS 62,1 Ko au total (au-dessus du budget de 60 Ko), 29,6 Ko au démarrage.
- **10/10/2026** — **Lot 5, partie locale** : version publiée regroupée et réduite (`tools/`, JS 44,7 Ko au lieu de 62), premier affichage 2,2 s en Slow 3G, recherche ≤ 50 ms sur 2 000 produits, ventes intactes après arrêt brutal (écriture stricte), compléments pour Chrome 80–85 (sans eux le site ne marchait pas), Firefox ≥ 98, zones tactiles ≥ 44 px et contraste AA sur tous les écrans, encaissement au clavier. 44 tests unitaires verts. Reste : hébergeur, Supabase, vrais téléphones, commerçants.

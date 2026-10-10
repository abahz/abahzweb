# Outils de mise en ligne d'ABAHZ Web

Le site (`../abahz-web`) fonctionne tel quel, sans étape de construction. Ces outils servent uniquement à préparer la version publiée.

```
npm install          # une fois : installe esbuild (outil de développement, non publié)
npm test             # tests unitaires (Node)
npm run build        # ../abahz-web → ../dist, avec contrôle du budget de poids
npm run serve        # prévisualise ../dist sur http://127.0.0.1:8766 (compression gzip)
```

`build.mjs` :
- regroupe tous les modules JS en un seul fichier `js/app.js` réduit (`compat.js` reste à part) ;
- regroupe les feuilles d'écran en `css/app.css` (`print.css` reste à part) ;
- refuse toute syntaxe trop récente pour Chrome 80 et Firefox 90 ;
- régénère la liste du service worker et ajoute `_headers` ;
- échoue (code 2) si le budget NFR-01 est dépassé.

## Publier une nouvelle version

1. Changer `version` dans `abahz-web/config.json` **et** `VERSION` dans `abahz-web/sw.js` (même numéro). Sans ce changement, les téléphones gardent l'ancienne version en cache.
2. `npm test`, puis `npm run build`.
3. Vérifier `dist/` avec `npm run serve` : connexion, vente, facture, hors ligne.
4. Envoyer **le contenu de `dist/`** à l'hébergeur (HTTPS obligatoire : service worker et `crypto` l'exigent).

## Hébergeur

Il faut seulement un hébergement statique en HTTPS. `_headers` est lu par Netlify et Cloudflare Pages. Ailleurs (GitHub Pages, serveur Apache ou Nginx), la CSP de `index.html` s'applique quand même, mais les autres en-têtes sont à reprendre dans la configuration.

L'adresse publiée (par exemple `https://abahz.example`) doit être ajoutée dans Supabase → Authentication → URL Configuration (Site URL et Redirect URLs).

## Hébergement actuel (10/10/2026)

- Netlify, projet `abahz3` (compte jeanballe02), ID `3278ab16-cfb7-4267-83ca-6fb807ef41d0`.
- Adresses : https://abahz3.netlify.app et https://abahz.com (+ www), une fois les DNS IONOS modifiés.
- Mise à jour : `npm run deploy` dans `tools/` (tests, build, publication). Se connecter une fois avec `npx netlify-cli login`.
- Badge « Built with Netlify » désactivé : son script injecté était bloqué par la CSP.
- DNS chez IONOS : `A @ → 75.2.60.5`, `CNAME www → abahz3.netlify.app`, AAAA de la page d'attente IONOS supprimé. MX et SPF (e-mails IONOS) inchangés.
- Supabase, Auth → URL Configuration → Redirect URLs : `https://abahz.com/**`, `https://www.abahz.com/**`, `https://abahz3.netlify.app/**`, `http://localhost:8765/**`.

// Prépare la version à mettre en ligne : ../abahz-web → ../dist.
// Le site reste sans étape de construction en développement. Pour la mise en ligne, esbuild
// regroupe les modules en un seul js/app.js réduit (une requête au lieu d'une vingtaine, 43 Ko
// au lieu de 62 Ko gzip), réduit le CSS, régénère la liste du service worker et contrôle le
// budget de poids (PRD NFR-01). compat.js reste à part : script classique, lu avant les modules.
//
// Usage : npm run build            (version lue dans abahz-web/config.json)

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { transformSync, buildSync } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'abahz-web');
const OUT = join(here, '..', 'dist');
// Navigateurs du PRD (NFR-02) : Chrome Android 80+, Samsung Internet 13+ (Chromium 83), Firefox 90+.
// esbuild refuse toute syntaxe plus récente : c'est aussi un contrôle de compatibilité.
const TARGET = ['chrome80', 'firefox90'];
const BUDGET = { js: 60_000, css: 15_000, total: 100_000 };

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const rel = (p, base = SRC) => relative(base, p).split('\\').join('/');
const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const ko = (n) => `${(n / 1000).toFixed(1).replace('.', ',')} Ko`;

const config = JSON.parse(readFileSync(join(SRC, 'config.json'), 'utf8'));
const version = config.version;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1. Fichiers publiés : tout sauf les tests et les modules JS (remplacés par le paquet).
const BUNDLED = (f) => f.startsWith('js/') && f !== 'js/compat.js';
const files = walk(SRC).map((p) => rel(p)).filter((f) => !f.startsWith('tests/') && !BUNDLED(f));
const sizes = new Map(); // chemin → taille gzip publiée
const fail = (f, err) => { console.error(`ERREUR ${f} :\n${err.message}`); process.exit(1); };

for (const f of files) {
  const from = join(SRC, f);
  const to = join(OUT, f);
  mkdirSync(dirname(to), { recursive: true });
  if (/\.(js|css)$/.test(f) && f !== 'sw.js') {
    const loader = f.endsWith('.css') ? 'css' : 'js';
    let out;
    try {
      out = transformSync(readFileSync(from, 'utf8'), { loader, minify: true, target: TARGET, legalComments: 'none', sourcefile: f }).code;
    } catch (err) { fail(f, err); }
    writeFileSync(to, out);
    sizes.set(f, gz(Buffer.from(out)));
  } else {
    cpSync(from, to);
  }
}

// Paquet unique : les imports dynamiques (écrans, rapport) deviennent internes au fichier.
try {
  buildSync({ entryPoints: [join(SRC, 'js', 'app.js')], outfile: join(OUT, 'js', 'app.js'), bundle: true, format: 'esm',
    minify: true, target: TARGET, legalComments: 'none', logLevel: 'silent' });
} catch (err) { fail('js/app.js (paquet)', err); }
files.push('js/app.js');
sizes.set('js/app.js', gz(readFileSync(join(OUT, 'js', 'app.js'))));

// Feuilles d'écran regroupées en css/app.css, dans l'ordre de index.html : sur une connexion
// HTTP/1.1, six fichiers suffisent à occuper toutes les connexions et à retarder app.js.
// print.css reste à part (media="print", et report.js la retrouve par son nom).
const LINK = /^[ \t]*<link rel="stylesheet" href="(css\/[^"]+\.css)">\r?\n/gm;
let index = readFileSync(join(SRC, 'index.html'), 'utf8');
const screenCss = [...index.matchAll(LINK)].map((m) => m[1]);
if (screenCss.length > 1) {
  const merged = transformSync(screenCss.map((f) => readFileSync(join(SRC, f), 'utf8')).join('\n'),
    { loader: 'css', minify: true, target: TARGET, legalComments: 'none' }).code;
  writeFileSync(join(OUT, 'css', 'app.css'), merged);
  for (const f of screenCss) {
    rmSync(join(OUT, f));
    sizes.delete(f);
    files.splice(files.indexOf(f), 1);
  }
  files.push('css/app.css');
  sizes.set('css/app.css', gz(Buffer.from(merged)));
  let first = true;
  index = index.replace(LINK, (line) => {
    if (!first) return '';
    first = false;
    return line.replace(/href="[^"]+"/, 'href="css/app.css"');
  });
  writeFileSync(join(OUT, 'index.html'), index);
}

// 2. Service worker : liste des fichiers mis en cache recalculée, même version que config.json.
const shellOf = (list) => ['./', 'index.html', 'manifest.webmanifest',
  ...list.filter((f) => f.startsWith('icons/')),
  ...list.filter((f) => /^(css|js)\//.test(f)).sort()];
const shell = shellOf(files);
const sourceShell = shellOf(walk(SRC).map((p) => rel(p)));
let sw = readFileSync(join(SRC, 'sw.js'), 'utf8');
if (!/const SHELL = \[\n[\s\S]*?\n\];/.test(sw) || !/abahz-v[0-9.]+/.test(sw)) {
  console.error('ERREUR sw.js : liste SHELL ou VERSION introuvable.');
  process.exit(1);
}
const listed = [...sw.matchAll(/^ {2}'([^']+)',$/gm)].map((m) => m[1]);
const missing = sourceShell.filter((f) => !listed.includes(f));
const extra = listed.filter((f) => !sourceShell.includes(f));
sw = sw.replace(/const SHELL = \[\n[\s\S]*?\n\];/, `const SHELL = [\n${shell.map((f) => `  '${f}',`).join('\n')}\n];`)
  .replace(/abahz-v[0-9.]+/, `abahz-v${version}`);
const swMin = transformSync(sw, { loader: 'js', minify: true, target: TARGET, legalComments: 'none' }).code;
writeFileSync(join(OUT, 'sw.js'), swMin);

// En-têtes HTTP (Netlify, Cloudflare Pages) : publiés avec le site, absents de la source.
cpSync(join(here, '_headers'), join(OUT, '_headers'));

// 3. Poids : total, et ce que le navigateur charge au démarrage.
const sum = (list) => list.reduce((n, f) => n + (sizes.get(f) || 0), 0);
const js = [...sizes.keys()].filter((f) => f.endsWith('.js'));
const css = [...sizes.keys()].filter((f) => f.endsWith('.css'));
const html = gz(readFileSync(join(OUT, 'index.html')));
const jsTotal = sum(js) + gz(Buffer.from(swMin));
const cssTotal = sum(css);
const bootTotal = sum(js) + sum(css.filter((f) => f !== 'css/print.css')) + html;

const line = (label, n, max) => console.log(`${label.padEnd(34)} ${ko(n).padStart(9)}${max ? `  / ${ko(max)} ${n <= max ? 'OK' : 'DÉPASSÉ'}` : ''}`);
console.log(`ABAHZ Web ${version} → ${rel(OUT, join(here, '..'))}/ (${files.length} fichiers)\n`);
console.log('Poids gzip (comme le navigateur les reçoit) :');
line('JS (app.js, compat.js, sw.js)', jsTotal, BUDGET.js);
line('CSS', cssTotal, BUDGET.css);
line('Total hors images', jsTotal + cssTotal + html, BUDGET.total);
line('Premier chargement (HTML, CSS, JS)', bootTotal);
if (missing.length || extra.length) {
  console.log(`\nAttention : abahz-web/sw.js n'est pas à jour (corrigé dans dist/).`
    + `${missing.length ? `\n  manquants : ${missing.join(', ')}` : ''}${extra.length ? `\n  en trop : ${extra.join(', ')}` : ''}`);
}
const over = jsTotal > BUDGET.js || cssTotal > BUDGET.css || jsTotal + cssTotal + html > BUDGET.total;
process.exit(over ? 2 : 0);

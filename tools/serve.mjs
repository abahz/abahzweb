// Serveur local de prévisualisation, avec compression gzip comme un hébergeur réel.
// Usage : npm run serve            → ../dist sur http://127.0.0.1:8766
//         node serve.mjs ../abahz-web 8765
// Service workers et IndexedDB exigent http://127.0.0.1 ou localhost (ou HTTPS).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, process.argv[2] || '../dist');
const port = Number(process.argv[3] || 8766);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    let body = await readFile(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    if (/text|json|javascript|svg|manifest/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      body = gzipSync(body, { level: 9 });
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable');
  }
}).on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Le port ${port} est déjà utilisé : un serveur tourne sans doute déjà. Ouvrez http://localhost:${port}/`
    + ` ou fermez l'autre fenêtre (Ctrl+C), puis relancez.`);
  process.exit(1);
}).listen(port, '127.0.0.1', () => console.log(`${root} → http://localhost:${port}/  (Ctrl+C pour arrêter)`));

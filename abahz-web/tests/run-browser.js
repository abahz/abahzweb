import { results } from './tests.js';

const list = document.getElementById('results');
let failed = 0;
for (const r of results) {
  const li = document.createElement('li');
  li.className = r.ok ? 'ok' : 'ko';
  li.textContent = r.ok ? `✔ ${r.name}` : `✘ ${r.name} — ${r.error}`;
  list.append(li);
  if (!r.ok) failed++;
}
const summary = document.getElementById('summary');
summary.textContent = `${results.length - failed}/${results.length} tests réussis`;
summary.className = failed ? 'ko' : 'ok';

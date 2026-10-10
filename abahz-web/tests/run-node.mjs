// Lance les tests purs (sans DOM) avec Node : node tests/run-node.mjs
const { results } = await import('./tests.js');
let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'ÉCHEC'} ${r.name}${r.ok ? '' : ' — ' + r.error}`);
  if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} tests réussis`);
process.exit(failed ? 1 : 0);

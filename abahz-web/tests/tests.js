// Tests unitaires sans framework. Navigateur : ouvrir tests/index.html. Node : node tests/run-node.mjs

import { fc, qty, parseNumber, date, dateTime, normalize, phone, setCurrency } from '../js/core/format.js';
import { match, resolve, routes } from '../js/core/router.js';
import { lot2 } from './lot2.js';
import { lot3 } from './lot3.js';
import { lot4 } from './lot4.js';
import { lot5 } from './lot5.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (err) { results.push({ name, ok: false, error: err.message }); }
}
function eq(actual, expected) {
  if (actual !== expected) throw new Error(`attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`);
}

// format.js (NFR-09)
test('fc : séparateur espace et devise', () => {
  setCurrency('FC');
  eq(fc(12500), '12 500 FC');
  eq(fc(0), '0 FC');
  eq(fc(999), '999 FC');
  eq(fc(1000000), '1 000 000 FC');
  eq(fc(-2500), '-2 500 FC');
  eq(fc(1499.6), '1 500 FC');
  eq(fc(null), '0 FC');
});
test('qty : décimales à la virgule, sans zéros inutiles', () => {
  eq(qty(2), '2');
  eq(qty(1.5), '1,5');
  eq(qty(0.125), '0,125');
  eq(qty(1000), '1 000');
  eq(qty(2.10), '2,1');
});
test('parseNumber : virgule, espaces, invalides', () => {
  eq(parseNumber('1,5'), 1.5);
  eq(parseNumber('12 500'), 12500);
  eq(parseNumber(' 3 '), 3);
  eq(Number.isNaN(parseNumber('abc')), true);
  eq(Number.isNaN(parseNumber('')), true);
  eq(Number.isNaN(parseNumber('1,2,3')), true);
});
test('date et dateTime : 09/10/2026 14:32', () => {
  const ms = new Date(2026, 9, 9, 14, 32).getTime();
  eq(date(ms), '09/10/2026');
  eq(dateTime(ms), '09/10/2026 14:32');
});
test('normalize : casse et accents', () => {
  eq(normalize('  Électronique  Téléphone '), 'electronique telephone');
  eq(normalize('SUCRE'), 'sucre');
  eq(normalize(null), '');
});
test('phone : formats congolais', () => {
  eq(phone('0812 345 678'), '+243812345678');
  eq(phone('+243 812-345-678'), '+243812345678');
  eq(phone('243812345678'), '+243812345678');
  eq(phone('00243812345678'), '+243812345678');
  eq(phone('812345678'), '+243812345678');
  eq(phone('12'), '');
});

// router.js (NAV-04, garde de rôle)
test('match : routes simples et paramètres', () => {
  eq(match('/accueil').route.view, 'home.js');
  eq(match('/facture/abc-123').params.id, 'abc-123');
  eq(match('/produit/nouveau').route.view, 'product-form.js');
  eq(match('/produit/42').params.id, '42');
  eq(match('/inconnu'), null);
});
test('resolve : sans session → connexion', () => {
  const anon = { loggedIn: false, role: null };
  eq(resolve('/accueil', anon).redirect, '/connexion');
  eq(resolve('/inscription', anon).route.view, 'register.js');
});
test('resolve : connecté sur une page publique → accueil', () => {
  eq(resolve('/connexion', { loggedIn: true, role: 'ADMIN' }).redirect, '/accueil');
});
test('resolve : CASHIER renvoyé de #/personnel', () => {
  const cashier = { loggedIn: true, role: 'CASHIER' };
  eq(resolve('/personnel', cashier).redirect, '/accueil');
  eq(resolve('/produit/nouveau', cashier).redirect, '/accueil');
  eq(resolve('/ventes', cashier).route.view, 'orders.js');
  eq(resolve('/personnel', { loggedIn: true, role: 'ADMIN' }).route.view, 'users.js');
});
test('routes : chaque vue réservée ADMIN est bien marquée', () => {
  const admin = routes.filter((r) => r.admin).map((r) => r.path).sort().join(',');
  eq(admin, '/categories,/depenses,/personnel,/produit/:id,/produit/nouveau,/unites');
});

lot2(test, eq);
lot3(test, eq);
lot4(test, eq);
lot5(test, eq);

export { results };

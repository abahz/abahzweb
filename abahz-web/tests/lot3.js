// Tests du lot 3 : dettes et remboursements, personnel, clients, dépenses.

import { setCurrency } from '../js/core/format.js';
import { orderOfDept, deptBalance, validatePayment, halfOf, reminderLink } from '../js/services/depts.js';
import { nextCode, validateMember, deleteBlocker, roleBlocker } from '../js/services/staff.js';
import { searchCustomers } from '../js/views/customers.js';
import { validateExpense } from '../js/views/expenses.js';

/** @param {(name: string, fn: Function) => void} test @param {(a: any, b: any) => void} eq */
export function lot3(test, eq) {
  setCurrency('FC');
  const orders = [
    { id: 'o1', fid: 7, total: 30000, shopid: 's' },
    { id: 'o2', fid: 8, total: 12000, shopid: 's' },
    { id: 'o3', fid: 9, total: 5000, shopid: 's' },
  ];

  test('dette : vente retrouvée par order_id, id Android, puis N°', () => {
    eq(orderOfDept({ id: 'x', order_id: 'o2', fid: 7, shopid: 's' }, orders).id, 'o2');
    eq(orderOfDept({ id: 'dept_o3', fid: 1, shopid: 's' }, orders).id, 'o3');
    eq(orderOfDept({ id: 'x', fid: 7, shopid: 's' }, orders).id, 'o1');
    eq(orderOfDept({ id: 'x', fid: 99, shopid: 's' }, orders), null);
  });

  test('dette : total, déjà payé, reste', () => {
    const b = deptBalance({ amount: 18000 }, orders[0]);
    eq(b.initial, 30000); eq(b.paid, 12000); eq(b.remaining, 18000);
    const alone = deptBalance({ amount: 5000 }, null);
    eq(alone.initial, 5000); eq(alone.paid, 0);
  });

  test('remboursement : montant positif, entier, jamais au-delà du reste', () => {
    const d = { amount: 18000 };
    eq(validatePayment(d, 18000), null);
    eq(validatePayment(d, 1), null);
    eq(validatePayment(d, 0), 'Saisissez un montant supérieur à 0.');
    eq(validatePayment(d, -500), 'Saisissez un montant supérieur à 0.');
    eq(validatePayment(d, 2.5), 'Saisissez un montant supérieur à 0.');
    eq(validatePayment(d, NaN), 'Saisissez un montant supérieur à 0.');
    eq(validatePayment(d, 18001), 'Le montant ne peut pas dépasser le reste à payer (18 000 FC).');
  });

  test('remboursement : « Moitié » arrondie comme Android', () => {
    eq(halfOf(18000), 9000);
    eq(halfOf(15001), 7500);
    eq(halfOf(1), 0);
  });

  test('relance WhatsApp : numéro normalisé, montant dû', () => {
    const link = reminderLink({ name: 'Ali', phone: '0812 345 678', amount: 18000, fid: 7 }, 'Chez Abi');
    eq(link.startsWith('https://wa.me/243812345678?text='), true);
    eq(decodeURIComponent(link.split('text=')[1]), 'Bonjour Ali, il reste 18 000 FC à payer pour la facture N° 7 chez Chez Abi. Merci.');
    eq(reminderLink({ name: 'Ali', phone: '', amount: 1, fid: 1 }), null);
  });

  test('personnel : code suivant sur 3 chiffres', () => {
    eq(nextCode([]), '001');
    eq(nextCode([{ code: '001' }, { code: '009' }, { code: '' }]), '010');
    eq(nextCode([{ code: 'abc' }, { code: '120' }]), '121');
  });

  const team = [
    { id: 'a1', role: 'ADMIN', email: 'abi@ex.cd' },
    { id: 'c1', role: 'CASHIER', email: 'caisse@ex.cd' },
  ];
  test('personnel : champs obligatoires, e-mail, mot de passe, doublon', () => {
    const base = { name: 'Jo', email: 'jo@ex.cd', password: 'secret', users: team };
    eq(validateMember(base), null);
    eq(validateMember({ ...base, name: ' ' }), 'Veuillez remplir tous les champs obligatoires (*)');
    eq(validateMember({ ...base, password: '' }), 'Veuillez remplir tous les champs obligatoires (*)');
    eq(validateMember({ ...base, email: 'jo@' }), 'Adresse email invalide.');
    eq(validateMember({ ...base, password: '12345' }), 'Le mot de passe doit contenir au moins 6 caractères.');
    eq(validateMember({ ...base, email: ' CAISSE@ex.cd ' }), 'Cet email est déjà enregistré pour un autre utilisateur dans cette boutique.');
    eq(validateMember({ name: 'Jo', editing: true, users: team }), null);
  });

  test('personnel : ni soi-même, ni le dernier ADMIN', () => {
    eq(deleteBlocker(team[0], team, 'a1'), 'Vous ne pouvez pas supprimer votre propre compte.');
    eq(deleteBlocker(team[0], team, 'zz'), 'Impossible de supprimer le dernier administrateur.');
    eq(deleteBlocker(team[1], team, 'a1'), null);
    eq(deleteBlocker(team[0], [...team, { id: 'a2', role: 'ADMIN' }], 'a2'), null);
  });

  test('personnel : rôle ADMIN conservé pour soi et pour le dernier', () => {
    eq(roleBlocker(team[0], 'CASHIER', team, 'a1'), 'Vous ne pouvez pas retirer votre propre rôle d\'administrateur.');
    eq(roleBlocker(team[0], 'CASHIER', team, 'zz'), 'La boutique doit garder au moins un administrateur.');
    eq(roleBlocker(team[0], 'CASHIER', [...team, { id: 'a2', role: 'ADMIN' }], 'a2'), null);
    eq(roleBlocker(team[1], 'ADMIN', team, 'a1'), null);
  });

  test('clients : recherche nom sans accents ou numéro, tri alphabétique', () => {
    const cs = [{ name: 'Zoé', phone: '+243 812 000 111' }, { name: 'André', phone: '0990 22 33 44' }, { name: 'bob', phone: '' }];
    eq(searchCustomers(cs, '').map((c) => c.name).join(','), 'André,bob,Zoé');
    eq(searchCustomers(cs, 'zoe').length, 1);
    eq(searchCustomers(cs, '2233')[0].name, 'André');
    eq(searchCustomers(cs, 'xyz').length, 0);
  });

  test('dépenses : motif et montant positif obligatoires', () => {
    eq(validateExpense({ name: 'Loyer', price: 50000 }), null);
    eq(validateExpense({ name: ' ', price: 50000 }), 'Le motif est obligatoire.');
    eq(validateExpense({ name: 'Loyer', price: 0 }), 'Saisissez un montant supérieur à 0.');
    eq(validateExpense({ name: 'Loyer', price: null }), 'Saisissez un montant supérieur à 0.');
  });
}

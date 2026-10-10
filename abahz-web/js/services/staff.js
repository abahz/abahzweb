// Personnel (USR-01 à USR-03), calqué sur UserScreen / UserRepository (Android).
// L'ajout exige le réseau : le compte Auth est créé sans jamais remplacer la session de l'ADMIN
// (la réponse de /signup n'est pas enregistrée), puis la fiche `users` est écrite directement.

import { authApi, rest, ApiError } from '../core/api.js';
import { tx, req, SYNC } from '../core/db.js';
import { store } from '../core/store.js';
import { writeRow } from '../core/remote.js';
import { isMissingColumn } from '../core/auth.js';

export const ROLES = [['CASHIER', 'Caissier'], ['ADMIN', 'Administrateur']];
const REQUIRED = 'Veuillez remplir tous les champs obligatoires (*)';

/** Code suivant : max + 1 sur 3 chiffres, comme UserRepository.saveUser. Fonction pure (testée). */
export function nextCode(users) {
  const max = users.reduce((m, u) => Math.max(m, parseInt(u.code, 10) || 0), 0);
  return String(max + 1).padStart(3, '0');
}

/** Contrôles de la fenêtre « Ajouter un membre » / « Modifier le membre ». Fonction pure (testée). */
export function validateMember({ name, email, password, editing, users }) {
  if (!String(name || '').trim()) return REQUIRED;
  if (editing) return null;
  const mail = String(email || '').trim().toLowerCase();
  if (!mail || !password) return REQUIRED;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return 'Adresse email invalide.';
  if (password.length < 6) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (users.some((u) => String(u.email || '').toLowerCase() === mail)) {
    return 'Cet email est déjà enregistré pour un autre utilisateur dans cette boutique.';
  }
  return null;
}

const admins = (users) => users.filter((u) => u.role === 'ADMIN');

/** Pourquoi ce membre ne peut pas être supprimé (USR-03), ou null. Fonction pure (testée). */
export function deleteBlocker(user, users, meId) {
  if (user.id === meId) return 'Vous ne pouvez pas supprimer votre propre compte.';
  if (user.role === 'ADMIN' && admins(users).length <= 1) return 'Impossible de supprimer le dernier administrateur.';
  return null;
}

/**
 * Un ADMIN ne retire pas son propre rôle (sa session deviendrait incohérente), et le dernier ADMIN
 * ne devient pas caissier : la boutique n'aurait plus d'administrateur. Fonction pure (testée).
 */
export function roleBlocker(user, role, users, meId) {
  if (user?.role !== 'ADMIN' || role === 'ADMIN') return null;
  if (user.id === meId) return 'Vous ne pouvez pas retirer votre propre rôle d\'administrateur.';
  if (admins(users).length <= 1) {
    return 'La boutique doit garder au moins un administrateur.';
  }
  return null;
}

/** Fiche sans champs sensibles ni champs locaux. */
function rowOf(user) {
  const { password, admin, _sync, ...rest } = user;
  return rest;
}

async function keepLocal(row) {
  await tx('users', 'readwrite', (s) => req(s.users.put({ ...row, _sync: SYNC.DONE })));
  store.emit('users');
}

/** Crée le compte Auth du membre puis sa fiche. Renvoie la fiche enregistrée. */
export async function addMember({ name, email, password, role }, users) {
  const mail = email.trim().toLowerCase();
  // Sans colonne users.email en base, le refus de /signup ci-dessous suffit à détecter un e-mail pris.
  const taken = await rest('users', `email=eq.${encodeURIComponent(mail)}&select=id&limit=1`)
    .catch((err) => { if (isMissingColumn(err)) return []; throw err; });
  if (taken.length) throw new ApiError('Cet email existe déjà (Auth / Utilisateurs).', 409);

  let created;
  try {
    created = await authApi('signup', { email: mail, password }, { auth: false });
  } catch (err) {
    if (/already|registered|exists/i.test(err.message)) throw new ApiError('Cet email existe déjà (Auth / Utilisateurs).', 409);
    throw err;
  }
  const authUser = created.user || created;
  // Confirmation par e-mail active : un e-mail déjà inscrit renvoie un compte fictif sans identité.
  if (!authUser?.id || (Array.isArray(authUser.identities) && !authUser.identities.length)) {
    throw new ApiError('Cet email existe déjà (Auth / Utilisateurs).', 409);
  }
  if (authUser.id === store.get('session')?.auth_id) {
    throw new ApiError('Impossible de récupérer l\'identifiant du nouveau compte.', 500);
  }

  const now = Date.now();
  const row = {
    id: authUser.id, name: name.trim(), email: mail, phone: '', role, code: nextCode(users),
    shopid: store.shopId, created: now, updated: now, sync: 0,
  };
  await writeRow('users', row, { upsert: false });
  await keepLocal(row);
  return row;
}

/** Modifie nom et rôle (le code, l'e-mail et la date de création sont conservés). */
export async function updateMember(user, { name, role }) {
  const row = { ...rowOf(user), name: name.trim(), role, updated: Date.now(), sync: 0 };
  await writeRow('users', row);
  await keepLocal(row);
  return row;
}

/** Supprime la fiche. Le compte Auth reste (comme Android : pas de clé de service côté client). */
export async function removeMember(user) {
  await rest('users', `id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE' });
  await tx('users', 'readwrite', (s) => req(s.users.delete(user.id)));
  store.emit('users');
}

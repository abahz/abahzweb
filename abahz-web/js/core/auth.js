// Session Supabase Auth : connexion, inscription, rafraîchissement, déconnexion.

import { authApi, rest, ApiError } from './api.js';
import { store } from './store.js';
import { getMeta, setMeta, delMeta, clear, count, destroy } from './db.js';
import { writeRow } from './remote.js';
import { phone as normPhone } from './format.js';

const SESSION_KEY = 'session';
const REFRESH_MARGIN = 60_000; // rafraîchir 60 s avant expiration
let timer = null;
let refreshing = null;
let pendingToken = null; // jeton pendant la connexion, avant que le profil soit chargé

/** E-mail tel qu'Android l'enregistre (UserScreen : trim + minuscules). */
function normEmail(text) {
  const email = String(text ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError('Adresse e-mail invalide.', 400);
  return email;
}

/** Retire les champs que le web ne doit jamais conserver (section 8, point 3). */
function scrub(row) {
  if (!row) return row;
  const { password, admin, ...rest } = row;
  return rest;
}

async function save(session) {
  await setMeta(SESSION_KEY, session);
  store.set('session', session);
  schedule(session);
}

function fromToken(t, previous) {
  return {
    ...previous,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: t.expires_at ? t.expires_at * 1000 : Date.now() + t.expires_in * 1000,
    auth_id: t.user?.id ?? previous?.auth_id,
  };
}

function schedule(session) {
  clearTimeout(timer);
  if (!session) return;
  const delay = Math.max(session.expires_at - Date.now() - REFRESH_MARGIN, 5_000);
  timer = setTimeout(() => refresh(), Math.min(delay, 2 ** 31 - 1));
}

/** Erreur PostgREST « colonne inexistante » (42703) : le schéma réel n'a pas tous les champs du PRD. */
export const isMissingColumn = (err) => err?.body?.code === '42703';

/**
 * Lit le profil (users) et la boutique (shops) de l'utilisateur connecté.
 * Fiche cherchée par id Auth, puis par e-mail si la colonne existe, puis comme propriétaire :
 * la boutique dont `owner` est cet e-mail et son unique ADMIN (anciennes fiches Android sans e-mail).
 */
async function loadProfile(authId, email) {
  let rows = await rest('users', `id=eq.${encodeURIComponent(authId)}&select=*`);
  if (!rows.length) {
    try {
      rows = await rest('users', `email=eq.${encodeURIComponent(email)}&select=*`);
    } catch (err) {
      if (!isMissingColumn(err)) throw err;
    }
  }
  if (!rows.length) {
    const owned = await rest('shops', `owner=eq.${encodeURIComponent(email)}&select=id`);
    if (owned.length === 1) {
      const admins = await rest('users', `shopid=eq.${encodeURIComponent(owned[0].id)}&role=eq.ADMIN&select=*`);
      if (admins.length === 1) rows = admins;
    }
  }
  if (!rows.length) throw new ApiError('Aucune boutique ABAHZ n\'est associée à ce compte.', 404);
  const user = scrub(rows[0]);
  const shops = await rest('shops', `id=eq.${encodeURIComponent(user.shopid)}&select=*`);
  return { user, shop: scrub(shops[0]) || null };
}

/** Restaure la session enregistrée (fonctionne hors ligne). */
export async function restore() {
  const session = await getMeta(SESSION_KEY);
  if (!session) return null;
  store.set('session', session);
  if (session.expires_at - Date.now() < REFRESH_MARGIN) refresh();
  else schedule(session);
  return session;
}

/** Jeton courant pour api.js. */
export function token() {
  return store.get('session')?.access_token ?? pendingToken;
}

/**
 * Rafraîchit le jeton. Renvoie false si impossible.
 * Hors ligne, la session est conservée : le travail local continue.
 */
export function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const session = store.get('session');
    if (!session?.refresh_token) return false;
    try {
      const t = await authApi('token?grant_type=refresh_token',
        { refresh_token: session.refresh_token }, { auth: false });
      await save(fromToken(t, session));
      return true;
    } catch (err) {
      if (err instanceof ApiError && !err.offline && err.status >= 400 && err.status < 500) {
        await endSession(); // jeton révoqué : retour à la connexion
      } else {
        addEventListener('online', () => refresh(), { once: true });
      }
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Connexion par e-mail + mot de passe, comme l'app Android (AUTH-01). */
export async function signIn(rawEmail, password) {
  const email = normEmail(rawEmail);
  const t = await authApi('token?grant_type=password', { email, password }, { auth: false });
  const partial = fromToken(t, null);
  pendingToken = partial.access_token;
  try {
    await save({ ...partial, ...(await loadProfile(partial.auth_id, email)) });
  } finally {
    pendingToken = null;
  }
}

/**
 * Inscription d'une boutique (AUTH-02, AUTH-03), dans le même ordre qu'Android (MainActivity) :
 * compte Auth, puis boutique BASIC, puis fiche ADMIN « 001 » qui référence la boutique.
 * Les mots de passe ne sont jamais écrits dans les tables (shops.admin et users.password vides).
 */
export async function register(form) {
  const email = normEmail(form.email);
  const tel = form.phone ? normPhone(form.phone) : '';
  if (form.phone && !tel) throw new ApiError('Numéro de téléphone invalide (ex. +243 812 345 678).', 400);

  const partial = await openAccount(email, form.password);
  pendingToken = partial.access_token;
  const now = Date.now();
  try {
    // Reprise après un essai interrompu : réutiliser la boutique et la fiche déjà créées.
    const mine = await rest('users', `id=eq.${encodeURIComponent(partial.auth_id)}&select=id`);
    if (!mine.length) {
      const owned = await rest('shops', `owner=eq.${encodeURIComponent(email)}&select=id&limit=1`);
      const shopId = owned[0]?.id ?? crypto.randomUUID();
      if (!owned.length) {
        await writeRow('shops', {
          id: shopId, name: form.shopName, owner: email, type: 'BASIC',
          rccm: form.rccm || '', idNat: form.idNat || '', address: form.address || '',
          category: form.category, devise: form.devise === '$' ? '$' : 'FC',
          created: now, updated: now,
        }, { upsert: false });
      }
      await writeRow('users', {
        id: partial.auth_id, name: form.name, phone: tel, email, shopid: shopId,
        role: 'ADMIN', code: '001', created: now, updated: now,
      }, { upsert: false });
    }
    await save({ ...partial, ...(await loadProfile(partial.auth_id, email)) });
  } finally {
    pendingToken = null;
  }
}

/**
 * Crée le compte Auth ; si l'e-mail est déjà inscrit (essai précédent interrompu),
 * se connecte avec le même mot de passe pour terminer l'inscription.
 */
async function openAccount(email, password) {
  let t;
  try {
    t = await authApi('signup', { email, password }, { auth: false });
  } catch (err) {
    if (!/already|registered|exists/i.test(err.message)) throw err;
    try {
      t = await authApi('token?grant_type=password', { email, password }, { auth: false });
    } catch {
      throw new ApiError('Cet e-mail a déjà un compte. Connectez-vous, ou utilisez son mot de passe pour terminer l\'inscription.', 409);
    }
  }
  if (!t.access_token) {
    throw new ApiError('Compte créé. Confirmez votre adresse e-mail puis connectez-vous.', 202);
  }
  return fromToken(t, null);
}

/** Nombre d'opérations locales pas encore envoyées. */
export function pendingCount() {
  return count('outbox');
}

/**
 * Déconnexion (AUTH-06). Refusée si des opérations attendent la synchronisation,
 * sauf `force`. `purge` efface toute la base locale (appareil partagé, NFR-11).
 */
export async function signOut({ purge = false, force = false } = {}) {
  const pending = await pendingCount();
  if (pending && !force) {
    throw new ApiError(`${pending} opération(s) ne sont pas encore synchronisées.`, 409);
  }
  try { await authApi('logout', {}, { timeout: 5000 }); } catch { /* hors ligne : on continue */ }
  await endSession({ purge });
}

async function endSession({ purge = false } = {}) {
  clearTimeout(timer);
  if (purge) await destroy();
  else { await clear('cart'); await delMeta(SESSION_KEY); }
  store.set('cartCount', 0);
  store.set('session', null);
}

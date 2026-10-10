// Session Supabase Auth : connexion, inscription, rafraîchissement, déconnexion.

import { authApi, rest, ApiError, OFFLINE_MESSAGE } from './api.js';
import { store } from './store.js';
import { getMeta, setMeta, delMeta, clear, count, destroy } from './db.js';
import { writeRow } from './remote.js';

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
  const shop = scrub(shops[0]) || null;
  // La base nomme la colonne id_nat ; les écrans (comme Android) lisent idNat.
  if (shop && shop.idNat == null) shop.idNat = shop.id_nat ?? '';
  return { user, shop };
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

// --- Connexion Google (AUTH-01), seul mode de connexion comme l'app Android (AuthScreen) ---
// Flux PKCE de Supabase : Google renvoie vers la page avec `?code=…` (jamais dans le #, qui sert au
// routeur), puis le code est échangé contre la session avec le vérificateur gardé dans la base locale.

const PKCE_KEY = 'pkce';
const PENDING_KEY = 'pendingAccount'; // compte Google connecté mais sans boutique : inscription à finir

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Adresse de retour après Google : la page elle-même, sans requête ni hash (à autoriser dans Supabase). */
export const redirectUrl = () => location.origin + location.pathname;

/** Ouvre la page de connexion Google (quitte l'application). */
export async function signInWithGoogle() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  await setMeta(PKCE_KEY, verifier);
  const params = new URLSearchParams({
    provider: 'google', redirect_to: redirectUrl(),
    code_challenge: challenge, code_challenge_method: 's256',
  });
  location.assign(`${store.get('config').supabaseUrl}/auth/v1/authorize?${params}`);
}

/**
 * Au démarrage : termine un retour de Google (`?code=` ou `?error=`), puis retire ces paramètres de
 * l'adresse. Renvoie « signedIn », « register » (compte sans boutique) ou null s'il n'y avait rien.
 * Une erreur est rangée dans store `authError` pour l'écran de connexion.
 */
export async function completeGoogleSignIn() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const failure = params.get('error_description') || params.get('error');
  if (!code && !failure) return null;
  history.replaceState(null, '', redirectUrl() + location.hash);
  const verifier = await getMeta(PKCE_KEY);
  await delMeta(PKCE_KEY);
  try {
    if (failure) throw new ApiError(failure.replace(/\+/g, ' '), 400);
    if (!verifier) throw new ApiError('Connexion interrompue. Recommencez avec Google.', 400);
    const t = await authApi('token?grant_type=pkce', { auth_code: code, code_verifier: verifier }, { auth: false });
    return await openSession(fromToken(t, null), t.user?.email);
  } catch (err) {
    store.set('authError', err.offline ? OFFLINE_MESSAGE : err.message);
    return null;
  }
}

/** Charge la fiche du compte ; sans fiche, garde le compte en attente d'inscription (comme onNewAccount). */
async function openSession(partial, rawEmail) {
  const email = normEmail(rawEmail);
  pendingToken = partial.access_token;
  try {
    await save({ ...partial, ...(await loadProfile(partial.auth_id, email)) });
    return 'signedIn';
  } catch (err) {
    if (err.status !== 404) throw err;
    await setMeta(PENDING_KEY, { ...partial, email });
    store.set('pendingAccount', { email });
    return 'register';
  } finally {
    pendingToken = null;
  }
}

/** Compte Google en attente d'inscription (après un rechargement de la page), ou null. */
export async function pendingAccount() {
  const p = await getMeta(PENDING_KEY);
  store.set('pendingAccount', p ? { email: p.email } : null);
  return p ? { email: p.email } : null;
}

/** Abandon de l'inscription : retour à la page d'accueil, session Google fermée. */
export async function cancelPendingAccount() {
  const p = await getMeta(PENDING_KEY);
  await delMeta(PENDING_KEY);
  store.set('pendingAccount', null);
  if (p?.access_token) {
    pendingToken = p.access_token;
    try { await authApi('logout', {}, { timeout: 5000 }); } catch { /* hors ligne : le jeton expirera */ } finally { pendingToken = null; }
  }
}

/**
 * Inscription d'une boutique (AUTH-02, AUTH-03), dans le même ordre qu'Android (MainActivity) : le compte
 * Google est déjà ouvert, puis boutique BASIC, puis fiche ADMIN « 001 » qui référence la boutique.
 * Aucun mot de passe : shops.admin et users.password restent vides.
 */
export async function register(form) {
  let partial = await getMeta(PENDING_KEY);
  if (!partial) throw new ApiError('Connectez-vous d\'abord avec Google.', 401);
  const { email } = partial;
  if (partial.expires_at - Date.now() < REFRESH_MARGIN) {
    // Formulaire resté ouvert plus d'une heure : jeton Google à renouveler.
    const t = await authApi('token?grant_type=refresh_token', { refresh_token: partial.refresh_token }, { auth: false });
    partial = { ...fromToken(t, partial), email };
    await setMeta(PENDING_KEY, partial);
  }
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
          rccm: form.rccm || '', id_nat: form.idNat || '', address: form.address || '', // colonne réelle : id_nat
          category: form.category, devise: form.devise === '$' ? '$' : 'FC',
          created: now, updated: now,
        }, { upsert: false });
      }
      await writeRow('users', {
        id: partial.auth_id, name: form.name, email, shopid: shopId,
        role: 'ADMIN', code: '001', created: now, updated: now,
      }, { upsert: false });
    }
    const { email: _, ...session } = partial;
    await save({ ...session, ...(await loadProfile(partial.auth_id, email)) });
    await delMeta(PENDING_KEY);
    store.set('pendingAccount', null);
  } finally {
    pendingToken = null;
  }
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

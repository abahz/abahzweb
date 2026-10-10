// Écriture d'une ligne vers Supabase en n'envoyant que les colonnes qui existent en base.
// Android n'envoie jamais ses champs restés à leur valeur par défaut : le schéma réel peut ne pas
// contenir toutes les propriétés de ses modèles (ex. shops.currentUserRole). Une colonne refusée
// (erreur PostgREST PGRST204) est retirée, mémorisée dans `meta`, puis la requête est rejouée.

import { rest, ApiError } from './api.js';
import { getMeta, setMeta } from './db.js';

const META_KEY = 'missingColumns';
const PROTECTED = new Set(['id', 'shopid']);
let cache = null;

async function missing() {
  if (!cache) cache = (await getMeta(META_KEY)) || {};
  return cache;
}

/** Nom de la colonne refusée par PostgREST, ou null. Fonction pure (testée). */
export function missingColumnOf(err) {
  if (err?.body?.code !== 'PGRST204') return null;
  return /'([^']+)' column/.exec(err.message)?.[1] ?? null;
}

/** Retire les champs locaux (préfixe _) et les colonnes connues comme absentes. Fonction pure (testée). */
export function cleanRow(row, absent = []) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('_') || absent.includes(k) || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Insère ou met à jour une ligne.
 * @param {string} table
 * @param {object} row
 * @param {{upsert?: boolean}} [opts] upsert : fusion sur l'id (merge-duplicates)
 */
export async function writeRow(table, row, { upsert = true } = {}) {
  const known = await missing();
  const prefer = upsert ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal';
  let body = cleanRow(row, known[table] || []);
  for (let tries = 0; tries < 8; tries++) {
    try {
      return await rest(table, '', { method: 'POST', headers: { Prefer: prefer }, body });
    } catch (err) {
      const col = missingColumnOf(err);
      if (!col || !(col in body) || PROTECTED.has(col)) throw err;
      console.warn(`Colonne ${table}.${col} absente de Supabase : ignorée.`);
      known[table] = [...new Set([...(known[table] || []), col])];
      await setMeta(META_KEY, known);
      body = cleanRow(body, known[table]);
    }
  }
  throw new ApiError(`Le schéma de la table ${table} ne correspond pas à l'application.`, 500);
}

// Réglages de l'appareil (écran Paramètres), conservés dans `meta`.

import { getMeta, setMeta } from './db.js';
import { store } from './store.js';

export const DEFAULTS = {
  paper: '58',           // largeur du papier : '58', '80' ou 'A4' (ORD-04)
  stripAccents: false,   // impression sans accents (InvoiceScreen Android)
  dataSaver: false,      // pas d'images produits (PRD-01, PRD-06)
  sharedDevice: false,   // proposer la purge à la déconnexion (NFR-11)
};

export async function loadSettings() {
  const s = { ...DEFAULTS, ...((await getMeta('settings')) || {}) };
  store.set('settings', s);
  return s;
}

export function settings() {
  return store.get('settings') || DEFAULTS;
}

export async function saveSettings(patch) {
  const s = { ...settings(), ...patch };
  await setMeta('settings', s);
  store.set('settings', s);
  return s;
}

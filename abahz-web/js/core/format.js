// Formats d'affichage : montants FC, dates fr-CD, normalisation de recherche.

let currency = 'FC';
export function setCurrency(c) { currency = c || 'FC'; }

/** Groupe les milliers avec une espace simple (lisible sur imprimante thermique). */
function group(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 12500 → « 12 500 FC ». Les montants sont des entiers. */
export function fc(amount) {
  const n = Math.round(Number(amount) || 0);
  return (n < 0 ? '-' : '') + group(String(Math.abs(n))) + ' ' + currency;
}

/** Quantité décimale : 1.5 → « 1,5 », 2 → « 2 », 1000 → « 1 000 ». */
export function qty(value) {
  const n = Number(value) || 0;
  const [int, dec] = Math.abs(n).toFixed(3).replace(/\.?0+$/, '').split('.');
  return (n < 0 ? '-' : '') + group(int) + (dec ? ',' + dec : '');
}

/** Saisie utilisateur « 1,5 » ou « 1 500 » → nombre, NaN si invalide. */
export function parseNumber(text) {
  const s = String(text ?? '').replace(/[\s  ]/g, '').replace(',', '.');
  return s === '' || !/^-?\d*\.?\d+$/.test(s) ? NaN : Number(s);
}

const pad = (n) => String(n).padStart(2, '0');

/** Horodatage ms → « 09/10/2026 ». */
export function date(ms) {
  const d = new Date(Number(ms));
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Horodatage ms → « 09/10/2026 14:32 ». */
export function dateTime(ms) {
  const d = new Date(Number(ms));
  return `${date(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Minuscules sans accents, espaces réduits : base de la recherche instantanée. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Normalise un numéro congolais au format international.
 * « 0812 345 678 » → « +243812345678 » ; « 243812345678 » → « +243812345678 ».
 * Renvoie '' si le numéro est invalide.
 */
export function phone(text) {
  let d = String(text ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('0')) d = '243' + d.slice(1);
  else if (d.length === 9) d = '243' + d;
  return /^\d{11,15}$/.test(d) ? '+' + d : '';
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre',
  'octobre', 'novembre', 'décembre'];

/** Heure seule : « 14:32 ». */
export function time(ms) {
  const d = new Date(Number(ms));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Regroupement des ventes (OrderScreen Android) : « Aujourd'hui », « Hier » ou « Lundi 6 octobre 2026 ». */
export function dayLabel(ms, now = Date.now()) {
  if (!ms || ms <= 0) return 'Date inconnue';
  const d = new Date(Number(ms));
  const today = new Date(now);
  const key = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(today)) return 'Aujourd\'hui';
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (key(d) === key(y)) return 'Hier';
  const label = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Même jour calendaire que `now` ? */
export function isToday(ms, now = Date.now()) {
  return dayLabel(ms, now) === 'Aujourd\'hui';
}

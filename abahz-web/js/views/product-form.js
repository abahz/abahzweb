// #/produit/nouveau, #/produit/:id — calqué sur AddScreen (Android) (PRD-04 à PRD-06). ADMIN.

import { h, formData } from '../core/dom.js';
import { tx } from '../core/db.js';
import { productsRepo, categoriesRepo, unitsRepo, written } from '../core/repo.js';
import { parseNumber } from '../core/format.js';
import { navigate } from '../core/router.js';
import { field } from '../ui/field.js';
import { icon } from '../ui/icons.js';
import { promptName } from '../ui/components.js';
import { toast } from '../ui/toast.js';

const NEW = '__new__';
const MAX_SIDE = 800;     // PRD-06
const QUALITY = 0.7;

/** Montant saisi : entier ≥ 0, espaces tolérés (parseAmount Android). Fonction pure (testée). */
export function parseAmount(text) {
  const n = parseNumber(text);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Quantité en stock : décimale ≥ 0, virgule acceptée (parseQuantity Android). Fonction pure (testée). */
export function parseStock(text) {
  const n = parseNumber(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Réduit une photo à 800 px de côté au plus, en JPEG qualité 0,7. */
async function compress(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  const src = bitmap || await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
  const w = src.width;
  const hgt = src.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, hgt));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(hgt * scale);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
}

const webImage = (p) => [p?.url, p?.image].find((u) => /^https?:\/\//.test(u || ''));

export async function render(root, params) {
  const editing = params.id ? await productsRepo.get(params.id) : null;
  if (params.id && !editing) {
    toast('Produit introuvable.', 'error');
    navigate('/accueil', { replace: true });
    return undefined;
  }
  let categories = await categoriesRepo.all();
  let units = await unitsRepo.all();
  let photo = null;          // Blob compressé choisi
  let previewUrl = null;

  const error = h('p', { class: 'error-box', role: 'alert' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const preview = h('button', { type: 'button', class: 'photo-pick', 'aria-label': 'Choisir une image' });

  function paintPreview() {
    const src = previewUrl || webImage(editing);
    preview.replaceChildren(src
      ? h('img', { src, alt: 'Aperçu de l\'image' })
      : h('span', { class: 'photo-empty' }, icon('plus'), 'Cliquer pour ajouter une image'));
  }
  preview.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      photo = await compress(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(photo);
      paintPreview();
    } catch {
      toast('Image illisible.', 'error');
    }
  });
  paintPreview();

  const options = (rows, current, addLabel) => [
    ['', 'Aucune'],
    ...rows.map((r) => [r.name, r.name]),
    ...(current && !rows.some((r) => r.name === current) ? [[current, current]] : []),
    [NEW, addLabel],
  ];
  const fmt = (v) => (v ? String(v) : '');

  const catField = field({ id: 'category', label: 'Catégorie', options: options(categories, editing?.category, '+ Ajouter une catégorie') });
  const unitField = field({ id: 'unity', label: 'Unité de mesure', options: options(units, editing?.unity, '+ Ajouter une unité') });

  const submitLabel = editing ? 'Mettre à jour' : 'Enregistrer le produit';
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, submitLabel);
  const form = h('form', { class: 'page form-page', novalidate: true },
    error,
    preview, fileInput,
    field({ id: 'name', label: 'Nom du produit *', required: true, value: editing?.name || '', autocomplete: 'off' }),
    h('div', { class: 'field-row' },
      field({ id: 'coast', label: 'Prix d\'achat', inputmode: 'numeric', value: fmt(editing?.coast || '') }),
      field({ id: 'price', label: 'Prix de vente *', inputmode: 'numeric', required: true, value: fmt(editing?.price || '') })),
    field({ id: 'qty', label: 'Quantité en stock', inputmode: 'decimal', value: fmt(editing?.qty || '') }),
    catField,
    unitField,
    submit);

  const selCat = catField.querySelector('select');
  const selUnit = unitField.querySelector('select');
  selCat.value = editing?.category || '';
  selUnit.value = editing?.unity || '';

  // « + Ajouter une catégorie / unité » : crée la ligne puis la sélectionne (AddScreen).
  async function addRef(select, repo, kind) {
    const title = kind === 'cat' ? 'Nouvelle Catégorie' : 'Nouvelle Unité';
    const label = kind === 'cat' ? 'Nom de la catégorie' : 'Nom de l\'unité';
    const name = await promptName({ title, label, iconName: kind === 'cat' ? 'category' : 'scale' });
    const rows = kind === 'cat' ? categories : units;
    if (!name) { select.value = select.dataset.prev || ''; return; }
    const existing = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
    const row = existing || await repo.save({ name });
    if (kind === 'cat') categories = await categoriesRepo.all(); else units = await unitsRepo.all();
    const list = kind === 'cat' ? categories : units;
    select.replaceChildren(...options(list, row.name, kind === 'cat' ? '+ Ajouter une catégorie' : '+ Ajouter une unité')
      .map(([v, t]) => h('option', { value: v }, t)));
    select.value = row.name;
  }
  for (const [select, repo, kind] of [[selCat, categoriesRepo, 'cat'], [selUnit, unitsRepo, 'unit']]) {
    select.dataset.prev = select.value;
    select.addEventListener('change', () => {
      if (select.value === NEW) addRef(select, repo, kind);
      else select.dataset.prev = select.value;
    });
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    const v = formData(form);
    if (!v.name || !v.price) { error.textContent = 'Veuillez remplir le nom et le prix de vente.'; return; }
    const price = parseAmount(v.price);
    const coast = v.coast ? parseAmount(v.coast) : 0;
    const stock = v.qty ? parseStock(v.qty) : 0;
    if (price == null || coast == null || stock == null) { error.textContent = 'Prix ou quantité invalide.'; return; }

    submit.disabled = true;
    submit.replaceChildren(h('span', { class: 'spinner', 'aria-label': 'Enregistrement…' }));
    try {
      const saved = await productsRepo.save({
        ...(editing || {}),
        name: v.name.trim(),
        price,
        coast,
        qty: stock,
        category: v.category === NEW ? '' : v.category,
        unity: v.unity === NEW ? '' : v.unity,
        type: editing?.type || 'POS',
        // Nouvelle photo : l'ancienne URL est remplacée après l'envoi ; `image` (chemin local Android) est vidé.
        url: photo ? '' : (editing?.url || ''),
        image: photo ? '' : (editing?.image || ''),
      });
      if (photo) {
        // La photo attend dans IndexedDB et part à la synchronisation (PRD-06).
        await tx(['blobs', 'outbox'], 'readwrite', (s) => {
          s.blobs.put({ id: saved.id, data: photo });
          s.outbox.add({ table: 'products', op: 'image', id: saved.id, tries: 0 });
        });
        written('products');
      }
      toast(editing ? 'Produit mis à jour.' : 'Produit enregistré.', 'success');
      history.length > 1 ? history.back() : navigate('/accueil');
    } catch (err) {
      error.textContent = err.message || 'Erreur lors de l\'enregistrement';
      submit.disabled = false;
      submit.replaceChildren(submitLabel);
    }
  });

  root.replaceChildren(form);
  if (!editing) form.elements.name.focus();
  return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
}


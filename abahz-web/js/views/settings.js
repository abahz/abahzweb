// #/parametres — réglages de l'appareil (SET-01) : impression, économie de données, appareil partagé.

import { h } from '../core/dom.js';
import { settings, saveSettings } from '../core/settings.js';
import { chip } from '../ui/components.js';
import { toast } from '../ui/toast.js';

const PAPERS = [['58', '58 mm'], ['80', '80 mm'], ['A4', 'A4']];

function toggle(id, title, text, checked) {
  return h('label', { class: 'switch-row', for: id },
    h('div', {}, h('p', { class: 't-title-sm' }, title), h('p', { class: 'muted t-body-sm' }, text)),
    h('input', { type: 'checkbox', id, class: 'switch', checked, role: 'switch' }));
}

export function render(root) {
  const s = settings();
  const papers = h('div', { class: 'chips' });
  const paintPapers = () => papers.replaceChildren(...PAPERS.map(([v, label]) =>
    chip(label, settings().paper === v, async () => { await saveSettings({ paper: v }); paintPapers(); toast('Largeur du papier enregistrée.'); })));
  paintPapers();

  const card = h('div', { class: 'card' },
    h('h2', { class: 'section-title' }, 'Impression'),
    h('p', { class: 'muted t-body-sm' }, 'Largeur du papier'),
    papers,
    toggle('set-accents', 'Imprimer sans accents', 'Si les lettres accentuées sont illisibles sur l\'imprimante.', s.stripAccents),
    h('h2', { class: 'section-title' }, 'Données'),
    toggle('set-saver', 'Mode économie de données', 'Les images des produits ne sont pas téléchargées.', s.dataSaver),
    toggle('set-shared', 'Appareil partagé', 'À la déconnexion, toutes les données de la boutique sont effacées de cet appareil.', s.sharedDevice));

  const keys = { 'set-accents': 'stripAccents', 'set-saver': 'dataSaver', 'set-shared': 'sharedDevice' };
  card.addEventListener('change', async (ev) => {
    const key = keys[ev.target.id];
    if (key) await saveSettings({ [key]: ev.target.checked });
  });

  root.replaceChildren(h('div', { class: 'page' }, card));
}

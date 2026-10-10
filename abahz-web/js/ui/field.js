// Champ « OutlinedTextField » de l'app Android : icône à gauche, libellé flottant, œil pour les mots de passe.

import { h } from '../core/dom.js';
import { icon } from './icons.js';

/**
 * @param {{id: string, label: string, icon?: string, type?: string, options?: [string, string][]} & Record<string, any>} opts
 *   `options` transforme le champ en liste déroulante ; les autres clés sont des attributs de l'<input>.
 */
export function field({ id, label, icon: iconName, options, ...attrs }) {
  const control = options
    ? h('select', { id, name: id, ...attrs }, options.map(([value, text]) => h('option', { value }, text)))
    : h('input', { id, name: id, placeholder: ' ', ...attrs });

  const wrap = h('div', { class: `field${iconName ? ' has-icon' : ''}${options ? ' is-select' : ''}` },
    iconName && h('span', { class: 'field-lead' }, icon(iconName)),
    control,
    h('label', { for: id }, label));

  if (attrs.type === 'password') {
    const eye = h('button', {
      type: 'button', class: 'field-trail icon-btn', 'aria-label': 'Afficher le mot de passe', 'aria-pressed': 'false',
    }, icon('eye_off'));
    eye.addEventListener('click', () => {
      const show = control.type === 'password';
      control.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      eye.replaceChildren(icon(show ? 'eye' : 'eye_off'));
    });
    wrap.classList.add('has-trail');
    wrap.append(eye);
  }
  return wrap;
}

// #/connexion — site de présentation et connexion Google, seul mode de connexion comme l'app Android
// (AuthScreen) : en-tête avec navigation, sections de présentation, pied de page (AUTH-01, AUTH-07).

import { h } from '../core/dom.js';
import { signInWithGoogle } from '../core/auth.js';
import { OFFLINE_MESSAGE } from '../core/api.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { modal } from '../ui/modal.js';

const WEBSITE = 'https://abahz.com';

/** AlertDialog « Hors connexion » de l'app Android. */
export function offlineDialog() {
  return modal({
    title: 'Hors connexion',
    body: h('p', {}, OFFLINE_MESSAGE),
    actions: [{ label: 'OK', value: true, kind: 'primary' }],
  });
}

/** Bouton « Sign in with Google » : fond clair et logo officiel quel que soit le thème (charte Google). */
function googleButton(text, onClick, extra = '') {
  return h('button', { type: 'button', class: `btn-google ${extra}`, onclick: onClick },
    h('img', { src: 'icons/google.svg', alt: '', width: 20, height: 20 }),
    h('span', {}, text));
}

/** En-tête de section : sur-titre, titre, chapeau. */
const sectionHead = (eyebrow, title, lead) => h('div', { class: 'site-head' },
  h('span', { class: 'eyebrow' }, eyebrow), h('h2', {}, title), lead && h('p', {}, lead));

// Les sections sont désignées par data-section : le # de l'adresse sert au routeur, pas aux ancres.
const SECTIONS = [
  ['fonctionnalites', 'Fonctionnalités'],
  ['pourquoi', 'Pourquoi Abahz'],
  ['demarrer', 'Comment démarrer'],
  ['vision', 'Notre vision'],
  ['contact', 'Contact'],
];
const navLink = ([id, label]) => h('button', { type: 'button', class: 'site-link', 'data-section': id }, label);

/** Aperçu de l'application dans un téléphone, dessiné en HTML (aucune image à télécharger). */
function phoneMockup() {
  const row = (name, qty, price, tone) => h('div', { class: 'mk-row' },
    h('span', { class: `mk-thumb ${tone}` }), h('span', { class: 'mk-name' }, name, h('small', {}, qty)), h('b', {}, price));
  return h('div', { class: 'mockup', 'aria-hidden': 'true' },
    h('div', { class: 'mk-phone' },
      h('div', { class: 'mk-bar' }, h('img', { src: 'icons/logo.webp', alt: '', width: 20, height: 20 }), h('b', {}, 'Ma boutique'), icon('sync')),
      h('div', { class: 'mk-total' }, h('small', {}, 'Ventes du jour'), h('strong', {}, '245 000 FC'),
        h('span', {}, icon('trending'), '+12 % depuis hier')),
      row('Sucre 1 kg', '18 en stock', '3 500', 't1'),
      row('Huile 5 L', '6 en stock', '24 000', 't2'),
      row('Savon OMO', 'Stock bas', '1 500', 't3'),
      h('div', { class: 'mk-btn' }, icon('cart'), 'Encaisser · 29 000 FC')),
    h('div', { class: 'mk-card mk-float-a' }, icon('receipt'), h('span', {}, h('b', {}, 'Facture N° 148'), h('small', {}, 'Imprimée en Bluetooth'))),
    h('div', { class: 'mk-card mk-float-b' }, icon('sync'), h('span', {}, h('b', {}, 'Hors ligne'), h('small', {}, '3 ventes en attente'))));
}

export function render(root) {
  const config = store.get('config');
  const year = new Date().getFullYear();
  const wa = (number, text) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  const error = h('p', { class: 'error-box', role: 'alert' }, store.get('authError') || '');
  store.set('authError', null);

  let busy = false;
  async function signIn() {
    if (busy) return;
    if (!navigator.onLine) { offlineDialog(); return; }
    busy = true;
    site.classList.add('is-busy');
    error.textContent = '';
    try {
      await signInWithGoogle(); // la page part vers Google
    } catch (err) {
      busy = false;
      site.classList.remove('is-busy');
      error.textContent = err.message;
    }
  }

  const menuBtn = h('button', {
    type: 'button', class: 'site-menu-btn', 'aria-label': 'Menu', 'aria-expanded': 'false', 'aria-controls': 'site-nav',
  }, icon('menu'));
  const nav = h('nav', { class: 'site-nav', id: 'site-nav', 'aria-label': 'Sections' }, ...SECTIONS.map(navLink));

  const header = h('header', { class: 'site-header' },
    h('div', { class: 'site-container site-header-in' },
      h('button', { type: 'button', class: 'site-brand', 'data-section': 'haut', 'aria-label': 'ABAHZ, haut de page' },
        h('img', { src: 'icons/logo.webp', alt: '', width: 34, height: 34 }), h('span', {}, 'ABAHZ')),
      nav,
      h('div', { class: 'site-actions' }, googleButton('Connexion', signIn, 'compact'), menuBtn)));

  const hero = h('section', { class: 'site-hero', 'data-anchor': 'haut' },
    h('div', { class: 'site-container site-hero-in' },
      h('div', { class: 'hero-copy' },
        error,
        h('span', { class: 'eyebrow on-dark' }, icon('storefront'), 'Caisse & gestion de boutique'),
        h('h1', {}, 'Votre boutique tient ', h('em', {}, 'dans votre poche.')),
        h('p', { class: 'hero-lead' }, 'Vendez, encaissez, suivez votre stock et vos dettes, même sans Internet. '
          + 'Abahz transforme chaque vente en décision éclairée.'),
        h('div', { class: 'hero-cta' },
          googleButton('Commencer avec Google', signIn, 'large'),
          h('button', { type: 'button', class: 'btn-ghost', 'data-section': 'fonctionnalites' }, 'Découvrir', icon('chevron'))),
        h('ul', { class: 'hero-trust' }, ...['Gratuit pour démarrer', 'Aucun mot de passe à retenir', 'Fonctionne hors ligne']
          .map((t) => h('li', {}, icon('check'), t)))),
      phoneMockup()));

  const stats = h('section', { class: 'site-stats', 'aria-label': 'En bref' },
    h('div', { class: 'site-container stats-in' }, ...[
      ['sync', '100 % hors ligne', 'Vendez sans réseau, tout se synchronise au retour'],
      ['bolt', '2 minutes', 'pour ouvrir votre boutique avec un compte Google'],
      ['money', 'FC ou $', 'la devise de votre comptabilité, au choix'],
      ['print', 'PDF & Word', 'rapports de ventes, dépenses et bénéfice'],
    ].map(([name, big, text]) => h('div', { class: 'stat' }, icon(name), h('strong', {}, big), h('span', {}, text)))));

  const features = h('section', { class: 'site-section', 'data-anchor': 'fonctionnalites' },
    h('div', { class: 'site-container' },
      sectionHead('Fonctionnalités', 'Tout votre commerce, clair et à jour',
        'Les outils d\'une grande enseigne, pensés pour la boutique de quartier et le téléphone de tous les jours.'),
      h('div', { class: 'feature-grid' }, ...[
        ['cart', 'Une caisse rapide', 'Panier, facture et ticket Bluetooth en quelques secondes.'],
        ['inventory', 'Un stock juste', 'Chaque vente met le stock à jour. Les ruptures sont signalées à temps.'],
        ['payments', 'Des dettes maîtrisées', 'Qui vous doit quoi, depuis quand, et chaque remboursement.'],
        ['chart', 'Des rapports clairs', 'Ventes, dépenses et bénéfice par période, en PDF et Word.'],
        ['group', 'Une équipe encadrée', 'Vos vendeurs ont leurs propres accès ; vous gardez la main.'],
        ['shield', 'La tranquillité', 'Fonctionne hors ligne, sauvegarde dans le cloud.'],
      ].map(([name, title, text]) => h('article', { class: 'feature' },
        h('span', { class: 'feature-icon' }, icon(name)), h('h3', {}, title), h('p', {}, text))))));

  const compare = h('section', { class: 'site-section alt', 'data-anchor': 'pourquoi' },
    h('div', { class: 'site-container' },
      sectionHead('Pourquoi Abahz', 'Le cahier vous coûte plus cher que vous ne le pensez'),
      h('div', { class: 'compare' },
        h('div', { class: 'compare-col loss' },
          h('h3', {}, icon('money_off'), 'Sans Abahz, vous perdez'),
          h('ul', {}, ...[
            ['De l\'argent', 'dettes oubliées, crédits jamais relancés.'],
            ['Des ventes', 'ruptures de stock découvertes trop tard.'],
            ['Vos chiffres', 'cahiers perdus, illisibles ou mouillés.'],
            ['Le contrôle', 'écarts de caisse impossibles à expliquer.'],
            ['Du temps', 'des heures de calcul chaque fin de mois.'],
          ].map(([b, t]) => h('li', {}, icon('close'), h('span', {}, h('b', {}, b), ` : ${t}`))))),
        h('div', { class: 'compare-col gain' },
          h('h3', {}, icon('trending'), 'Avec Abahz, vous gagnez'),
          h('ul', {}, ...[
            ['Chaque franc suivi', 'ventes, dettes et dépenses au même endroit.'],
            ['Le bon stock', 'réapprovisionnez avant la rupture.'],
            ['Des chiffres sûrs', 'sauvegardés, lisibles sur tous vos appareils.'],
            ['Une caisse juste', 'chaque vente est tracée, vendeur par vendeur.'],
            ['Vos soirées', 'les rapports se font tout seuls.'],
          ].map(([b, t]) => h('li', {}, icon('check'), h('span', {}, h('b', {}, b), ` : ${t}`))))))));

  const steps = h('section', { class: 'site-section', 'data-anchor': 'demarrer' },
    h('div', { class: 'site-container' },
      sectionHead('Comment démarrer', 'Prêt en moins de deux minutes'),
      h('ol', { class: 'steps' }, ...[
        ['Connectez-vous avec Google', 'Un clic, aucun mot de passe à créer ni à retenir.'],
        ['Créez votre boutique', 'Nom, catégorie, devise : c\'est tout ce qu\'il faut.'],
        ['Vendez', 'Ajoutez vos produits et encaissez votre première vente.'],
      ].map(([title, text], i) => h('li', { class: 'step' },
        h('span', { class: 'step-n' }, String(i + 1)), h('h3', {}, title), h('p', {}, text))))));

  const vision = h('section', { class: 'site-section alt', 'data-anchor': 'vision' },
    h('div', { class: 'site-container vision-in' },
      h('div', {},
        sectionHead('Notre vision', 'Le commerce de demain selon Abahz'),
        h('p', { class: 'vision-text' }, 'Nous croyons que le commerce de proximité est le cœur de l\'économie africaine. '
          + 'Il mérite les mêmes outils que les grandes surfaces : simples, accessibles et pensés pour le terrain.')),
      h('ol', { class: 'timeline' }, ...[
        ['storefront', 'Aujourd\'hui', 'Chaque boutique, même la plus petite, gère ses ventes comme une grande enseigne.'],
        ['people', 'Demain', 'Commerçants, fournisseurs et clients connectés : commandes et réassorts en un geste.'],
        ['trending', 'Après-demain', 'Des prévisions intelligentes qui disent quoi acheter, quand, et à quel prix vendre.'],
      ].map(([name, label, text]) => h('li', {}, h('span', { class: 'tl-dot' }, icon(name)),
        h('div', {}, h('strong', {}, label), h('p', {}, text)))))));

  const cta = h('section', { class: 'site-cta' },
    h('div', { class: 'site-container cta-in' },
      h('div', {},
        h('h2', {}, 'Prêt à faire grandir votre commerce ?'),
        h('p', {}, 'Un compte Google suffit : votre boutique est prête en moins de deux minutes.')),
      h('div', { class: 'cta-actions' },
        googleButton('Continuer avec Google', signIn, 'large'),
        config.androidAppUrl && h('a', { class: 'btn-ghost on-dark', href: config.androidAppUrl, target: '_blank', rel: 'noopener' },
          icon('phone'), 'Application Android'))));

  const footLink = (name, label, href) => h('li', {}, h('a', { href, target: '_blank', rel: 'noopener' }, icon(name), label));
  const footer = h('footer', { class: 'site-footer', 'data-anchor': 'contact' },
    h('div', { class: 'site-container footer-grid' },
      h('div', { class: 'footer-brand' },
        h('div', { class: 'site-brand' }, h('img', { src: 'icons/logo.webp', alt: '', width: 34, height: 34 }), h('span', {}, 'ABAHZ')),
        h('p', {}, 'La caisse, le stock et les dettes de votre boutique, dans votre poche. Même sans Internet.')),
      h('div', {},
        h('h3', {}, 'Découvrir'),
        h('ul', {}, ...SECTIONS.slice(0, 4).map((s) => h('li', {}, navLink(s))))),
      h('div', {},
        h('h3', {}, 'Contact'),
        h('ul', {},
          footLink('business', WEBSITE.replace('https://', ''), WEBSITE),
          footLink('phone', `Support · +${config.supportWhatsApp}`, wa(config.supportWhatsApp, 'Bonjour, je souhaite en savoir plus sur Abahz.')),
          config.partnersWhatsApp && footLink('people', 'Devenir partenaire',
            wa(config.partnersWhatsApp, 'Bonjour, je souhaite devenir partenaire d\'Abahz.')))),
      h('div', {},
        h('h3', {}, 'Application'),
        h('ul', {},
          config.androidAppUrl && footLink('phone', 'Abahz pour Android', config.androidAppUrl),
          h('li', {}, h('button', { type: 'button', class: 'site-link', onclick: signIn }, icon('person'), 'Se connecter'))))),
    h('div', { class: 'site-container footer-bottom' },
      h('span', {}, `© ${year} ABAHZ. Tous droits réservés.`),
      h('span', {}, `Version ${config.version || ''}`)));

  const site = h('div', { class: 'site' }, header, h('main', { class: 'site-main' }, hero, stats, features, compare, steps, vision, cta), footer);

  function setMenu(open) {
    header.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  menuBtn.addEventListener('click', () => setMenu(!header.classList.contains('menu-open')));
  // Défilement vers une section (les ancres # sont réservées au routeur).
  site.addEventListener('click', (ev) => {
    const link = ev.target.closest('[data-section]');
    if (!link) return;
    setMenu(false);
    site.querySelector(`[data-anchor="${link.dataset.section}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // Ombre de l'en-tête dès que la page défile.
  const onScroll = () => header.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });

  root.replaceChildren(site);
  if (error.textContent) error.scrollIntoView({ block: 'center' }); // retour de Google avec une erreur
  return () => removeEventListener('scroll', onScroll);
}

import './epic.css';
import { clearGarageAisle } from './garage-aisle';
import { epicFlag, markEpic } from '../core/epics';
import { SECTOR_IDS } from '../core/types';
import type { App } from '../engine/app';
import { el } from '../engine/dom';
import { line, S } from '../engine/i18n';

export function epicObject(app: App, refresh: () => void): HTMLElement | null {
  const state = app.state;
  if (!state) return null;
  const flag = (key: string) => epicFlag(state, key);
  const mark = (key: string, value = 1) => {
    const opened = app.ui.querySelector<HTMLDetailsElement>('.epic-object[open]')?.querySelector('summary')?.textContent;
    app.state = markEpic(state, key, value);
    app.save();
    refresh();
    const objects = Array.from(app.ui.querySelectorAll<HTMLDetailsElement>('.epic-object'));
    const next = objects.find(object => object.querySelector('summary')?.textContent === opened) ?? objects[0];
    if (next) {
      next.open = true;
      (next.querySelector('button') ?? next.querySelector('summary'))?.focus();
    }
  };
  const item = (name: string, description: string, action?: string, click?: () => void) => {
    const details = el('details', { class: 'epic-object' }, [
      el('summary', { text: name }), el('p', { text: description }),
      action && click ? el('button', { class: 'btn', text: action, onClick: click }) : null,
    ]);
    return details;
  };
  const { where, day } = state;
  if (where === 'garage' && !flag('moped')) {
    if (flag('loaded')) return item(line('Le break', 'Station wagon'), line('La mob dépasse du coffre.', 'The moped sticks out of the boot.'));
    return item(flag('garagePrint') ? line('La clé sur la photo', 'The key in the photo') : line('Rétroviseur fêlé', 'Cracked mirror'), day < 3
      ? line('« Si tu touches, tu pédales. » Gérard a fermé le rideau.', '“Touch it and you pedal.” Gérard pulled the shutter down.')
      : line('Dans le rétro, une clé pend au rideau levé. La mob occupera la moitié de chaque lot au retour, arrondie en sa faveur.', 'In the mirror, a key hangs from the raised shutter. The moped takes half of each stack on return, rounded up.'),
      day >= 3 ? line('Décrocher la clé et sortir la mob', 'Take the key and roll the moped out') : undefined,
      () => clearGarageAisle(app.ui, () => mark('loaded')));
  }
  if (day === 2 && where === 'grocery') return item(line('Menu du snack', 'Snack menu'),
    line('Au dos, le cuistot crache du feu. Sa toque ressemble au bouton de ta gazinière.', 'On the back the cook breathes fire. His hat looks just like your stove dial.'),
    flag('menu') ? undefined : line('Emporter le dessin', 'Pocket the drawing'), () => mark('menu'));
  if (day === 4 && where === 'post') return item(line('Colis vidéo', 'Video parcel'), line('NUIT IV. « Le facteur fait ses propres cascades. »', 'NIGHT IV. “The postman does his own stunts.”'),
    flag('vhs') ? undefined : line('Lire la jaquette', 'Read the sleeve'), () => mark('vhs'));
  if (day === 5 && where === 'shed') return item(line('Terre meuble', 'Soft earth'), line('Deux grandes pistes encadrent une petite. Toutes trois vont vers ton portail.', 'Two sets of large prints flank a small set. All three lead to your gate.'));
  if (day === 6 && where === 'grocery') return item(line('Photo sous la caisse', 'Photo under the till'), line('Ton cendrier, vu de la maison d’en face. « Si tu fumes encore là-dedans, allume la lampe. »', 'Your ashtray, seen from across the road. “If you still smoke in there, turn on the lamp.”'),
    flag('photo') ? undefined : line('Retourner la photo', 'Turn over the photo'), () => mark('photo'));
  if (where !== 'home') return null;
  const objects = el('div', { class: 'refuge-curiosities' });
  if (day === 2) objects.append(item(line('Gazinière', 'Stove'), flag('stove') ? line('Ce soir, on mange froid.', 'Cold dinner tonight.') : flag('menu') ? line('Le dessin tient pile sur la porte du four. Une idée prend.', 'The drawing fits the oven door perfectly. An idea clicks.') : line('Plus que deux raviolis.', 'Two ravioli left.'),
    flag('menu') && !flag('stove') ? line('Sacrifier la gazinière 🔥', 'Sacrifice the stove 🔥') : undefined, () => mark('stove')));
  if (day === 6 && flag('photo')) objects.append(item(line('Cendrier et lampe', 'Ashtray and lamp'), line('Le reflet dans la photo vient de cette ampoule.', 'The reflection in the photo comes from this bulb.'),
    flag('lamp') ? undefined : line('Poser la lampe à la fenêtre', 'Set the lamp in the window'), () => mark('lamp')));
  if (flag('garagePrint') && !flag('moped')) objects.append(item(line('Tirage du garage', 'Garage print'),
    line('Au dos du tirage : « Clé sous le rideau. Prendre le break. »', 'On the back: “Key under the shutter. Take the wagon.”')));
  if (flag('moped') && !flag('spent')) {
    const lane = flag('lane') % 4;
    objects.append(item(line('Mob à lames de Gérard', 'Gérard’s bladed moped'), S().sector[SECTOR_IDS[lane]!] + ' →',
      line('Orienter vers ', 'Aim at ') + S().sector[SECTOR_IDS[(lane + 1) % 4]!], () => mark('lane', (lane + 1) % 4)));
  }
  if (day === 3 && flag('stove')) objects.append(item(line('Rectangle de lino propre', 'Clean patch of lino'), line('Deux raviolis. Froids.', 'Two ravioli. Cold.')));
  for (const detail of objects.querySelectorAll('details')) detail.name = 'refuge-curiosity';
  return objects.childElementCount ? objects : null;
}

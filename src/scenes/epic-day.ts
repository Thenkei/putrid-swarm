import './epic.css';
import { showGarageBoot } from './garage-boot';
import { stoveMorning } from './stove-return';
import { epicFlag, markEpic } from '../core/epics';
import { SECTOR_IDS, type SectorId } from '../core/types';
import type { App } from '../engine/app';
import { audio } from '../engine/audio';
import { say } from '../engine/voice';
import { el } from '../engine/dom';
import { line, S } from '../engine/i18n';

export function epicObject(app: App, refresh: () => void, aimMoped?: (sector: SectorId, previous?: SectorId) => void): HTMLElement | null {
  const state = app.state;
  if (!state) return null;
  const flag = (key: string) => epicFlag(state, key);
  const mark = (key: string, value = 1) => {
    const opened = app.ui.querySelector<HTMLDetailsElement>('.epic-object[open]')?.querySelector('summary')?.textContent;
    app.state = markEpic(app.state!, key, value);
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
    if (flag('garageStarterBroken') || flag('loaded')) return null;
    if (day >= 3 && flag('garageKey')) {
      void audio.prepareSample('vo_moped_load');
      void audio.prepareSample('crate_1');
      const summary = el('summary', { text: line('Antivol ouvert', 'Steering unlocked') });
      const note = el('p', { text: line('Avec la mob, tu ramènes un objet par paire de même type. Les objets seuls restent ici.', 'With the moped aboard, you keep one item per matching pair. Single items stay here.') });
      const load = el('button', { class: 'garage-load-button', text: line('Charger dans le break', 'Load into the wagon'), onClick: () => {
        app.state = markEpic(app.state!, 'loaded');
        app.save();
        refresh();
        const cargo = app.ui.querySelector<HTMLButtonElement>('.garage-boot-inspect');
        cargo?.focus({ preventScroll: true });
        const dialog = showGarageBoot(app, true);
        void Promise.all([audio.prepareSample('crate_1'), audio.prepareSample('vo_moped_load')]).then(() => {
          if (!cargo?.isConnected) return;
          audio.play('crate', .42);
          say('vo_moped_load', { interrupt: true, subtitle: !dialog.open });
        });
      } });
      return el('details', { class: 'garage-load' }, [
        summary, el('div', { class: 'garage-load-body' }, [note, load]),
      ]);
    }
    if (day < 3) return item(line('Rétroviseur fêlé', 'Cracked mirror'),
      line('« Si tu touches, tu pédales. » Gérard a fermé le rideau.', '“Touch it and you pedal.” Gérard pulled the shutter down.'));
    return null;
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
  if (flag('garagePrint') && !flag('moped') && !flag('garageKey') && !flag('garageStarterBroken')) objects.append(item(line('Tirage du garage', 'Garage print'),
    line('Un petit anneau dépasse de la poche du bleu de travail.', 'A small ring peeks out of the coverall pocket.')));
  if (flag('moped') && !flag('spent')) {
    const lane = flag('lane') % 4;
    const current = SECTOR_IDS[lane]!;
    const next = (lane + 1) % SECTOR_IDS.length;
    const moped = item(line('Mob à lames de Gérard', 'Gérard’s bladed moped'),
      line('Départ vers ', 'Pointed toward ') + S().sector[SECTOR_IDS[lane]!] + line('. Les lames ouvrent le passage. La mob et sa charge explosent au fond du jardin. Un seul départ.', '. The blades cut a path. The charge blows the moped apart at the far end of the yard. One ride.'),
      line('Orienter vers ', 'Aim at ') + S().sector[SECTOR_IDS[next]!], () => {
        mark('lane', next);
        aimMoped?.(SECTOR_IDS[next]!, current);
      });
    moped.querySelector('summary')?.addEventListener('click', () => {
      if (!moped.open) aimMoped?.(current);
    });
    objects.append(moped);
  }
  if (day === 3 && flag('stove')) objects.append(stoveMorning(!!flag('sootyLock')));
  for (const detail of objects.querySelectorAll('details')) detail.name = 'refuge-curiosity';
  return objects.childElementCount ? objects : null;
}

import { discover } from './scene-evidence';
import { notebookButton } from './field-notebook';
import { epicFlag, markEpic } from '../core/epics';
import { audio } from '../engine/audio';
import type { App } from '../engine/app';
import { el } from '../engine/dom';
import { line as L } from '../engine/i18n';
import kitchen from '../assets/epic-kitchen.webp';
import coldMeal from '../assets/epic-stove-morning.webp';
import neighbourWindow from '../assets/epic-neighbour.webp';
import { paintedRoom, type Detail } from './painted-room';

type Keepsake = 'stove' | 'lamp';
interface Room {
  art: string;
  ratio: number;
  opening: string;
  points: (Detail & { action?: string | undefined })[];
}

function kitchenView(done: boolean, drawing: boolean): Room {
  if (done) {
    const opening = L('Deux raviolis. Froids. Le lino a gardé la marque des pieds.', 'Two ravioli. Cold. The feet left marks on the lino.');
    return {
      art: coldMeal, ratio: 860 / 573, opening, points: [
        { x: 39, y: 86, label: L('Boîte ouverte', 'Open tin'), read: opening },
      ]
    };
  }
  const opening = drawing
    ? L('« Tiens. Il avait donc la même que moi. » Le dessin dépasse de ta poche.', '“Huh. So he had the same one as me.” The drawing peeks out of your pocket.')
    : L('Plus que deux raviolis. Le couvercle du four est encore tiède.', 'Two ravioli left. The oven lid is still warm.');
  return {
    art: kitchen, ratio: 1280 / 540, opening, points: [
      { x: 53, y: 66, label: L('Examiner la table', 'Inspect the table'), read: drawing ? L('Les assiettes sont bien trop larges pour le rond dessiné sur le menu.', 'The plates are much wider than the circle on the menu.') : L('Deux assiettes, un seul couvert.', 'Two plates, one place setting.') },
      {
        x: 13, y: 61, label: L('Examiner le bouton', 'Inspect the dial'),
        read: drawing ? L('L’encoche tombe juste. Pour l’emmener sur le perron ce soir, il faudra condamner le four. Demain, tu mangeras froid.', 'The notches match. Taking the stove onto the porch tonight means giving up the oven. Tomorrow’s dinner will be cold.') : opening,
        action: drawing ? L('Réserver la gazinière pour le perron', 'Set the stove aside for the porch') : undefined
      },
    ]
  };
}

function windowView(done: boolean): Room {
  const opening = done
    ? L('La lampe éclaire le cendrier. Depuis le jardin, la fenêtre doit se voir de loin.', 'The lamp lights the ashtray. That window must show from way down the garden.')
    : L('« Même la petite brûlure sur le bord… » Tu reconnais ton cendrier sur le tirage.', '“Even the little burn on the rim…” You recognise the ashtray in the print.');
  return {
    art: neighbourWindow, ratio: 1280 / 540, opening, points: [
      { x: 16, y: 90, label: L('Examiner le cendrier', 'Inspect the ashtray'), read: L('L’éclat est du côté de la rue. Sur la photo aussi. C’est bien ce rebord-là qu’on aperçoit d’en face.', 'The chip faces the street. In the photo, too. This is the sill they can see from across the road.') },
      {
        x: 9, y: 57, label: L('Examiner la lampe', 'Inspect the lamp'), read: done ? opening : L('La vitre renvoie un reflet de l’abat-jour juste au-dessus de la brûlure.', 'The shade reflects in the pane just above the burn mark.'),
        action: done ? undefined : L('Poser la lampe à la fenêtre', 'Set the lamp in the window')
      },
    ]
  };
}

export function refugeRoom(app: App, key: Keepsake) {
  const stove = key === 'stove';
  const title = stove ? L('Gazinière', 'Stove') : L('Cendrier et lampe', 'Ashtray and lamp');
  const trigger = el('button', { class: 'btn', text: stove ? L('Entrer dans la cuisine', 'Step into the kitchen') : L('Regarder par la fenêtre', 'Look out of the window'), onClick: open });
  const entry = el('details', { class: 'epic-object' }, [el('summary', { text: title }), trigger]);

  function open() {
    const note = el('p');
    note.setAttribute('role', 'status');
    const actions = el('div', { class: 'find-actions' });
    const frame = el('div', { class: 'room-frame' });
    const leave = el('button', { class: 'btn', text: L('Revenir à la cour', 'Back to the yard'), onClick: () => dialog.close() });
    const dialog = el('dialog', { class: 'garage-key-dialog refuge-room' }, [el('header', { class: 'find-heading' }, [el('h2', { text: title }), notebookButton(app, stove ? 'menu' : 'photo')]), frame, note, actions]);
    dialog.setAttribute('aria-label', title);
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('close', () => {
      dialog.remove();
      trigger.focus({ preventScroll: true });
    }, { once: true });

    function commit() {
      if (epicFlag(app.state!, key)) return;
      app.state = markEpic(app.state!, key);
      app.save();
      audio.play(stove ? 'crate' : 'bulb', .5);
      show();
      leave.focus();
    }

    function show() {
      const done = Boolean(epicFlag(app.state!, key));
      const view = stove ? kitchenView(done, Boolean(epicFlag(app.state!, 'menu'))) : windowView(done);
      if (!stove) dialog.dataset.lit = String(done);
      const room = paintedRoom(view.art, view.ratio, view.opening, view.points, index => {
        const point = index === null ? undefined : view.points[index];
        if (index !== null) discover(app, stove ? (done ? 'coldTin' : index === 0 ? 'table' : 'dial') : index === 0 ? 'ashtray' : 'shade');
        note.textContent = point?.read ?? view.opening;
        actions.replaceChildren(room.back, leave);
        if (point?.action) actions.insertBefore(el('button', { class: 'btn', text: point.action, onClick: commit }), leave);
      });
      frame.style.setProperty('--room-ratio', String(view.ratio));
      frame.replaceChildren(room.host);
      actions.replaceChildren(room.back, leave);
      note.textContent = view.opening;
    }

    show();
    app.ui.append(dialog);
    dialog.showModal();
  }
  return entry;
}

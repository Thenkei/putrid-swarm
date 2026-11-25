import { audio } from '../engine/audio';
import type { App } from '../engine/app';
import { epicFlag, markEpic } from '../core/epics';
import { forceGarageKey, garageModel, garageModels, hasTimeForGarageKey, keyForGarageModel, tryGarageKey } from '../core/garage-ignition';
import { assetUrl } from '../engine/assets';
import { el } from '../engine/dom';
import { line as L, S } from '../engine/i18n';
import { say } from '../engine/voice';
import './garage-keys.css';

// Positions of the cuts along each blade. The rubbing and the corresponding key
// share the same outline so the player can solve the puzzle by sight.
const keys = [
  { cuts: [80, 100, 141], fr: 'deux crans côté anneau, un côté pointe', en: 'two cuts near the bow, one near the tip' },
  { cuts: [80, 124, 141], fr: 'un cran côté anneau, deux côté pointe', en: 'one cut near the bow, two near the tip' },
  { cuts: [80, 110, 141], fr: 'trois crans régulièrement espacés', en: 'three evenly spaced cuts' },
  { cuts: [91, 135], fr: 'deux crans très écartés', en: 'two widely spaced cuts' },
  { cuts: [90, 108, 126, 144], fr: 'quatre petits crans', en: 'four close cuts' },
] as const;
type Key = (typeof keys)[number];
export type GarageFind = 'notebook' | 'pocket' | 'cart' | 'model';

function modelBadge(seed: number) {
  return el('span', { class: 'garage-frame-number', text: garageModels[garageModel(seed)]! });
}

function mopedProp(seed: number, inspect?: () => void) {
  const picture = el('img');
  picture.alt = '';
  const art = assetUrl('epic_moped_art');
  if (art) picture.src = art;
  const bike = inspect ? el('button', { class: 'garage-parked-moped', onClick: inspect }, [picture, modelBadge(seed)])
    : el('span', { class: 'garage-parked-moped' }, [picture, modelBadge(seed)]);
  if (inspect) bike.setAttribute('aria-label', L('Examiner la mob', 'Inspect the moped'));
  return el('div', { class: 'garage-moped-occlusion' }, [bike]);
}

export function parkedGarageMoped(app: App, inspect: () => void) {
  const caption = el('span', { class: 'garage-moped-memory', text: S().voice.vo_moped_discovery });
  if (!epicFlag(app.state!, 'garageNoticed')) void audio.prepareSample('vo_moped_discovery');
  caption.id = 'garage-moped-memory';
  caption.hidden = true;
  const prop = mopedProp(app.state!.seed, () => {
    if (epicFlag(app.state!, 'garageNoticed')) {
      showCaption(false);
      inspect();
      return;
    }
    app.state = markEpic(app.state!, 'garageNoticed');
    app.save();
    showCaption(true);
    void audio.prepareSample('vo_moped_discovery').then(() => {
      if (caption.isConnected && !caption.hidden) say('vo_moped_discovery', { subtitle: false, interrupt: true });
    });
  });
  const bike = prop.querySelector('button')!;
  bike.setAttribute('aria-controls', caption.id);
  function showCaption(open: boolean) {
    caption.hidden = !open;
    bike.setAttribute('aria-expanded', String(open));
  }
  showCaption(false);
  bike.addEventListener('blur', () => showCaption(false));
  return el('div', { class: 'garage-moped-prop' }, [prop, caption]);
}

export function garageFinds(seed: number, held: number, inspect: (place: GarageFind) => void) {
  const buttons = (['notebook', 'pocket', 'cart'] as const).map(place => {
    const label = place === 'notebook' ? L('Tiroir entrouvert de l’établi', 'Open workbench drawer')
      : place === 'pocket' ? L('Poche du bleu de travail', 'Coverall pocket') : L('Flanc de la servante', 'Side of the tool chest');
    const button = el('button', { class: 'garage-key-spot', data: { place }, onClick: () => inspect(place) });
    if (place !== 'notebook') button.append(garageRing(seed, place, held));
    button.setAttribute('aria-label', label);
    return button;
  });
  return el('div', { class: 'garage-finds' }, buttons);
}

export function garageView(plate: string | null | undefined, seed: number) {
  const scene = el('div', { class: 'garage-key-scene' }, [mopedProp(seed)]);
  if (plate) scene.style.backgroundImage = 'url("' + plate + '")';
  return scene;
}

function keyDrawing(key: Key, rubbing = false) {
  const canvas = el('canvas');
  canvas.width = 360;
  canvas.height = 130;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  const shape = new Path2D('M 54 24 Q 52 9 38 8 L 24 8 Q 9 9 9 27 L 9 37 Q 9 54 24 55 L 38 55 Q 51 54 54 40 L 61 40 L 62 44 L 69 44 L 69 38');
  for (const cut of key.cuts) {
    shape.lineTo(cut - 7, 38);
    shape.lineTo(cut, 29);
    shape.lineTo(cut + 6, 38);
  }
  shape.lineTo(153, 38);
  shape.lineTo(164, 28);
  shape.lineTo(155, 23);
  shape.lineTo(61, 23);
  shape.closePath();
  shape.moveTo(23, 18);
  shape.arc(18, 18, 5, 0, Math.PI * 2);
  const brass = ctx.createLinearGradient(0, 8, 0, 53);
  brass.addColorStop(0, '#ffdfa0');
  brass.addColorStop(.42, '#d3a153');
  brass.addColorStop(.65, '#f1c77b');
  brass.addColorStop(1, '#946534');
  ctx.fillStyle = rubbing ? '#675849' : brass;
  ctx.strokeStyle = rubbing ? '#473b33' : '#4b321b';
  ctx.lineWidth = 1.5;
  ctx.fill(shape, 'evenodd');
  ctx.stroke(shape);
  if (rubbing) {
    ctx.save();
    ctx.clip(shape, 'evenodd');
    ctx.strokeStyle = '#d5c2a18a';
    ctx.lineWidth = .75;
    ctx.beginPath();
    for (let x = -40; x < 168; x += 2.4) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 35, 56);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = rubbing ? '#b8a68b' : '#936431';
  ctx.beginPath();
  ctx.moveTo(60, 26); ctx.lineTo(154, 26);
  ctx.stroke();
  return canvas;
}

// The close-ups and the developed print share the notebook's key silhouettes.
export function garageRing(seed: number, place: 'pocket' | 'cart', held = 0, choose?: (index: number) => void) {
  const ring = el('span', { class: 'garage-door-ring' });
  const slots = place === 'pocket' ? [0, 1, 2] : [3, 4];
  for (const slot of slots) {
    const index = (slot + (seed >>> 0)) % keys.length;
    if (held === index + 1) continue;
    const key = keys[index]!;
    const props = { class: 'garage-ring-key', data: { slot: String(slot) } };
    const drawing = keyDrawing(key);
    if (choose) {
      const pick = el('button', { ...props, onClick: () => choose(index) }, [drawing]);
      pick.setAttribute('aria-label', L('Examiner la clé : ', 'Inspect key: ') + L(key.fr, key.en));
      ring.append(pick);
    } else {
      ring.append(el('span', props, [drawing]));
    }
  }
  return ring;
}

export function searchGarageKeys(app: App, place: GarageFind, plate: string | undefined, canUnlock: boolean, refresh: () => void) {
  const state = app.state!;
  const seed = state.seed;
  const model = garageModel(seed);
  const held = epicFlag(state, 'garageHeldKey');
  const tracing = epicFlag(state, 'garageTracing') - 1;
  const heading = place === 'model' ? L('La mob de Gérard', 'Gérard’s moped')
    : place === 'notebook' ? L('Le carnet de Gérard', 'Gérard’s notebook')
    : place === 'pocket' ? L('La poche du bleu de travail', 'The coverall pocket') : L('Le flanc de la servante', 'The side of the tool chest');
  const status = el('p', { class: 'garage-key-status' });
  status.setAttribute('role', 'status');
  const detail = el('div', { class: 'garage-key-detail', data: { view: place } });
  // This view only supplies the first frames of the lean-in. The playable garage stays underneath the dialog.
  const approach = garageView(plate, seed);
  approach.setAttribute('aria-hidden', 'true');
  const frame = el('div', { class: 'garage-key-frame' }, [approach, detail]);
  const back = el('button', { class: 'btn', text: L('Reprendre la fouille', 'Keep searching'), onClick: () => dialog.close() });
  const dialog = el('dialog', { class: 'garage-key-dialog' }, [el('h2', { text: heading }), frame, status, back]);
  dialog.setAttribute('aria-label', heading);

  function remember(flag: string, value: number) {
    app.state = markEpic(app.state!, flag, value);
    app.save();
  }

  function notebookPage(index: number) {
    const key = keys[keyForGarageModel(seed, index)]!;
    const page = el('figure', { class: 'garage-key-rubbing' }, [
      el('figcaption', { text: garageModels[index]! }), keyDrawing(key, true),
    ]);
    page.setAttribute('role', 'img');
    page.setAttribute('aria-label', garageModels[index] + ' · ' + L(key.fr, key.en));
    return page;
  }

  if (place === 'notebook') {
    const pages = el('div', { class: 'garage-key-pages' });
    garageModels.forEach((number, index) => {
      const key = keys[keyForGarageModel(seed, index)]!;
      const copy = el('button', { class: 'garage-key-sheet', onClick: () => {
        remember('garageTracing', index + 1);
        dialog.close();
        app.toast(L('Calque emporté · ', 'Tracing taken · ') + number);
      } }, [notebookPage(index)]);
      copy.setAttribute('aria-label', L('Prendre le calque du modèle ', 'Take the tracing for model ') + number + ' · ' + L(key.fr, key.en));
      pages.append(copy);
    });
    status.textContent = epicFlag(state, 'garageModelRead')
      ? L('Sur le réservoir de la mob : ', 'On the moped’s tank: ') + garageModels[model] + '.'
      : L('Trois modèles, trois empreintes au crayon.', 'Three models, three pencil rubbings.');
    detail.append(el('div', { class: 'garage-notebook-spread' }, [
      el('h3', { text: L('Doubles d’antivol', 'Spare steering keys') }), pages,
    ]));
  } else if (place === 'pocket' || place === 'cart') {
    const ink = tracing >= 0 && tracing < garageModels.length ? notebookPage(tracing) : null;
    if (ink) detail.append(ink);
    detail.append(garageRing(seed, place, held, index => {
      remember('garageHeldKey', index + 1);
      audio.play('chain', .28);
      dialog.close();
      refresh();
      app.ui.querySelector<HTMLButtonElement>(`[data-place="${place}"]`)?.focus();
      app.toast(L('Tu décroches la clé.', 'You slip the key off the ring.'));
    }));
    status.textContent = ink ? L('Tu déplies le calque à côté des clés.', 'You unfold the tracing beside the keys.')
      : place === 'pocket' ? L('Tu sors le trousseau de la poche. L’anneau tient au bleu par un passant.', 'You lift the keys out of the pocket. A cloth loop holds the ring to the coveralls.')
      : L('Un petit crochet sous le rebord. Les clés ont rayé la peinture rouge.', 'A little hook under the lip. The keys have scratched the red paint.');
    if (held) status.append(' ' + L('Prendre une autre clé remet celle en main à sa place.', 'Taking another key returns the one in hand to its ring.'));
  } else {
    if (!epicFlag(state, 'garageModelRead')) remember('garageModelRead', 1);
    const portrait = el('div', { class: 'garage-model-portrait' }, [modelBadge(seed)]);
    portrait.setAttribute('role', 'img');
    portrait.setAttribute('aria-label', L('Modèle ', 'Model ') + garageModels[model]);
    detail.append(portrait);
    status.textContent = L('Les lettres chromées du réservoir brillent encore sous la poussière.', 'The chrome lettering on the tank still shines through the dust.');
    if (epicFlag(state, 'garageStarterBroken')) {
      status.textContent = L('Le démarreur est cassé. La mob restera au garage.', 'The starter is broken. The moped is staying here.');
    } else if (held && canUnlock) {
      const attempt = el('button', { class: 'btn garage-try-key', disabled: !hasTimeForGarageKey(state),
        text: L('Essayer la clé · 30 min', 'Try the key · 30 min'), onClick: () => {
        const trial = tryGarageKey(app.state!);
        if (trial.result === 'unavailable') return;
        app.state = trial.state;
        app.save();
        refresh();
        attempt.remove();
        if (trial.result !== 'started') {
          audio.play('deny', .25);
          if (trial.result === 'resists') {
            status.textContent = L('Une deuxième clé résiste. Si tu forces, tu casseras le démarreur et tu devras abandonner la mob.', 'Another key sticks. Forcing it will break the starter and cost you the moped.');
            detail.append(el('button', { class: 'btn garage-try-key', text: L('Forcer et casser le démarreur', 'Force it and break the starter'), onClick: () => {
              app.state = forceGarageKey(app.state!);
              app.save();
              dialog.close();
              refresh();
              app.toast(L('Démarreur cassé. La mob restera ici.', 'Starter broken. The moped stays here.'), 'error');
            } }));
            back.textContent = L('Retirer la clé et reprendre la fouille', 'Withdraw key and keep searching');
          } else {
            status.textContent = L('La clé bute. Tu la retires avant de tordre le contact. Une demi-heure de perdue.', 'The key catches. You pull it out before it bends the ignition. Half an hour gone.');
          }
          back.focus();
          return;
        }
        audio.play('ready', .5);
        dialog.close();
        refresh();
        const load = app.ui.querySelector<HTMLDetailsElement>('.garage-load');
        if (load) { load.open = true; load.querySelector('summary')?.focus({ preventScroll: true }); }
      } });
      detail.append(attempt);
      if (attempt.disabled) status.textContent = L('Il faut garder assez de jour pour rentrer. L’essai demande 30 minutes.', 'Save enough daylight for the drive home. A test takes 30 minutes.');
    }
  }
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  app.ui.append(dialog);
  dialog.showModal();
}

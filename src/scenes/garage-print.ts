import { assetUrl } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line as L } from '../engine/i18n';
import './garage-print.css';

/** The paper develops on the night clock so pausing also holds the exposure. */
export function developGaragePrint(field: HTMLElement, note: HTMLElement, actions: HTMLElement, finish: (readable: boolean) => void) {
  const photo = el('div', { class: 'garage-print-photo' });
  const garage = assetUrl('plate_loc_garage');
  if (garage) photo.style.backgroundImage = 'url("' + garage + '")';
  const bike = assetUrl('epic_moped_art');
  if (bike) {
    const moped = el('img');
    moped.src = bike;
    moped.alt = '';
    photo.append(moped);
  }
  const frame = el('div', { class: 'garage-print-paper' }, [photo]);
  frame.setAttribute('aria-hidden', 'true');
  const status = el('output', { class: 'garage-print-status' });
  status.setAttribute('aria-live', 'polite');
  const stages = [L('Papier vierge', 'Blank paper'), L('Les contours apparaissent', 'Outlines emerging'),
    L('Les détails sont nets', 'Details are sharp'), L('Les ombres se bouchent', 'Shadows closing in')];
  let elapsed = 0;
  let stage = 0;
  let dipped = false;
  let finished = false;
  const takeOut = (readable: boolean) => {
    if (finished) return;
    finished = true;
    audio.play(readable ? 'ready' : 'deny');
    finish(readable);
  };
  const dip = el('button', { class: 'btn', text: L('Plonger le papier', 'Dip the paper'), onClick: () => {
    if (dipped) { takeOut(stage === 2); return; }
    dipped = true;
    audio.play('click');
    dip.textContent = L('Retirer le tirage', 'Lift the print');
  } });
  status.value = stages[0]!;
  field.replaceChildren(el('div', { class: 'garage-print-tray' }, [frame, status]));
  actions.replaceChildren(dip);
  note.textContent = L('Plonge le papier, puis retire-le quand les détails sont nets. Une exposition trop longue efface les ombres.',
    'Dip the paper, then lift it when the details are sharp. Leave it too long and the shadows fill in.');
  dip.focus();
  return (dt: number) => {
    if (!dipped || finished) return;
    elapsed += dt;
    const next = elapsed < 1 ? 0 : elapsed < 2.6 ? 1 : elapsed < 5.4 ? 2 : 3;
    if (next !== stage) { stage = next; status.value = stages[stage]!; }
    photo.style.opacity = String(Math.min(1, elapsed / 2.6));
    photo.style.filter = 'sepia(.75) grayscale(.55) brightness(' + Math.max(.16, 1 - Math.max(0, elapsed - 4.6) * .36) + ')';
    if (elapsed >= 7) takeOut(false);
  };
}

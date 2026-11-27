import pocketPlate from '../assets/garage-key-pocket.webp';
import { garageRing } from './garage-keys';
import { calmMotion } from '../render/lighting';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line as L } from '../engine/i18n';
import './garage-print.css';

/** The paper develops on the night clock so pausing also holds the exposure. */
export function developGaragePrint(field: HTMLElement, note: HTMLElement, actions: HTMLElement, seed: number, onSharp: () => void, finish: (readable: boolean) => void) {
  void audio.prepareSample('photo_dip');
  void audio.prepareSample('photo_lift');
  const photo = el('div', { class: 'garage-print-photo' });
  photo.style.backgroundImage = 'url("' + pocketPlate + '")';
  photo.append(garageRing(seed, 'pocket'));
  const frame = el('div', { class: 'garage-print-paper' }, [photo]);
  frame.setAttribute('aria-hidden', 'true');
  const bath = el('div', { class: 'garage-print-bath' }, [frame]);
  const ripple = el('i', { class: 'garage-print-ripple' });
  ripple.setAttribute('aria-hidden', 'true');
  bath.append(ripple);
  const status = el('output', { class: 'garage-print-status' });
  status.setAttribute('aria-live', 'polite');
  const stages = [L('Papier vierge', 'Blank paper'), L('Les contours apparaissent', 'Outlines emerging'),
    L('Les détails sont nets', 'Details are sharp'), L('Les ombres se bouchent', 'Shadows closing in')];
  let elapsed = 0;
  let stage = 0;
  let dipped = false;
  let finished = false;
  let lifting: boolean | null = null;
  let liftTime = 0;
  const still = calmMotion();
  function paperPosition(lift: number, tilt: number) {
    if (still) lift = 0;
    frame.style.transform = 'translate(-50%,' + (-50 - 13 * lift) + '%) rotate(' + (still ? 0 : tilt) + 'deg) perspective(520px) rotateX(20deg) scale(' + (1 + .055 * lift) + ')';
    frame.style.boxShadow = '0 ' + (2 + lift * 12) + 'px ' + (3 + lift * 13) + 'px #100807aa';
  }
  paperPosition(1, -3.8);
  const takeOut = (readable: boolean) => {
    if (finished || lifting !== null) return;
    lifting = readable;
    dip.disabled = true;
    audio.fadeOut('photo_dip', .045);
    audio.play('photo_lift');
    status.value = L('Le tirage s’égoutte', 'The print is draining');
  };
  const dip = el('button', { class: 'btn', text: L('Plonger le papier', 'Dip the paper'), onClick: () => {
    if (dipped) { takeOut(stage === 2); return; }
    dipped = true;
    audio.play('photo_dip');
    dip.textContent = L('Retirer le tirage', 'Lift the print');
  } });
  status.value = stages[0]!;
  field.replaceChildren(el('div', { class: 'garage-print-tray' }, [bath, status]));
  actions.replaceChildren(dip);
  note.textContent = L('Plonge le papier, puis retire-le quand les détails sont nets. Une exposition trop longue efface les ombres.',
    'Dip the paper, then lift it when the details are sharp. Leave it too long and the shadows fill in.');
  dip.focus();
  return (dt: number) => {
    if (!dipped || finished) return;
    if (lifting !== null) {
      liftTime += dt;
      const rise = Math.min(1, liftTime / .5);
      paperPosition(rise, -1 - rise * 3);
      ripple.style.opacity = still ? '0' : String(.28 * Math.sin(rise * Math.PI));
      ripple.style.transform = 'translate(-50%,-50%) scale(' + (1 + .12 * rise) + ')';
      if (liftTime >= (still ? .20 : .70)) {
        finished = true;
        audio.play(lifting ? 'ready' : 'deny', .40);
        finish(lifting);
      }
      return;
    }
    elapsed += dt;
    if (!still && elapsed <= 1.35) {
      const settle = Math.max(0, 1 - elapsed / .42);
      paperPosition(settle, -1 - 2.8 * settle);
      const wave = Math.min(1, Math.max(0, (elapsed - .18) / 1.05));
      ripple.style.opacity = String(Math.sin(wave * Math.PI) * .44);
      ripple.style.transform = 'translate(-50%,-50%) scale(' + (.94 + wave * .17) + ')';
    }
    const next = elapsed < 1 ? 0 : elapsed < 2.6 ? 1 : elapsed < 5.4 ? 2 : 3;
    if (next !== stage) {
      stage = next;
      status.value = stages[stage]!;
      if (stage === 2) {
        onSharp();
        frame.removeAttribute('aria-hidden');
        frame.setAttribute('role', 'img');
        frame.setAttribute('aria-label', L('Un anneau de laiton dépasse de la poche du bleu de travail.', 'A brass ring peeks out of the coverall pocket.'));
      } else {
        frame.setAttribute('aria-hidden', 'true');
        frame.removeAttribute('aria-label');
        frame.removeAttribute('role');
      }
    }
    photo.style.opacity = String(Math.min(1, elapsed / 2.6));
    photo.style.filter = 'sepia(.75) grayscale(.55) brightness(' + Math.max(.16, 1 - Math.max(0, elapsed - 4.6) * .36) + ')';
    if (elapsed >= 7) takeOut(false);
  };
}

import loadedMopedArt from '../assets/garage-loaded-moped.webp';
import type { App } from '../engine/app';
import { el } from '../engine/dom';
import { line, S } from '../engine/i18n';

function bootPicture(alt: string) {
  const image = el('img');
  image.src = loadedMopedArt;
  image.alt = alt;
  image.width = 1675;
  image.height = 939;
  return image;
}

export function showGarageBoot(app: App, justLoaded = false) {
  const picture = bootPicture(line('La mob de Gérard, sanglée dans le coffre ouvert du break.', 'Gérard’s moped strapped inside the open boot of the wagon.'));
  const back = el('button', { class: 'btn', text: line('Reprendre la fouille', 'Keep searching'), onClick: () => dialog.close() });
  const dialog = el('dialog', { class: 'garage-key-dialog garage-boot-dialog' }, [
    picture,
    el('div', { class: 'garage-boot-actions' }, [
      justLoaded ? el('span', { text: S().voice.vo_moped_load }) : null, back,
    ]),
  ]);
  dialog.setAttribute('aria-label', line('Le coffre du break', 'The wagon’s boot'));
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  app.ui.append(dialog);
  dialog.showModal();
  return dialog;
}

export function loadedGarageBoot(app: App) {
  const inspect = el('button', { class: 'garage-boot-inspect', onClick: () => showGarageBoot(app) });
  inspect.setAttribute('aria-label', line('Examiner la mob dans le coffre', 'Inspect the moped in the boot'));
  inspect.setAttribute('aria-haspopup', 'dialog');
  return el('div', { class: 'garage-loaded-moped' }, [bootPicture(''), inspect]);
}

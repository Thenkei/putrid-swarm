import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line as L } from '../engine/i18n';

/** A second way to play the kitchen without finding the stove idea. A released bolt
 * stays where it is. Continued pressure from both sides makes it slide backwards. */
export function kitchenBolts(field: HTMLElement, note: HTMLElement, toggle: HTMLButtonElement, finish: () => void) {
  let time = 0, inserted = 0, travel = 0, pushing = false;
  void audio.prepareSample('bolt_slide');
  void audio.prepareSample('bolt_seat');
  let motion = 0;
  let wasKnocking = false;
  const rails = [0, 1].map(() => el('div', { class: 'kitchen-bolt' }, [
    el('i', { class: 'bolt-rail' }), el('i', { class: 'bolt-shaft' }), el('i', { class: 'bolt-catch' }),
  ]));
  const door = el('div', { class: 'kitchen-door-detail' }, rails);
  door.setAttribute('aria-hidden', 'true');
  field.append(door);
  const status = el('span');
  status.setAttribute('role', 'status');
  const progress = el('progress');
  progress.max = 1;
  progress.setAttribute('aria-label', L('Course du verrou', 'Bolt travel'));
  note.replaceChildren(status, progress);
  const label = () => {
    toggle.textContent = pushing ? L('Relâcher le verrou', 'Release bolt') : L('Pousser le verrou', 'Push bolt');
    toggle.setAttribute('aria-pressed', String(pushing));
  };
  const pressure = () => (time + (inserted ? 0.64 : 0)) % 3.4 < 1.45;
  const show = () => {
    const knocking = pressure();
    if (knocking && !wasKnocking) audio.play('door', .33);
    wasKnocking = knocking;
    door.dataset.pressure = String(knocking);
    rails.forEach((rail, i) => {
      rail.style.setProperty('--slide', (i < inserted ? 100 : i === inserted ? travel * 100 : 0) + '%');
      rail.dataset.active = String(i === inserted);
    });
    const text = (inserted ? L('Verrou du bas', 'Lower bolt') : L('Verrou du haut', 'Upper bolt')) + ' · ' +
      (knocking ? L('La porte force. Relâche.', 'The door strains. Release.') : L('Accalmie. Pousse.', 'A lull. Push.'));
    if (status.textContent !== text) status.textContent = text;
    progress.value = travel;
  };
  toggle.onclick = () => { pushing = !pushing; label(); };
  label(); show(); toggle.focus();
  return (dt: number) => {
    time += dt;
    const previous = travel;
    if (pushing) travel = Math.max(0, travel + dt * (pressure() ? -.8 : .70));
    const direction = Math.sign(travel - previous);
    if (direction !== motion) {
      audio.fadeOut('bolt_slide', .035);
      if (direction) audio.play('bolt_slide', direction > 0 ? .8 : .63, direction > 0 ? 1 : .78);
      motion = direction;
    }
    if (travel >= 1) {
      audio.fadeOut('bolt_slide', .035);
      motion = 0;
      audio.play('bolt_seat', .9, inserted ? .89 : 1);
      inserted++;
      if (inserted === rails.length) { finish(); return; }
      pushing = false;
      travel = 0;
      label();
    }
    show();
  };
}

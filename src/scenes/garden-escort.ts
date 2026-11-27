import { GardenEscort } from '../core/garden-escort';
import { el } from '../engine/dom';
import { audio } from '../engine/audio';
import { drawGarden } from '../render/garden-feed';
import { gardenAftermath } from '../render/garden-scenery';
import { line as L } from '../engine/i18n';

const gardenNames = () => [
  L('La haie du facteur', 'The postman’s hedge'),
  L('Le fil à linge', 'The washing line'),
  L('La serre du voisin', 'The neighbour’s greenhouse'),
];

/** The caller owns the simulation clock, so pausing or leaving night also stops the patrol. */
export function escortFeed(field: HTMLElement, note: HTMLElement, signal: HTMLButtonElement, lamp: boolean, seed: number, shelter: (id: 'hedge' | 'laundry' | 'greenhouse') => void, finish: (home: boolean) => void) {
  const game = new GardenEscort(lamp, seed);
  const names = gardenNames();
  const canvas = el('canvas', { class: 'garden-feed' });
  canvas.width = 900;
  canvas.height = 390;
  canvas.setAttribute('aria-hidden', 'true');
  const voice = el('span', { class: 'epic-live' });
  voice.setAttribute('role', 'status');
  field.replaceChildren(canvas, voice);
  let lastShelter = -1;
  let last = '';
  let feedback = '';
  let feedbackFor = 0;
  const sign = lamp ? L('Lampe', 'Lamp') : L('Rideau', 'Curtain');
  const sync = () => {
    const action = game.advance ? L('Cacher · se baisser', 'Hide · crouch') : L('Montrer · avancer', 'Show · move');
    const command = sign + ' · ' + action;
    if (signal.textContent !== command) {
      signal.textContent = command;
      signal.setAttribute('aria-pressed', String(game.advance));
    }
    const situation = game.watched ? L('Regard sur le sentier', 'Patrol watching the path')
      : game.hidden ? L('À couvert', 'In cover')
      : game.closingIn ? L('Le regard approche', 'Gaze closing in') : L('Passage libre', 'Path clear');
    const alert = Math.round(game.alert / .93 * 10) * 10;
    // Announce changes in exposure, not every point accumulated by the suspicion meter.
    const report = names[game.garden] + ' · ' + situation + (feedbackFor > 0 ? ' · ' + feedback : '');
    if (report !== voice.textContent) voice.textContent = report;
    const pending = game.advance !== game.walking ? L(' · Il réagit…', ' · Signal travelling…') : '';
    const status = names[game.garden] + ' · ' + (game.garden + 1) + '/3 · ' + situation + pending + ' · ' + L('Soupçon ', 'Suspicion ') + alert + '%' + (feedbackFor > 0 ? ' · ' + feedback : '');
    if (status !== last) { note.textContent = status; last = status; }
    drawGarden(canvas, game, names[game.garden]!);
  };
  signal.onclick = () => { game.signal(); audio.play(lamp ? 'bulb' : 'rope_take', 0.32); sync(); };
  signal.focus();
  sync();
  return (dt: number) => {
    // A missed frame may span an entire sight line. Always integrate the walk in small steps.
    for (let remain = dt; remain > 1e-7; remain -= 1 / 60) {
      const tick = Math.min(remain, 1 / 60);
      feedbackFor -= tick;
      const event = game.step(tick);
      if (event === 'home' || event === 'fled') {
        finish(event === 'home');
        field.replaceChildren(canvas);
        gardenAftermath(canvas, event === 'home');
        return;
      }
      if (event === 'caught') {
        audio.play('scuffle', 0.55);
        feedback = L('Repéré ! Il se replie. Encore une alerte et il rentre seul.', 'Spotted! He falls back. One more scare and he turns back.');
        feedbackFor = 4;
      }
      if (event === 'next') {
        audio.play('car_latch', 0.33, 1.15);
        audio.play('camera', 0.4);
        feedback = L('Au portail. Il attend ton signal.', 'At the gate. He waits for your signal.');
        feedbackFor = 3;
      }
    }
    if (game.hidden && game.garden !== lastShelter) {
      lastShelter = game.garden;
      shelter((['hedge', 'laundry', 'greenhouse'] as const)[game.garden]!);
    }
    sync();
  };
}

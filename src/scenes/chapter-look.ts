import type { App } from '../engine/app';
import { STAGE_H, STAGE_W } from '../engine/app';
import { el } from '../engine/dom';
import { line as L } from '../engine/i18n';
import { epicFlag, markEpic } from '../core/epics';
import { audio } from '../engine/audio';
import './epic-finds.css';

import { observations, type Chapter, type Look } from './chapter-observations';
import { notebookButton } from './field-notebook';

/** The first stationary shot is the source of the close-up, including the foreground
 * and current campaign's painted props. The scene owns its clock while it is open. */
export function chapterLook(app: App, chapter: Chapter) {
  const layer = el('div', { class: 'chapter-look' });
  const dialog = el('dialog', { class: 'garage-key-dialog chapter-look-dialog' });
  let previous: HTMLButtonElement;
  function inspect(point: Look, index: number, source: HTMLButtonElement) {
    previous = source;
    const frame = el('canvas');
    frame.width = 800;
    frame.height = 388;
    const width = STAGE_W * .48, height = width * frame.height / frame.width;
    const x = Math.max(0, Math.min(STAGE_W - width, STAGE_W * point.x - width / 2));
    const y = Math.max(0, Math.min(STAGE_H - height, STAGE_H * point.y - height / 2));
    const sx = app.canvas.width / STAGE_W, sy = app.canvas.height / STAGE_H;
    frame.getContext('2d')?.drawImage(app.canvas, x * sx, y * sy, width * sx, height * sy, 0, 0, frame.width, frame.height);
    const flag = chapter + 'Look';
    const seen = epicFlag(app.state!, flag);
    const id = chapter + index;
    if (!app.state!.chapterPrints?.[id]) {
      const print = el('canvas');
      print.width = 384;
      print.height = 186;
      print.getContext('2d')!.drawImage(frame, 0, 0, print.width, print.height);
      const state = markEpic(app.state!, flag, seen | (1 << index));
      app.state = { ...state, chapterPrints: { ...state.chapterPrints, [id]: print.toDataURL('image/webp', .76) } };
      app.save();
    }
    source.dataset.seen = 'true';
    if (index === 0) {
      const sound = { orchard: 'hedge_leaves', shed: 'chain', radio: 'radio_squelch', finale: 'chord' } as const;
      audio.play(sound[chapter], .38);
    }
    dialog.setAttribute('aria-label', point.label);
    dialog.replaceChildren(el('header', { class: 'find-heading' }, [el('h2', { text: point.label }), notebookButton(app, chapter)]), frame, el('p', { text: point.evidence }),
      el('button', { class: 'btn', text: L('Revenir à la scène', 'Back to the scene'), onClick: () => dialog.close() }));
    dialog.showModal();
  }
  dialog.addEventListener('keydown', e => e.stopPropagation());
  dialog.addEventListener('close', () => previous?.focus({ preventScroll: true }));
  observations(chapter).forEach((point, index) => {
    const button = el('button', {
      class: 'chapter-point', title: point.label,
      style: { left: point.x * 100 + '%', top: point.y * 100 + '%' }, onClick: () => inspect(point, index, button)
    });
    button.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') e.stopPropagation();
    });
    button.setAttribute('aria-label', point.label);
    button.dataset.seen = String(Boolean(epicFlag(app.state!, chapter + 'Look') & (1 << index)));
    button.setAttribute('aria-haspopup', 'dialog');
    layer.append(button);
  });
  layer.append(dialog);
  return { layer, dialog };
}

/** Let the player put the written report down and look at the final shot again. */
export function chapterReport(card: HTMLElement, label: string) {
  const summary = el('summary', {}, [
    el('span', { class: 'chapter-see', text: label }),
    el('span', { class: 'chapter-back', text: L('Revenir au bilan', 'Back to the report') }),
  ]);
  const review = el('details', { class: 'chapter-revisit' }, [summary]);
  summary.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
    if (event.key === 'Escape' && review.open) {
      event.stopPropagation();
      review.open = false;
    }
  });
  card.append(review);
}

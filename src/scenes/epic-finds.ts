import { notebookButton } from './field-notebook';
import type { GameState } from '../core/types';
import { epicFlag, GARDEN_NIGHT, markEpic, MOON_NIGHT } from '../core/epics';
import type { App } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line as L } from '../engine/i18n';
import './epic-finds.css';

import { papers, story, seenFind, type Find } from './find-notes';
import trailUrl from '../assets/shed-muddy-trail.webp';
const positions = { menu: [314, 360], vhs: [408, 254], trail: [555, 523], photo: [379, 329] } as const;

function findAt(s: GameState): Find | undefined {
  if (s.where === 'grocery' && s.day === 2) return 'menu';
  if (s.where === 'post' && s.day === 4) return 'vhs';
  if (s.where === 'shed' && s.day === MOON_NIGHT) return 'trail';
  if (s.where === 'grocery' && s.day === GARDEN_NIGHT) return 'photo';
}

const pictures = new Map<string, HTMLImageElement>();
function pictureFor(url: string) {
  let picture = pictures.get(url);
  if (!picture) {
    picture = new Image();
    picture.src = url;
    pictures.set(url, picture);
  }
  return picture;
}

// Painted in stage coordinates after the shop foreground and before the dusk wash.
// The inspection uses the same rendered frame, including dust, occlusion and shadows.
export function drawEpicFind(c: CanvasRenderingContext2D, state: GameState) {
  const kind = findAt(state);
  if (!kind) return;
  const [x, y] = positions[kind];
  const kept = epicFlag(state, kind);
  c.save();
  c.translate(x, y);
  if (kind === 'trail') {
    const ground = pictureFor(trailUrl);
    if (ground.naturalWidth) c.drawImage(ground, -117, -58.5, 234, 117);
    if (kept) {
      c.beginPath();
      c.ellipse(41, 4, 10, 6, -.5, .4, 4.1);
      c.strokeStyle = '#ddd1b3cf';
      c.lineWidth = .95;
      c.setLineDash([3.3, .48, 1.3, .32]);
      c.stroke();
    }
  } else {
    c.rotate(-.13);
    c.transform(1, -.13, .13, .60, 0, 0);
    const [under, loose] = papers[kind].map(pictureFor);
    c.shadowColor = '#2d1c1180';
    c.shadowBlur = 1.1;
    c.shadowOffsetY = .7;
    if (under?.naturalWidth) c.drawImage(under, -27, -16, 34, 33);
    if (loose?.naturalWidth) {
      c.rotate(.1);
      if (!kept) c.drawImage(loose, -6, -17, 29, 34);
      else if (kind === 'menu') {
        c.drawImage(loose, 0, 0, loose.width, loose.height * .11, -6, -17, 29, 3.7);
      }
    }
  }
  c.restore();
}

function evidenceInsert(kind: Find) {
  const paper = el('img', { class: 'find-insert' });
  paper.alt = '';
  if (kind !== 'trail') paper.src = papers[kind][1];
  return paper;
}

export function epicFind(app: App, inspectOnly: boolean, renderRoom: (ctx: CanvasRenderingContext2D) => void): HTMLElement | null {
  const kind = findAt(app.state!);
  if (!kind) return null;
  const [x, y] = positions[kind], words = story(kind);
  const spot = el('button', { class: 'epic-find', style: { left: x + 'px', top: y + 'px' }, onClick: () => inspect(kind) });
  spot.setAttribute('aria-label', words.title);
  spot.setAttribute('aria-haspopup', 'dialog');
  function inspect(kind: Find) {
    const frame = el('canvas');
    frame.width = 720;
    frame.height = 360;
    // Redraw the room at inspection resolution with its foreground and dusk grade.
    const paint = () => {
      const ctx = frame.getContext('2d')!;
      ctx.save();
      ctx.scale(frame.width / 234, frame.height / 117);
      ctx.translate(117 - x, 58.5 - y);
      renderRoom(ctx);
      ctx.restore();
    };
    paint();
    const read = el('p');
    read.setAttribute('role', 'status');
    const paper = evidenceInsert(kind);
    const account = el('div', { class: 'find-account' }, [paper, read]);
    const actions = el('div', { class: 'find-actions' });
    const back = el('button', { class: 'btn', text: L('Reprendre la fouille', 'Keep searching'), onClick: () => dialog.close() });
    const view = el('div', { class: 'find-view', data: { kind } }, [frame]);
    const detail = el('button', {
      class: 'btn', text: words.act, onClick: () => {
        if (epicFlag(app.state!, kind)) return;
        app.state = markEpic(app.state!, kind);
        app.save();
        audio.play(kind === 'trail' ? 'click' : 'letter_fold', .42);
        read.textContent = words.result + ' ' + L('Noté dans le carnet.', 'Written in the notebook.');
        detail.remove();
        second.focus();
        paint();
      }
    });
    const examined = 'examined.' + kind;
    const choose = (right: boolean) => {
      detail.remove();
      const kept = epicFlag(app.state!, kind);
      paper.hidden = !right || kind === 'trail';
      const side = right ? 2 : 1;
      if (epicFlag(app.state!, examined) !== side) {
        const seen = seenFind(app.state!, kind) | side;
        app.state = markEpic(markEpic(app.state!, 'notes.' + kind, seen), examined, side);
        app.save();
      }
      read.textContent = right ? words.clue + (kept ? ' ' + words.result : '') : words.other;
      if (right && !kept && !inspectOnly) {
        actions.prepend(detail);
        detail.focus();
      }
    };
    const target = (label: string, right: boolean) => {
      const b = el('button', { class: 'find-target ' + (right ? 'find-right' : 'find-left'), onClick: () => choose(right) }, [el('span', { text: label })]);
      b.setAttribute('aria-label', label);
      return b;
    };
    const second = target(words.second, true);
    view.append(target(words.first, false), second);
    const last = epicFlag(app.state!, examined);
    const kept = Boolean(epicFlag(app.state!, kind));
    paper.hidden = kind === 'trail' || (!kept && last !== 2);
    read.textContent = kept ? words.result : [words.opening, words.other, words.clue][last] ?? words.opening;
    if (last === 2 && !kept && !inspectOnly) actions.append(detail);
    actions.append(back);
    const dialog = el('dialog', { class: 'garage-key-dialog find-dialog' }, [el('header', { class: 'find-heading' }, [el('h2', { text: words.title }), notebookButton(app, kind)]), view, account, actions]);
    dialog.setAttribute('aria-label', words.title);
    dialog.addEventListener('keydown', e => e.stopPropagation());
    dialog.addEventListener('close', () => {
      dialog.remove();
      spot.focus({ preventScroll: true });
    }, { once: true });
    app.ui.append(dialog);
    dialog.showModal();
  }
  return spot;
}

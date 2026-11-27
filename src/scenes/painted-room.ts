import { el } from '../engine/dom';
import { line as L } from '../engine/i18n';
import './painted-room.css';

export interface Detail {
  x: number;
  y: number;
  label: string;
  read: string;
  finding?: string;
}

/** Keep the painted board, its hit areas and its close-ups in one coordinate space. */
export function paintedRoom(url: string, ratio: number, description: string, points: Detail[],
  examine: (index: number | null) => void) {
  const image = el('img');
  image.src = url;
  image.alt = description;
  const layer = el('div', { class: 'room-painting' }, [image]);
  const board = el('div', { class: 'room-board' }, [layer]);
  board.style.setProperty('--ratio', String(ratio));
  const host = el('div', { class: 'room-mat' }, [board]);
  const back = el('button', {
    class: 'btn room-wide', text: L('Vue d’ensemble', 'Wide view'), onClick: () => {
      layer.style.transform = '';
      layer.classList.remove('is-close');
      back.hidden = true;
      examine(null);
      buttons[selected]?.focus({ preventScroll: true });
    }
  });
  let selected = 0;
  const buttons = points.map((p, i) => {
    const b = el('button', {
      class: 'room-point', title: p.label, style: { left: p.x + '%', top: p.y + '%' }, onClick: () => {
        selected = i;
        layer.style.transformOrigin = p.x + '% ' + p.y + '%';
        layer.style.transform = 'scale(1.72)';
        layer.classList.add('is-close');
        back.hidden = false;
        examine(i);
        back.focus({ preventScroll: true });
      }
    });
    b.setAttribute('aria-label', p.label);
    return b;
  });
  // A moving reflection follows the metal, not the hit area around it.
  for (const p of points) {
    if (p.finding === 'latch' || p.finding === 'litSignal' || p.finding === 'curtain') {
      const mark = el('i', { class: 'room-material mark-' + p.finding });
      mark.setAttribute('aria-hidden', 'true');
      layer.append(mark);
    }
  }
  layer.append(...buttons);
  back.hidden = true;
  return { host, back };
}

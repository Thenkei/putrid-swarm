import { aislePieces, initialAisle, pieceCells, slidePiece } from '../core/garage-aisle';
import { el } from '../engine/dom';
import { audio } from '../engine/audio';
import { getLang } from '../engine/i18n';
import { drawPaintedMoped } from '../render/moped';
import { calmMotion } from '../render/lighting';
import './garage-aisle.css';

/** Native dialog contains focus while the player rolls the moped through the workshop. */
export function clearGarageAisle(host: HTMLElement, loaded: () => void) {
  const fr = getLang() === 'fr';
  const names = fr ? ['La mob', 'Servante', 'Chariot', 'Établi'] : ['Moped', 'Tool cart', 'Trolley', 'Workbench'];
  const board = el('div', { class: 'aisle-grid' });
  const controls = el('div', { class: 'aisle-controls' });
  const message = el('p');
  message.setAttribute('role', 'status');
  let offsets = initialAisle();
  let selected = 0;
  let loading = false;
  let dragged = false;
  let drag: { index: number; x: number; y: number; id: number } | null = null;
  const art = el('canvas', { class: 'aisle-moped-art' });
  art.width = 210;
  art.height = 136;
  art.setAttribute('aria-hidden', 'true');
  const ink = art.getContext('2d');
  let hasArt = false;
  if (ink) {
    ink.translate(98, 106);
    ink.scale(2.95, 2.95);
    hasArt = drawPaintedMoped(ink);
  }
  const dialog = el('dialog', { class: 'aisle-dialog' }, [
    el('h2', { text: fr ? 'Sortir la mob' : 'Roll the moped out' }),
    el('p', { text: fr ? 'Fais glisser les objets ou déplace-les avec les flèches. Le break attend à droite de la mob.' : 'Drag the objects or move them with the arrows. The wagon is waiting to the right of the moped.' }),
    board, message, controls,
  ]);
  dialog.setAttribute('aria-label', fr ? 'Allée du garage' : 'Garage aisle');
  const close = () => dialog.close();
  const shift = (d: -1 | 1) => {
    if (loading) return;
    const next = slidePiece(offsets, selected, d);
    if (!next) {
      message.textContent = fr ? 'Ça coince. Il faut dégager le passage.' : 'Blocked. Clear the aisle first.';
      audio.play('deny', .26);
      return;
    }
    audio.play(selected === 0 ? 'chain' : 'crate', 0.36);
    const moving = tokens[selected]!;
    // A second arrow can arrive while the previous slide is still on screen.
    const from = moving.getBoundingClientRect();
    for (const slide of moving.getAnimations()) slide.cancel();
    offsets = next;
    loading = offsets[0] === 3;
    draw();
    moving.focus();
    let travel: Animation | undefined;
    if (!calmMotion()) {
      const to = moving.getBoundingClientRect();
      const dx = 100 * (from.left - to.left) / to.width;
      const dy = 100 * (from.top - to.top) / to.height;
      travel = moving.animate([
        { transform: 'translate(' + dx + '%,' + dy + '%)' },
        { transform: 'translate(0,0)' },
      ], { duration: 175, easing: 'cubic-bezier(.18,.6,.28,1)' });
    }
    if (loading) {
      controls.inert = true;
      board.inert = true;
      const finish = () => { if (dialog.open) { close(); loaded(); } };
      if (travel) travel.finished.then(finish, finish);
      else finish();
    }
  };
  const tokens = aislePieces.map((_, i) => {
    const token = el('button', { class: 'aisle-piece', onClick: () => {
      selected = i; draw(); token.focus();
    } }, [el('span', { class: 'aisle-piece-label', text: names[i]! })]);
    token.dataset.index = String(i);
    token.dataset.piece = ['moped', 'toolbox', 'trolley', 'bench'][i]!;
    if (i === 0 && hasArt) token.prepend(art);
    return token;
  });
  board.append(...tokens, el('span', { class: 'aisle-exit', text: '→' }));
  const draw = () => {
    aislePieces.forEach((piece, i) => {
      const { x, y } = pieceCells(offsets, i)[0]!;
      const token = tokens[i]!;
      token.style.gridColumn = (x + 1) + ' / span ' + (piece.vertical ? 1 : 2);
      token.style.gridRow = (y + 1) + ' / span ' + (piece.vertical ? 2 : 1);
      token.setAttribute('aria-pressed', String(i === selected));
    });
    const vertical = aislePieces[selected]!.vertical;
    const labels = vertical ? (fr ? ['↑ Monter', '↓ Descendre'] : ['↑ Up', '↓ Down']) : (fr ? ['← Gauche', 'Droite →'] : ['← Left', 'Right →']);
    message.textContent = loading ? (fr ? 'La mob monte dans le break.' : 'The moped rolls into the wagon.') : names[selected] + (vertical ? ' ↕' : ' ↔');
    controls.replaceChildren(...([-1, 1] as const).map((d,i) => el('button', {
      class: 'btn', text: labels[i]!, disabled: !slidePiece(offsets, selected, d), onClick: () => shift(d),
    })), el('button', { class: 'btn', text: fr ? 'Recommencer' : 'Reset', onClick: () => {
      for (const slide of board.getAnimations({ subtree: true })) slide.cancel();
      offsets = initialAisle(); selected = 0; draw();
    } }),
      el('button', { class: 'btn', text: fr ? 'La laisser ici' : 'Leave it here', onClick: close }));
  };
  board.addEventListener('pointerdown', event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('[data-index]');
    if (!event.isPrimary || event.button !== 0 || !target || loading) return;
    dragged = false;
    drag = { index: Number(target.dataset.index), x: event.clientX, y: event.clientY, id: event.pointerId };
    target.setPointerCapture(event.pointerId);
  });
  board.addEventListener('pointercancel', () => { drag = null; });
  board.addEventListener('pointerup', event => {
    const start = drag;
    drag = null;
    if (!start || event.pointerId !== start.id) return;
    const vertical = aislePieces[start.index]!.vertical;
    const distance = vertical ? event.clientY - start.y : event.clientX - start.x;
    const cross = vertical ? event.clientX - start.x : event.clientY - start.y;
    const threshold = Math.max(8, board.getBoundingClientRect().width / 20);
    if (Math.abs(distance) < threshold || Math.abs(distance) < Math.abs(cross)) return;
    dragged = true;
    selected = start.index;
    if (!slidePiece(offsets, selected, distance > 0 ? 1 : -1)) draw();
    shift(distance > 0 ? 1 : -1);
  });
  board.addEventListener('click', event => {
    if (dragged && event.detail > 0) { dragged = false; event.stopPropagation(); }
  }, true);
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    const keys = aislePieces[selected]!.vertical ? ['ArrowUp','ArrowDown'] : ['ArrowLeft','ArrowRight'];
    if (keys.includes(event.key)) { event.preventDefault(); shift(event.key === keys[0] ? -1 : 1); }
  });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  host.append(dialog);
  draw();
  dialog.showModal();
}

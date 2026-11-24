import { audio } from '../engine/audio';
import { el } from '../engine/dom';

/** Capture held gestures on the layer because advancing the scene replaces its prompt buttons. */
export function promptLayer(stopHolding: () => void): HTMLElement {
  const layer = el('div', { class: 'qte-layer' });
  const release = (event: PointerEvent) => {
    if (event.target === layer) stopHolding();
  };
  layer.addEventListener('pointerup', release);
  layer.addEventListener('pointercancel', release);
  layer.addEventListener('lostpointercapture', release);
  return layer;
}

export function bindPromptPointer(button: HTMLElement, layer: HTMLElement, hold: boolean, press: (event: PointerEvent) => void): void {
  button.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    audio.unlock();
    if (hold) layer.setPointerCapture(event.pointerId);
    press(event);
  });
}

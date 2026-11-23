import { el } from '../engine/dom';
import { audio } from '../engine/audio';
import { getLang } from '../engine/i18n';

/** Align the two CRT traces. Each dial controls one independently visible property. */
export function lastWatchDesk(field: HTMLElement, seed: number, lamp: boolean, cub: boolean) {
  const fr = getLang() === 'fr';
  const cycles = 3 + (seed >>> 0) % 5;
  const phase = 2 + (seed >>> 8) % 6;
  const scope = el('canvas');
  scope.width = 720; scope.height = 200;
  scope.setAttribute('aria-hidden', 'true');
  const makeDial = (label: string, min: number, max: number, initial: number) => {
    const input = el('input');
    input.type = 'range'; input.min = String(min); input.max = String(max); input.value = String(initial);
    input.setAttribute('aria-label', label);
    const value = el('output', { text: input.value });
    input.addEventListener('input', () => {
      value.value = input.value;
      audio.play(locked() ? 'radio_squelch' : 'radio_knob', locked() ? 0.5 : 0.28);
      redraw();
    });
    return { input, root: el('label', {}, [label, input, value]) };
  };
  const freq = makeDial(fr ? 'Fréquence' : 'Frequency', 1, 9, lamp ? cycles : 1);
  const shift = makeDial(fr ? 'Phase' : 'Phase', 0, 9, cub ? phase : 0);
  const status = el('div', { class: 'last-watch-state' });
  status.setAttribute('aria-live', 'polite');
  const locked = () => +freq.input.value === cycles && +shift.input.value === phase;
  const redraw = () => {
    const ctx = scope.getContext('2d');
    if (!ctx) return;
    const glass = ctx.createRadialGradient(358, 94, 12, 360, 100, 395);
    glass.addColorStop(0, '#293e32'); glass.addColorStop(1, '#101e1b');
    ctx.fillStyle = glass; ctx.fillRect(0, 0, 720, 200);
    ctx.strokeStyle = '#314442'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < 720; x += 30) { ctx.moveTo(x, 0); ctx.lineTo(x, 200); }
    for (let y = 0; y < 200; y += 25) { ctx.moveTo(0, y); ctx.lineTo(720, y); }
    ctx.stroke();
    const trace = (f: number, p: number, color: string, dash: number[]) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = 3;
      for (let x = 0; x <= 720; x += 2) {
        const y = 100 + 65 * Math.sin(2 * Math.PI * (x * f / 720 + p / 10));
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.stroke(); ctx.restore();
      ctx.setLineDash([]);
    };
    trace(+freq.input.value, +shift.input.value, '#e6aa61', []);
    trace(cycles, phase, '#9ad4c2', [6, 6]);
    const higher = +freq.input.value < cycles;
    const later = +shift.input.value < phase;
    status.dataset.locked = String(locked());
    status.textContent = locked() ? (fr ? 'Signal stable. Le relais peut être enclenché.' : 'Signal steady. The relay is ready.')
      : +freq.input.value !== cycles ? (fr ? (higher ? 'Trop peu de crêtes.' : 'Trop de crêtes.') : (higher ? 'Too few peaks.' : 'Too many peaks.'))
      : (fr ? (later ? 'Fréquence calée. Augmente la phase.' : 'Fréquence calée. Réduis la phase.') : (later ? 'Frequency matched. Raise the phase.' : 'Frequency matched. Lower the phase.'));
  };
  const legend = el('div', { class: 'last-watch-legend' }, [
    el('span', { text: fr ? 'Signal reçu' : 'Incoming signal' }), el('span', { text: fr ? 'Relais' : 'Relay' }),
  ]);
  field.append(el('div', { class: 'last-watch-scope' }, [legend, el('div', { class: 'last-watch-screen' }, [scope]), freq.root, shift.root, status]));
  redraw();
  if (!locked()) (+freq.input.value === cycles ? shift.input : freq.input).focus();
  return locked;
}

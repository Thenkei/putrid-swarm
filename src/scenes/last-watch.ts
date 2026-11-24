import { el } from '../engine/dom';
import { audio } from '../engine/audio';
import { getLang } from '../engine/i18n';
import './last-watch.css';

/** Align the two CRT traces. Each dial controls one independently visible property. */
export function lastWatchDesk(field: HTMLElement, seed: number, lamp: boolean, cub: boolean) {
  const fr = getLang() === 'fr';
  const cycles = 3 + (seed >>> 0) % 5;
  const phase = 2 + (seed >>> 8) % 6;
  const scope = el('canvas');
  scope.width = 720; scope.height = 200;
  scope.setAttribute('aria-hidden', 'true');
  const makeDial = (label: string, min: number, max: number, initial: number, target: number) => {
    const input = el('input');
    input.type = 'range'; input.min = String(min); input.max = String(max); input.value = String(initial);
    input.setAttribute('aria-label', label);
    const value = el('output', { text: input.value });
    input.addEventListener('input', () => {
      value.value = input.value;
      input.setAttribute('aria-valuetext', input.value + (+input.value === target ? (fr ? ' · calée' : ' · matched') : ''));
      audio.play(locked() ? 'radio_squelch' : 'radio_knob', locked() ? 0.5 : 0.28);
      redraw();
    });
    return { input, root: el('label', {}, [el('span', {text:label}), input, value]) };
  };
  const freq = makeDial(fr ? 'Fréquence' : 'Frequency', 1, 9, lamp ? cycles : 1, cycles);
  const shift = makeDial(fr ? 'Phase' : 'Phase', 0, 9, cub ? phase : 0, phase);
  const status = el('div', { class: 'last-watch-state' });
  status.id = 'last-watch-status';
  status.setAttribute('aria-live', 'polite');
  for (const dial of [freq, shift]) dial.input.setAttribute('aria-describedby', status.id);
  const locked = () => +freq.input.value === cycles && +shift.input.value === phase;
  const redraw = (retry = false) => {
    const higher = +freq.input.value < cycles;
    const later = +shift.input.value < phase;
    freq.root.dataset.matched = String(+freq.input.value === cycles);
    shift.root.dataset.matched = String(+shift.input.value === phase);
    receiver.style.setProperty('--strength', String(Math.max(.08, 1 - (Math.abs(+freq.input.value - cycles) + Math.abs(+shift.input.value - phase)) / 12)));
    status.dataset.locked = String(locked());
    const cue = locked() ? (fr ? 'Signal stable. Le relais peut être enclenché.' : 'Signal steady. The relay is ready.')
      : +freq.input.value !== cycles ? (fr ? (higher ? 'Augmente la fréquence.' : 'Réduis la fréquence.') : (higher ? 'Raise the frequency.' : 'Lower the frequency.'))
      : (fr ? (later ? 'Fréquence calée. Augmente la phase.' : 'Fréquence calée. Réduis la phase.') : (later ? 'Frequency matched. Raise the phase.' : 'Frequency matched. Lower the phase.'));
    const message = retry ? (fr ? 'Le relais décroche. ' : 'The relay drops out. ') + cue : cue;
    if (status.textContent !== message) status.textContent = message;
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
  };
  const legend = el('div', { class: 'last-watch-legend' }, [
    el('span', { text: fr ? 'Signal reçu' : 'Incoming signal' }), el('span', { text: fr ? 'Relais' : 'Relay' }),
  ]);
  const meter = el('i', {class:'relay-carrier-meter'});
  meter.setAttribute('aria-hidden', 'true');
  const receiver = el('div', { class: 'last-watch-scope relay-rack' }, [el('div', { class: 'last-watch-screen' }, [scope, legend, status]), freq.root, shift.root, meter]);
  field.append(receiver);
  redraw();
  const focusDial = () => (+freq.input.value === cycles ? shift.input : freq.input).focus();
  if (!locked()) focusDial();
  return { locked, statusId: status.id, retry() {
    redraw(true);
    focusDial();
  }, confirm(text: string) {
    freq.input.disabled = shift.input.disabled = true;
    status.textContent = text;
  } };
}

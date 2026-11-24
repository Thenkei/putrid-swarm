import gateUrl from '../assets/baker-gate.webp';
import thresholdUrl from '../assets/baker-threshold.webp';
import reachUrl from '../assets/baker-reach.webp';
import bowlUrl from '../assets/baker-bowl.webp';
import { bakerKindling } from '../render/baker-kindling';
import { calmMotion } from '../render/lighting';
import { el } from '../engine/dom';
import { audio } from '../engine/audio';
import { line } from '../engine/i18n';
import './baker-morning.css';

function painting(src: string) {
  const img = new Image();
  img.src = src;
  return img;
}

/** The wood and the quarter hour of upkeep have already settled in shedDawn.
 * This is the player's view of that first visit, including on a restored day. */
export function bakerMorning(freed: boolean) {
  const label = freed ? line('Un fagot au portail', 'A bundle at the gate')
    : line('Apporter l’eau à la cabane', 'Take water to the shed');
  const description = freed ? line('Le nœud est encore serré. Sur le morceau de sac, un épi et le tampon de la boulangerie.',
    'The knot is still tight. On the strip of flour sack, a wheat ear and the bakery stamp.')
    : line('Il pousse le bol vide jusqu’au seuil et retire sa main.', 'He pushes the empty bowl over to the sill and draws his hand back.');
  const canvas = el('canvas');
  canvas.width = 720; canvas.height = 405;
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', description);
  const detail = el('details', { class: 'epic-object baker-morning' }, [
    el('summary', { text: label }), canvas, el('p', { text: description }),
  ]);
  detail.name = 'refuge-curiosity';
  const background = painting(freed ? gateUrl : thresholdUrl);
  const bundle = freed ? bakerKindling() : null;
  const hand = freed ? null : painting(reachUrl);
  const bowl = freed ? null : painting(bowlUrl);
  if (!freed) void audio.prepareSample('baker_bowl_slide');
  const loaded = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;
  const ctx = canvas.getContext('2d');
  const ease = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
  let age = 0, finished = false;
  function update(dt: number) {
    if (!detail.open || document.hidden || !ctx || finished || !loaded(background)) return;
    if (bundle && !loaded(bundle) || hand && !loaded(hand) || bowl && !loaded(bowl)) return;
    const before = age;
    age += dt;
    const still = calmMotion();
    ctx.drawImage(background, 0, 0, 720, 405);
    if (bundle) {
      const shadow = ctx.createRadialGradient(291, 281, 2, 291, 281, 105);
      shadow.addColorStop(0, '#261809c2'); shadow.addColorStop(1, '#26180900');
      ctx.save(); ctx.translate(0, 194); ctx.scale(1, .32); ctx.fillStyle = shadow;
      ctx.fillRect(162, 164, 265, 240); ctx.restore();
      ctx.drawImage(bundle, 143, 89, 308, 219);
      finished = true;
    } else if (bowl && hand) {
      // His hand reaches from the dark, meets the far rim, follows it along
      // the planks, then releases it. The lip stops short of the sill's drop.
      const contact = .74, release = 1.49;
      const push = still ? Number(age >= 1.12) : ease((age - contact) / (release - contact));
      const reach = still ? Number(age >= .4) : ease((age - .08) / .66);
      const withdraw = still ? Number(age >= 1.8) : ease((age - release) / .65);
      const x = 210 + 124 * push, y = 133 + 21 * push, size = 110 + 13 * push;
      const armEnd = x + 17 - 153 * (1 - reach) - 374 * withdraw;
      ctx.drawImage(hand, armEnd - 356, y - 98 - 26 * (1 - reach + withdraw), 356, 106);
      ctx.fillStyle = '#231b176b';
      ctx.beginPath(); ctx.ellipse(x + size * .52, y + 4, size * .47, 6, -.08, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(bowl, x, y + 6 - size * .54, size, size * .54);
      if (before < contact && age >= contact) audio.play('baker_bowl_slide', .60);
      finished = age >= 2.25;
    }
  }
  return { detail, update, label, freed };
}

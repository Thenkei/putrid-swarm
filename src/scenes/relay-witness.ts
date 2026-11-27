import type { MoonCamera } from '../render/moon-yard';
import windowUrl from '../render/garden-window.webp';
import { homewardPack } from '../render/moon-pack';
import { smoothstep } from '../core/math';
import { audio } from '../engine/audio';
import { line as L } from '../engine/i18n';
import { el } from '../engine/dom';
import { calmMotion } from '../render/lighting';

const FLASHES = [.22, 1.04, 1.86];
function plate(url: string) {
  const art = new Image();
  art.decoding = 'async';
  art.src = url;
  return art;
}

/** A lamp reflected in the curved tube, followed by the gate camera coming through. */
function reflectedWindow(ctx: CanvasRenderingContext2D, image: HTMLImageElement, light: number) {
  ctx.save();
  // Mirror the neighbour's lamp and shutters as seen from the operator's desk.
  ctx.transform(-1, .035, -.035, 1, 682, -22);
  if (image.complete && image.naturalWidth) {
    ctx.globalAlpha = .61;
    ctx.drawImage(image, 0, 0, 1024, 454, 0, 0, 660, 291);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'screen';
  const bloom = ctx.createRadialGradient(215, 86, 3, 215, 86, 109);
  bloom.addColorStop(0, 'rgba(255,238,167,' + (.88 * light) + ')');
  bloom.addColorStop(.27, 'rgba(255,193,105,' + (.52 * light) + ')');
  bloom.addColorStop(1, '#c4874000');
  ctx.fillStyle = bloom;
  ctx.fillRect(106, -23, 218, 218);
  ctx.restore();
  // The offset second glint and the feathered edges belong to the CRT's outer glass.
  // Only the lamp changes exposure. The house and the night sky behind it stay still.
  ctx.fillStyle = 'rgba(255,215,152,' + (.28 * light) + ')';
  ctx.beginPath(); ctx.ellipse(458, 74, 6, 2.6, -.28, 0, Math.PI * 2); ctx.fill();
  const falloff = ctx.createLinearGradient(0, 0, 720, 150);
  falloff.addColorStop(0, '#0f1d1bfd'); falloff.addColorStop(.14, '#0e1c1cca');
  falloff.addColorStop(.44, '#14232036'); falloff.addColorStop(.75, '#1c29210a'); falloff.addColorStop(1, '#101f1bf4');
  ctx.fillStyle = falloff; ctx.fillRect(0, 0, 720, 230);
  const rim = ctx.createLinearGradient(0, 119, 0, 230);
  rim.addColorStop(0, '#14211f00'); rim.addColorStop(1, '#12211fec');
  ctx.fillStyle = rim; ctx.fillRect(0, 119, 720, 111);
}

function gateCamera(ctx: CanvasRenderingContext2D, yard: HTMLCanvasElement, paintYard: MoonCamera, time: number, still: boolean) {
  paintYard(yard, 'portail', layer => {
    homewardPack(layer, time, still);
  });
  ctx.drawImage(yard,0,103,900,287.5,0,0,720,230);
  ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#ccd7c5';
  ctx.fillText(L('CAM 01 · PORTAIL', 'CAM 01 · GATE'), 40, 30);
}

export function relayWitness(screen: HTMLElement, caption: HTMLElement, lamp: boolean, cub: boolean, paintYard: MoonCamera,
  frequency: number, phase: number, receiveLamp: () => void, receiveCub: () => void, hearMower: () => void) {
  const windowArt = lamp ? plate(windowUrl) : null;
  const gateArt = cub ? el('canvas') : null;
  if (gateArt) { gateArt.width=900; gateArt.height=420; }
  const gateAt = lamp ? 2.68 : .12;
  const still = calmMotion();
  const canvas = el('canvas', { class: 'relay-witness' });
  canvas.width = 720; canvas.height = 230;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (lamp || cub) screen.prepend(canvas);
  let time = 0, lastPaint = -1, lastCaption = '', done = false;
  function paint() {
    if (!ctx || !canvas.isConnected) return;
    ctx.fillStyle = '#112020'; ctx.fillRect(0, 0, 720, 230);
    if (gateArt && time >= gateAt) {
      gateCamera(ctx, gateArt, paintYard, time - gateAt, still);
    } else if (windowArt) {
      let light = 0;
      for (const at of FLASHES) {
        const age = time - at;
        if (still) light += .28 * Number(age >= 0);
        else if (age >= 0 && age <= .66) light = Math.sin(age / .66 * Math.PI) ** 2;
      }
      reflectedWindow(ctx, windowArt, light);
    }
    const glass = ctx.createRadialGradient(364, 111, 89, 360, 119, 396);
    glass.addColorStop(0, '#13201d00'); glass.addColorStop(.80, '#10201c33'); glass.addColorStop(1, '#0b1a16d4');
    ctx.fillStyle = glass; ctx.fillRect(0, 0, 720, 230);
    ctx.fillStyle = '#09161030';
    for (let y = 1; y < 230; y += 4) ctx.fillRect(0, y, 720, 1);
  }
  function describe() {
    const text = cub && time >= gateAt + 2.35
      ? L('Sous le lampadaire, le petit rejoint l’adulte.', 'Under the gate lamp, the cub catches up with the adult.')
      : cub && time >= gateAt + .30 ? L('Un petit cri traverse le souffle du poste. Phase ', 'A small cry cuts through the static. Phase ') + phase + '.'
      : lamp && time >= FLASHES[2]! ? L('Trois éclats dans le verre. Fréquence ', 'Three flashes in the glass. Frequency ') + frequency + '.'
      : lamp ? L('Dans le verre du poste, la lampe du voisin se lève.', 'Reflected in the tube, your neighbour raises his lamp.')
      : cub ? L('La caméra du portail sort du noir.', 'The gate feed comes out of the dark.')
      : time >= .36 ? L('La tondeuse tousse une fois derrière la cloison.', 'The mower coughs once on the other side of the wall.') : '';
    if (text !== lastCaption) { caption.textContent = text; lastCaption = text; }
  }
  describe();
  // A slow image download can finish after the scene's last animated frame.
  if (windowArt) void windowArt.decode().then(paint, () => {});
  return {
    interference: () => !lamp || still || time >= FLASHES[2]! ? 0 : 6 * (1 - smoothstep(0, 2, time)),
    tick(dt: number) {
      if (done) return false;
      const before = time;
      time += dt;
      const crossed = (at: number) => before < at && time >= at;
      if (lamp && crossed(FLASHES[2]!)) receiveLamp();
      if (cub && crossed(gateAt + .3)) {
        receiveCub();
        audio.play('epic_pack', .64, 1.04);
      }
      if (!cub && !lamp && crossed(.36)) {
        hearMower();
        audio.play('mower_start', .40, .82);
        // Stop on the starter's cough, even if the desk clock is paused mid-cue.
        audio.fadeOut('mower_start', .88);
      }
      describe();
      done = time >= (cub ? gateAt + 3.1 : lamp ? 2.64 : 1.4);
      if (!done && time - lastPaint < 1 / 30) return false;
      lastPaint = time;
      paint();
      return true;
    },
  };
}

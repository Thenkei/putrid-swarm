import roomUrl from '../assets/epic-vhs-room.webp';
import handUrl from '../assets/epic-vhs-eject-hand.webp';
import cassetteUrl from '../assets/epic-vhs-cassette.webp';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line as L } from '../engine/i18n';
import { calmMotion } from '../render/lighting';

function image(url: string) {
  const art = new Image();
  art.src = url;
  return art;
}

let art: { room: HTMLImageElement; hand: HTMLImageElement; cassette: HTMLImageElement } | undefined;
export function warmVhsRoom() {
  return art ??= { room: image(roomUrl), hand: image(handUrl), cassette: image(cassetteUrl) };
}

function ease(t: number) {
  const p = Math.max(0, Math.min(1, t));
  return p * p * (3 - 2 * p);
}

/** All cues follow the desk clock. Leaving the insert discards the remaining beats. */
export function ejectVhs(field: HTMLElement, note: HTMLElement, frame: HTMLCanvasElement,
  complete: boolean, fired: boolean, rightHand: boolean, result: string) {
  const { room, hand, cassette } = warmVhsRoom();
  const canvas = el('canvas');
  canvas.className = 'vhs-room';
  const w = canvas.width = 960, h = canvas.height = 412;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', L('Le magnétoscope du refuge, à côté de la porte verrouillée.', 'The VCR in the shelter, beside the bolted front door.'));
  field.replaceChildren(canvas);
  const ctx = canvas.getContext('2d')!;
  const caption = el('span');
  caption.setAttribute('role', 'status');
  note.replaceChildren(document.createTextNode(result + ' · '), caption);
  caption.textContent = complete
    ? L('Le portail rouge se fige. La bande accroche.', 'The red gate freezes. The tape snags.')
    : L('Tu cherches le bouton d’éjection.', 'You reach for the eject button.');

  const cut = complete ? .64 : 0, press = cut + .85, knock = press + .31;
  const echoes = complete && fired ? [.06, .19, .51, .82, 1.13] : [];
  const cues = [
    ...echoes.map((at, i) => ({ at, play: () => audio.play('epic_tape', .63 - i * .085, 1 - i * .07) })),
    { at: press, play: () => {
      audio.play('vhs_eject', .83);
      caption.textContent = L('Clac. La cassette ressort.', 'Clack. The cassette slides out.');
    } },
    { at: knock, play: () => {
      audio.play('vhs_knock', .76);
      caption.textContent = L('L’écran est noir. Ça cogne encore.', 'The screen is dark. The pounding carries on.');
    } },
    { at: knock + 1.05, play: () => {
      audio.play('vhs_knock', .65, .94);
      caption.textContent = L('Ça recommence. Quelqu’un cogne à la porte du refuge.', 'There it is again. Someone is knocking on the shelter door.');
    } },
  ];
  let elapsed = 0, cue = 0, settled = false;
  function draw() {
    const still = calmMotion();
    if (elapsed < cut || !room.complete || !room.naturalWidth) {
      ctx.drawImage(frame, 0, 0, w, h);
      if (complete && !still && elapsed < cut) {
        const y = Math.floor((elapsed * 1.7 % 1) * (h - 14));
        ctx.drawImage(frame, 0, y, w - 8, 9, 8, y, w - 8, 9);
      }
      return;
    }
    ctx.drawImage(room, 0, 0, w, h);
    const ejected = elapsed - press;
    if (ejected < .18) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(184, 51, 255, 184, 12);
      ctx.clip();
      ctx.globalAlpha = .86 * (1 - ease(ejected / .18));
      // Preserve the tape's wide picture inside the domestic 4:3 tube.
      ctx.drawImage(frame, 181, 86, 261, 112);
      ctx.fillStyle = '#253b3999';
      for (let y = 86; y < 198; y += 3) ctx.fillRect(181, y, 261, .65);
      ctx.restore();
    }
    if (ejected > .10 && cassette.complete && cassette.naturalWidth) {
      const travel = still ? 1 : ease((ejected - .10) / .52);
      ctx.save();
      ctx.beginPath();
      ctx.rect(173, 316, 242, 65);
      ctx.clip();
      ctx.drawImage(cassette, 183 - 4 * travel, 278 + travel * 39, 216 + 8 * travel, 40);
      ctx.restore();
    }
    const reach = ease((elapsed - cut - .10) / .66) * (1 - ease((ejected - .13) / .50));
    if (reach > 0 && hand.complete && hand.naturalWidth) {
      const travel = still ? Number(reach > .65) : reach;
      ctx.save();
      ctx.translate(432 + (rightHand ? 1 : -1) * (1 - travel) * 63, 320 + (1 - travel) * 105);
      if (rightHand) ctx.scale(-1, 1);
      ctx.drawImage(hand, -165, -3, 171, 85.5);
      ctx.restore();
    }
    const since = elapsed - knock;
    if (!still && since >= 0 && since < 1.94) {
      // Move the door leaf and its ironwork together against the fixed jamb.
      // The recording has three impacts, at 0, 320 and 620 milliseconds.
      const beat = since < 1.05 ? since : (since - 1.05) * .94;
      const hit = beat >= .62 ? beat - .62 : beat >= .32 ? beat - .32 : beat;
      const shift = 2.6 * Math.sin(hit * 56) * Math.exp(-hit * 15);
      ctx.drawImage(room, room.naturalWidth * .749, 0, room.naturalWidth * .251, room.naturalHeight,
        719 + shift, 0, 243, h);
    }
    if (since > 1.95 && cassette.complete && hand.complete) settled = true;
  }
  draw();
  return (dt: number) => {
    if (settled) return;
    elapsed += dt;
    while (cue < cues.length && elapsed >= cues[cue]!.at) cues[cue++]!.play();
    draw();
  };
}

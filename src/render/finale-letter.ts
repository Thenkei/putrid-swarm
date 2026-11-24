import dashUrl from '../assets/finale-letter-dash.webp';
import gripUrl from '../assets/finale-letter-grip.webp';
import paperUrl from '../assets/finale-letter-paper.webp';
import { calmMotion } from './lighting';
import { smoothstep } from './noise';

/** The motor catches only after the folded complaint has been slipped under the strap. */
export const LETTER = { fold: 2.65, turn: 4.92, end: 6.35 } as const;

function image(url: string): HTMLImageElement {
  const img = new Image();
  img.src = url;
  return img;
}

let art: { dash: HTMLImageElement; paper: HTMLImageElement; hand: HTMLImageElement } | undefined;
export function prepareFinaleLetter() {
  return art ??= { dash: image(dashUrl), paper: image(paperUrl), hand: image(gripUrl) };
}

const mix = (a: number, b: number, p: number) => a + (b - a) * p;

function key(ctx: CanvasRenderingContext2D, angle: number) {
  ctx.save();
  ctx.translate(1121, 505);
  ctx.rotate(angle);
  ctx.fillStyle = '#726951';
  ctx.fillRect(-4, -26, 9, 30);
  ctx.fillStyle = '#e5bc78';
  ctx.fillRect(2, -20, 2, 21);
  ctx.beginPath();
  ctx.roundRect(-17, -47, 32, 26, 7);
  ctx.fillStyle = '#29251f'; ctx.fill();
  ctx.strokeStyle = '#a29070'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-2, -45, 7, 12, -.5, 0, Math.PI * 2);
  ctx.strokeStyle = '#d5bc8b'; ctx.stroke();
  ctx.restore();
}

/** Right fingertips pinch the crease. The lower panel falls open, then folds behind the top panel. */
function foldedPage(ctx: CanvasRenderingContext2D, page: HTMLImageElement, width: number, open: number) {
  const hinge = 313;
  const scale = width / page.naturalWidth;
  const height = (page.naturalHeight - hinge) * scale * Math.cos((1 - open) * Math.PI);
  if (height > .5) {
    ctx.drawImage(page, 0, hinge, page.naturalWidth, page.naturalHeight - hinge, -width, 0, width, height);
    if (open < .98) {
      ctx.fillStyle = 'rgba(62,39,22,' + ((1 - open) * .27) + ')';
      ctx.fillRect(-width + 7, 0, width - 14, Math.max(0, height - 3));
    }
  }
  ctx.drawImage(page, 0, 0, page.naturalWidth, hinge, -width, -hinge * scale, width, hinge * scale + .5);
}

/** All geometry is registered to the 1280×720 dash. The same right arm works for either orchard outcome. */
export function drawFinaleLetter(ctx: CanvasRenderingContext2D, t: number): boolean {
  const { dash, paper, hand } = prepareFinaleLetter();
  if (![dash, paper, hand].every(img => img.complete && img.naturalWidth)) return false;
  const still = calmMotion();
  // Show the same gestures as held poses for players who prefer less motion.
  const pose = (start: number, end: number) => still ? Number(t >= (start + end) / 2) : smoothstep(start, end, t);
  const pull = pose(.18, 1.29);
  const lower = pose(3.23, 3.82);
  const tuck = pose(3.80, 4.17);
  const reachKey = pose(4.19, 4.71);
  const release = pose(5.06, 5.56);
  const idle = t > LETTER.turn && !still ? Math.sin((t - LETTER.turn) * 42) * smoothstep(LETTER.turn, 5.09, t) : 0;
  const pageX = mix(mix(mix(125, 947, pull), 974, lower), 947, tuck);
  const pageY = mix(mix(mix(705, 372, pull), 266, lower), 355, tuck);
  const width = mix(mix(155, 715, pull), 329, lower);
  const angle = mix(mix(-.73, -.065, pull), -.092, lower);
  const turn = pose(4.74, LETTER.turn) - pose(5.00, 5.20) * .28;
  ctx.drawImage(dash, 0, 0, 1280, 720);
  key(ctx, -.16 + turn * .82);
  ctx.save();
  ctx.translate(pageX, pageY);
  ctx.rotate(angle);
  ctx.transform(1, 0, idle * .017, 1 + idle * .036, 0, 0);
  const open = pose(.56, 1.36) * (1 - pose(LETTER.fold, 3.29));
  foldedPage(ctx, paper, width, open);
  ctx.restore();

  if (tuck > 0) {
    // The moving sheet goes in from above the leather, disappearing under its stitched lip.
    ctx.save();
    ctx.beginPath(); ctx.roundRect(411, 303, 846, 77, 20); ctx.clip();
    ctx.drawImage(dash, 0, 0, 1280, 720);
    ctx.restore();
  }
  const x = mix(pageX - 9, 1122 + 23 * turn, reachKey) + release * 182;
  const y = mix(pageY - 3, 478, reachKey) + release * 260;
  const handWidth = mix(mix(785, 900, pull), 640, lower);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle * (1 - reachKey) + turn * .32);
  ctx.drawImage(hand, -handWidth * .034, -handWidth * .107, handWidth, handWidth * hand.naturalHeight / hand.naturalWidth);
  ctx.restore();
  return true;
}

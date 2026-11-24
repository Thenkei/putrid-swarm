import camerasUrl from './garden-cameras.webp';
import windowUrl from './garden-window.webp';
import gestureUrl from './garden-neighbour-gestures.webp';
import laundryUrl from './garden-striped-sheet.webp';
import { sprite } from '../engine/assets';

let cameras: HTMLImageElement | undefined;
let kitchen: HTMLImageElement | undefined;
let laundry: HTMLImageElement | undefined;
let gestures: HTMLImageElement | undefined;

function loadSheet(url: string) {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  return image;
}

/** Only the sixth night's invitation starts these downloads. */
export function warmGardenArt() {
  cameras ??= loadSheet(camerasUrl);
  kitchen ??= loadSheet(windowUrl);
  laundry ??= loadSheet(laundryUrl);
  gestures ??= loadSheet(gestureUrl);
}

/** The camera sees the reverse of the signal window on the greenhouse side. */
const windows = [[95, 104, 37, 66], [98, 84, 34, 70], [684, 94, 54, 67]] as const;

export function windowIsRight(garden: number, feet: number) {
  const [x, , width] = windows[garden]!;
  return feet < x + width / 2;
}

export function signalWindow(ctx: CanvasRenderingContext2D, garden: number, lamp: boolean) {
  const [x, y, width, height] = windows[garden]!;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const spill = ctx.createRadialGradient(x + width / 2, y + height * .67, 3, x + width / 2, y + height * .67, height * .88);
  spill.addColorStop(0, lamp ? '#ecac5970' : '#ede1b23b');
  spill.addColorStop(1, '#ffba6d00');
  ctx.fillStyle = spill;
  ctx.fillRect(x - height, y - height, width + height * 2, height * 3);
  // Leave the painted sash and central mullion intact.
  ctx.fillStyle = lamp ? '#ffcb8054' : '#e8dfbb39';
  for (let pane = 0; pane < 2; pane++) {
    ctx.fillRect(x + pane * width / 2 + 2, y + 2, width / 2 - 4, height / 2 - 4);
    ctx.fillRect(x + pane * width / 2 + 2, y + height / 2 + 2, width / 2 - 4, height / 2 - 4);
  }
  ctx.restore();
}

export function drawGardenGesture(ctx: CanvasRenderingContext2D, frame: number, feetX: number, feetY: number, faceWindowRight: boolean, stride: number) {
  if (!gestures?.complete || !gestures.naturalWidth) return false;
  const anchor = [113, 97, 119][frame]!;
  ctx.save();
  ctx.translate(feetX, feetY);
  if (faceWindowRight && frame !== 2) ctx.scale(-1, 1);
  const scale = .335;
  ctx.scale(scale, scale);
  ctx.translate(-anchor, -250);
  if (frame !== 2 || stride === 0) {
    ctx.drawImage(gestures, frame * 256, 0, 256, 256, 0, 0, 256, 256);
  } else {
    // His palm stays on the hem while his boots take turns clearing the path.
    // At row 179 the coat ends and there is clear air between the two trouser legs.
    const knee = 179, shin = 250 - knee;
    for (const side of [-1, 1]) {
      const left = side < 0 ? 0 : 106, width = side < 0 ? 106 : 150;
      const shift = 22 * Math.sin(stride) * side;
      const lift = -6 * Math.max(0, Math.cos(stride) * side);
      ctx.save();
      ctx.translate(0, knee);
      ctx.transform(1, 0, shift / shin, 1 + lift / shin, 0, 0);
      ctx.drawImage(gestures, 512 + left, knee, width, 256 - knee, left, 0, width, 256 - knee);
      ctx.restore();
    }
    ctx.drawImage(gestures, 512, 0, 256, knee + 1, 0, 0, 256, knee + 1);
  }
  ctx.restore();
  return true;
}

const LINE_LEFT = 443 * 900 / 1080;
const LINE_WIDTH = 114 * 900 / 1080;

export function sheetContact(handX: number) {
  return Math.max(0, Math.min(1, (handX - LINE_LEFT) / 13, (LINE_LEFT + LINE_WIDTH - handX) / 13));
}

/** Red hem from the painted washing-line plate, first glimpsed behind the hedge. */
export function gardenLaundry(ctx: CanvasRenderingContext2D, garden: number, handX: number, handY: number, carrying: boolean, time: number) {
  if (!laundry?.complete || !laundry.naturalWidth) return;
  ctx.save();
  if (garden === 0) {
    // The hedge hides the lower corner. The line follows the two existing posts.
    ctx.strokeStyle = '#796b58';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(410, 144);
    ctx.quadraticCurveTo(483, 157, 554, 145);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(439, 135); ctx.lineTo(525, 135); ctx.lineTo(525, 192);
    ctx.quadraticCurveTo(486, 185, 439, 190); ctx.closePath(); ctx.clip();
    ctx.globalAlpha = .87;
    ctx.drawImage(laundry, 453, 146, 61, 48);
  } else if (garden === 1) {
    // Keep the two pegs fixed. Only the cloth around his upturned palm gathers.
    const contact = carrying ? sheetContact(handX) : 0;
    const strips = 57;
    for (let i = 0; i < strips; i++) {
      const u = (i + .5) / strips;
      const x = LINE_LEFT + u * LINE_WIDTH;
      const breeze = time ? Math.sin(time * 1.8 + 3 * u) * 1.4 : 0;
      const distance = Math.min(1, Math.abs(x - handX) / 39);
      const fall = (1 + Math.cos(distance * Math.PI)) / 2;
      const bottom = 249 + breeze - (249 - handY - 2) * contact * fall;
      ctx.drawImage(laundry, i * 2, 0, 2, 100, LINE_LEFT + i * LINE_WIDTH / strips, 98, LINE_WIDTH / strips + .35, bottom - 98);
    }
  } else {
    // The reflection lives in three separate panes. Keep every greenhouse bar in front.
    ctx.beginPath();
    for (const [left, right] of [[269, 287], [290, 313], [317, 343]]) {
      ctx.rect(left!, 129, right! - left!, 38);
      ctx.rect(left!, 171, right! - left!, 30);
    }
    ctx.clip();
    ctx.translate(345, 131);
    ctx.scale(-1, 1);
    ctx.globalAlpha = .57;
    ctx.drawImage(laundry, 0, 0, 79, 58);
  }
  ctx.restore();
}

export function paintGardenPlate(ctx: CanvasRenderingContext2D, garden: number) {
  warmGardenArt();
  const sheet = cameras!;
  if (sheet.complete && sheet.naturalWidth) {
    const height = sheet.naturalHeight / 3;
    // Inset two rows: the image filter must never sample the adjoining camera.
    ctx.drawImage(sheet, 0, garden * height + 2, sheet.naturalWidth, height - 4, 0, 16, 900, 328);
  } else {
    const fallback = sprite('plate_orchard');
    if (fallback) ctx.drawImage(fallback.img, 0, 16, 900, 328);
  }
}

/** Both outcomes use the same camera and the same cottage as the final crossing. */
export function gardenAftermath(canvas: HTMLCanvasElement, home: boolean) {
  warmGardenArt();
  const sheet = kitchen!;
  const paint = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !sheet.naturalWidth) return;
    const height = sheet.naturalHeight / 2;
    const crop = sheet.naturalWidth * canvas.height / canvas.width;
    const y = (home ? 0 : height) + (height - crop) / 2;
    ctx.drawImage(sheet, 0, y, sheet.naturalWidth, crop, 0, 0, canvas.width, canvas.height);
  };
  if (sheet.complete && sheet.naturalWidth) paint();
  else {
    // A fast loss or a slow connection can reach the still before it has decoded.
    const ctx = canvas.getContext('2d');
    if (ctx) paintGardenPlate(ctx, 2);
    void sheet.decode().then(paint).catch(() => {});
  }
}

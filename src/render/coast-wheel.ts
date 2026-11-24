import handUrl from '../assets/coast-steering-hand.webp';
import type { CoastDrive } from '../core/coast-home';

const hubX = 164, hubY = 423;
const gripRadius = 121;
let rim: HTMLCanvasElement | undefined;
let hand: HTMLImageElement | undefined;

export function prepareCoastWheel(): Promise<void> {
  if (!hand) { hand = new Image(); hand.src = handUrl; }
  return hand.decode();
}

function leatherRim(cabin: HTMLImageElement): HTMLCanvasElement {
  const texture = document.createElement('canvas');
  const radius = 131;
  texture.width = texture.height = radius * 4;
  const ctx = texture.getContext('2d')!;
  ctx.scale(2, 2); ctx.translate(radius, radius);
  // Reconstruct the wheel from the original painting. Alternate octants share a seam
  // so the leather grain stays fixed to the rim as it rolls through the driver's grip.
  for (let octant = 0; octant < 8; octant++) {
    ctx.save(); ctx.rotate((octant + octant % 2) * Math.PI / 4);
    if (octant % 2) ctx.scale(-1, 1);
    const top = -Math.PI / 2;
    ctx.beginPath(); ctx.arc(0, 0, 127.7, top - .002, top + Math.PI / 4 + .003);
    ctx.arc(0, 0, 114, top + Math.PI / 4 + .003, top - .002, true);
    ctx.closePath(); ctx.clip();
    ctx.drawImage(cabin, -hubX, -hubY, 640, 360);
    ctx.fillStyle = 'rgba(12,22,41,.48)'; ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.restore();
  }
  return texture;
}

function grip(ctx: CanvasRenderingContext2D, image: HTMLImageElement, spin: number, left: boolean) {
  const side = left ? -1 : 1;
  const angle = side * .77 + spin;
  ctx.save();
  ctx.translate(hubX + gripRadius * Math.sin(angle), hubY - gripRadius * Math.cos(angle));
  // Let the elbow follow a shorter arc than the knuckles, with the cuff always below the rim.
  ctx.rotate(spin * .56);
  ctx.scale(side, 1);
  const height = 121, width = height * image.naturalWidth / image.naturalHeight;
  ctx.drawImage(image, -width * .35, -height * .13, width, height);
  ctx.restore();
}

export function drawCoastWheel(ctx: CanvasRenderingContext2D, cabin: HTMLImageElement, drive: CoastDrive, oneArmed: boolean): void {
  const spin = drive.wheel * .78;
  rim ??= leatherRim(cabin);
  ctx.save(); ctx.translate(hubX, hubY); ctx.rotate(spin);
  ctx.drawImage(rim, -131, -131, 262, 262);
  // A hand-sewn repair at twelve o’clock gives a reference even when only one hand is visible.
  const top = -Math.PI / 2;
  ctx.lineWidth = 10; ctx.strokeStyle = '#493d32';
  ctx.beginPath(); ctx.arc(0, 0, gripRadius, top - .046, top + .046); ctx.stroke();
  ctx.strokeStyle = '#9a8264'; ctx.lineWidth = .72;
  for (const offset of [-.035, 0, .035]) {
    const a = top + offset;
    ctx.beginPath(); ctx.moveTo(116 * Math.cos(a), 116 * Math.sin(a));
    ctx.lineTo(126 * Math.cos(a + .012), 126 * Math.sin(a + .012)); ctx.stroke();
  }
  ctx.restore();
  if (!hand?.complete || !hand.naturalWidth) return;
  if (!oneArmed) grip(ctx, hand, spin, true);
  grip(ctx, hand, spin, false);
}

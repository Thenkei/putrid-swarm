import { sprite } from '../engine/assets';
import { smoothstep } from './noise';

/** A line tied to the barn wall and a pegged sheet on the near side of the cub's path. */
export function drawBarnLaundry(ctx: CanvasRenderingContext2D, cubX: number | null, trailingX: number, air: number) {
  const cloth = sprite('moon_laundry');
  if (!cloth) return;
  const left = 395, top = 192, width = 98, height = 145;
  ctx.save();
  // Shadow, split fence stake, then the line behind the pegs.
  ctx.fillStyle = '#14202d55';
  ctx.beginPath();
  ctx.moveTo(579, 344);
  ctx.lineTo(585, 344);
  ctx.lineTo(611, 349);
  ctx.lineTo(604, 350);
  ctx.fill();
  ctx.fillStyle = '#383738';
  ctx.beginPath();
  ctx.moveTo(579, 344);
  ctx.lineTo(577, 184);
  ctx.lineTo(580, 180);
  ctx.lineTo(584, 183);
  ctx.lineTo(586, 343);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#767571';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(579, 185);
  ctx.lineTo(581, 341);
  ctx.stroke();
  ctx.strokeStyle = '#212a32';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(282, 177);
  ctx.quadraticCurveTo(436, 209, 581, 192);
  ctx.stroke();
  ctx.strokeStyle = '#a0a3a080';
  ctx.lineWidth = .8;
  ctx.translate(0, -1);
  ctx.stroke();
  ctx.translate(0, 1);
  ctx.fillStyle = '#3b3c3e';
  ctx.fillRect(279, 175, 6, 4);
  ctx.fillRect(577, 190, 9, 3);
  // Each narrow strip keeps its top pinned. The back lifts the hem first, then the tail.
  const strips = 28;
  for (let i = 0; i < strips; i++) {
    const sx = Math.round(i * cloth.w / strips);
    const sw = Math.round((i + 1) * cloth.w / strips) - sx;
    const dx = width * sx / cloth.w;
    const x = left + dx;
    const contact = cubX === null ? 0 : 1 - smoothstep(6, 55, Math.abs(x - cubX));
    const trailing = cubX === null ? 0 : 1 - smoothstep(3, 47, Math.abs(x - trailingX));
    const lift = Math.max(40 * contact, 28 * trailing);
    const ripple = Math.sin(air * 1.9 + i * .13) * 1.3;
    ctx.drawImage(cloth.img, sx, 0, sw, cloth.h, x, top, width * sw / cloth.w + .22, height - lift + ripple);
  }
  ctx.restore();
}

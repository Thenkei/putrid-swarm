import { PARKED } from '../core/car-path';
import sideUrl from '../assets/coast-wagon-side.webp';
import { sprite } from '../engine/assets';
import { groundMatrix, type Point, type View } from './projection';
import { PROP_FEET } from './registration';

/** Four chalk corners on the gravel. They share the tyre plane and disappear under the car. */
export function drawParkingBay(ctx: CanvasRenderingContext2D, view: View): void {
  ctx.save();
  ctx.transform(...groundMatrix(view));
  ctx.translate(PARKED.x, PARKED.y);
  ctx.lineWidth = .085;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffe6a9';
  ctx.shadowColor = '#35200d';
  ctx.shadowBlur = 2;
  ctx.beginPath();
  for (const x of [-1.21, 1.21]) {
    for (const y of [-1.66, 1.66]) {
      ctx.moveTo(x * .58, y); ctx.lineTo(x, y); ctx.lineTo(x, y * .68);
    }
  }
  ctx.stroke();
  ctx.restore();
}

let side: HTMLImageElement | undefined;
/** The painted tyres stay planted in each of the three angles, even if the player stops mid-turn. */
export function drawReturningCar(ctx: CanvasRenderingContext2D, root: Point, height: number, heading: number): void {
  if (!side) { side = new Image(); side.src = sideUrl; }
  const slope = .5 * (Math.cos(heading) - Math.sin(heading)) / (Math.cos(heading) + Math.sin(heading));
  const rot = heading < Math.PI / 4 ? 1 : 0;
  const art = sprite(rot === 1 ? 'obj_car_back' : 'obj_car_front');
  ctx.save();
  ctx.translate(root.x, root.y);
  if (side.complete && side.naturalWidth && (Math.abs(heading - Math.PI / 4) < .36 || !art)) {
    const width = height * 1.48;
    const h = width * side.naturalHeight / side.naturalWidth;
    ctx.transform(1, slope, 0, 1, 0, 0);
    ctx.drawImage(side, -width * .466, -h * .81, width, h);
  } else if (art) {
    const width = height * art.w / art.h, foot = PROP_FEET.car[rot];
    ctx.transform(1, (slope + (rot === 1 ? -.5 : .5)) * .74, 0, 1, 0, 0);
    ctx.scale(rot === 1 ? -1 : 1, 1);
    ctx.drawImage(art.img, -width * foot[0], -height * foot[1], width, height);
  } else {
    ctx.fillStyle = '#c7a35d';
    ctx.fillRect(-18, -15, 36, 16);
  }
  ctx.restore();
}

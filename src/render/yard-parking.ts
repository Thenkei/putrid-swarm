import { PARKED } from '../core/car-path';
import { HOUSE_CENTER } from '../core/map';
import type { YardParking } from '../core/yard-parking';
import sideUrl from '../assets/coast-wagon-side.webp';
import { sprite } from '../engine/assets';
import { groundMatrix, project, type Point, type View } from './projection';
import { HOUSE_PAINT_SCALE, houseOffset } from './registration';

/** Four chalk corners on the gravel. They share the tyre plane and disappear under the car. */
export function drawParkingBay(ctx: CanvasRenderingContext2D, view: View): void {
  ctx.save();
  ctx.transform(...groundMatrix(view));
  ctx.translate(PARKED.x, PARKED.y);
  // The break has taken this bend before. Its two worn arcs show which way to
  // approach the space even when the front wheel enters from the far verge.
  const radius = 2.5;
  ctx.lineCap = 'round'; ctx.lineWidth = .12; ctx.strokeStyle = 'rgba(56,44,35,.24)';
  for (const tyre of [-.48,.48]) {
    ctx.beginPath(); ctx.moveTo(5.7,-radius-tyre); ctx.lineTo(radius,-radius-tyre);
    ctx.arc(radius,0,radius+tyre,-Math.PI/2,-Math.PI,true);
    ctx.stroke();
  }
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

let houseMask: ImageData | undefined;

/** The camera follows the wagon off the apron and intervening trees become
 * translucent. Only mark the driver when the actual house painting hides him. */
export function drawParkingBearing(ctx: CanvasRenderingContext2D, view: View, car: YardParking): void {
  if (car.x + car.y + .4 >= HOUSE_CENTER.x + HOUSE_CENTER.y + 1.2) return;
  const house = sprite('obj_house_front');
  if (!house) return;
  const p = project(view, car.x, car.y);
  const root = project(view, HOUSE_CENTER.x, HOUSE_CENTER.y), origin = houseOffset(0, 0, 0);
  const maskX = Math.floor(64*(p.x-root.x-origin.dx*view.zoom)/(house.w*HOUSE_PAINT_SCALE*view.zoom));
  const maskY = Math.floor(64*(p.y-36*view.zoom-root.y+origin.lift*view.zoom)/(house.h*HOUSE_PAINT_SCALE*view.zoom));
  if (maskX<0 || maskY<0 || maskX>=64 || maskY>=64) return;
  if (!houseMask) {
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = 64;
    const mask = scratch.getContext('2d')!;
    mask.drawImage(house.img, 0, 0, 64, 64);
    houseMask = mask.getImageData(0, 0, 64, 64);
  }
  if (houseMask.data[(maskY*64+maskX)*4+3]! < 175) return;
  const angle = car.heading - Math.PI / 4;
  ctx.save();
  ctx.translate(Math.min(view.x + view.w - 18, Math.max(view.x + 18, p.x)),
    Math.min(view.y + view.h - 20, Math.max(view.y + 18, p.y - 9)));
  ctx.rotate(Math.atan2(.5 * Math.sin(angle), -Math.cos(angle)));
  ctx.beginPath(); ctx.moveTo(11,0); ctx.lineTo(-6,-5); ctx.lineTo(-3,0); ctx.lineTo(-6,5); ctx.closePath();
  ctx.lineWidth = 3; ctx.strokeStyle = '#30271f'; ctx.stroke(); ctx.fillStyle = '#f1d293'; ctx.fill();
  ctx.restore();
}
export function prepareParkingCar(): void {
  if (!side) { side = new window.Image(); side.src = sideUrl; }
}

type UV = readonly [number, number];
type Pos = readonly [number, number, number];
type Image = HTMLImageElement | HTMLCanvasElement;

// These coordinates were measured on the broadside painting. All the panels and
// axle contacts meet at the same vertices as the car rotates in the gravel yard.
const U = (x: number) => (209 - x) / 310;
const Z = (y: number) => (209 - y) / 287;
const halfWidth = .287;
const flank = (uv: UV, side: number): Pos => [U(uv[0]), side * halfWidth, Z(uv[1])];
const crossCar = (start: UV, end: UV): Pos[] => [flank(start, -1), flank(start, 1), flank(end, 1), flank(end, -1)];

function projectCar(p: Pos, cos: number, sin: number): Point {
  return { x: -p[0] * cos + p[1] * sin, y: .5 * (p[0] * sin + p[1] * cos) - p[2] };
}

// Map one triangle of a painted body panel onto its projected ground-space vertices.
function panelTriangle(ctx: CanvasRenderingContext2D, image: Image, src: UV[], dest: Point[], i: number) {
  const [a, b, c] = [src[0]!, src[i]!, src[i + 1]!];
  const [p, q, r] = [dest[0]!, dest[i]!, dest[i + 1]!];
  const u = b[0] - a[0], v = b[1] - a[1], s = c[0] - a[0], t = c[1] - a[1];
  const det = u * t - s * v;
  if (Math.abs(det) < .001 || Math.abs((q.x-p.x)*(r.y-p.y)-(r.x-p.x)*(q.y-p.y)) < .00001) return;
  const xx = ((q.x-p.x)*t - (r.x-p.x)*v) / det;
  const xy = ((r.x-p.x)*u - (q.x-p.x)*s) / det;
  const yx = ((q.y-p.y)*t - (r.y-p.y)*v) / det;
  const yy = ((r.y-p.y)*u - (q.y-p.y)*s) / det;
  ctx.save();
  ctx.beginPath();
  // Half a source pixel of bleed along the triangles' common diagonal avoids a pale seam.
  const midX = (p.x + q.x + r.x) / 3, midY = (p.y + q.y + r.y) / 3;
  for (const [j, e] of [p, q, r].entries()) {
    const length = Math.max(.001, Math.hypot(e.x-midX, e.y-midY));
    const x = e.x + .002 * (e.x-midX)/length, y = e.y + .002 * (e.y-midY)/length;
    if (j === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.clip();
  ctx.transform(xx, yx, xy, yy, p.x - xx*a[0] - xy*a[1], p.y - yx*a[0] - yy*a[1]);
  ctx.drawImage(image, 0, 0); ctx.restore();
}

const roof = crossCar([149,74], [397,74]);
const bonnet = crossCar([110,116], [8,132]);
const windscreen = crossCar([149,74], [110,116]);
const hatchGlass = crossCar([397,74], [436,119]);
const grille = crossCar([8,132], [4,175]);
const hatch = crossCar([436,119], [443,177]);
const loadTop = crossCar([168,52], [382,52]).map(([u,v,z]): Pos => [u,v*.86,z]);
const loadBottom = loadTop.map(([u,v,z]): Pos => [u,v,z-.047]);

let flankArt: HTMLCanvasElement | undefined;
function paintedFlank(img: HTMLImageElement): HTMLCanvasElement {
  if (flankArt) return flankArt;
  flankArt = document.createElement('canvas'); flankArt.width = img.naturalWidth; flankArt.height = img.naturalHeight;
  const c = flankArt.getContext('2d')!;
  c.beginPath(); c.moveTo(0,133); c.lineTo(8,132); c.lineTo(110,116); c.lineTo(149,74);
  c.lineTo(397,74); c.lineTo(436,119); c.lineTo(448,131); c.lineTo(448,212); c.lineTo(0,212);
  c.closePath(); c.clip(); c.drawImage(img,0,0);
  return flankArt;
}

export function drawReturningCar(ctx: CanvasRenderingContext2D, root: Point, height: number, heading: number, wheelRoll = 0): void {
  prepareParkingCar();
  const front = sprite('obj_car_front'), rear = sprite('obj_car_back');
  if (!side?.complete || !side.naturalWidth || !front || !rear) {
    const art = Math.sin(heading-Math.PI/4) < 0 ? rear ?? front : front ?? rear;
    if (art) ctx.drawImage(art.img, root.x-height*art.w/art.h*.50, root.y-height*.76, height*art.w/art.h,height);
    return;
  }
  const cos = Math.cos(heading-Math.PI/4), sin = Math.sin(heading-Math.PI/4);
  const near = cos >= 0 ? 1 : -1;
  ctx.save(); ctx.translate(root.x,root.y); ctx.scale(height,height);
  const panel = (img: Image, uv: UV[], corners: Pos[]) => {
    const dest = corners.map(p=>projectCar(p, cos, sin));
    for (let i=1; i<uv.length-1; i++) panelTriangle(ctx,img,uv,dest,i);
  };
  const drawFlank = (v: number) => {
    const image = paintedFlank(side!);
    const p = projectCar(flank([0,0],v),cos,sin);
    ctx.save(); ctx.transform(cos/310, -sin*.5/310, 0, 1/287, p.x,p.y);
    ctx.drawImage(image,0,0);
    // Turn just the stamped hubs. The tyre's flat contact and its painted
    // shadow stay on the gravel as the body turns around the rear axle.
    for (const x of [75,342]) {
      ctx.save(); ctx.translate(x,180); ctx.rotate(wheelRoll);
      ctx.beginPath(); ctx.arc(0,0,12,0,2*Math.PI); ctx.clip();
      ctx.drawImage(image,x-13,167,26,26,-13,-13,26,26); ctx.restore();
    }
    ctx.restore();
  };
  drawFlank(-near);
  // Crops of the original front and rear quarter paintings retain the lights, grille and plate.
  if (sin >= 0) panel(front.img, [[10,155],[109,181],[110,217],[3,191]],grille);
  else panel(rear.img, [[136,154],[7,137],[2,190],[136,214]],hatch);
  panel(front.img, [[82,110],[170,136],[109,181],[10,155]],bonnet);
  if (sin >= -.32) panel(front.img, [[109,69],[186,88],[170,136],[82,110]],windscreen);
  if (sin <= .32) panel(rear.img, [[132,89],[50,76],[13,137],[124,156]],hatchGlass);
  panel(side, [[148,27],[149,74],[397,74],[392,27]],roof);
  drawFlank(near);
  const face = near > 0 ? [1,2] : [3,0];
  const ends = sin >= 0 ? [0,1] : [2,3];
  for (const [i,j] of [face,ends]) {
    panel(side,[[172,43],[378,43],[378,58],[172,58]],[loadTop[i!]!,loadTop[j!]!,loadBottom[j!]!,loadBottom[i!]!]);
  }
  panel(side,[[172,3],[172,46],[378,46],[374,3]],loadTop);
  ctx.restore();
}

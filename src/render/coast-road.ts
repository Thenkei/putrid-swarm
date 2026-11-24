import { GRID_W, HOUSE_CENTER, PROPS, roadCentre } from '../core/map';
import { PARKED } from '../core/car-path';
import { facadeForStage, houseDamageStage } from './house';
import { smoothstep } from '../core/math';
import { COAST_METRES, COAST_RUT, coastVerge, type CoastDrive } from '../core/coast-home';
import { sprite } from '../engine/assets';
import { drawMobStride } from './infected';

export interface CoastArt {
  woods: HTMLImageElement;
  cottage: HTMLImageElement;
  lane: HTMLImageElement;
  posts: HTMLImageElement;
  listener: HTMLImageElement;
  hedge: HTMLImageElement;
  thorn: HTMLImageElement;
}

const FOCAL = 306;
const EYE = 1.37;
const HORIZON = 139;
const metresPerCell = 1.55;
// The break returns along the same east-side gravel track it used to leave.
export const GATE_AT = COAST_METRES - (GRID_W - PARKED.x) * metresPerCell;
export function alleyPosition(gx: number, gy: number) {
  return { x: (roadCentre('barn', gx) - gy) * metresPerCell, z: GATE_AT + (GRID_W - gx) * metresPerCell };
}
const focusX = 320;
const fieldLength = 36;
const fieldWidth = 22.8;

export function coastCamera(drive: CoastDrive, reduced: boolean) {
  const z = drive.metres;
  const intoBay = smoothstep(COAST_METRES - 3.2, COAST_METRES, z);
  const x = drive.lane * 1.64 * (1 - intoBay) - intoBay * .55 * metresPerCell;
  const jolt = reduced ? 0 : Math.sin(drive.jolt * Math.PI * 3) * drive.jolt * 2.4;
  const horizon = HORIZON + jolt + (reduced ? 0 : .38 * drive.speed * Math.sin(z * 7));
  const turning = drive.wheel * drive.lane > 0 ? 1 - smoothstep(.65, 1, Math.abs(drive.lane)) : 1;
  const centre = focusX + intoBay * (reduced ? 12 : 40) - (reduced ? 0 : drive.wheel * turning * 11);
  return { x, z, horizon, centre };
}

type Camera = ReturnType<typeof coastCamera>;

/** Fixed focal length. All distances are in metres from the start of the lane. */
export function roadPoint(camera: Camera, x: number, z: number) {
  const depth = Math.max(.22, z - camera.z);
  const scale = FOCAL / depth;
  return { x: camera.centre + (x - camera.x) * scale, y: camera.horizon + EYE * scale, scale };
}

function available(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0;
}

function ground(ctx: CanvasRenderingContext2D, image: HTMLImageElement, camera: Camera): void {
  if (!available(image)) return;
  // Inverse-project each band of gravel and verge onto the same plane as the wheel contacts.
  // The outlying edges of the strip feather into the painted farmyard beyond the gate.
  const h = image.naturalHeight, w = image.naturalWidth, strip = 1.35;
  for (let y = camera.horizon + EYE * FOCAL / 41; y < 293; y += strip) {
    const near = FOCAL * EYE / (y + strip - camera.horizon);
    const far = FOCAL * EYE / (y - camera.horizon);
    const z = camera.z + (near + far) / 2;
    const repeat = Math.floor(z / fieldLength);
    const v = z / fieldLength - repeat;
    const sy = (repeat % 2 ? v : 1 - v) * (h - 1);
    const sh = Math.min(h, Math.max(1, h * (far - near) / fieldLength));
    const scale = FOCAL / ((near + far) / 2);
    const left = camera.centre + (1.64 * coastVerge(z) - .52 * fieldWidth - camera.x) * scale;
    ctx.globalAlpha = 1 - smoothstep(19, 39, (near + far) / 2);
    ctx.drawImage(image, 0, Math.min(h - sh, Math.max(0, sy - sh / 2)), w, sh, left, y, fieldWidth * scale, strip + .22);
  }
  ctx.globalAlpha = 1;
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.fillStyle = 'rgba(22,24,27,.27)';
  ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .15, -.07, 0, 2 * Math.PI); ctx.fill();
}

function gatepost(ctx: CanvasRenderingContext2D, art: CoastArt, camera: Camera, right: boolean): void {
  const p = roadPoint(camera, right ? 3.45 : -3.15, GATE_AT);
  if (GATE_AT <= camera.z || !available(art.posts)) return;
  const h = 2.05 * p.scale;
  const half = art.posts.naturalWidth / 2;
  const w = h * half / art.posts.naturalHeight;
  const left = p.x - (right ? .76 : .25) * w;
  if (left > 640 || left + w < 0) return;
  shadow(ctx, p.x, p.y, .65 * p.scale);
  ctx.drawImage(art.posts, right ? half : 0, 0, half, art.posts.naturalHeight, left, p.y - h, w, h);
}

const hedgerow = [
  { x: -6.3, z: 23, height: 1.85 }, { x: 6.8, z: 20.2, height: 1.42 },
  { x: -5.3, z: 17.4, height: 1.14 }, { x: -4.9, z: 11.2, height: 1.66 },
  { x: 5.2, z: 8.1, height: 1.27 }, { x: -4.55, z: 6.4, height: 1.61 },
  { x: -3.4, z: 4.3, height: .98 },
] as const;

function bush(ctx: CanvasRenderingContext2D, art: CoastArt, camera: Camera, index: number) {
  const prop = hedgerow[index]!;
  if (prop.z <= camera.z + .5 || !available(art.thorn)) return;
  const p = roadPoint(camera, prop.x, prop.z);
  const h = prop.height * p.scale;
  const w = h * art.thorn.naturalWidth / art.thorn.naturalHeight * (.72 + (index % 3) * .10);
  if (p.x - w / 2 > 640 || p.x + w / 2 < 0) return;
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(index % 2 ? -1 : 1, 1);
  ctx.drawImage(art.thorn, -w / 2, -.97 * h, w, h);
  ctx.restore();
}

function walker(ctx: CanvasRenderingContext2D, d: CoastDrive, c: Camera, i: number, age: number, alertAge: number, reduced: boolean) {
  const z = 7.7 + i * 1.7;
  if (z < c.z + 1) return;
  const turn = d.heard ? smoothstep(i * .38, .76 + i * .38, alertAge) : 0;
  const listen = d.noise > .52 && !d.heard;
  const walk = Math.min(d.metres, 4);
  const toHedge = 1 - smoothstep(1.1, 5.8, z - d.metres);
  const x = -2.26 + .97 * i - walk * .10 - (.62 + .8 * i) * toHedge;
  const p = roadPoint(c, x, z + walk * .08);
  const height = p.scale * (1.63 + .1 * i);
  shadow(ctx, p.x, p.y, height * .16);
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.scale(1 - Math.sin(Math.PI * turn) * .45, 1);
  const stride = reduced || listen || d.heard || d.phase === 'ready' ? .18 + i * .32 : (age * .45 + i * .31) % 1;
  if (!drawMobStride(ctx, 'shambler', stride, height, turn >= .5)) {
    const cel = sprite(turn >= .5 ? 'en_shambler_front' : 'en_shambler_back');
    if (cel) ctx.drawImage(cel.img, -height * cel.w / cel.h / 2, -height, height * cel.w / cel.h, height);
  }
  ctx.restore();
}

function rut(ctx: CanvasRenderingContext2D, camera: Camera) {
  // Two exposed roots cross the outside wheel rut. Both ends are projected on the ground.
  if (camera.z > COAST_RUT - .8) return;
  for (let i = 0; i < 2; i++) {
    const start = roadPoint(camera, .87 + .08 * i, COAST_RUT + .15 * i);
    const mid = roadPoint(camera, 1.45, COAST_RUT + .2 + .05 * i);
    const tip = roadPoint(camera, 2.45 - .21 * i, COAST_RUT - .35 + .44 * i);
    ctx.lineCap = 'round'; ctx.lineWidth = start.scale * (.054 - i * .017);
    ctx.strokeStyle = '#463c30'; ctx.beginPath(); ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(mid.x, mid.y - .085 * mid.scale, tip.x, tip.y); ctx.stroke();
    ctx.lineWidth *= .35; ctx.strokeStyle = '#a19673'; ctx.stroke();
  }
}

function fence(ctx: CanvasRenderingContext2D, c: Camera, side: number) {
  const at = (z: number) => roadPoint(c, side * (2.7 + .18 * Math.sin(z * .35)), z);
  // Timber uprights and twin rails mark the edges of the wooded drive. The bay stays open inside.
  for (let z = GATE_AT - .75; z > -3; z -= 2.1) {
    const near = Math.max(c.z + .75, z - 2.1);
    if (near >= z) continue;
    const a = at(z), b = at(near);
    ctx.fillStyle = '#514536';
    for (const height of [.39, .73]) {
      ctx.beginPath(); ctx.moveTo(a.x, a.y - height * a.scale);
      ctx.lineTo(b.x, b.y - height * b.scale);
      ctx.lineTo(b.x, b.y - (height - .065) * b.scale);
      ctx.lineTo(a.x, a.y - (height - .065) * a.scale); ctx.fill();
    }
    ctx.fillStyle = '#544735'; ctx.fillRect(a.x - .047*a.scale, a.y - .99*a.scale, .094*a.scale, a.scale);
    ctx.fillStyle = '#9a896c'; ctx.fillRect(a.x - .047*a.scale, a.y - .99*a.scale, .023*a.scale, .97*a.scale);
  }
}

function refuge(ctx: CanvasRenderingContext2D, assets: CoastArt, c: Camera, health: number) {
  const intact = sprite('obj_house_front');
  if (!intact) return;
  const anchor = alleyPosition(HOUSE_CENTER.x, HOUSE_CENTER.y);
  const p = roadPoint(c, anchor.x, anchor.z);
  const stage = houseDamageStage(health);
  const eyeLevel = stage === 0 && available(assets.cottage);
  const h = 5.8 * p.scale, w = h * (eyeLevel ? assets.cottage.naturalWidth / assets.cottage.naturalHeight : intact.w / intact.h);
  shadow(ctx, p.x, p.y, w * .46);
  const facade = eyeLevel ? assets.cottage : facadeForStage(0, 'obj_house_front', intact, stage);
  ctx.drawImage(facade, p.x - w * .50, p.y - h, w, h);
  for (const prop of PROPS) {
    if (prop.kind !== 'woodpile' && prop.kind !== 'barrel') continue;
    const art = sprite(prop.kind === 'barrel' ? 'obj_props2_barrel' : 'obj_props_woodpile');
    if (!art) continue;
    const loc = alleyPosition(prop.x + .5, prop.y + .5);
    const ground = roadPoint(c, loc.x, loc.z), height = ground.scale * (prop.kind === 'barrel' ? .86 : 1.12);
    const width = height * art.w / art.h;
    ctx.drawImage(art.img, ground.x - width / 2, ground.y - height, width, height);
  }
}

export function paintRoad(ctx: CanvasRenderingContext2D, art: CoastArt, d: CoastDrive, age: number, alertAge: number, reduced: boolean, health: number): void {
  const c = coastCamera(d, reduced);
  if (available(art.woods)) {
    // Forest beyond the clearing. The house and parking apron have their actual yard coordinates.
    const far = roadPoint(c, 0, 110);
    const w = 810 * 110 / (110 - c.z), h = w * art.woods.naturalHeight / art.woods.naturalWidth;
    ctx.drawImage(art.woods, far.x - .53 * w, far.y - .49 * h, w, h);
  } else if (available(art.hedge)) ctx.drawImage(art.hedge, 0, -46, 640, 360);
  ground(ctx, art.lane, c);
  bush(ctx, art, c, 0);
  refuge(ctx, art, c, health);
  for (let i = 1; i <= 3; i++) bush(ctx, art, c, i);
  walker(ctx, d, c, 1, age, alertAge, reduced);
  bush(ctx, art, c, 4);
  walker(ctx, d, c, 0, age, alertAge, reduced);
  rut(ctx, c);
  bush(ctx, art, c, 5);
  gatepost(ctx, art, c, false); gatepost(ctx, art, c, true);
  fence(ctx, c, -1); fence(ctx, c, 1);
  bush(ctx, art, c, 6);
}

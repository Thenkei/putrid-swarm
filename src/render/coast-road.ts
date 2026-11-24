import { GRID_W, HOUSE_CENTER, PROPS, roadCentre } from '../core/map';
import { facadeForStage, houseDamageStage } from './house';
import { smoothstep } from '../core/math';
import { COAST_METRES, COAST_RUT, type CoastDrive } from '../core/coast-home';
import { sprite } from '../engine/assets';
import { drawMobStride } from './infected';
import { coastLaneCentre, drawCoastGround } from './coast-ground';

export interface CoastArt {
  woods: HTMLImageElement;
  grove: HTMLImageElement;
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
export const GATE_AT = 4.2;
export const coastGatePosts = [-2.55, 2.65].map(offset => ({ x: coastLaneCentre(GATE_AT) + offset, z: GATE_AT }));
export function alleyPosition(gx: number, gy: number) {
  return { x: (roadCentre('barn', gx) - gy) * metresPerCell, z: COAST_METRES + (GRID_W - gx) * metresPerCell };
}
const focusX = 320;

export function coastCamera(drive: CoastDrive, reduced: boolean) {
  const z = drive.metres;
  const x = drive.worldX;
  const jolt = reduced ? 0 : Math.sin(drive.jolt * Math.PI * 3) * drive.jolt * 2.4;
  const horizon = HORIZON + jolt + (reduced ? 0 : .38 * drive.speed * Math.sin(z * 7));
  const centre = focusX - FOCAL * Math.tan(drive.heading);
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

let softShadow: HTMLCanvasElement | undefined;

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, opacity = .42) {
  if (!softShadow) {
    softShadow = document.createElement('canvas');
    softShadow.width = 64;
    softShadow.height = 64;
    const stamp = softShadow.getContext('2d')!;
    const gradient = stamp.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, '#111517');
    gradient.addColorStop(.55, 'rgba(21,24,24,.64)');
    gradient.addColorStop(1, 'rgba(30,28,24,0)');
    stamp.fillStyle = gradient;
    stamp.fillRect(0, 0, 64, 64);
  }
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.drawImage(softShadow, x - radius, y - radius * .21, radius * 2, radius * .42);
  ctx.restore();
}

function gatepost(ctx: CanvasRenderingContext2D, art: CoastArt, camera: Camera, right: boolean): void {
  const p = roadPoint(camera, coastGatePosts[right ? 1 : 0]!.x, GATE_AT);
  if (GATE_AT <= camera.z || !available(art.posts)) return;
  const h = 2.05 * p.scale;
  const half = art.posts.naturalWidth / 2;
  const w = h * half / art.posts.naturalHeight;
  const left = p.x - (right ? .76 : .25) * w;
  if (left > 640 || left + w < 0) return;
  shadow(ctx, p.x, p.y, .65 * p.scale);
  ctx.drawImage(art.posts, right ? half : 0, 0, half, art.posts.naturalHeight, left, p.y - h, w, h);
}

// Eye-level woodland cutouts share the distant clearing's ink, bark and dusk light.
const grove: readonly { oak: boolean; x: number; z: number; h: number; flip?: true }[] = [
  { oak: false, x: -8.9, z: 29, h: 7.6 }, { oak: true, x: 10.1, z: 25.4, h: 8.8, flip: true },
  { oak: true, x: -5.8, z: 22.4, h: 7.3 }, { oak: false, x: 7.4, z: 20, h: 7.7 },
  { oak: true, x: -4.8, z: 17.7, h: 8.7, flip: true }, { oak: false, x: 5.9, z: 16.9, h: 6.4 },
  { oak: false, x: -3.6, z: 14.6, h: 7.4 }, { oak: true, x: 6.3, z: 13.8, h: 8.4, flip: true },
  { oak: false, x: -2.55, z: 12.4, h: 6.1 }, { oak: true, x: 2.14, z: 9.05, h: 7.9 },
  { oak: false, x: -6.9, z: 8.3, h: 6.8, flip: true }, { oak: false, x: 2.6, z: 6.8, h: 7.2 },
  { oak: true, x: -5.55, z: 5.8, h: 8.2 },
  // Two stems on the inside of the first bend break up the distant roof.
  // The last low oak lets the windows emerge as the driver clears its crown.
  { oak: true, x: .40, z: 7.52, h: 5.2 }, { oak: false, x: 1.84, z: 8.60, h: 6.8 },
  { oak: true, x: -1.65, z: 12.56, h: 4.3 },
  { oak: false, x: -2.3, z: 16.2, h: 6.1, flip: true },
];

function tree(ctx: CanvasRenderingContext2D, image: HTMLImageElement, c: Camera, n: number, age: number, reduced: boolean) {
  const t = grove[n]!;
  if (!available(image) || t.z <= c.z + .12) return;
  const p = roadPoint(c, t.x, t.z);
  const half = image.naturalWidth / 2;
  const h = t.h * p.scale, w = h * half / image.naturalHeight;
  if (p.x + w * .71 < 0 || p.x - w * .71 > 640) return;
  shadow(ctx, p.x, p.y, w * .28, .47);
  ctx.save(); ctx.translate(p.x, p.y);
  const wind = reduced ? 0 : .0038 * Math.sin(age * .61 + n * 1.7);
  ctx.transform(t.flip ? -1 : 1, 0, wind, 1, 0, 0);
  ctx.drawImage(image, t.oak ? 0 : half, 0, half, image.naturalHeight,
    -w * (t.oak ? .335 : .47), -h * .972, w, h);
  ctx.restore();
}

const hedgerow: readonly { x: number; z: number; height: number; spread?: number }[] = [
  { x: -6.3, z: 23, height: 1.85 }, { x: 6.8, z: 20.2, height: 1.42 },
  { x: -4.5, z: 17.4, height: 1.44 }, { x: -3.56, z: 12.85, height: 2.26 },
  { x: 3.55, z: 9.05, height: 1.86 }, { x: -6.3, z: 6.4, height: 1.61 },
  { x: -3.4, z: 4.3, height: .98 },
  { x: 3.6, z: 16.65, height: 1.85, spread: .68 },
];

function bush(ctx: CanvasRenderingContext2D, art: CoastArt, camera: Camera, index: number) {
  const prop = hedgerow[index]!;
  if (prop.z <= camera.z + .12 || !available(art.thorn)) return;
  const p = roadPoint(camera, prop.x, prop.z);
  const h = prop.height * p.scale;
  const w = h * art.thorn.naturalWidth / art.thorn.naturalHeight * (prop.spread ?? .72 + (index % 3) * .10);
  if (p.x - w / 2 > 640 || p.x + w / 2 < 0) return;
  shadow(ctx, p.x, p.y, w * .43, .36);
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(index % 2 ? -1 : 1, 1);
  ctx.drawImage(art.thorn, -w / 2, -.97 * h, w, h);
  ctx.restore();
}

// Both windows look at the same tracks. Each figure shuffles diagonally onto the left verge.
export function coastWalkerPosition(d: CoastDrive, i: number) {
  const walk = d.walkerTravel * (i === 0 ? .94 : 1.04);
  const z = 7.7 + 1.7 * i + .626 * walk;
  return { x: coastLaneCentre(7.7 + 1.7 * i) - 2.49 + .48 * i - .78 * walk, z };
}

function walker(ctx: CanvasRenderingContext2D, d: CoastDrive, c: Camera, i: number, age: number, alertAge: number, reduced: boolean) {
  const pos = coastWalkerPosition(d, i);
  if (pos.z <= c.z + .25) return;
  const p = roadPoint(c, pos.x, pos.z);
  const height = p.scale * (1.63 + .1 * i);
  if (p.x + height * .58 < 0 || p.x - height * .58 > 640) return;
  const turn = d.heard ? smoothstep(i * .38, .76 + i * .38, alertAge) : 0;
  const stride = (d.walkerTravel * (i === 0 ? .94 : 1.04) / .91 + .34 + .37 * i) % 1;
  const lean = reduced ? 0 : d.listening ? .034 : .009 * Math.sin(age * 1.4 + i * 2.1);
  shadow(ctx, p.x, p.y, height * .24, .68);
  shadow(ctx, p.x - height * .035, p.y, height * .11, .82);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.transform(-(1 - Math.sin(Math.PI * turn) * .48), 0, lean, 1, 0, 0);
  if (!drawMobStride(ctx, 'shambler', reduced ? .34 : stride, height, turn >= .5)) {
    const cel = sprite(turn >= .5 ? 'en_shambler_front' : 'en_shambler_back');
    if (cel) ctx.drawImage(cel.img, -height * cel.w / cel.h / 2, -height, height * cel.w / cel.h, height);
  }
  ctx.restore();
}

// The roots break out of the bank, cross the wheel rut and disappear under the gravel.
const rootRuns = [
  [[2.81, -.28, .076], [2.52, -.24, .068], [2.22, -.11, .058], [1.96, -.14, .052], [1.71, .08, .046], [1.4, .11, .035], [1.12, .03, .025], [.84, .09, .007]],
  [[2.43, -.22, .044], [2.27, .02, .039], [2.01, .12, .029], [1.89, .3, .023], [1.63, .38, .012], [1.40, .48, .003]],
  [[1.73, .08, .022], [1.62, -.05, .015], [1.42, -.14, .005]],
] as const;

function rut(ctx: CanvasRenderingContext2D, c: Camera) {
  if (c.z >= COAST_RUT + .5) return;
  const lane = coastLaneCentre(COAST_RUT);
  ctx.save();
  ctx.lineCap = 'round';
  for (const root of rootRuns) {
    for (let i = 1; i < root.length; i++) {
      const [ax, az, ar] = root[i - 1]!;
      const [bx, bz, br] = root[i]!;
      if (COAST_RUT + Math.min(az, bz) < c.z + .3) continue;
      const a = roadPoint(c, lane + ax, COAST_RUT + az), b = roadPoint(c, lane + bx, COAST_RUT + bz);
      if (Math.min(a.x, b.x) > 640 || Math.max(a.x, b.x) < 0) continue;
      const thick = (ar * a.scale + br * b.scale) * .5;
      ctx.strokeStyle = '#423b30';
      ctx.lineWidth = thick * 1.28;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = i % 3 === 1 ? '#85765a' : '#75664d';
      ctx.lineWidth = thick * .66;
      ctx.beginPath(); ctx.moveTo(a.x, a.y - thick * .31); ctx.lineTo(b.x, b.y - thick * .27); ctx.stroke();
    }
  }
  ctx.restore();
}

// Sample an unbroken length of weathered oak from the open gate's first pale.
const pale = { x: 282 / 1200, y: 266 / 600, width: 11 / 1200, height: 169 / 600 };
function fence(ctx: CanvasRenderingContext2D, c: Camera, side: number, posts: HTMLImageElement) {
  if (!available(posts)) return;
  const at = (z: number) => roadPoint(c, coastLaneCentre(z) + side * (2.48 + .18 * Math.sin(z * .35)), z);
  const sx = pale.x * posts.naturalWidth, sy = pale.y * posts.naturalHeight;
  const sw = pale.width * posts.naturalWidth, sh = pale.height * posts.naturalHeight;
  const span = 2.1;
  for (let z = GATE_AT - .34, index = 0; z > -3 && z > c.z + .4; z -= span, index++) {
    const base = at(z);
    const near = at(Math.max(c.z + .4, z - span));
    if (Math.min(base.x, near.x) > 652 || Math.max(base.x, near.x) < -12) continue;
    const cut = .93 + .057 * Math.sin(index * 4.8 + side);
    for (const rail of [.38, .72]) {
      // World-space lengths keep the grain anchored and perspective foreshortens the far end.
      for (let j = 0; j < 6; j++) {
        const u = j / 6;
        const v = Math.min((j + 1) / 6, (z - c.z - .4) / span);
        if (v <= u) break;
        const a = at(z - span * u), b = at(z - span * v);
        if (Math.min(a.x, b.x) > 641 || Math.max(a.x, b.x) < -1) continue;
        const ay = a.y - (rail - .037 * Math.sin(Math.PI * u)) * a.scale;
        const by = b.y - (rail - .037 * Math.sin(Math.PI * v)) * b.scale;
        const ah = a.scale * .081, bh = b.scale * .081;
        ctx.save();
        ctx.beginPath(); ctx.moveTo(a.x, ay); ctx.lineTo(b.x, by);
        ctx.lineTo(b.x, by + bh); ctx.lineTo(a.x, ay + ah); ctx.closePath(); ctx.clip();
        ctx.fillStyle = '#534737'; ctx.fill();
        ctx.transform(0, Math.max(ah, bh), b.x - a.x, by - ay, a.x, ay);
        ctx.drawImage(posts, sx, sy + sh * u, sw, sh * (v - u), 0, 0, 1, 1);
        ctx.restore();
        ctx.strokeStyle = 'rgba(150,136,103,.72)';
        ctx.lineWidth = Math.max(.38, .009 * a.scale);
        ctx.beginPath(); ctx.moveTo(a.x, ay); ctx.lineTo(b.x, by); ctx.stroke();
      }
    }
    const w = .105 * base.scale, h = cut * base.scale;
    const lean = w * .29 * Math.sin(index * 2.8 + side);
    shadow(ctx, base.x, base.y, .24 * base.scale, .54);
    ctx.save(); ctx.translate(base.x, base.y); ctx.transform(1, 0, -lean / h, 1, 0, 0);
    ctx.beginPath(); ctx.moveTo(-w * .56, 0); ctx.lineTo(-w * .49, -h + w * .36);
    ctx.lineTo(-w * .25, -h); ctx.lineTo(w * .35, -h + w * .12);
    ctx.lineTo(w * .52, -h + w * .52); ctx.lineTo(w * .48, 0); ctx.closePath(); ctx.clip();
    ctx.drawImage(posts, sx, sy, sw, sh, -w * .57, -h, w * 1.15, h);
    ctx.fillStyle = 'rgba(34,31,26,.42)'; ctx.fillRect(w * .2, -h, w * .33, h);
    for (const level of [.38, .72]) {
      ctx.fillStyle = '#39362e'; ctx.fillRect(-w * .08, -level * base.scale + w * .26, w * .19, w * .17);
    }
    ctx.restore();
  }
}

function refuge(ctx: CanvasRenderingContext2D, assets: CoastArt, c: Camera, health: number) {
  const intact = sprite('obj_house_front');
  if (!intact) return;
  const anchor = alleyPosition(HOUSE_CENTER.x, HOUSE_CENTER.y);
  const p = roadPoint(c, anchor.x, anchor.z);
  const stage = houseDamageStage(health);
  const eyeLevel = stage === 0 && available(assets.cottage);
  const h = 5.05 * p.scale, w = h * (eyeLevel ? assets.cottage.naturalWidth / assets.cottage.naturalHeight : intact.w / intact.h);
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
    shadow(ctx, ground.x, ground.y, width * .53, .55);
    ctx.drawImage(art.img, ground.x - width / 2, ground.y - height, width, height);
  }
}

const forestLayers = [
  ...grove.map((prop, i) => ({ z: prop.z, kind: 'tree' as const, i })),
  ...hedgerow.map((prop, i) => ({ z: prop.z, kind: 'bush' as const, i })),
  { z: COAST_RUT, kind: 'root' as const, i: 0 },
  { z: GATE_AT, kind: 'gate' as const, i: 0 },
].sort((a, b) => b.z - a.z);

/** Continue the forest across the glass when a turn brings the painted edge into view. */
export function drawWoodline(ctx: CanvasRenderingContext2D, image: HTMLImageElement,
  x: number, y: number, w: number, h: number, left: number, right: number) {
  ctx.drawImage(image, x, y, w, h);
  if (x <= left && x + w >= right) return;
  const edge = x > left ? x : x + w;
  ctx.save(); ctx.translate(2 * edge, 0); ctx.scale(-1, 1);
  ctx.drawImage(image, x, y, w, h); ctx.restore();
}

export function paintRoad(ctx: CanvasRenderingContext2D, art: CoastArt, d: CoastDrive, age: number, alertAge: number, reduced: boolean, health: number): void {
  const c = coastCamera(d, reduced);
  if (available(art.woods)) {
    // Forest beyond the clearing. The house and parking apron have their actual yard coordinates.
    const far = roadPoint(c, 0, 110);
    const w = 1050 * 110 / (110 - c.z), h = w * art.woods.naturalHeight / art.woods.naturalWidth;
    drawWoodline(ctx, art.woods, far.x - .53 * w, far.y - .49 * h, w, h, 0, 640);
  } else if (available(art.hedge)) ctx.drawImage(art.hedge, 0, -46, 640, 360);
  drawCoastGround(ctx, art.lane, c, FOCAL, EYE, 293, 1);
  refuge(ctx, art, c, health);
  // Depth-sort the fixed grove against the moving foot anchors, including bushes
  // that can momentarily cover a walker as the driver rounds the first bend.
  let next = 1;
  let foot = coastWalkerPosition(d, next);
  for (const layer of forestLayers) {
    while (next >= 0 && foot.z >= layer.z) {
      walker(ctx, d, c, next, age, alertAge, reduced);
      next--;
      if (next >= 0) foot = coastWalkerPosition(d, next);
    }
    if (layer.kind === 'tree') tree(ctx, art.grove, c, layer.i, age, reduced);
    else if (layer.kind === 'bush') bush(ctx, art, c, layer.i);
    else if (layer.kind === 'root') rut(ctx, c);
    else { gatepost(ctx, art, c, false); gatepost(ctx, art, c, true); }
  }
  fence(ctx, c, -1, art.posts); fence(ctx, c, 1, art.posts);
}

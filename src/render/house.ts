import type { SectorId } from '../core/types';
import { sprite, type Sprite } from '../engine/assets';
import type { Rot } from './projection';

const worn = new Map<Rot, HTMLCanvasElement>();
const exposedInteriors = new Map<Rot, HTMLCanvasElement>();

/** Stage zero is intact. The thresholds apply equally to damage, saved yards and daytime repairs. */
export function houseDamageStage(health: number): number {
  if (health <= 0.15) return 5;
  if (health <= 0.35) return 4;
  if (health <= 0.55) return 3;
  if (health <= 0.75) return 2;
  if (health <= 0.90) return 1;
  return 0;
}

const facadeSuffix = ['', '', 'damaged', 'stripped', 'failing', 'ruin'] as const;

export function facadeForStage(rot: Rot, key: string, intact: Sprite, stage: number): CanvasImageSource {
  // A missing optional painting falls back to the closest less damaged state for this side.
  for (let i = stage; i >= 2; i--) {
    const image = sprite(`${key}_${facadeSuffix[i]}`);
    if (image) return i === 5 ? exposedInterior(rot, intact, image) : image.img;
  }
  const damage = stage > 0 && sprite(`${key}_damaged`);
  return damage ? wornFacade(rot, intact, damage) : intact.img;
}

/** Through the missing wall and roof, the camera sees the far wall and the loft floor. Keep
 * the broken skyline open and paint the surviving rafters in front of the interior. */
function exposedInterior(rot: Rot, intact: Sprite, ruin: Sprite): HTMLCanvasElement {
  const cached = exposedInteriors.get(rot);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = intact.w;
  canvas.height = intact.h;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.scale(canvas.width, canvas.height);
  const ridgeX = rot === 0 ? 0.67 : 0.70;
  const ridgeY = rot === 0 ? 0.09 : 0.12;
  ctx.beginPath();
  ctx.moveTo(0.075, 0.47);
  ctx.lineTo(0.30, 0.245);
  ctx.lineTo(ridgeX, ridgeY);
  ctx.lineTo(0.92, 0.345);
  ctx.lineTo(0.92, 0.79);
  ctx.lineTo(0.55, 0.915);
  ctx.lineTo(0.075, 0.82);
  ctx.closePath();
  ctx.clip();
  const shade = ctx.createLinearGradient(0, 0.12, 0.12, 0.84);
  shade.addColorStop(0, '#33261d');
  shade.addColorStop(0.34, '#211b16');
  shade.addColorStop(0.52, '#30261b');
  shade.addColorStop(0.85, '#191615');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 1, 1);
  // Use the grain of this facade's planking for the timber on its unlit side.
  ctx.globalAlpha = 0.12;
  const woodX = rot === 0 ? 0.741 : 0.659;
  ctx.drawImage(intact.img, intact.w * woodX, intact.h * 0.72, intact.w * 0.065, intact.h * 0.15, 0.06, 0.08, 0.9, 0.79);
  ctx.globalAlpha = 1;
  // A raking sliver of daylight picks out the loft boards behind the lower rafters.
  ctx.transform(1, -0.30, 0, 1, 0, 0);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#2f251c' : '#403225';
    ctx.fillRect(0.23 + i * 0.012, 0.436 + i * 0.021, 0.69 - i * 0.05, 0.006);
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(intact.img, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(ruin.img, 0, 0, canvas.width, canvas.height);
  exposedInteriors.set(rot, canvas);
  return canvas;
}

/** Before the damage reaches the roof, only the splintered wood and chipped plaster on the lower
 * facade are visible. Feather those paint areas together once at the sprite's native resolution. */
function wornFacade(rot: Rot, intact: Sprite, damage: Sprite): HTMLCanvasElement {
  const cached = worn.get(rot);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = intact.w;
  canvas.height = intact.h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(damage.img, 0, 0, intact.w, intact.h);
  ctx.save();
  // Choose an exposed shutter on each facade. The entrance barricades can cover the doors.
  ctx.translate(rot === 0 ? 160 : 660, rot === 0 ? 584 : 534);
  ctx.scale(1, rot === 0 ? 0.72 : 0.93);
  const fade = ctx.createRadialGradient(0, 0, 105, 0, 0, 167);
  fade.addColorStop(0, '#000');
  fade.addColorStop(1, 'transparent');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = fade;
  ctx.fillRect(-intact.w, -intact.h * 2, intact.w * 2, intact.h * 4);
  ctx.restore();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.drawImage(intact.img, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  worn.set(rot, canvas);
  return canvas;
}

/** Corners inside the painted door jambs, in pixels on the 760-wide facade. */
const OPENINGS: Record<SectorId, { x: number; y: number; w: number; h: number; rise: number }> = {
  portail: { x: 200, y: 501, w: 89, h: 156, rise: 19 },
  grange: { x: 526, y: 519, w: 201, h: 201, rise: -61 },
  arriere: { x: 198, y: 503, w: 72, h: 145, rise: 17 },
  verger: { x: 531, y: 482, w: 68, h: 181, rise: -24 },
};

function breachedDoor(ctx: CanvasRenderingContext2D, sector: SectorId): void {
  const { x, y, w, h, rise } = OPENINGS[sector];
  ctx.save();
  ctx.transform(1, rise / w, 0, 1, x, y);
  // The opening is a view into the building; the barn reads as deep timber bays and the other
  // doors open onto a hallway with a sliver of light at its far end.
  const interior = sprite(sector === 'grange' ? 'yard_masonry_barn' : 'yard_masonry_hall');
  ctx.fillStyle = '#211c19';
  ctx.fillRect(0, 0, w, h);
  if (interior) {
    const cropW = Math.min(interior.w - 6, interior.h * w / h + interior.w * 0.28);
    const cropX = 3 + (interior.w - cropW - 6) * (sector === 'grange' ? 0.1 : 0.51);
    ctx.drawImage(interior.img, cropX, 3, cropW, interior.h - 6, 0, 0, w, h);
  }
  ctx.fillStyle = '#382c22';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.13, h * 0.064);
  ctx.lineTo(w * 0.13, h * 0.9);
  ctx.lineTo(0, h);
  ctx.fill();
  // The hinged leaf has given inward. Its narrow lit face still shows the grain and fracture.
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w * 0.74, h * 0.10);
  ctx.lineTo(w * 0.74, h * 0.42);
  ctx.lineTo(w * 0.82, h * 0.36);
  ctx.lineTo(w * 0.76, h * 0.63);
  ctx.lineTo(w * 0.83, h * 0.57);
  ctx.lineTo(w * 0.79, h * 0.91);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = '#60412b';
  ctx.fill();
  ctx.clip();
  for (const at of [0.79, 0.85, 0.918, 0.955]) {
    ctx.fillStyle = at < 0.9 ? '#95754a' : '#39291e';
    ctx.fillRect(w * at, 0, 2, h);
  }
  ctx.restore();
}

export function paintHouse(ctx: CanvasRenderingContext2D, rot: Rot, key: string, intact: Sprite, left: number, top: number, width: number, health: number, barricades: Readonly<Record<SectorId, { hp: number }>>): void {
  const image = facadeForStage(rot, key, intact, houseDamageStage(health));
  ctx.save();
  ctx.translate(left, top);
  ctx.scale(width / intact.w, width / intact.w);
  ctx.drawImage(image, 0, 0, intact.w, intact.h);
  const visible = rot === 0 ? FRONT : BACK;
  for (const sector of visible) if (barricades[sector].hp <= 0) breachedDoor(ctx, sector);
  ctx.restore();
}

const FRONT = ['portail', 'grange'] as const;
const BACK = ['arriere', 'verger'] as const;

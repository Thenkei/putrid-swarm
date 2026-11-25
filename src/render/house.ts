import type { SectorId } from '../core/types';
import { HOUSE_CENTER } from '../core/map';
import { paintingImage, sprite, type Sprite } from '../engine/assets';
import { depthOf, project, type Rot, type View } from './projection';
import { HOUSE_PAINT_SCALE } from './registration';
import { DOOR_OPENINGS, THRESHOLDS, VISIBLE_DOORS } from '../house-layout';
import { smoothstep } from './noise';

export { DOOR_OPENINGS, DOOR_OUTWARD, THRESHOLDS, VISIBLE_DOORS, doorStance } from '../house-layout';

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

export function damagedFacade(key: string, stage: number): Sprite | undefined {
  // A missing optional painting falls back to the closest less damaged state for this side.
  for (let i = stage; i >= 2; i--) {
    const image = sprite(`${key}_${facadeSuffix[i]}`);
    if (image) return image;
  }
}

export function facadeForStage(rot: Rot, key: string, intact: Sprite, stage: number): CanvasImageSource {
  const ruin = stage === 5 && sprite(`${key}_ruin`);
  if (ruin) return exposedInterior(rot, intact, ruin);
  const image = damagedFacade(key, stage);
  if (image) return paintingImage(image);
  const damage = stage > 0 && sprite(`${key}_damaged`);
  return damage ? wornFacade(rot, intact, damage) : paintingImage(intact);
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
  ctx.drawImage(paintingImage(ruin), 0, 0, canvas.width, canvas.height);
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
  ctx.drawImage(paintingImage(intact), 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  worn.set(rot, canvas);
  return canvas;
}

export interface HouseDoor {
  readonly sector: SectorId;
  readonly open: number;
}

export function doorSwing(age: number, closeAt: number, shutAt: number): number {
  return smoothstep(0, .4, age) * (1 - smoothstep(closeAt, shutAt, age));
}

/** The outside of the sill lies just in front of its boards and behind figures attacking them. */
export function outsideSillDepth(rot: Rot, depth: number): number {
  return Math.max(depth, depthOf(rot, HOUSE_CENTER.x, HOUSE_CENTER.y) + 1.315);
}

/** While crossing the sill, the jamb hides the part of the sprite still inside the house. */
export function clipAtSill(ctx: CanvasRenderingContext2D, view: View, sector: SectorId, facing: number) {
  const sill = THRESHOLDS[sector];
  const foot = project(view, sill.gx, sill.gy);
  const width = sill.width * view.zoom;
  const height = DOOR_OPENINGS[sector].h * HOUSE_PAINT_SCALE * view.zoom;
  const insideEdge = facing > 0 ? -.5 : .5;
  const leftHinge = sector === 'arriere' || sector === 'verger';
  const inset = sector === 'grange' ? .07 : (leftHinge === (insideEdge < 0) ? .14 : .025);
  const edgeX = foot.x + width * insideEdge * (1 - 2 * inset);
  const edgeY = foot.y + (edgeX - foot.x) * sill.slope;
  const limit = facing > 0 ? view.x + view.w : view.x;
  ctx.beginPath();
  ctx.moveTo(edgeX, edgeY);
  ctx.lineTo(edgeX, edgeY - height);
  ctx.lineTo(foot.x, foot.y - height);
  ctx.lineTo(foot.x, view.y);
  ctx.lineTo(limit, view.y);
  ctx.lineTo(limit, view.y + view.h);
  ctx.lineTo(foot.x, view.y + view.h);
  ctx.lineTo(foot.x, foot.y);
  ctx.closePath();
  ctx.clip();
}

/** Both a leaf and its attached boards rotate about the same masonry jamb in screen space. */
export function hingedLeaves(ctx: CanvasRenderingContext2D, sector: SectorId, open: number,
  left: number, width: number, slope: number, paint: () => void) {
  if (open <= 0) { paint(); return; }
  const angle = Math.min(1, open) * 1.44;
  const span = Math.cos(angle);
  const double = sector === 'grange';
  const fromLeft = sector === 'arriere' || sector === 'verger';
  const leaf = (leftHinge: boolean) => {
    const hinge = left + (leftHinge ? 0 : width);
    const shear = slope * (span - 1) - (leftHinge ? 1 : -1) * Math.sin(angle) * .28;
    ctx.save();
    ctx.transform(span, shear, 0, 1, hinge * (1 - span), -hinge * shear);
    if (double) {
      const centre = left + width / 2;
      ctx.beginPath(); ctx.rect(leftHinge ? centre - 4096 : centre, -4096, 4096, 8192); ctx.clip();
    }
    paint();
    ctx.restore();
  };
  if (double) { leaf(true); leaf(false); } else leaf(fromLeft);
}

/** The hall, floor reflection and original leaf all use the measured corners of this facade. */
function launchOpening(ctx: CanvasRenderingContext2D, sector: SectorId, open: number,
  facade: CanvasImageSource, intact: boolean) {
  const d = DOOR_OPENINGS[sector];
  const { x, y, w, h, rise } = d;
  ctx.save();
  ctx.transform(1, rise / w, 0, 1, x, y);
  const jamb = new Path2D();
  if (sector === 'portail') {
    jamb.moveTo(0, 22); jamb.quadraticCurveTo(w * .45, -15, w, 20);
    jamb.lineTo(w, h); jamb.lineTo(0, h); jamb.closePath();
  } else jamb.rect(0, 0, w, h);
  ctx.save(); ctx.clip(jamb);
  if (intact) {
    const interior = sprite(sector === 'grange' ? 'yard_masonry_barn' : 'yard_masonry_hall');
    ctx.fillStyle = '#261b15'; ctx.fillRect(0, 0, w, h);
    if (interior) {
      const crop = Math.min(interior.w, interior.h * w / h);
      ctx.drawImage(interior.img, (interior.w - crop) * .5, 0, crop, interior.h, 0, 0, w, h);
    }
  }
  const warmth = ctx.createLinearGradient(0, h * .25, 0, h);
  warmth.addColorStop(0, '#21161015'); warmth.addColorStop(.77, '#da99532b'); warmth.addColorStop(1, '#f9c37c9e');
  ctx.globalAlpha = open; ctx.fillStyle = warmth; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#d6ae77'; ctx.fillRect(0, h - 3, w, 3);
  ctx.restore();
  // Spill travels away from the threshold and is occluded by the barricade and vehicle above it.
  ctx.globalAlpha = Math.min(1, open);
  const spill = ctx.createLinearGradient(0, h, 0, h + 47);
  spill.addColorStop(0, '#ffdc8b85'); spill.addColorStop(1, '#e4ae5b00');
  ctx.fillStyle = spill;
  const drift = rise > 0 ? -32 : 32;
  ctx.beginPath(); ctx.moveTo(2, h); ctx.lineTo(w - 2, h); ctx.lineTo(w + drift + 13, h + 47); ctx.lineTo(drift - 12, h + 47); ctx.fill();
  ctx.restore();

  if (intact) hingedLeaves(ctx, sector, open, x, w, rise / w, () => {
    ctx.save();
    ctx.transform(1, rise / w, 0, 1, x, y); ctx.clip(jamb);
    // Restore the source painting's coordinates while keeping the jamb-shaped clip.
    ctx.transform(1, -rise / w, 0, 1, -x, x * rise / w - y);
    const top = y + Math.min(rise, 0) - 10, height = h + Math.abs(rise) + 12;
    ctx.drawImage(facade, x, top, w, height, x, top, w, height);
    ctx.restore();
  });
}

function breachedDoor(ctx: CanvasRenderingContext2D, sector: SectorId): void {
  const { x, y, w, h, rise } = DOOR_OPENINGS[sector];
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

export function paintHouse(ctx: CanvasRenderingContext2D, rot: Rot, key: string, intact: Sprite, left: number, top: number, width: number, health: number, barricades: Readonly<Record<SectorId, { hp: number }>>, door?: HouseDoor): void {
  const image = facadeForStage(rot, key, intact, houseDamageStage(health));
  ctx.save();
  ctx.translate(left, top);
  ctx.scale(width / intact.w, width / intact.w);
  ctx.drawImage(image, 0, 0, intact.w, intact.h);
  const visible = VISIBLE_DOORS[rot];
  for (const sector of visible) if (barricades[sector].hp <= 0) breachedDoor(ctx, sector);
  if (door && door.open > 0 && visible.includes(door.sector)) {
    launchOpening(ctx, door.sector, door.open, image, barricades[door.sector].hp > 0);
  }
  ctx.restore();
}

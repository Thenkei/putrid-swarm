import { ENTRIES, HOUSE_CENTER } from './core/map';
import { smoothstep } from './core/math';
import type { EnemyImpact } from './core/night';
import type { SectorId } from './core/types';
import { project, unproject, type Rot, type View } from './render/projection';
import { houseOffset, HOUSE_PAINT_SCALE } from './render/registration';

/** Corners inside the painted door jambs, in pixels on the 760-wide facade. */
export const DOOR_OPENINGS: Readonly<Record<SectorId, { x: number; y: number; w: number; h: number; rise: number }>> = {
  portail: { x: 200, y: 501, w: 89, h: 156, rise: 19 },
  grange: { x: 526, y: 519, w: 201, h: 201, rise: -61 },
  arriere: { x: 198, y: 503, w: 72, h: 145, rise: 17 },
  verger: { x: 531, y: 482, w: 68, h: 181, rise: -24 },
};

export const VISIBLE_DOORS: Readonly<Record<Rot, readonly SectorId[]>> = {
  0: ['portail', 'grange'], 1: ['arriere', 'verger'],
};

/** The two images show disjoint exterior walls. Read the actual threshold on its painted face
 * once, then give every camera the same world-space contact, including one looking over the roof. */
function doorway(sector: SectorId) {
  const rot: Rot = VISIBLE_DOORS[0].includes(sector) ? 0 : 1;
  const view: View = { rot, cx: HOUSE_CENTER.x, cy: HOUSE_CENTER.y, zoom: 1, x: 0, y: 0, w: 0, h: 0 };
  const d = DOOR_OPENINGS[sector];
  const sill = houseOffset(rot, d.x + d.w / 2, d.y + d.h + d.rise / 2);
  const point = unproject(view, sill.dx, -sill.lift);
  return { view, sx: sill.dx, sy: -sill.lift, gx: point.gx, gy: point.gy, width: d.w * HOUSE_PAINT_SCALE, slope: d.rise / d.w };
}
export const THRESHOLDS = { portail: doorway('portail'), grange: doorway('grange'), arriere: doorway('arriere'), verger: doorway('verger') };
export const DOOR_OUTWARD = { portail: [0, 1], grange: [1, 0], arriere: [0, -1], verger: [-1, 0] } as const;

export const DOOR_REACH = 1.3;

/** The simulation resolves a bite within a radius around the entry cell. Carry the last step
 * to the painted boards, leaving pathfinding, collision and trap targeting in simulation space. */
export function doorStance<T extends EnemyImpact & { boss?: { sector: SectorId } | null }>(e: T): T & { threshold?: SectorId } {
  const mower = e.type === 'mower', sector = mower && e.boss ? e.boss.sector : e.target;
  const foot = approachDoor(e, sector, mower ? 0.12 : DOOR_REACH);
  const exit = e.mailExit;
  if (!exit || e.travel === undefined) return foot;
  const weight = 1 - smoothstep(0, 1.37, e.travel - exit.atTravel);
  if (weight <= 0) return foot;
  const knocking = e.gripTarget === exit.sector;
  const [nx, ny] = DOOR_OUTWARD[exit.sector];
  return { ...foot, x: foot.x + exit.dx * weight, y: foot.y + exit.dy * weight,
    fx: knocking ? -nx : foot.fx, fy: knocking ? -ny : foot.fy, threshold: foot.threshold ?? exit.sector };
}

function approachDoor<T extends EnemyImpact>(e: T, sector: SectorId, contactDistance: number): T & { threshold?: SectorId } {
  const entry = ENTRIES[sector];
  const distance = Math.hypot(e.x - entry.x - 0.5, e.y - entry.y - 0.5);
  const approach = 0.92;
  if (distance >= contactDistance + approach || e.lureDevice !== null || e.crawlDepth > 0 ||
    (distance > contactDistance && e.action !== 'walk' && e.action !== 'charge')) return e;
  const door = THRESHOLDS[sector], [nx, ny] = DOOR_OUTWARD[sector];
  const p = project(door.view, e.x, e.y);
  // Preserve lateral ordering on a wide barn door, and spread a crowd across a narrow jamb.
  const side = Math.max(-0.32, Math.min(0.32, (p.x - door.sx) / door.width)) + (e.offsetX - e.offsetY) * 0.22;
  const along = side * door.width;
  const at = unproject(door.view, door.sx + along, door.sy + along * door.slope);
  const reach = Math.min(0.66, 0.32 * e.def.size + 0.07);
  const t = 1 - smoothstep(contactDistance, contactDistance + approach, distance);
  return { ...e, x: e.x + (at.gx + nx * reach - e.x) * t, y: e.y + (at.gy + ny * reach - e.y) * t,
    fx: e.fx + (-nx - e.fx) * t, fy: e.fy + (-ny - e.fy) * t, threshold: sector };
}

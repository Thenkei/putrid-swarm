import { HOUSE_CENTER } from './core/map';
import type { SectorId } from './core/types';
import { unproject, type Rot, type View } from './render/projection';
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

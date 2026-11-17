// The isometric projection, and nothing else: grid ↔ screen for a view. Pure arithmetic, so the
// renderer, the ground builder and the tests all read the same numbers.

import { GRID_H, GRID_W, HOUSE_CENTER } from '../core/map';
import type { Cell, SectorId } from '../core/types';

export const TW = 64;
export const TH = 32;

/** 0 looks from the gate side (sees gate + barn doors); 1 looks from the back (sees back + orchard doors). */
export type Rot = 0 | 1;

export interface View {
  readonly rot: Rot;
  readonly zoom: number;
  /** Grid point shown at the centre of the rectangle. */
  readonly cx: number;
  readonly cy: number;
  /** Stage rectangle the view is drawn into. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const viewX = (rot: Rot, gx: number): number => (rot === 0 ? gx : GRID_W - gx);
export const viewY = (rot: Rot, gy: number): number => (rot === 0 ? gy : GRID_H - gy);

/** Grid → un-zoomed world pixels for a rotation. */
export function world(rot: Rot, gx: number, gy: number): Point {
  const vx = viewX(rot, gx);
  const vy = viewY(rot, gy);
  return { x: ((vx - vy) * TW) / 2, y: ((vx + vy) * TH) / 2 };
}

export function project(view: View, gx: number, gy: number): Point {
  const p = world(view.rot, gx, gy);
  const c = world(view.rot, view.cx, view.cy);
  return { x: view.x + view.w / 2 + (p.x - c.x) * view.zoom, y: view.y + view.h / 2 + (p.y - c.y) * view.zoom };
}

export function unproject(view: View, sx: number, sy: number): { gx: number; gy: number } {
  const c = world(view.rot, view.cx, view.cy);
  const wx = (sx - view.x - view.w / 2) / view.zoom + c.x;
  const wy = (sy - view.y - view.h / 2) / view.zoom + c.y;
  const vx = wy / TH + wx / TW;
  const vy = wy / TH - wx / TW;
  return view.rot === 0 ? { gx: vx, gy: vy } : { gx: GRID_W - vx, gy: GRID_H - vy };
}

export const inView = (view: View, sx: number, sy: number): boolean => sx >= view.x && sy >= view.y && sx < view.x + view.w && sy < view.y + view.h;

/** The rectangle of grid coordinates that contains everything a view shows. */
export function viewBounds(view: View): { x: number; y: number; w: number; h: number } {
  const corners = [unproject(view, view.x, view.y), unproject(view, view.x + view.w, view.y), unproject(view, view.x, view.y + view.h), unproject(view, view.x + view.w, view.y + view.h)];
  const minX = Math.min(...corners.map((c) => c.gx));
  const minY = Math.min(...corners.map((c) => c.gy));
  return { x: minX, y: minY, w: Math.max(...corners.map((c) => c.gx)) - minX, h: Math.max(...corners.map((c) => c.gy)) - minY };
}

/** Painter's order: what is nearer the viewer has the larger depth. */
export const depthOf = (rot: Rot, gx: number, gy: number): number => viewX(rot, gx) + viewY(rot, gy);

/**
 * The matrix that lays the grid flat on the screen for a view: applied to a context, one unit is
 * one cell, so anything drawn in grid coordinates lands on the ground plane. `[a, b, c, d, e, f]`
 * as `setTransform` takes them, before any device-pixel scale.
 */
export function groundMatrix(view: View): readonly [number, number, number, number, number, number] {
  const o = project(view, 0, 0);
  const sign = view.rot === 0 ? 1 : -1;
  const z = view.zoom * sign;
  return [(TW / 2) * z, (TH / 2) * z, (-TW / 2) * z, (TH / 2) * z, o.x, o.y];
}

/** The camera framing of each sector: which side it is seen from and where it is centred. */
export function cameraView(sector: SectorId, rect: { x: number; y: number; w: number; h: number }, zoom: number): View {
  const rot: Rot = sector === 'portail' || sector === 'grange' ? 0 : 1;
  const reach = 5.4;
  const centre: Record<SectorId, Cell> = {
    portail: { x: HOUSE_CENTER.x - 0.4, y: HOUSE_CENTER.y + reach },
    grange: { x: HOUSE_CENTER.x + reach, y: HOUSE_CENTER.y - 0.4 },
    arriere: { x: HOUSE_CENTER.x + 0.4, y: HOUSE_CENTER.y - reach },
    verger: { x: HOUSE_CENTER.x - reach, y: HOUSE_CENTER.y + 0.4 },
  };
  return { rot, zoom, cx: centre[sector].x, cy: centre[sector].y, ...rect };
}

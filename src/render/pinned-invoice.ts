import type { SectorId } from '../core/types';
import { HOUSE_CENTER } from '../core/map';
import { DOOR_OPENINGS, VISIBLE_DOORS } from '../house-layout';
import { depthOf, project, type View } from './projection';
import { houseOffset } from './registration';
import { calmMotion } from './lighting';

// A sound barricade takes the nail in the upper crosspiece. At a breached
// opening a surviving jamb still holds it; never hang a sheet in mid-air.
export function invoiceNail(view: View, sector: SectorId, breached: boolean) {
  const door = DOOR_OPENINGS[sector];
  const across = breached ? .02 : .38;
  const offset = houseOffset(view.rot, door.x + across * door.w, door.y + door.rise * across + door.h * .34);
  const base = project(view, HOUSE_CENTER.x, HOUSE_CENTER.y);
  return { x: base.x + offset.dx * view.zoom, y: base.y - offset.lift * view.zoom };
}

export function hitsInvoice(view: View, sector: SectorId, breached: boolean, x: number, y: number, time = 0, visible?: (depth: number) => boolean) {
  if (!VISIBLE_DOORS[view.rot].includes(sector)) return false;
  const nail = invoiceNail(view, sector, breached);
  const dx = (x - nail.x) / view.zoom, dy = (y - nail.y) / view.zoom;
  const slope = DOOR_OPENINGS[sector].rise / DOOR_OPENINGS[sector].w + .08;
  const py = (dy - slope * dx) / (1 + .06 * slope), px = dx + .06 * py;
  const curl = invoiceCurl(time);
  const right = py <= 12 ? 7 + curl * (py + 2) / 14 : 4 + (3 + curl) * (15 - py) / 3;
  return py >= -2.5 && py <= 15.5 && px >= -7 && px <= right + .5
    && (visible?.(depthOf(view.rot, HOUSE_CENTER.x, HOUSE_CENTER.y) + 1.3) ?? true);
}

const invoiceCurl = (time: number): number => calmMotion() ? .6 : .6 + .6 * Math.sin(time * 2.4);

export function drawPinnedInvoice(ctx: CanvasRenderingContext2D, view: View, sector: SectorId, breached: boolean, time: number) {
  const nail = invoiceNail(view, sector, breached);
  const slope = DOOR_OPENINGS[sector].rise / DOOR_OPENINGS[sector].w;
  const curl = invoiceCurl(time);
  ctx.save();
  ctx.translate(nail.x, nail.y);
  ctx.scale(view.zoom, view.zoom);
  ctx.transform(1, slope + .08, -.06, 1, 0, 0);
  const paper = () => {
    ctx.beginPath(); ctx.moveTo(-6.5, -2); ctx.lineTo(7, -2);
    ctx.lineTo(7 + curl, 12); ctx.lineTo(4, 15); ctx.lineTo(-6, 14); ctx.closePath(); ctx.fill();
  };
  ctx.save(); ctx.translate(1.2 + curl, 1.5); ctx.fillStyle = '#2d241ad4'; paper(); ctx.restore();
  ctx.fillStyle = '#edce8b'; paper();
  ctx.fillStyle = '#856148'; ctx.fillRect(-4, 2, 7, 1.6);
  ctx.fillStyle = '#aa8254'; ctx.fillRect(-4, 6, 8.5, .8); ctx.fillRect(-4, 8.5, 6, .8);
  ctx.fillStyle = '#bc9564'; ctx.beginPath(); ctx.moveTo(4, 15); ctx.lineTo(4.5, 11.5); ctx.lineTo(7 + curl, 12); ctx.fill();
  ctx.fillStyle = '#493a2d'; ctx.fillRect(-.9, -.8, 1.8, 1.8);
  ctx.restore();
}

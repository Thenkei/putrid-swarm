import { ENTRIES, LANES } from '../core/map';
import type { SectorId } from '../core/types';
import { calmMotion } from './lighting';
import { project, type View } from './projection';

export interface RattleVisual {
  readonly sector: SectorId;
  readonly struckAt: number | null;
}

export function rattlePoint(sector: SectorId) {
  const edge = LANES[sector][0]!;
  const door = ENTRIES[sector];
  const inward = { x: Math.sign(door.x - edge.x), y: Math.sign(door.y - edge.y) };
  return { x: edge.x + 0.5 + inward.x * 1.7, y: edge.y + 0.5 + inward.y * 1.7, inward };
}

/** A tin at the hedge, hung on a short post where it can be inspected from the yard. */
export function drawRattle(ctx: CanvasRenderingContext2D, view: View, rattle: RattleVisual, time: number): void {
  const point = rattlePoint(rattle.sector);
  const { inward } = point;
  const root = project(view, point.x, point.y);
  const neighbour = project(view, point.x - inward.y * 0.92, point.y + inward.x * 0.92);
  const z = view.zoom;
  const age = rattle.struckAt === null ? -1 : time - rattle.struckAt;
  const swing = age >= 0 && age < 1.3 && !calmMotion() ? Math.sin(age * 24) * (1 - age / 1.3) * 0.72 : 0;
  const slack = age >= 0 ? 6 : 0;
  ctx.save();
  ctx.translate(root.x, root.y);
  ctx.scale(z, z);
  const x = (neighbour.x - root.x) / z;
  const y = (neighbour.y - root.y) / z;
  const side = view.rot === 0 ? 1 : -1;
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#69482e';
  ctx.beginPath();
  ctx.moveTo(-2 * side, 0);
  ctx.lineTo(0, -24);
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 15);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ba9d71';
  const startY = -20, controlY = y * 0.5 - 14 + slack, endY = y - 13;
  ctx.beginPath();
  ctx.moveTo(0, startY);
  ctx.quadraticCurveTo(x * 0.5, controlY, x, endY);
  ctx.stroke();
  // The tie is fixed partway along the wire, including after the wire goes slack.
  const t = 0.28, s = 1 - t;
  ctx.translate(x * t, s * s * startY + 2 * s * t * controlY + t * t * endY);
  ctx.rotate(side * (swing + (slack ? 0.22 : 0)));
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 4);
  ctx.stroke();
  ctx.fillStyle = '#344140';
  ctx.fillRect(-3.5, 4, 7, 8);
  ctx.fillStyle = '#b7b9a4';
  ctx.fillRect(-2.5, 3, 5, 7);
  ctx.fillStyle = '#e1d9b7';
  ctx.fillRect(-2.5, 3, 5, 1.5);
  ctx.restore();
}

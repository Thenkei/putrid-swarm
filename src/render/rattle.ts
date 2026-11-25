import { ENTRIES, LANES } from '../core/map';
import type { SectorId } from '../core/types';
import { sprite } from '../engine/assets';
import { calmMotion } from './lighting';
import { project, type View } from './projection';
import { castShadow } from './shadows';

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
  const stake = sprite('rattle_stake'), tins = sprite('rattle_tins');
  if (!stake || !tins) return;
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
  const tall = 39, short = 30;
  castShadow(ctx, 'rattle_stake', 0, 0, tall, false, 0.25);
  castShadow(ctx, 'rattle_stake', x, y, short, false, 0.25);
  const aspect = stake.w / stake.h;
  ctx.drawImage(stake.img, -tall * aspect / 2, -tall, tall * aspect, tall);
  ctx.drawImage(stake.img, x - short * aspect / 2, y - short, short * aspect, short);
  // Both ends of the wire meet the winding painted a third of the way down each stake.
  const startY = -tall * 0.66, endY = y - short * 0.66;
  const controlY = (startY + endY) / 2 + 3 + slack;
  ctx.beginPath();
  ctx.moveTo(0, startY);
  ctx.quadraticCurveTo(x * 0.5, controlY, x, endY);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#4a3830';
  ctx.stroke();
  ctx.lineWidth = 0.85;
  ctx.strokeStyle = '#c5ae8c';
  ctx.stroke();
  // The tie is fixed partway along the wire, including after the wire goes slack.
  const t = 0.43, s = 1 - t;
  ctx.translate(x * t, s * s * startY + 2 * s * t * controlY + t * t * endY);
  ctx.rotate(side * (swing + (slack ? 0.22 : 0)));
  const tinHeight = 19, tinWidth = tinHeight * tins.w / tins.h;
  // The eye of the hanging loop sits slightly right of centre in the painting.
  ctx.drawImage(tins.img, -tinWidth * 0.56, -tinHeight * 0.045, tinWidth, tinHeight);
  ctx.restore();
}

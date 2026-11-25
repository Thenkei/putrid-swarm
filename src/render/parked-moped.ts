import { mopedPath } from '../core/epics';
import { smoothstep } from '../core/math';
import type { SectorId } from '../core/types';
import { VISIBLE_DOORS } from '../house-layout';
import { outsideSillDepth } from './house';
import { sprite } from '../engine/assets';
import { calmMotion } from './lighting';
import { drawFallbackFrame, drawPaintedMoped, mopedMount } from './moped';
import { depthOf, project, type View } from './projection';

export interface ParkedMoped {
  readonly sector: SectorId;
  readonly previous: SectorId | undefined;
  readonly aimAge: number;
}

export function trackOpacity(age: number): number {
  return 1 - smoothstep(2.5, 3.6, age);
}

/** On its stand the moped rests against the jamb, leaving the doorway and its traps clear. */
export function mopedParkingSpot(sector: SectorId) {
  const [start] = mopedPath(sector);
  if (sector === 'portail') return { x: start.x + 1.05, y: start.y };
  if (sector === 'verger') return { x: start.x + 1.18, y: start.y - .55 };
  return start;
}

function track(view: View, sector: SectorId) {
  const [start, end] = mopedPath(sector);
  const from = project(view, start.x, start.y);
  const to = project(view, end.x, end.y);
  return { start, from, to, angle: Math.atan2(to.y - from.y, to.x - from.x) };
}

/** A single tyre's chevrons between the actual starting point and the hedge. */
export function drawMopedTracks(ctx: CanvasRenderingContext2D, view: View, moped: ParkedMoped) {
  if (moped.aimAge >= 3.6) return;
  const { from, to, angle } = track(view, moped.sector);
  const z = view.zoom;
  const length = Math.hypot(to.x - from.x, to.y - from.y) / z;
  const reveal = calmMotion() ? 1 : smoothstep(.12, .92, moped.aimAge);
  ctx.save();
  ctx.translate(from.x, from.y);
  ctx.rotate(angle);
  ctx.scale(z, z);
  ctx.globalAlpha *= trackOpacity(moped.aimAge);
  const tip = length * reveal;
  // Compressed earth joins the staggered tread blocks. The dusty shoulder catches the sun.
  if (tip > 12) {
    ctx.fillStyle = '#2e211b88';
    ctx.fillRect(12, -3.8, tip - 12, 7.6);
    ctx.fillStyle = '#ddba7870';
    ctx.fillRect(12, 3.5, tip - 12, 1.6);
  }
  ctx.beginPath();
  for (let x = 14; x < tip; x += 7.5) {
    ctx.moveTo(x - 1.8, -3.2); ctx.lineTo(x + 1.3, -.5);
    ctx.moveTo(x + 2.0, .5); ctx.lineTo(x - .7, 3.2);
  }
  ctx.lineWidth = 2.1;
  ctx.strokeStyle = '#d3af70';
  ctx.stroke();
  ctx.restore();
}

export function parkedMopedDrawable(ctx: CanvasRenderingContext2D, view: View, moped: ParkedMoped) {
  const { angle } = track(view, moped.sector);
  const start = mopedParkingSpot(moped.sector);
  const from = project(view, start.x, start.y);
  const depth = depthOf(view.rot, start.x, start.y);
  const painted = !!sprite('epic_moped_art');
  const mount = mopedMount(angle, painted);
  let beamAngle = angle;
  if (moped.previous && moped.aimAge < .48 && !calmMotion()) {
    const before = track(view, moped.previous).angle;
    const turn = Math.atan2(Math.sin(angle - before), Math.cos(angle - before));
    beamAngle = before + turn * smoothstep(0, .48, moped.aimAge);
  }
  return {
    depth: VISIBLE_DOORS[view.rot].includes(moped.sector) ? outsideSillDepth(view.rot, depth) : depth,
    draw: () => {
      ctx.save();
      ctx.translate(from.x, from.y);
      ctx.scale(view.zoom, view.zoom);
      ctx.fillStyle = '#281b166e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 27, 6.5, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      const lampX = painted ? 21 : 11, lampY = painted ? -24 : -13;
      ctx.translate(mount[0] * lampX + mount[4], mount[1] * lampX + lampY + mount[5]);
      ctx.rotate(beamAngle);
      const light = ctx.createLinearGradient(0, 0, 110, 0);
      light.addColorStop(0, '#fff1bcb8');
      light.addColorStop(.4, '#ffd66a5c');
      light.addColorStop(1, '#f9ce6800');
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.moveTo(0, -1.5); ctx.lineTo(110, -11); ctx.lineTo(110, 16); ctx.lineTo(0, 1.5);
      ctx.fill();
      ctx.restore();
      ctx.transform(...mount);
      if (!drawPaintedMoped(ctx)) drawFallbackFrame(ctx, 0);
      ctx.restore();
    },
  };
}

import { mopedImpact } from '../core/epics';
import { type SectorId } from '../core/types';
import { sprite } from '../engine/assets';
import { THRESHOLDS } from '../house-layout';
import { calmMotion } from './lighting';
import { paintedSource } from './painted-pixel';
import { depthOf, project, type View } from './projection';

// Keep the chipped red tank, the saddle and the teeth of Gérard's original painting.
// The wheel is cut out once; rotating the complete vehicle would turn its fork as well.
let chassis: HTMLCanvasElement | undefined;
let wheel: HTMLCanvasElement | undefined;
function prepareWreck() {
  if (chassis && wheel) return;
  const art = sprite('epic_moped_art');
  if (!art) return;
  chassis = document.createElement('canvas');
  chassis.width = 370; chassis.height = 320;
  const body = chassis.getContext('2d')!;
  body.beginPath();
  body.moveTo(0, 0); body.lineTo(360, 0); body.lineTo(344, 92);
  body.lineTo(353, 115); body.lineTo(326, 156); body.lineTo(301, 181);
  body.lineTo(302, 320); body.lineTo(0, 320); body.closePath(); body.clip();
  body.drawImage(art.img, 0, 0, 480, 320);
  body.globalCompositeOperation = 'source-atop';
  const soot = body.createLinearGradient(60, 74, 308, 251);
  soot.addColorStop(0, 'rgba(40,32,27,.12)'); soot.addColorStop(1, 'rgba(34,26,24,.61)');
  body.fillStyle = soot; body.fillRect(0, 0, 370, 320);

  wheel = document.createElement('canvas');
  wheel.width = wheel.height = 160;
  const rim = wheel.getContext('2d')!;
  rim.translate(80, 80);
  // Mirror the unbroken lower half of the tyre to remove the attached fork.
  for (const sign of [-1, 1]) {
    rim.save(); rim.scale(1, sign);
    rim.beginPath(); rim.ellipse(0, 0, 73, 79, 0, 0, Math.PI); rim.clip();
    rim.drawImage(art.img, -401, -232, 480, 320);
    rim.restore();
  }
  rim.fillStyle = '#574639';
  rim.beginPath(); rim.arc(0, 0, 9, 0, Math.PI * 2); rim.fill();
  // One bent, bright tooth makes the last revolutions readable even on a thumbnail.
  rim.fillStyle = '#d2b99a';
  rim.beginPath(); rim.moveTo(12, -27); rim.lineTo(27, -77); rim.lineTo(31, -23); rim.fill();
}

function wreckPlacement(view: View, sector: SectorId) {
  const end = mopedImpact(sector);
  const sill = THRESHOLDS[sector];
  // The bike's last momentum throws the frame past the centre of the scorch.
  const dx = end.x - sill.gx, dy = end.y - sill.gy;
  const travel = 1.05 / Math.hypot(dx, dy);
  const gx = end.x + dx * travel, gy = end.y + dy * travel;
  const point = project(view, gx, gy);
  const from = project(view, sill.gx, sill.gy);
  const angle = Math.atan2(point.y - from.y, point.x - from.x);
  return { ...point, dx: Math.cos(angle), dy: Math.sin(angle), angle, depth: depthOf(view.rot, gx, gy) };
}

// The attached rear tyre rests 26 stage pixels back along the skid. Draw and hit-test
// the broken frame about that tyre in its 370×320 crop.
const chassisX = -86 * 53 / 370, chassisY = -315 * 24 / 320;
const chassisTilt = .28;
const rollSeconds = 7, settledHeight = .36;
const wheelTurn = (roll: number): number => roll * (13 - 6.5 * roll / rollSeconds);

export function hitsMopedWreck(view: View, sector: SectorId, px: number, py: number, visible?: (depth: number) => boolean): boolean {
  const p = wreckPlacement(view, sector);
  const x = (px - p.x) / view.zoom, y = (py - p.y) / view.zoom;
  const cx = (x + 26 * p.dx) * Math.sign(p.dx), cy = y + 26 * p.dy;
  const u = (cx * Math.cos(chassisTilt) + cy * Math.sin(chassisTilt) - chassisX) / 53;
  const v = (cy * Math.cos(chassisTilt) - cx * Math.sin(chassisTilt) - chassisY) / 24;
  const wx = (x - 20 * p.dx) * Math.sign(p.dx), wy = (y - 20 * p.dy) / settledHeight + 12;
  const onBody = u >= 0 && u < 1 && v >= 0 && v < 1, onWheel = Math.hypot(wx, wy) <= 12;
  if (!onBody && !onWheel) return false;
  prepareWreck();
  if (!chassis || !wheel) return false;
  const turn = wheelTurn(rollSeconds);
  const wu = .5 + (wx * Math.cos(turn) + wy * Math.sin(turn)) / 24;
  const wv = .5 + (wy * Math.cos(turn) - wx * Math.sin(turn)) / 24;
  const painted = (onBody && paintedSource(chassis, u, v, 370 / 320)) || (onWheel && paintedSource(wheel, wu, wv, 1));
  return painted && (visible?.(p.depth + .2) ?? true);
}

export function wreckDrawable(ctx: CanvasRenderingContext2D, view: View, sector: SectorId, age: number) {
  const p = wreckPlacement(view, sector);
  return { depth: p.depth + .2, draw: () => {
    prepareWreck();
    if (!chassis || !wheel) return;
    // The blast is painted over the wreck. The freed wheel emerges as the smoke lifts,
    // slows, and tips onto its side. Later visits pick up the same settled pose.
    const t = calmMotion() ? 8 : Math.min(8, Math.max(0, age));
    const turn = wheelTurn(Math.min(rollSeconds, t));
    const fall = Math.max(0, Math.min(1, (t - 4.5) / 3));
    const height = 1 - (1 - settledHeight) * fall + .09 * Math.sin(t * 9) * fall * (1 - fall);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(view.zoom, view.zoom);
    ctx.fillStyle = 'rgba(35,25,20,.45)';
    ctx.beginPath(); ctx.ellipse(-3 * p.dx, -3 * p.dy, 33, 6, p.angle, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(-26 * p.dx, -26 * p.dy); ctx.scale(Math.sign(p.dx), 1); ctx.rotate(chassisTilt);
    ctx.drawImage(chassis, chassisX, chassisY, 53, 24); ctx.restore();
    ctx.translate(20 * p.dx, 20 * p.dy - 12 * height); ctx.scale(Math.sign(p.dx), height); ctx.rotate(turn);
    ctx.drawImage(wheel, -12, -12, 24, 24); ctx.restore();
  } };
}

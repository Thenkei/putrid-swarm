import { ENTRIES, LANES } from '../core/map';
import { sprite } from '../engine/assets';
import type { NightSim } from '../core/night';
import { calmMotion } from './lighting';
import { project, type View } from './projection';

import { MOPED_RUN_SECONDS as RUN_TIME } from '../core/epics';
const STEEL = '#b7ada0';
const paintedCels: HTMLCanvasElement[] = [];

/** The garage and CCTV use the same registered vehicle. The tips extend beyond the front tyre
 * so the special wheel keeps its silhouette in the small feeds and behind the night grading. */
export function drawPaintedMoped(ctx: CanvasRenderingContext2D, rotation = 0): boolean {
  const painted = sprite('epic_moped_art');
  if (!painted) return false;
  // Seven identical blades share a turn; six cels cover the sweep at both garage and CCTV sizes.
  const period = 2 * Math.PI / 7;
  const index = Math.floor((((rotation % period) + period) % period) / period * 6);
  let cel = paintedCels[index];
  if (!cel) {
    cel = document.createElement('canvas');
    cel.width = 210;
    cel.height = 138;
    const paint = cel.getContext('2d')!;
    paint.setTransform(3, 0, 0, 3, 99, 105);
    paintWheelCel(paint, painted.img, index * period / 6);
    paintedCels[index] = cel;
  }
  ctx.drawImage(cel, -33, -35, 70, 46);
  return true;
}

function paintWheelCel(ctx: CanvasRenderingContext2D, image: HTMLImageElement, rotation: number) {
  ctx.drawImage(image, -31, -34, 62, 41.33);
  ctx.save();
  ctx.translate(20.8, -4.5);
  ctx.scale(.94, 1);
  ctx.rotate(rotation);
  ctx.lineJoin = 'round';
  ctx.lineWidth = .8;
  for (let i = 0; i < 7; i++) {
    ctx.rotate(Math.PI * 2 / 7);
    ctx.fillStyle = '#979a96';
    ctx.strokeStyle = '#433b32';
    ctx.beginPath();
    ctx.moveTo(4.4, -1.2);
    ctx.lineTo(8.3, -2.4);
    ctx.lineTo(13.2, -3.7);
    ctx.lineTo(10.2, .15);
    ctx.lineTo(5, 1.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#f4e1b4';
    ctx.lineWidth = .65;
    ctx.beginPath();
    ctx.moveTo(8.3, -2.4);
    ctx.lineTo(12.6, -3.55);
    ctx.stroke();
  }
  ctx.fillStyle = '#685c49';
  ctx.beginPath(); ctx.arc(0, 0, 3.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d5b980';
  ctx.beginPath(); ctx.arc(-.4, -.6, 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Put the painted fork back in front of the disc.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(16,-20); ctx.lineTo(18,-21); ctx.lineTo(21.6,-5.8);
  ctx.lineTo(20.1,-4.5); ctx.closePath(); ctx.clip();
  ctx.drawImage(image, -31, -34, 62, 41.33);
  ctx.restore();
}

function wheel(ctx: CanvasRenderingContext2D, x: number, turn: number, blades: boolean) {
  ctx.save();
  ctx.translate(x, 0);
  ctx.fillStyle = '#231f1d';
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#97897b';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.rotate(turn);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.strokeStyle = '#786e62';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(5.5, 0);
    ctx.stroke();
    if (blades) {
      ctx.fillStyle = STEEL;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(9, -2);
      ctx.lineTo(6, 1.2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawMoped(ctx: CanvasRenderingContext2D, view: View, sim: NightSim) {
  const ride = sim.mopedRide;
  if (!ride) return;
  const entry = ENTRIES[ride.sector];
  const last = LANES[ride.sector][0]!;
  const origin = project(view, entry.x + .5, entry.y + .5);
  const end = project(view, last.x + .5, last.y + .5);
  const age = Math.max(0, sim.time - ride.start);
  const progress = Math.min(1, age / RUN_TIME);
  const x = origin.x + (end.x - origin.x) * progress;
  const y = origin.y + (end.y - origin.y) * progress;
  const radius = 85 * view.zoom;
  if (x + radius < view.x || x - radius > view.x + view.w || y + radius < view.y || y - radius > view.y + view.h) return;
  const still = calmMotion(), travel = progress < 1;
  const crashAge = age - RUN_TIME;
  const facing = end.x >= origin.x ? 1 : -1;
  const pitch = Math.atan2(end.y - origin.y, Math.abs(end.x - origin.x));

  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();
  ctx.translate(x, y);
  ctx.scale(view.zoom * facing, view.zoom);
  ctx.rotate(pitch * .65);

  // Exhaust and kick-up stay low enough to leave the infected visible on every feed.
  if (!still && travel) {
    for (let i = 0; i < 4; i++) {
      const phase = (age * 2 + i / 4) % 1;
      ctx.fillStyle = 'rgba(144,132,111,' + ((1 - phase) * .29) + ')';
      ctx.beginPath();
      ctx.ellipse(-12 - phase * 34, 1 - phase * 6, 2.5 + phase * 5, 1.2 + phase * 2.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = '#17141078';
  ctx.beginPath();
  ctx.ellipse(0, 3, 18, 3.8, 0, 0, Math.PI * 2);
  ctx.fill();

  const lift = !still && age < .38 ? -.21 * Math.sin(Math.PI * age / .38) : 0;
  const rebound = !still && !travel && crashAge < .6 ? Math.sin(crashAge * 24) * (.6 - crashAge) * .25 : 0;
  ctx.rotate(lift + rebound + (travel ? 0 : .10));
  // A headlamp illuminates the path long enough for the player to follow a single launch.
  const painted = sprite('epic_moped_art');
  const lampX = painted ? 21 : 11, lampY = painted ? -24 : -13;
  const beam = ctx.createLinearGradient(lampX, lampY, lampX + 65, lampY);
  beam.addColorStop(0, '#ffe7a15f');
  beam.addColorStop(1, '#ffe7a100');
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(lampX, lampY);
  ctx.lineTo(lampX + 66, lampY - 13);
  ctx.lineTo(lampX + 66, lampY + 19);
  ctx.closePath();
  ctx.fill();

  if (!drawPaintedMoped(ctx, still ? 0 : progress * 17)) {
    drawFallbackFrame(ctx, still ? 0 : progress * 30);
  }

  drawImpact(ctx, travel, crashAge, still, age);
  ctx.restore();
}

function drawFallbackFrame(ctx: CanvasRenderingContext2D, rotation: number) {
  wheel(ctx, -11, rotation, false);
  wheel(ctx, 12, rotation, true);
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#da8857';
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.lineTo(-7, -11);
  ctx.lineTo(0, -4);
  ctx.lineTo(7, -11);
  ctx.lineTo(12, 0);
  ctx.stroke();
  ctx.fillStyle = '#625d56';
  ctx.fillRect(-5, -6, 8, 6);
  ctx.fillStyle = '#ddd1ad';
  ctx.fillRect(-17, -10, 7, 2);
  ctx.strokeStyle = '#2e2924';
  ctx.beginPath();
  ctx.moveTo(-11,-12);
  ctx.lineTo(-3,-12);
  ctx.moveTo(8,-10);
  ctx.lineTo(6,-17);
  ctx.lineTo(2,-17);
  ctx.stroke();
  ctx.fillStyle = '#ffe5ad';
  ctx.fillRect(8,-15,4,3);
  ctx.fillStyle = '#bb4f38';
  ctx.fillRect(-16,-9,3,2);
}

function drawImpact(ctx: CanvasRenderingContext2D, travel: boolean, crashAge: number, still: boolean, age: number) {
  if (!travel && crashAge < .38 && !still) {
    ctx.strokeStyle = '#f3bf70';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) {
      const a = -1.55 + i * .52;
      const radius = 3 + crashAge * (34 + i * 6);
      ctx.beginPath();
      ctx.moveTo(15 + Math.cos(a) * radius, -4 + Math.sin(a) * radius);
      ctx.lineTo(15 + Math.cos(a) * (radius + 4), -4 + Math.sin(a) * (radius + 4));
      ctx.stroke();
    }
  }
  if (crashAge >= 0 && age < 8) {
    // The stuck horn is visible even with the sound off. A static pair of arcs serves reduced motion.
    const phase = still ? .5 : (crashAge * 1.25) % 1;
    ctx.strokeStyle = 'rgba(248,210,133,' + (.62 * (1 - phase)) + ')';
    ctx.lineWidth = 1.3;
    for (const radius of [12, 18]) {
      ctx.beginPath();
      ctx.arc(10, -12, radius + phase * 8, -.95, -.18);
      ctx.stroke();
    }
  }
}

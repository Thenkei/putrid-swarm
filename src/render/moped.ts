import { sprite } from '../engine/assets';
import type { NightSim } from '../core/night';
import { THRESHOLDS, VISIBLE_DOORS } from '../house-layout';
import { clipAtSill, doorSwing, outsideSillDepth } from './house';
import { calmMotion } from './lighting';
import { depthOf, project, type View } from './projection';

import { MOPED_RUN_SECONDS, MOPED_EXIT_SECONDS, MOPED_BLAST_RADIUS } from '../core/epics';
import blastSheet from './epic-moped-blast.webp';
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
  ctx.lineWidth = .9;
  for (let i = 0; i < 7; i++) {
    ctx.rotate(Math.PI * 2 / 7);
    ctx.fillStyle = '#c4c7c0';
    ctx.strokeStyle = '#302e29';
    ctx.beginPath();
    ctx.moveTo(4.4, -1.2);
    ctx.lineTo(8.3, -2.4);
    ctx.lineTo(14.5, -4.3);
    ctx.lineTo(10.1, 1.2);
    ctx.lineTo(5, 1.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fff3c7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8.3, -2.4);
    ctx.lineTo(14.0, -4.0);
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

type Ride = NonNullable<NightSim['mopedRide']>;

export function mopedDoorOpen(age: number): number {
  return doorSwing(age, 1.05, 1.40);
}

export function drawMopedBlast(ctx: CanvasRenderingContext2D, view: View, ride: Ride | null, time: number) {
  if (!ride || ride.blastAt === null) return;
  const impact = project(view, ride.impact.x, ride.impact.y);
  drawBlast(ctx, view, impact.x, impact.y, Math.max(0, time - ride.blastAt));
}


export function mopedRideDrawable(ctx: CanvasRenderingContext2D, view: View, ride: Ride, time: number) {
  const age = time - ride.start;
  if (age < .22 || ride.blastAt !== null) return;
  const front = VISIBLE_DOORS[view.rot].includes(ride.sector);
  if (!front && age < MOPED_EXIT_SECONDS) return;
  const sill = THRESHOLDS[ride.sector];
  const [start, next] = ride.path;
  const progress = Math.min(1, Math.max(0, (age - MOPED_EXIT_SECONDS) / MOPED_RUN_SECONDS));
  // Move along the same line through the painted sill and onto the simulated blade path.
  const t = Math.min(1, (age - .22) / (MOPED_EXIT_SECONDS - .22));
  const emergence = 2.25 * t * t * (1.8 - .8 * t) - 1.25;
  const gx = sill.gx + (start.x - sill.gx) * emergence + (next.x - start.x) * progress;
  const gy = sill.gy + (start.y - sill.gy) * emergence + (next.y - start.y) * progress;
  const { x, y } = project(view, gx, gy);
  const radius = 85 * view.zoom;
  if (x + radius < view.x || x - radius > view.x + view.w || y + radius < view.y || y - radius > view.y + view.h) return;
  const origin = project(view, start.x, start.y);
  const end = project(view, next.x, next.y);
  const facing = end.x >= origin.x ? 1 : -1;
  const pitch = Math.atan2(end.y - origin.y, Math.abs(end.x - origin.x));
  const depth = depthOf(view.rot, gx, gy);
  return {
    depth: front ? outsideSillDepth(view.rot, depth) : depth,
    draw: () => {
      ctx.save();
      ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip();
      if (front && age < 1.05) clipAtSill(ctx, view, ride.sector, facing);
      ctx.translate(x, y); ctx.scale(view.zoom * facing, view.zoom); ctx.rotate(pitch * .65);
      drawRiderlessMoped(ctx, age, progress, emergence);
      ctx.restore();
    },
  };
}

function drawRiderlessMoped(ctx: CanvasRenderingContext2D, age: number, progress: number, emergence: number) {
  const still = calmMotion();
  // Exhaust and kick-up stay low enough to leave the infected visible on every feed.
  if (!still) {
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

  const roll = age - .46;
  const lift = !still && roll > 0 && roll < .38 ? -.16 * Math.sin(Math.PI * roll / .38) : 0;
  ctx.rotate(lift);
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

  const turn = still ? 0 : (emergence + 1.25) * 2 + progress * 17;
  if (!drawPaintedMoped(ctx, turn)) {
    drawFallbackFrame(ctx, turn);
  }

  if (!still && painted) {
    ctx.translate(20.8, -4.5);
    ctx.strokeStyle = '#fce8b1b8';
    ctx.lineWidth = 1.2;
    const spin = age * 11;
    for (const a of [spin, spin + Math.PI]) {
      ctx.beginPath(); ctx.arc(0,0,14.2,a,a+.58); ctx.stroke();
    }
  }
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

// Each vignette is registered at ground contact, including the separate, flat scorch decal.
const blastArt = typeof Image === 'undefined' ? null : new Image();
if (blastArt) blastArt.src = blastSheet;

function blastCel(ctx: CanvasRenderingContext2D, cel: number, width: number,
  alpha: number, x = 0, footY = 0) {
  if (!blastArt?.complete || !blastArt.naturalWidth || alpha <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(blastArt, (cel % 2) * 384, Math.floor(cel / 2) * 384, 384, 384,
    x - width / 2, footY - width, width, width);
  ctx.globalAlpha = 1;
}

function drawBlast(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, age: number) {
  // An isometric circle of r world cells spans 2 * hypot(32,32) * r in screen-space X.
  const width = MOPED_BLAST_RADIUS * Math.hypot(32, 32) * 2;
  const reach = width * view.zoom;
  if (x + reach < view.x || x - reach > view.x + view.w || y + reach < view.y || y - reach > view.y + view.h) return;
  const still = calmMotion();
  ctx.save();
  ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip();
  ctx.translate(x, y); ctx.scale(view.zoom, view.zoom);

  // This footprint remains after the smoke has cleared and no longer has an intact vehicle.
  if (!blastArt?.naturalWidth) {
    ctx.fillStyle = '#20171380';
    ctx.beginPath(); ctx.ellipse(0, 0, width * .30, width * .085, -.06, 0, Math.PI * 2); ctx.fill();
  }
  blastCel(ctx, 3, width * .74, .94, 0, width * .115);
  if (age < 2.75) {
    const light = still ? .36 : Math.max(0, 1 - age / 1.1);
    if (light > 0) {
      ctx.save();
      ctx.scale(1, .47);
      const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, width * .53);
      pool.addColorStop(0, 'rgba(255,211,112,' + (.68 * light) + ')');
      pool.addColorStop(.52, 'rgba(249,137,61,' + (.42 * light) + ')');
      pool.addColorStop(1, 'rgba(238,100,27,0)');
      ctx.fillStyle = pool; ctx.fillRect(-width * .53, -width * .53, width * 1.06, width * 1.06);
      ctx.restore();
    }
    if (still) {
      // Fixed silhouettes and a steady local glow replace expansion, flying cinders and drift.
      blastCel(ctx, age < 1 ? 1 : 2, width * .64, age < 1 ? .9 : .62, 0, width * .055);
    } else {
      const swell = Math.min(1, age / .33);
      blastCel(ctx, 0, width * (.42 + .32 * swell), Math.max(0, 1 - age / .30), 0, width * .06);
      const fire = Math.min(1, age / .16) * Math.max(0, Math.min(1, (1.05 - age) / .50));
      blastCel(ctx, 1, width * (.49 + .39 * swell), fire, 0, width * .09);
      const smoke = Math.min(1, Math.max(0, (age - .47) / .51)) * Math.min(1, (2.75 - age) / 1.48);
      blastCel(ctx, 2, width * (.55 + Math.min(age, 2) * .105), smoke * .81, age * 5, width * .04 - age * 5);
    }
  }
  ctx.restore();
}

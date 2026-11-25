import { PARKED_CAR } from '../core/map';
import { sprite } from '../engine/assets';
import type { ApproachShot } from './hero-approach';
import { clamp01, smoothstep } from './noise';
import { project, type Point, type View } from './projection';

interface Perch extends Point { readonly lift: number }
// The timber and bonnet surfaces were measured in both wagon paintings.
const rack = { x: PARKED_CAR.x + 1.25, y: PARKED_CAR.y + 1.11, lift: 70 };
const bonnet = { x: PARKED_CAR.x + .97, y: PARKED_CAR.y + 2.52, lift: 38 };
const gravel = { x: PARKED_CAR.x + 1.26, y: PARKED_CAR.y + 3.86, lift: 0 };
const verge = { x: PARKED_CAR.x + .72, y: PARKED_CAR.y + 4.75, lift: 0 };

export const CAT_BONNET_AT = 1.30;
export const CAT_LANDS_AT = 1.91;
export const CAT_SETTLES_AT = 2.79;

export function catWakeTime(shot: ApproachShot): number {
  // A boot within earshot wakes it whichever side of the car the driver comes from.
  return shot.cues.find(cue => cue.position && Math.hypot(cue.position.x - rack.x, cue.position.y - rack.y) < 4)?.at ?? shot.intro;
}

export interface YardCatPose extends Perch {
  readonly cel: number;
  readonly stretch: number;
  readonly tilt: number;
  readonly shadow: Perch;
  readonly opacity: number;
}

function onSurface(at: Perch, cel: number, stretch = 1): YardCatPose {
  return { ...at, cel, stretch, tilt: 0, shadow: at, opacity: 1 };
}

function leap(from: Perch, to: Perch, t: number, height: number): YardCatPose {
  // Leave the first shadow on its own surface; the second gathers below the incoming paws.
  const near = t < .5;
  return {
    x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t,
    lift: from.lift + (to.lift - from.lift) * t + 4 * height * t * (1 - t),
    // Nose up at takeoff, forepaws down for the catch. Rotate about the belly.
    cel: 4, stretch: 1, tilt: .12 - .43 * t, shadow: near ? from : to,
    opacity: near ? 1 - smoothstep(0, .36, t) : smoothstep(.52, 1, t),
  };
}

/** Local time starts with the audible boot strike. Positions and contact shadows share the car's grid registration. */
export function sampleYardCat(t: number): YardCatPose {
  if (t < 0) return onSurface(rack, 0, 1 + .025 * Math.sin(t * 4));
  if (t < .34) return onSurface(rack, 1);
  if (t < .69) return onSurface(rack, 2, .97 + .06 * Math.sin(Math.PI * (t - .34) / .35));
  if (t < .90) return onSurface(rack, 3);
  if (t < CAT_BONNET_AT) return leap(rack, bonnet, (t - .90) / (CAT_BONNET_AT - .90), 15);
  if (t < 1.49) return onSurface(bonnet, 3, 1 - .14 * Math.sin(Math.PI * (t - CAT_BONNET_AT) / .19));
  if (t < CAT_LANDS_AT) return leap(bonnet, gravel, (t - 1.49) / (CAT_LANDS_AT - 1.49), 11);
  if (t < CAT_LANDS_AT + .13) return onSurface(gravel, 3, .90);
  if (t < CAT_SETTLES_AT) {
    const run = clamp01((t - CAT_LANDS_AT - .13) / (CAT_SETTLES_AT - CAT_LANDS_AT - .13));
    const distance = 1 - (1 - run) ** 1.4;
    const stride = distance * 5;
    const at = { x: gravel.x + (verge.x - gravel.x) * distance, y: gravel.y + (verge.y - gravel.y) * distance, lift: 0 };
    return { ...onSurface(at, 5 + Math.floor(stride) % 2), lift: 1.3 * Math.sin(Math.PI * stride) ** 2 };
  }
  return onSurface(verge, 7, 1 + .016 * Math.sin((t - CAT_SETTLES_AT) * 3.4));
}

export function drawYardCat(ctx: CanvasRenderingContext2D, view: View, cat: YardCatPose): void {
  const art = sprite('yard_cat');
  if (!art) return;
  const z = view.zoom;
  const paw = project(view, cat.x, cat.y);
  const shadow = project(view, cat.shadow.x, cat.shadow.y);
  ctx.save();
  ctx.translate(shadow.x, shadow.y - cat.shadow.lift * z);
  ctx.scale(9 * z, 2.8 * z);
  const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  shade.addColorStop(0, 'rgba(43,29,18,.47)');
  shade.addColorStop(1, 'rgba(43,29,18,0)');
  ctx.globalAlpha *= cat.opacity;
  ctx.fillStyle = shade;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
  const w = art.w / 4, h = art.h / 2;
  const height = 32 * cat.stretch * z;
  ctx.save();
  ctx.translate(paw.x, paw.y - cat.lift * z - height * .28);
  if (view.rot === 1) ctx.scale(-1, 1);
  ctx.rotate(cat.tilt);
  ctx.drawImage(art.img, cat.cel % 4 * w, Math.floor(cat.cel / 4) * h, w, h,
    -24 * z, -height * (.875 - .28), 48 * z, height);
  ctx.restore();
}

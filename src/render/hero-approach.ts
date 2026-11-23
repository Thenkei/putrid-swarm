import { PARKED_CAR } from '../core/map';
import { sprite, type Sprite } from '../engine/assets';
import { clipAtSill, doorSwing, houseDamageStage } from './house';
import { DOOR_OUTWARD, THRESHOLDS } from '../house-layout';
import { clamp01, smoothstep } from './noise';
import { unproject, type Point, type View } from './projection';
import { HOUSE_PAINT_SCALE, houseOffset } from './registration';

type Start = 'portail' | 'window' | 'grange';
type Foot = readonly [number, number];
type Cue = { readonly at: number; readonly sound: 'moped_door' | 'step_shed' | 'hand' };
const STARTS: readonly Start[] = ['portail', 'window', 'grange'];
const HERO_HEIGHT = 78;
const WALK_STEP = 0.135;
const WALK_SPEED = 3.9;
const SLOW_AT_CAR = 0.30;
const TURN_AT_CAR = 0.20;
const UNLATCH_AT = 0.20;
const FIRST_STEP = 0.51;
const INSIDE_SILL = -1.18;
const OUTSIDE_SILL = 1.25;
const HOUSE_FOOT_Y = 723;
const EAVE_Y = 486;

// Measured relative to each cell in the original sheets. Anchor the walk below
// the hips and the descent cels at the boots, regardless of their silhouette.
const RIGHT_FEET: readonly Foot[] = [[216, 400], [218, 395], [216, 398], [219, 396], [208, 371], [217, 282], [207, 422], [220, 353]];
const RIGHT_ONE_ARM_FEET: readonly Foot[] = [[227, 431], [206, 424], [215, 433], [209, 435], [225, 454], [204, 362], [206, 447], [215, 432]];
const LEFT_FEET: readonly Foot[] = [[216, 433], [213, 417], [217, 434], [218, 421], [207, 439], [212, 422], [213, 440], [210, 427]];

interface WalkSegment {
  readonly from: Point;
  readonly to: Point;
  readonly distance: number;
  readonly left: boolean;
}

export interface ApproachShot {
  readonly start: Start;
  readonly right: Sprite;
  readonly left: Sprite;
  readonly oneArmed: boolean;
  readonly intro: number;
  readonly duration: number;
  readonly walk: readonly WalkSegment[];
  readonly distance: number;
  readonly cues: readonly Cue[];
}

export interface ApproachingHero {
  readonly shot: ApproachShot;
  readonly position: Point;
  readonly lift: number;
  readonly frame: number;
  readonly left: boolean;
  readonly opening: number;
  /** First step inside the hall through to both boots on the landing. */
  readonly emergence?: number;
}

function housePoint(x: number, y: number): Point {
  const { dx, lift } = houseOffset(0, x, y);
  const point = unproject(THRESHOLDS.portail.view, dx, -lift);
  return { x: point.gx, y: point.gy };
}

const LANDING = housePoint(242, HOUSE_FOOT_Y);

function stepFromSill(sector: 'portail' | 'grange', distance: number): Point {
  const sill = THRESHOLDS[sector];
  const [nx, ny] = DOOR_OUTWARD[sector];
  return { x: sill.gx + nx * distance, y: sill.gy + ny * distance };
}

export function heroApproachShot(outings: number, oneArmed: boolean, houseHealth: number): ApproachShot | null {
  const right = sprite(oneArmed ? 'hero_departure_one_arm' : 'hero_departure');
  const left = sprite('hero_departure_left');
  if (!right || !left) return null;
  let start = STARTS[outings % STARTS.length] ?? 'portail';
  const damage = houseDamageStage(houseHealth);
  if (damage === 5) start = 'grange';
  else if (start === 'window' && damage >= 3) start = 'portail';

  const tail = { x: PARKED_CAR.x + (oneArmed ? 2.44 : 2.83), y: PARKED_CAR.y + (oneArmed ? 1.09 : 1.22) };
  const landing = start === 'window' ? LANDING : stepFromSill(start, OUTSIDE_SILL);
  const points = start === 'grange'
    ? [landing, { x: 15.7, y: 10.22 }, { x: 17.15, y: 11.48 }, { x: 17.75, y: 12.28 }, tail]
    : [landing, { x: 12.7, y: 14.55 }, { x: 14.85, y: 16.04 }, { x: 17.25, y: 16.12 }, tail];
  const walk = points.slice(1).map((to, index) => {
    const from = points[index]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return { from, to, distance: Math.hypot(dx, dy), left: dx < dy };
  });
  const distance = walk.reduce((total, segment) => total + segment.distance, 0);
  const intro = start === 'window' ? (oneArmed ? 2.08 : 1.68) : (oneArmed ? 1.51 : 1.31);
  const duration = intro + distance / WALK_SPEED + SLOW_AT_CAR / 2 + TURN_AT_CAR;
  const cues: Cue[] = [];
  if (start === 'window') {
    cues.push({ at: intro * 0.46, sound: 'hand' }, { at: intro * 0.85, sound: 'step_shed' });
  } else {
    cues.push({ at: UNLATCH_AT, sound: 'moped_door' }, { at: FIRST_STEP + .24, sound: 'step_shed' }, { at: intro - .09, sound: 'step_shed' });
  }
  for (let at = intro + WALK_STEP; at < duration - TURN_AT_CAR; at += 2 * WALK_STEP) cues.push({ at, sound: 'step_shed' });
  return { start, right, left, oneArmed, intro, duration, walk, distance, cues };
}

export function sampleApproach(shot: ApproachShot, time: number): ApproachingHero {
  const opening = shot.start === 'window' ? 1 : doorSwing(time - UNLATCH_AT, shot.intro + .03 - UNLATCH_AT, shot.intro + .45 - UNLATCH_AT);
  if (shot.start !== 'window' && time < shot.intro) {
    const emergence = smoothstep(FIRST_STEP, shot.intro, time);
    const stride = INSIDE_SILL + (OUTSIDE_SILL - INSIDE_SILL) * emergence;
    return { shot, position: stepFromSill(shot.start, stride),
      frame: Math.floor(emergence * 4) % 4, lift: 0, left: shot.start === 'portail', opening, emergence };
  }
  if (shot.start === 'window' && time < shot.intro) {
    const progress = clamp01(time / shot.intro);
    const frame = progress < 0.25 ? 4 : progress < 0.52 ? 5 : progress < 0.82 ? 6 : 7;
    const hang = (shot.oneArmed ? 444 / 402 : 422 / 365) * HERO_HEIGHT / HOUSE_PAINT_SCALE;
    const bootsY = frame === 4 ? 444 + 9 * smoothstep(0.05, 0.25, progress)
      : frame === 5 ? 453 + 31 * smoothstep(0.25, 0.52, progress)
      : frame === 6 ? Math.min(HOUSE_FOOT_Y - 5, EAVE_Y + hang)
      : HOUSE_FOOT_Y;
    return { shot, position: LANDING, frame, left: false, lift: (HOUSE_FOOT_Y - bootsY) * HOUSE_PAINT_SCALE, opening: 1 };
  }

  const walkTime = Math.max(0, time - shot.intro);
  const remaining = Math.max(0, shot.duration - TURN_AT_CAR - time);
  const last = shot.walk[shot.walk.length - 1]!;
  if (remaining === 0) return { shot, position: last.to, frame: 1, left: true, lift: 0, opening };
  const travelled = remaining < SLOW_AT_CAR ? shot.distance - WALK_SPEED * remaining * remaining / (2 * SLOW_AT_CAR) : WALK_SPEED * walkTime;
  let distance = travelled;
  let segment = shot.walk[0]!;
  for (const step of shot.walk) {
    segment = step;
    if (distance <= step.distance || step === last) break;
    distance -= step.distance;
  }
  const progress = clamp01(distance / segment.distance);
  const position = {
    x: segment.from.x + (segment.to.x - segment.from.x) * progress,
    y: segment.from.y + (segment.to.y - segment.from.y) * progress,
  };
  return { shot, position, frame: Math.floor(travelled / (WALK_SPEED * WALK_STEP)) % 4,
    left: segment.left, lift: 0, opening };
}

export function approachView(shot: ApproachShot, time: number, boarding: View): View {
  const from = shot.start === 'window' ? { cx: 11.18, cy: 9.95, zoom: 1.85 }
    : shot.start === 'grange' ? { cx: 13.15, cy: 9.7, zoom: 2.05 } : { cx: 10.7, cy: 11.7, zoom: 2.05 };
  const progress = smoothstep(shot.intro * 0.75, shot.duration, time);
  return {
    ...boarding,
    cx: from.cx + (boarding.cx - from.cx) * progress,
    cy: from.cy + (boarding.cy - from.cy) * progress,
    zoom: from.zoom + (boarding.zoom - from.zoom) * progress,
  };
}

export function drawApproachingHero(ctx: CanvasRenderingContext2D, hero: ApproachingHero, foot: Point, view: View): void {
  const { shot, frame, left } = hero;
  if (hero.emergence === 0) return;
  const zoom = view.zoom;
  const picture = left ? shot.left : shot.right;
  const cell = frame + (left && shot.oneArmed ? 4 : 0);
  const [x, y] = (left ? LEFT_FEET : shot.oneArmed ? RIGHT_ONE_ARM_FEET : RIGHT_FEET)[cell]!;
  const rawW = left ? 1661 : 1659;
  const rawH = left ? 947 : 948;
  const rawX = Math.round((cell % 4) * rawW / 4);
  const rawY = Math.round(Math.floor(cell / 4) * rawH / 2);
  const cellW = Math.round((cell % 4 + 1) * rawW / 4) - rawX;
  // The hanging cel's fingertips are close to the bottom of the right walk row.
  const cellH = !left && !shot.oneArmed && frame < 4 ? 418 : Math.round((Math.floor(cell / 4) + 1) * rawH / 2) - rawY;
  const scale = zoom * HERO_HEIGHT / (left ? 405 : shot.oneArmed ? 402 : 365) * (frame === 4 ? 0.87 : 1);
  ctx.save();
  if (hero.emergence !== undefined && shot.start !== 'window') {
    clipAtSill(ctx, view, shot.start, left ? -1 : 1);
    // Duck under the lintel and straighten as the trailing boot comes out onto the step.
    const upright = .76 + .24 * smoothstep(.5, .94, hero.emergence);
    ctx.translate(foot.x, foot.y); ctx.scale(1, upright); ctx.translate(-foot.x, -foot.y);
  }
  ctx.drawImage(picture.img, rawX * picture.w / rawW, rawY * picture.h / rawH, cellW * picture.w / rawW, cellH * picture.h / rawH,
    foot.x - x * scale, foot.y - y * scale - hero.lift * zoom, cellW * scale, cellH * scale);
  ctx.restore();
}

/** Interior seen through the intact painted jambs during the departure. */
export function drawApproachWindow(ctx: CanvasRenderingContext2D, hero: ApproachingHero, house: Point, zoom: number): void {
  if (hero.shot.start !== 'window' || hero.opening <= 0) return;
  const { dx, lift } = houseOffset(0, 0, 0);
  ctx.save();
  ctx.translate(house.x + dx * zoom, house.y - lift * zoom);
  ctx.scale(HOUSE_PAINT_SCALE * zoom, HOUSE_PAINT_SCALE * zoom);
  ctx.globalAlpha *= hero.opening;
  ctx.beginPath();
  ctx.moveTo(212, 280);
  ctx.lineTo(268, 287);
  ctx.lineTo(268, 361);
  ctx.lineTo(212, 354);
  ctx.closePath();
  const shade = ctx.createLinearGradient(0, 280, 0, 360);
  shade.addColorStop(0, '#1c150f');
  shade.addColorStop(0.7, '#2d2118');
  shade.addColorStop(1, '#503726');
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#38271c';
  ctx.stroke();
  ctx.restore();
}

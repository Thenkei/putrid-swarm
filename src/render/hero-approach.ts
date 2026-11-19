import { HOUSE_CENTER, PARKED_CAR } from '../core/map';
import { sprite, type Sprite } from '../engine/assets';
import { THRESHOLDS, houseDamageStage } from './house';
import { clamp01, smoothstep } from './noise';
import { unproject, type Point, type View } from './projection';
import { HOUSE_PAINT_SCALE, houseOffset } from './registration';

type Start = 'door' | 'window' | 'woodshed';
type Foot = readonly [number, number];
type Cue = { readonly at: number; readonly sound: 'door' | 'step_shed' | 'hand' };
const STARTS: readonly Start[] = ['door', 'window', 'woodshed'];
const HERO_HEIGHT = 78;
const WALK_STEP = 0.135;
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
}

function housePoint(x: number, y: number): Point {
  const { dx, lift } = houseOffset(0, x, y);
  const point = unproject(THRESHOLDS.portail.view, dx, -lift);
  return { x: point.gx, y: point.gy };
}

const LANDING = housePoint(242, HOUSE_FOOT_Y);

export function heroApproachShot(outings: number, oneArmed: boolean, houseHealth: number): ApproachShot | null {
  const right = sprite(oneArmed ? 'hero_departure_one_arm' : 'hero_departure');
  const left = sprite('hero_departure_left');
  if (!right || !left) return null;
  let start = STARTS[outings % STARTS.length] ?? 'door';
  const damage = houseDamageStage(houseHealth);
  if (damage === 5) start = 'woodshed';
  else if (start === 'window' && damage >= 3) start = 'door';

  const tail = { x: PARKED_CAR.x + (oneArmed ? 2.44 : 2.83), y: PARKED_CAR.y + (oneArmed ? 1.09 : 1.22) };
  const points = start === 'woodshed'
    ? [{ x: 14.02, y: 8.02 }, { x: 15.7, y: 8.82 }, { x: 16.78, y: 10.72 }, { x: 17.75, y: 12.18 }, tail]
    : [start === 'window' ? LANDING : housePoint(245, 678), { x: 12.7, y: 14.55 }, { x: 14.85, y: 16.04 }, { x: 17.25, y: 16.12 }, tail];
  const walk = points.slice(1).map((to, index) => {
    const from = points[index]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    return { from, to, distance: Math.hypot(dx, dy), left: dx < dy };
  });
  const distance = walk.reduce((total, segment) => total + segment.distance, 0);
  const intro = start === 'window' ? (oneArmed ? 2.08 : 1.68) : start === 'door' ? 0.24 : 0.36;
  const duration = intro + distance / 3.9;
  const cues: Cue[] = [];
  if (start === 'door') cues.push({ at: 0.15, sound: 'door' });
  if (start === 'woodshed') cues.push({ at: 0.22, sound: 'hand' });
  if (start === 'window') {
    cues.push({ at: intro * 0.46, sound: 'hand' }, { at: intro * 0.85, sound: 'step_shed' });
  }
  for (let at = intro + WALK_STEP; at < duration - 0.07; at += 2 * WALK_STEP) cues.push({ at, sound: 'step_shed' });
  return { start, right, left, oneArmed, intro, duration, walk, distance, cues };
}

export function sampleApproach(shot: ApproachShot, time: number): ApproachingHero {
  if (shot.start === 'woodshed' && time < shot.intro) {
    return { shot, position: shot.walk[0]!.from, frame: 7, left: false, lift: 0, opening: 0 };
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
  let distance = shot.distance * clamp01(walkTime / (shot.duration - shot.intro));
  let segment = shot.walk[0]!;
  for (const step of shot.walk) {
    segment = step;
    if (distance <= step.distance) break;
    distance -= step.distance;
  }
  const progress = clamp01(distance / segment.distance);
  const position = {
    x: segment.from.x + (segment.to.x - segment.from.x) * progress,
    y: segment.from.y + (segment.to.y - segment.from.y) * progress,
  };
  const opening = shot.start === 'window' ? 1 : shot.start === 'door' ? 1 - smoothstep(0.46, 0.8, time) : 0;
  return { shot, position, frame: Math.floor(walkTime / WALK_STEP) % 4, left: segment.left, lift: 0, opening };
}

export function approachView(shot: ApproachShot, time: number, boarding: View): View {
  const from = shot.start === 'woodshed' ? { cx: 14.55, cy: 8.7, zoom: 2 } : { cx: 11.18, cy: 9.95, zoom: 1.85 };
  const progress = smoothstep(shot.intro * 0.75, shot.duration, time);
  return {
    ...boarding,
    cx: from.cx + (boarding.cx - from.cx) * progress,
    cy: from.cy + (boarding.cy - from.cy) * progress,
    zoom: from.zoom + (boarding.zoom - from.zoom) * progress,
  };
}

export function drawApproachingHero(ctx: CanvasRenderingContext2D, hero: ApproachingHero, foot: Point, zoom: number): void {
  const { shot, frame, left } = hero;
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
  ctx.drawImage(picture.img, rawX * picture.w / rawW, rawY * picture.h / rawH, cellW * picture.w / rawW, cellH * picture.h / rawH,
    foot.x - x * scale, foot.y - y * scale - hero.lift * zoom, cellW * scale, cellH * scale);
}

/** Interior seen through the intact painted jambs during the departure. */
export function drawApproachOpening(ctx: CanvasRenderingContext2D, hero: ApproachingHero, house: Point, zoom: number): void {
  if (hero.opening <= 0) return;
  const window = hero.shot.start === 'window';
  const { dx, lift } = houseOffset(0, 0, 0);
  ctx.save();
  ctx.translate(house.x + dx * zoom, house.y - lift * zoom);
  ctx.scale(HOUSE_PAINT_SCALE * zoom, HOUSE_PAINT_SCALE * zoom);
  ctx.globalAlpha *= hero.opening;
  ctx.beginPath();
  if (window) {
    ctx.moveTo(212, 280);
    ctx.lineTo(268, 287);
    ctx.lineTo(268, 361);
    ctx.lineTo(212, 354);
  } else {
    ctx.moveTo(201, 525);
    ctx.quadraticCurveTo(235, 474, 289, 521);
    ctx.lineTo(289, 677);
    ctx.lineTo(201, 658);
  }
  ctx.closePath();
  const shade = ctx.createLinearGradient(0, window ? 280 : 499, 0, window ? 360 : 674);
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

export function approachDepth(hero: ApproachingHero, depth: number): number {
  // A figure at the front sill belongs in front of the facade even while elevated.
  return hero.shot.start === 'woodshed' ? depth : Math.max(HOUSE_CENTER.x + HOUSE_CENTER.y + 1.25, depth);
}

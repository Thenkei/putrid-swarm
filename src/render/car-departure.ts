import { GRID_W, PARKED_CAR } from '../core/map';
import { sprite, type Sprite } from '../engine/assets';
import { clamp01, smoothstep } from './noise';
import { PROP_FEET } from './registration';
import type { Point } from './projection';
import { roadCentre } from './terrainfield';

// Seconds spent approaching, opening the door, ducking in, then pulling it shut.
// With one hand he has to turn, brace and change his grip before the door can close.
const BOARDING = [0.36, 0.65, 0.98, 1.25] as const;
const BOARDING_ONE_ARM = [0.53, 1.22, 1.94, 2.37] as const;
const IGNITION_DELAY = 0.1;
const ROLL_DELAY = 0.45;
const REVERSE_SECONDS = 1.12;
const SHIFT_SECONDS = 0.16;
const EXIT_SECONDS = 1.9;
const FORWARD_START = REVERSE_SECONDS + SHIFT_SECONDS;
const PARKED = { x: PARKED_CAR.x + PARKED_CAR.w / 2, y: PARKED_CAR.y + PARKED_CAR.h / 2 };
const REVERSE_RADIUS = 1.85;
const TURN_RADIUS = 3.6;
const REVERSE_TURN = 65 * Math.PI / 180;
const ROAD_TURN = Math.PI / 2;
const ROAD_Y = roadCentre('barn', PARKED.x);
const BACKED_OUT = {
  x: PARKED.x - REVERSE_RADIUS * (1 - Math.cos(REVERSE_TURN)),
  y: ROAD_Y - TURN_RADIUS * (1 - Math.sin(REVERSE_TURN)),
};
const STRAIGHT_REVERSE = PARKED.y - BACKED_OUT.y - REVERSE_RADIUS * Math.sin(REVERSE_TURN);
const REVERSE_DISTANCE = STRAIGHT_REVERSE + REVERSE_RADIUS * REVERSE_TURN;
const ROAD_ENTRY_X = BACKED_OUT.x + TURN_RADIUS * Math.cos(REVERSE_TURN);
const EXIT_X = GRID_W + 4.2;
// The accelerating turn ends at the same speed as the run along the road.
const TURN_SECONDS = 2 * TURN_RADIUS * (ROAD_TURN - REVERSE_TURN) * EXIT_SECONDS / (EXIT_X - ROAD_ENTRY_X);
const MANEUVER_SECONDS = FORWARD_START + TURN_SECONDS + EXIT_SECONDS;

export function carManeuver(elapsed: number): { position: Point; yaw: number } {
  if (elapsed < FORWARD_START) {
    // Clear the bay first, then swing the rear toward the barn while still in reverse.
    const distance = REVERSE_DISTANCE * smoothstep(0, REVERSE_SECONDS, elapsed);
    const turn = Math.max(0, distance - STRAIGHT_REVERSE) / REVERSE_RADIUS;
    return {
      position: {
        x: PARKED.x - REVERSE_RADIUS * (1 - Math.cos(turn)),
        y: PARKED.y - Math.min(STRAIGHT_REVERSE, distance) - REVERSE_RADIUS * Math.sin(turn),
      },
      yaw: -turn,
    };
  }
  if (elapsed < FORWARD_START + TURN_SECONDS) {
    const progress = (elapsed - FORWARD_START) / TURN_SECONDS;
    const turn = REVERSE_TURN + (ROAD_TURN - REVERSE_TURN) * progress * progress;
    return {
      position: {
        x: BACKED_OUT.x + TURN_RADIUS * (Math.cos(REVERSE_TURN) - Math.cos(turn)),
        y: BACKED_OUT.y + TURN_RADIUS * (Math.sin(turn) - Math.sin(REVERSE_TURN)),
      },
      yaw: -turn,
    };
  }
  const progress = clamp01((elapsed - FORWARD_START - TURN_SECONDS) / EXIT_SECONDS);
  const x = ROAD_ENTRY_X + (EXIT_X - ROAD_ENTRY_X) * progress;
  const y = roadCentre('barn', x);
  const slope = (roadCentre('barn', x + 0.01) - roadCentre('barn', x - 0.01)) / 0.02;
  return { position: { x, y }, yaw: Math.atan2(-1, slope) };
}

interface CarArt {
  readonly art: Sprite;
  readonly columnCut: number;
  // The car body within a cell (left, top, width and height), in source pixels.
  readonly body: readonly [number, number, number, number];
}

interface DepartureShot {
  readonly boarding: CarArt;
  readonly driver: Sprite;
  readonly turn: Sprite;
  readonly poseEnds: readonly number[];
  readonly latchAt: number;
  readonly ignitionAt: number;
  readonly rollAt: number;
  readonly forwardAt: number;
  readonly duration: number;
}

export type DepartingCar = { readonly position: Point } & (
  | { readonly kind: 'boarding'; readonly picture: CarArt; readonly pose: number }
  | { readonly kind: 'driving'; readonly driver: Sprite; readonly turn: Sprite; readonly yaw: number; readonly shake: number }
);

export function carDepartureShot(oneArmed: boolean): DepartureShot | null {
  const boarding = sprite(oneArmed ? 'car_boarding_one_arm' : 'car_boarding');
  const driver = sprite('car_driver');
  const turn = sprite('car_turn_road');
  if (!boarding || !driver || !turn) return null;
  const poseEnds = oneArmed ? BOARDING_ONE_ARM : BOARDING;
  const latchAt = poseEnds[3];
  return {
    boarding: {
      art: boarding,
      // The retouched right-hand poses start 32 px left of the atlas midpoint.
      columnCut: oneArmed ? 736 : 768,
      body: oneArmed ? [4, 7, 630, 474] : [17, 12, 621, 466],
    },
    driver,
    turn,
    poseEnds,
    latchAt,
    ignitionAt: latchAt + IGNITION_DELAY,
    rollAt: latchAt + ROLL_DELAY,
    forwardAt: latchAt + ROLL_DELAY + FORWARD_START,
    duration: latchAt + ROLL_DELAY + MANEUVER_SECONDS,
  };
}

export function departingCar(shot: DepartureShot, time: number): DepartingCar {
  const pose = shot.poseEnds.findIndex((end) => time < end);
  if (pose >= 0) return { kind: 'boarding', position: PARKED, picture: shot.boarding, pose };
  const crank = time - shot.ignitionAt;
  const shake = crank >= 0 && time < shot.rollAt ? Math.sin(crank * 75) * (1 - crank / (ROLL_DELAY - IGNITION_DELAY)) : 0;
  return { kind: 'driving', driver: shot.driver, turn: shot.turn, ...carManeuver(time - shot.rollAt), shake };
}

/** The rack and wheelbase are registered to the same point as the parked yard sprite. */
export function drawDepartingCar(ctx: CanvasRenderingContext2D, car: DepartingCar, root: Point, height: number): void {
  if (car.kind === 'driving') {
    drawDrivingCar(ctx, car, root, height);
    return;
  }
  const { art, columnCut, body } = car.picture;
  const [left, top, width, bodyHeight] = body;
  const [footX, footY] = PROP_FEET.car[0];
  const rightColumn = car.pose % 2 === 1;
  const cellW = rightColumn ? 1536 - columnCut : columnCut;
  const sourceX = rightColumn ? art.w * columnCut / 1536 : 0;
  const sourceY = Math.floor(car.pose / 2) * art.h / 2;
  const scale = height / bodyHeight;
  const x = root.x - (left + width * footX) * scale;
  const y = root.y - (top + bodyHeight * footY) * scale;
  ctx.drawImage(art.img, sourceX, sourceY, art.w * cellW / 1536, art.h / 2, x, y, cellW * scale, 512 * scale);
}

// Axle landmarks in source cel pixels. The head-on view uses the axle centres because
// its rear tyres are hidden. The other views register to the side facing the camera.
const DRIVER_TYRES = { front: { x: 653, y: 1037 }, rear: { x: 1221, y: 743 }, side: 1 };
const TURN_TYRES = [
  { maxTurn: 33, front: { x: 430, y: 499 }, rear: { x: 565, y: 321 }, side: 1 },
  { maxTurn: 56, front: { x: 379, y: 499 }, rear: { x: 379, y: 327 }, side: 0 },
  { maxTurn: 78, front: { x: 346, y: 499 }, rear: { x: 212, y: 319 }, side: -1 },
  { maxTurn: Infinity, front: { x: 402, y: 499 }, rear: { x: 166, y: 347 }, side: -1 },
] as const;
const DRIVER_HEIGHT = 1029;
const WHEELBASE = (DRIVER_TYRES.rear.x - DRIVER_TYRES.front.x) / DRIVER_HEIGHT;
const HALF_TRACK = ((DRIVER_TYRES.front.x + DRIVER_TYRES.rear.x) / 2 - 741) / DRIVER_HEIGHT;

/** Keep both tyre contacts on the projected axle during a change of painted angle. */
function drawDrivingCar(ctx: CanvasRenderingContext2D, car: Extract<DepartingCar, { kind: 'driving' }>, root: Point, height: number): void {
  const degrees = -car.yaw * 180 / Math.PI;
  const pose = degrees <= 11 ? -1 : TURN_TYRES.findIndex((cel) => degrees <= cel.maxTurn);
  const { front, rear, side } = TURN_TYRES[pose] ?? DRIVER_TYRES;
  const art = pose < 0 ? car.driver : car.turn;
  const columns = pose < 0 ? 1 : 2;
  const cellW = pose < 0 ? 1442 : 768;
  const cellH = pose < 0 ? 1091 : 512;
  const sourceW = art.w / columns;
  const sourceH = art.h / columns;
  const s = Math.sin(car.yaw);
  const c = Math.cos(car.yaw);
  const axleX = front.x - rear.x;
  const axleY = front.y - rear.y;
  const axleSize = Math.hypot(axleX, axleY);
  const projectedX = -height * WHEELBASE * (c + s);
  const projectedY = height * WHEELBASE * (c - s) / 2;
  const scale = Math.hypot(projectedX, projectedY) / axleSize;
  // Adjust along the wheelbase. This keeps registration stable even when the axle
  // is vertical on screen during the head-on part of the turn.
  const correctionX = (projectedX - scale * axleX) / axleSize ** 2;
  const correctionY = (projectedY - scale * axleY) / axleSize ** 2;
  const tyreX = (front.x + rear.x) / 2;
  const tyreY = (front.y + rear.y) / 2;
  const x = root.x + height * HALF_TRACK * (c - s) * side;
  const y = root.y + height * (HALF_TRACK * (c + s) * side / 2 + car.shake * 0.009);
  const cel = Math.max(0, pose);
  ctx.save();
  ctx.transform(scale + correctionX * axleX, correctionY * axleX, correctionX * axleY, scale + correctionY * axleY, x, y);
  ctx.drawImage(art.img, (cel % columns) * sourceW, Math.floor(cel / columns) * sourceH, sourceW, sourceH,
    -tyreX, -tyreY, cellW, cellH);
  ctx.restore();
}

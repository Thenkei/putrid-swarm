import sweep from './wagon-turn.json';
import { carManeuver, departureTiming, PARKED, type DepartureRoute } from '../core/car-path';
import { sprite, type Sprite } from '../engine/assets';
import { clamp01, smoothstep } from './noise';
import { PROP_FEET } from './registration';
import { groundMatrix, type Point, type View } from './projection';

export { carManeuver } from '../core/car-path';

// Seconds spent approaching, opening the door, ducking in, then pulling it shut.
// With one hand he has to turn, brace and change his grip before the door can close.
const BOARDING = [0.36, 0.65, 0.98, 1.25] as const;
const BOARDING_ONE_ARM = [0.53, 1.22, 1.94, 2.37] as const;
const IGNITION_DELAY = 0.1;
const ROLL_DELAY = 0.45;
// Two patches on the near shoulder. Place each leaf at the rear wheel's actual
// crossing, so it stays put while the camera follows the walk from the house.
const laneLeaves = (route: DepartureRoute) => Array.from({ length: 11 }, (_, i) => {
  const patch = i < 6 ? 0 : 1;
  const at = departureTiming(route).forwardAt + .42 + patch * .48 + (i % 6) * .035;
  const { position, yaw } = carManeuver(at, route);
  const side = .70 + .08 * (i % 3);
  const x = position.x + Math.sin(yaw) * .92 - Math.cos(yaw) * side;
  const y = position.y - Math.cos(yaw) * .92 - Math.sin(yaw) * side;
  return { at, x, y };
});

const LEAVES = { reverse: laneLeaves('reverse'), carefulReverse: laneLeaves('carefulReverse'), forward: laneLeaves('forward') };

/** The wake lifts dry leaves from the gravel. They spin, skim and come to rest. */
export function* wagonLeaves(secondsSinceRoll: number, route: DepartureRoute = 'reverse') {
  for (const [i, leaf] of LEAVES[route].entries()) {
    const t = clamp01((secondsSinceRoll - leaf.at) / (.80 + .10 * (i % 4)));
    const arc = 4 * t * (1 - t);
    const drift = t * (2 - t);
    yield {
      x: leaf.x - (.25 + .16 * (i % 4)) * drift,
      y: leaf.y + (.66 + .20 * (i % 5)) * drift + .14 * arc * Math.sin(i + 6 * t),
      height: (8 + i % 4 * 4.2) * arc,
      size: 2.8 + i % 3 * .55,
      angle: i * 2.1 + t * (i % 2 ? 8 : -6),
      turning: .48 + .5 * arc * Math.abs(Math.sin(11 * t + i)),
      alpha: .82,
      colour: i,
    };
  }
}

interface CarArt {
  readonly art: Sprite;
  readonly columnCut: number;
  // The car body within a cell (left, top, width and height), in source pixels.
  readonly body: readonly [number, number, number, number];
}

interface DepartureShot {
  readonly route: DepartureRoute;
  readonly reverseEnd: number;
  readonly boarding: CarArt;
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
  | { readonly kind: 'driving'; readonly brake: number; readonly pitch: number; readonly steer: number; readonly distance: number; readonly turn: Sprite; readonly yaw: number; readonly shake: number; readonly headlights: number }
);

export function carDepartureShot(oneArmed: boolean, route: DepartureRoute = 'reverse', checkingBehind = false): DepartureShot | null {
  const boarding = sprite(oneArmed ? 'car_boarding_one_arm' : 'car_boarding');
  const turn = sprite('car_turn_sweep');
  if (!boarding || !turn || !sprite('car_tyre')) return null;
  const poseEnds = oneArmed ? BOARDING_ONE_ARM : BOARDING;
  const latchAt = poseEnds[3];
  const timing = departureTiming(route);
  const rollAt = latchAt + ROLL_DELAY + (checkingBehind ? .8 : 0);
  return {
    route, reverseEnd: timing.reverseEnd,
    boarding: {
      art: boarding,
      // The retouched right-hand poses start 32 px left of the atlas midpoint.
      columnCut: oneArmed ? 736 : 768,
      body: oneArmed ? [4, 7, 630, 474] : [17, 12, 621, 466],
    },
    turn,
    poseEnds,
    latchAt,
    ignitionAt: latchAt + IGNITION_DELAY,
    rollAt,
    forwardAt: rollAt + timing.forwardAt,
    duration: rollAt + timing.duration,
  };
}

export function departingCar(shot: DepartureShot, time: number, dusk: number): DepartingCar {
  const pose = shot.poseEnds.findIndex((end) => time < end);
  if (pose >= 0) return { kind: 'boarding', position: PARKED, picture: shot.boarding, pose };
  const crank = time - shot.ignitionAt;
  const shake = crank >= 0 && crank < ROLL_DELAY - IGNITION_DELAY ? Math.sin(crank * 75) * (1 - crank / (ROLL_DELAY - IGNITION_DELAY)) : 0;
  const headlights = smoothstep(0.78, 0.96, dusk) * smoothstep(0, 0.17, crank);
  const roll = time - shot.rollAt;
  const forward = shot.forwardAt - shot.rollAt;
  const brake = shot.route === 'forward' ? 0 : smoothstep(shot.reverseEnd - .32, shot.reverseEnd - .24, roll) * (1 - smoothstep(forward, forward + .08, roll));
  // The nose lifts as the reversing wagon stops, then settles before it pulls away.
  const load = smoothstep(shot.reverseEnd - .24, shot.reverseEnd, roll);
  const rebound = smoothstep(shot.reverseEnd, forward + .12, roll);
  const pitch = shot.route === 'forward' ? 0 : -.015 * load * (1 - rebound) + .005 * Math.sin(Math.PI * rebound);
  return { kind: 'driving', turn: shot.turn, ...carManeuver(roll, shot.route), shake, headlights, brake, pitch };
}

/** Paint the two low beams on the ground before the props and the wagon are drawn. */
export function drawHeadlightPools(ctx: CanvasRenderingContext2D, view: View, car: DepartingCar): void {
  if (car.kind !== 'driving' || car.headlights <= 0) return;
  const s = Math.sin(car.yaw);
  const c = Math.cos(car.yaw);
  ctx.save();
  ctx.transform(...groundMatrix(view));
  ctx.transform(c, s, -s, c, car.position.x, car.position.y);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = car.headlights;
  for (const lamp of [-0.42, 0.42]) {
    ctx.save();
    ctx.translate(lamp, 1.36);
    ctx.scale(1, 2.5);
    const pool = ctx.createRadialGradient(0, 0.68, 0.05, 0, 1.03, 1.07);
    pool.addColorStop(0, 'rgba(255, 222, 155, 0.45)');
    pool.addColorStop(0.48, 'rgba(255, 187, 111, 0.24)');
    pool.addColorStop(1, 'rgba(255, 174, 95, 0)');
    ctx.fillStyle = pool;
    ctx.fillRect(-1.07, -0.04, 2.14, 2.14);
    ctx.restore();
  }
  ctx.restore();
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

/** Every baked direction has the same ground pivot and pixel scale. */
function drawDrivingCar(ctx: CanvasRenderingContext2D, car: Extract<DepartingCar, { kind: 'driving' }>, root: Point, height: number): void {
  const turn = -car.yaw / (Math.PI / 2);
  const frame = Math.min(sweep.lamps.length - 1, Math.max(0, Math.round(turn * 90 / sweep.stepDegrees)));
  const [lampX, lampY, otherX, otherY, tailX, tailY] = sweep.lamps[frame]!;
  const scale = height / sweep.unit;
  const cosine = Math.cos(car.pitch) * scale, sine = Math.sin(car.pitch) * scale;
  ctx.save();
  ctx.transform(cosine, sine, -sine, cosine, root.x, root.y + height * car.shake * .009);
  ctx.translate(-sweep.pivot[0]!, -sweep.pivot[1]!);
  drawRollingWheels(ctx, frame, car.distance, car.steer);
  ctx.drawImage(car.turn.img, (frame % sweep.columns) * sweep.width, Math.floor(frame / sweep.columns) * sweep.height,
    sweep.width, sweep.height, 0, 0, sweep.width, sweep.height);
  if (car.headlights > 0) {
    glow(ctx, lampX!, lampY!, 16, car.headlights, '#ffe4a0', 'rgba(255,202,116,.65)');
    glow(ctx, otherX!, otherY!, 16, car.headlights, '#ffe4a0', 'rgba(255,202,116,.65)');
  }
  // Head-on, the rear lights are hidden by the body.
  const visible = smoothstep(.04, .20, Math.abs(turn - .5));
  if (car.brake * visible > 0) glow(ctx, tailX!, tailY!, 9, car.brake * visible, '#ff9d70', 'rgba(255,41,17,.9)');
  ctx.restore();
}

function drawRollingWheels(ctx: CanvasRenderingContext2D, frame: number, distance: number, steer: number): void {
  const rubber = sprite('car_tyre'), art = sprite('car_wheel_faces');
  if (!rubber) return;
  const bodyAngle = (frame * sweep.stepDegrees - 45) * Math.PI / 180;
  const { cell, columns, radius, halfWidth } = sweep.tyre;
  const phase = -distance / .30;
  const rollCos = Math.cos(phase), rollSin = Math.sin(phase);
  // Draw the far wheels first. The fenders and bumper cover all four afterwards.
  const near = bodyAngle < 0 ? 0 : 1;
  for (const side of [1-near, near]) for (const axle of [1, 0]) {
    const sign = side === 0 ? 1 : -1;
    const tangent = axle === 0 ? Math.tan(steer) : 0;
    // Half track / wheelbase: the inside front wheel follows the tighter circle.
    const angle = bodyAngle + Math.atan2(tangent, 1 - sign * (63/194) * tangent);
    const s = Math.sin(angle), c = Math.cos(angle);
    const [x, y] = sweep.wheels[frame]![side]![axle]!;
    const tile = Math.round(Math.atan2(Math.abs(s), Math.abs(c)) * 180 / Math.PI / sweep.stepDegrees);
    ctx.save();
    ctx.translate(x!, y!);
    // The inside of the wheel arch stays in the body plane when the tyre
    // turns away from it. Gravel should only show below the sill.
    ctx.save();
    const arch = radius + 7;
    ctx.transform(arch*Math.sin(bodyAngle), .48*arch*Math.cos(bodyAngle), 0, -arch,
      sign*halfWidth*Math.cos(bodyAngle), 3-sign*halfWidth*.48*Math.sin(bodyAngle));
    ctx.fillStyle = '#2f231b';
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.scale(s*c < 0 ? -1 : 1, 1);
    ctx.drawImage(rubber.img, tile%columns*cell, Math.floor(tile/columns)*cell, cell, cell,
      -cell/2, -cell/2, cell, cell);
    ctx.restore();

    // Tread travels down the exposed face as the wheel rolls forward.
    const headOn = 1 - smoothstep(.15, .52, Math.abs(s));
    if (headOn > 0) {
      ctx.save();
      ctx.fillStyle = '#b09778';
      for (let i = 0; i < 3; i++) {
        const cycle = distance/.25 + i/3;
        const t = cycle - Math.floor(cycle);
        const arc = .35 + .92*t;
        const along = Math.cos(arc)*radius*Math.sign(c);
        ctx.save();
        ctx.transform(c, -.48*s, 0, 1, along*s, radius*Math.sin(arc) + .48*along*c);
        ctx.globalAlpha *= .42 * headOn * Math.sin(Math.PI*t);
        ctx.fillRect(-6, 0, 5, 1);
        ctx.fillRect(1, .7, 5, 1);
        ctx.restore();
      }
      ctx.restore();
    }
    // Only the outward face carries a hubcap. Its ground and vertical axes
    // are projected before spinning the paint in the plane of the wheel.
    if (art && -sign*s > .001) {
      const disc = art.h, index = side*2 + axle;
      const faceRadius = radius - 4;
      ctx.transform(s*faceRadius, .48*c*faceRadius, 0, -faceRadius,
        sign*halfWidth*c, -sign*halfWidth*.48*s);
      ctx.drawImage(art.img, (4+index)*disc, 0, disc, disc, -1, -1, 2, 2);
      ctx.transform(rollCos, rollSin, -rollSin, rollCos, 0, 0);
      ctx.drawImage(art.img, index*disc, 0, disc, disc, -.68, -.68, 1.36, 1.36);
    }
    ctx.restore();
  }
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, opacity: number, centre: string, edge: string): void {
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = opacity;
  const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
  light.addColorStop(0, centre);
  light.addColorStop(.4, edge);
  light.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = light;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

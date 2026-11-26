import { GRID_W, PARKED_CAR, roadCentre } from './map';
import { clamp01, smoothstep } from './math';
import type { Cell } from './types';

export const REVERSE_SECONDS = 1.12;
const SHIFT_SECONDS = 0.16;
const EXIT_SECONDS = 1.9;
export const FORWARD_START = REVERSE_SECONDS + SHIFT_SECONDS;
export const PARKED = { x: PARKED_CAR.x + PARKED_CAR.w / 2, y: PARKED_CAR.y + PARKED_CAR.h / 2 };
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
export const MANEUVER_SECONDS = FORWARD_START + TURN_SECONDS + EXIT_SECONDS;

export type DepartureRoute = 'reverse' | 'forward' | 'carefulReverse';
const CAREFUL_RATE = 1.85;
const FRONT_SECONDS = 3.35;
const FRONT_JOIN = GRID_W + 1.6;
const FRONT_CONTROL_X = PARKED.x + 2.5;
const FRONT_EXIT_SPEED = 3 * (FRONT_JOIN - FRONT_CONTROL_X) / FRONT_SECONDS;

export function departureTiming(route: DepartureRoute) {
  if (route === 'forward') return { reverseEnd: 0, forwardAt: 0, duration: FRONT_SECONDS + (EXIT_X - FRONT_JOIN) / FRONT_EXIT_SPEED };
  const extra = route === 'carefulReverse' ? REVERSE_SECONDS * (CAREFUL_RATE - 1) : 0;
  return { reverseEnd: REVERSE_SECONDS + extra, forwardAt: FORWARD_START + extra, duration: MANEUVER_SECONDS + extra };
}

// The open side of the parking bay lets the driver pull out nose first, swing
// round the rock and meet the barn track with both position and tangent matched.
function frontCurve(t: number) {
  const u = 1 - t;
  const reach = 2.75;
  const x = PARKED.x * u*u * (1 + 2*t) + 3*u*t*t * FRONT_CONTROL_X + t*t*t * FRONT_JOIN;
  const y = u*u*u * PARKED.y + 3*u*u*t * (PARKED.y + reach) + t*t * (3 - 2*t) * ROAD_Y;
  const dx = 2*u*t * (FRONT_CONTROL_X - PARKED.x) + t*t * (FRONT_JOIN - FRONT_CONTROL_X);
  const dy = u*u * reach + 2*u*t * (ROAD_Y - PARKED.y - reach);
  return { position: { x, y }, yaw: Math.atan2(-dx, dy) };
}

/** Arc length of a painted ground path, independent of display frame rate. */
function arcLengthTable(point: (t: number) => Cell) {
  const segments = 512;
  const samples = [0];
  let prev = point(0);
  for (let i = 1; i <= segments; i++) {
    const next = point(i / segments);
    samples.push(samples[i-1]! + Math.hypot(next.x - prev.x, next.y - prev.y));
    prev = next;
  }
  return (t: number) => {
    const n = clamp01(t) * segments, i = Math.min(segments - 1, Math.floor(n));
    return samples[i]! + (samples[i+1]! - samples[i]!) * (n-i);
  };
}
const frontLength = arcLengthTable(t => frontCurve(t).position);
const roadLength = arcLengthTable(t => {
  const x = ROAD_ENTRY_X + (EXIT_X - ROAD_ENTRY_X) * t;
  return { x, y: roadCentre('barn', x) };
});

function onRoad(x: number, distanceAtEntry: number) {
  const slope = (roadCentre('barn', x + .01) - roadCentre('barn', x - .01)) / .02;
  return { position: { x, y: roadCentre('barn', x) }, yaw: Math.atan2(-1, slope),
    distance: distanceAtEntry + roadLength((x - ROAD_ENTRY_X) / (EXIT_X - ROAD_ENTRY_X)) };
}

export function carManeuver(elapsed: number, route: DepartureRoute = 'reverse'): { position: Cell; yaw: number; distance: number } {
  if (route === 'forward') {
    if (elapsed <= FRONT_SECONDS) {
      const t = clamp01(elapsed / FRONT_SECONDS), u = t*t*(2-t);
      return { ...frontCurve(u), distance: frontLength(u) };
    }
    const x = Math.min(EXIT_X, FRONT_JOIN + (elapsed - FRONT_SECONDS) * FRONT_EXIT_SPEED);
    return onRoad(x, frontLength(1) - roadLength((FRONT_JOIN - ROAD_ENTRY_X) / (EXIT_X - ROAD_ENTRY_X)));
  }
  if (route === 'carefulReverse') {
    const slowEnd = REVERSE_SECONDS * CAREFUL_RATE;
    elapsed = elapsed <= slowEnd ? elapsed / CAREFUL_RATE : elapsed - slowEnd + REVERSE_SECONDS;
  }
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
      distance: -distance,
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
      distance: -REVERSE_DISTANCE + TURN_RADIUS * (turn - REVERSE_TURN),
    };
  }
  const progress = clamp01((elapsed - FORWARD_START - TURN_SECONDS) / EXIT_SECONDS);
  const x = ROAD_ENTRY_X + (EXIT_X - ROAD_ENTRY_X) * progress;
  return onRoad(x, -REVERSE_DISTANCE + TURN_RADIUS * (ROAD_TURN - REVERSE_TURN));
}

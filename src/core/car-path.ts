import { GRID_W, PARKED_CAR, roadCentre } from './map';
import { clamp01, smoothstep } from './math';
import type { Cell } from './types';

const REVERSE_SECONDS = 1.12;
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

export function carManeuver(elapsed: number): { position: Cell; yaw: number } {
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

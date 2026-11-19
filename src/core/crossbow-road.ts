import { hasCrossbow } from './crossbow';
import { seize } from './encounters';
import type { Cost, GameState } from './types';
import { RESOURCE_IDS } from './types';
import { gain, spend } from './yard';

export const ROAD_DUSK_HOURS = 2;
export const ROAD_BOLTS = 3;
export const IGNITION_SECONDS = 5;
const STOP_PLAYED = 'crossbow:road';
const STALL_HOURS = 0.25;

export function shouldStopAtDusk(state: GameState, hoursOnArrival: number): boolean {
  return hoursOnArrival <= ROAD_DUSK_HOURS && hasCrossbow(state) && !state.flags[STOP_PLAYED];
}

/** The starter turns twice before stalling. The needle and success use the same timing. */
export function ignitionNeedle(time: number): number {
  const lap = time % 2.5 / 2.5;
  return 1 - Math.abs(2 * lap - 1);
}

export const IGNITION_WINDOW = { from: 0.66, to: 0.89 } as const;

export function catchesIgnition(time: number): boolean {
  const needle = ignitionNeedle(time);
  return time < IGNITION_SECONDS && needle >= IGNITION_WINDOW.from && needle <= IGNITION_WINDOW.to;
}

/** Apply the stop once, while the rest of the cargo is still in the car. */
export function finishCrossbowStop(state: GameState, stalled: boolean, hits: number): { state: GameState; lost: Cost; hours: number } | null {
  const outing = state.outing;
  if (state.phase !== 'day' || state.where !== 'road' || !outing?.crossbowStop || state.encounter) return null;
  if (!Number.isInteger(hits) || hits < 0 || hits > ROAD_BOLTS) return null;
  const lost = seize(outing.trunk, ROAD_BOLTS - hits, RESOURCE_IDS);
  const trunk = spend(outing.trunk, lost);
  if (!trunk.ok) return null;
  const hours = stalled ? Math.min(STALL_HOURS, state.hoursLeft) : 0;
  const { crossbowStop: _stop, ...trip } = outing;
  return {
    state: {
      ...state,
      hoursLeft: state.hoursLeft - hours,
      outing: { ...trip, trunk: trunk.value, parted: gain(outing.parted, lost) },
      flags: { ...state.flags, [STOP_PLAYED]: 1 },
      totals: { ...state.totals, kills: state.totals.kills + hits },
    },
    lost,
    hours,
  };
}

import { LOCATIONS } from './data/locations';
import { isUnlocked, roundTripHours, travelTo, type TravelOutcome } from './game';
import type { GameState, LocationId } from './types';

export const HERD_WAIT_HOURS = 0.5;
export type CrossingRoute = 'wait' | 'garage';
const CROSSED = 'road:crossing';

export function shouldPlayCrossing(state: GameState, planned: LocationId): boolean {
  const destination = LOCATIONS[planned];
  return state.phase === 'day' && state.where === 'home' && state.day >= 2
    && planned !== 'garage' && planned !== 'shed' && !state.flags[CROSSED]
    && isUnlocked(destination, state.day)
    && state.hoursLeft + 1e-9 >= roundTripHours(destination) + HERD_WAIT_HOURS;
}

/** Charge the route only when the player commits. The chosen trip uses normal scavenging arrival rules. */
export function chooseCrossing(state: GameState, planned: LocationId, route: CrossingRoute): (TravelOutcome & { id: LocationId }) | null {
  if (!shouldPlayCrossing(state, planned)) return null;
  const id = route === 'wait' ? planned : 'garage';
  const result = travelTo({
    ...state,
    hoursLeft: state.hoursLeft - (route === 'wait' ? HERD_WAIT_HOURS : 0),
    flags: { ...state.flags, [CROSSED]: 1 },
  }, id);
  return result.ok ? { ...result.value, id } : null;
}

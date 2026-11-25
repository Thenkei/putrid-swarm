import { LOCATIONS } from './data/locations';
import { isUnlocked, planVisit, roundTripHours, travelTo, type TravelOutcome } from './game';
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

function crossingDeparture(state: GameState, planned: LocationId, route: CrossingRoute): { state: GameState; id: LocationId } | null {
  if (!shouldPlayCrossing(state, planned)) return null;
  return {
    id: route === 'wait' ? planned : 'garage',
    state: {
      ...state,
      hoursLeft: state.hoursLeft - (route === 'wait' ? HERD_WAIT_HOURS : 0),
      flags: { ...state.flags, [CROSSED]: 1 },
    },
  };
}

export function crossingSearches(state: GameState, planned: LocationId, route: CrossingRoute): number | null {
  const trip = crossingDeparture(state, planned, route);
  return trip ? planVisit(trip.state, LOCATIONS[trip.id]).searches : null;
}

/** Charge the route only when the player commits. The chosen trip uses normal scavenging arrival rules. */
export function chooseCrossing(state: GameState, planned: LocationId, route: CrossingRoute): (TravelOutcome & { id: LocationId }) | null {
  const trip = crossingDeparture(state, planned, route);
  if (!trip) return null;
  const result = travelTo(trip.state, trip.id);
  if (!result.ok) return null;
  const { state: arrived, meeting } = result.value;
  const outing = arrived.outing && { ...arrived.outing, quiet: false };
  return { state: { ...arrived, outing }, meeting, id: trip.id };
}

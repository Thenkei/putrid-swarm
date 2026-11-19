import { LOCATIONS } from './data/locations';
import type { GameState, LocationId } from './types';

export const GARAGE_WORKBENCH = LOCATIONS.garage.spots.findIndex((spot) => spot.key === 'workbench');
export const VICE_ATTEMPT_DAY = 'garage:vice-attempt';
const VICE_OPENED = 'garage:vice-opened';

export const isGarageVice = (location: LocationId, spot: number): boolean => location === 'garage' && spot === GARAGE_WORKBENCH;

export function hasViceLeftovers(state: GameState, location: LocationId, spot: number): boolean {
  return isGarageVice(location, spot) && state.flags[VICE_OPENED] === 1;
}

/** Someone opens the vice if it was worked on and then left exposed overnight. */
export function openViceOnReturn(state: GameState, location: LocationId): GameState {
  const { searched, covered } = state.locations.garage;
  const attempt = state.flags[VICE_ATTEMPT_DAY];
  if (location !== 'garage' || state.flags[VICE_OPENED] || !attempt || attempt >= state.day) return state;
  if (searched.includes(GARAGE_WORKBENCH) || covered.includes(GARAGE_WORKBENCH)) return state;
  return { ...state, flags: { ...state.flags, [VICE_OPENED]: 1 } };
}

import { LOCATIONS } from './data/locations';
import type { GameState } from './types';

const CASE_INDEX = LOCATIONS.garage.spots.findIndex(spot => spot.key === 'crossbow');

/** The case is a permanent equipment find, separate from cargo in the boot. */
export function hasCrossbow(state: Pick<GameState, 'locations'>): boolean {
  return state.locations.garage.searched.includes(CASE_INDEX);
}

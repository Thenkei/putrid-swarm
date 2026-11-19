import { LOCATIONS, type SearchSpot } from './data/locations';
import type { GameState } from './types';

const DIRECTORY_INDEX = LOCATIONS.post.spots.findIndex(spot => spot.key === 'minitel');
const CACHE_INDEX = LOCATIONS.shed.spots.findIndex(spot => spot.key === 'parcel-cache');

export function knowsPlanque(state: Pick<GameState, 'locations'>): boolean {
  return state.locations.post.searched.includes(DIRECTORY_INDEX);
}

export function hasUnclaimedPlanque(state: Pick<GameState, 'locations'>): boolean {
  return knowsPlanque(state) && !state.locations.shed.searched.includes(CACHE_INDEX);
}

export function spotRevealed(state: Pick<GameState, 'locations'>, spot: SearchSpot): boolean {
  return !spot.requiresDirectory || knowsPlanque(state);
}

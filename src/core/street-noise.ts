// What the street hears during one visit to a town location. Noise only lasts for that visit: it is
// keyed like the visit's search counter, so a new visit (or a new day) starts quiet and saves keep it.

import { RUMMAGE } from './rummage';
import type { GameState, LocationId } from './types';

/** Every this much noise costs the visit one search. */
export const NOISE_PER_LOST_SEARCH = 3;

/** A failed attempt (a slip, a clatter, a curse) is always heard. */
export const FAILED_ATTEMPT_NOISE = 1;

/**
 * Where a records throw lands when it misses, by decoy position: the first decoy muffles it (flour
 * sacks), the second breaks glass (a shop window). Pairs with the thud and the shatter in the panel.
 */
export const RECORD_DECOY_NOISE = [0, 2] as const;

/** A rummage that spends all but one of its noise budget is heard from the road. */
const RUMMAGE_HEARD_AT = RUMMAGE.noise - 1;
const RUMMAGE_HEARD_NOISE = 1;

/** The street noise a rummage has made once `used` of its budget is spent. */
export const rummageNoise = (used: number): number => (used >= RUMMAGE_HEARD_AT ? RUMMAGE_HEARD_NOISE : 0);

const noiseKey = (state: GameState, id: LocationId): string => `noise:${id}:${state.day}:${state.locations[id].visits}`;

/** Noise made so far on the current visit; nothing is heard at home or on the road. */
export function streetNoise(state: GameState): number {
  if (state.where === 'home' || state.where === 'road') return 0;
  return state.flags[noiseKey(state, state.where)] ?? 0;
}

/** Adds noise to the current visit. Outside a location, or for no noise, the state is returned as is. */
export function makeNoise(state: GameState, amount: number): GameState {
  if (amount <= 0 || state.where === 'home' || state.where === 'road') return state;
  return { ...state, flags: { ...state.flags, [noiseKey(state, state.where)]: streetNoise(state) + amount } };
}

/** Searches the current visit at `id` has lost to noise. Any other location is on a later, quiet visit. */
export function searchesLostToNoise(state: GameState, id: LocationId): number {
  return state.where === id ? Math.floor(streetNoise(state) / NOISE_PER_LOST_SEARCH) : 0;
}

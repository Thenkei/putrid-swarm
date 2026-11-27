import { LOCATIONS } from './data/locations';
import { epicFlag, markEpic } from './epics';
import type { GameState } from './types';

export const MOPED_UNLOCK_DAY = 2;
export const GARAGE_KEY_COUNT = 5;
export const garageModels = ['G-17', 'G-41', 'G-74'] as const;
export const garageModel = (seed: number) => (seed >>> 8) % garageModels.length;
export const keyForGarageModel = (seed: number, model: number) => (model + (seed >>> 16)) % GARAGE_KEY_COUNT;
export const GARAGE_KEY_HOURS = .5;
export const hasTimeForGarageKey = (state: GameState) => state.hoursLeft >= LOCATIONS.garage.travelHours + GARAGE_KEY_HOURS;

function canStart(state: GameState) {
  return state.where === 'garage' && state.phase === 'day' && state.day >= MOPED_UNLOCK_DAY &&
    !['garageStarterBroken', 'garageKey', 'loaded', 'moped'].some(flag => epicFlag(state, flag));
}

export function tryGarageKey(state: GameState) {
  const held = epicFlag(state, 'garageHeldKey');
  if (!canStart(state) || !held || held > GARAGE_KEY_COUNT || !hasTimeForGarageKey(state)) {
    return { state, result: 'unavailable' } as const;
  }
  const timed = { ...state, hoursLeft: state.hoursLeft - GARAGE_KEY_HOURS };
  if (held === keyForGarageModel(state.seed, garageModel(state.seed)) + 1) {
    return { state: markEpic(timed, 'garageKey'), result: 'started' } as const;
  }
  const bit = 1 << (held - 1);
  const previous = epicFlag(state, 'garageRejectedKeys');
  const strained = (previous & ~bit) !== 0;
  const next = markEpic(markEpic(timed, 'garageRejectedKeys', previous | bit), 'garageStrainedKey', strained ? held : 0);
  return { state: next, result: strained ? 'resists' : 'wrong' } as const;
}

export function forceGarageKey(state: GameState) {
  const strained = epicFlag(state, 'garageStrainedKey');
  if (!canStart(state) || !strained || strained !== epicFlag(state, 'garageHeldKey')) return state;
  return markEpic(state, 'garageStarterBroken');
}

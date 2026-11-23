import { RESOURCE_IDS, type GameState, type Inventory } from './types';

export const MOPED_RUN_SECONDS = 1.2;

export function markEpic(state: GameState, key: string, value = 1): GameState {
  return { ...state, flags: { ...state.flags, ['epic.' + key]: value } };
}

export function epicFlag(state: GameState, key: string): number {
  const value = state.flags['epic.' + key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** A moped occupies half the boot for the entire return trip, including late finds. */
export function unloadMoped(state: GameState, trunk: Inventory, parted: Inventory) {
  if (!epicFlag(state, 'loaded')) return { state, trunk, parted };
  const kept = { ...trunk };
  const left = { ...parted };
  for (const id of RESOURCE_IDS) {
    kept[id] = Math.floor(trunk[id] / 2);
    left[id] += trunk[id] - kept[id];
  }
  return { state: markEpic(markEpic(state, 'loaded', 0), 'moped'), trunk: kept, parted: left };
}

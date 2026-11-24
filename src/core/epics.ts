import { RESOURCE_IDS, type GameState, type Inventory } from './types';

export const MOPED_RUN_SECONDS = 1.65;
/** From releasing the door to the moped reaching the outside lane. */
export const MOPED_EXIT_SECONDS = 0.8;
export const MOPED_BLAST_RADIUS = 4.25;

export function markEpic(state: GameState, key: string, value = 1): GameState {
  return { ...state, flags: { ...state.flags, ['epic.' + key]: value } };
}

export function epicFlag(state: GameState, key: string): number {
  const value = state.flags['epic.' + key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Preview the load that fits beside the moped without changing any goods on the road. */
export function mopedCargo(trunk: Inventory) {
  const kept = { ...trunk };
  const displaced = { ...trunk };
  for (const id of RESOURCE_IDS) {
    kept[id] = Math.floor(trunk[id] / 2);
    displaced[id] = trunk[id] - kept[id];
  }
  return { kept, displaced };
}

/** A moped occupies half the boot for the entire return trip, including late finds. */
export function unloadMoped(state: GameState, trunk: Inventory, parted: Inventory) {
  if (!epicFlag(state, 'loaded')) return { state, trunk, parted };
  const { kept, displaced } = mopedCargo(trunk);
  const left = { ...parted };
  for (const id of RESOURCE_IDS) left[id] += displaced[id];
  return { state: markEpic(markEpic(state, 'loaded', 0), 'moped'), trunk: kept, parted: left };
}

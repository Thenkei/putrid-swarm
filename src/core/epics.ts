import { LANES } from './map';
import { THRESHOLDS } from '../house-layout';
import { RESOURCE_IDS, SECTOR_IDS, type GameState, type Inventory, type SectorId } from './types';

export const MOPED_RUN_SECONDS = 1.65;
/** From releasing the door to the moped reaching the outside lane. */
export const MOPED_EXIT_SECONDS = 0.8;
export const MOPED_BLAST_RADIUS = 4.25;

export function mopedImpact(sector: SectorId) {
  const cell = LANES[sector][2]!;
  return { x: cell.x + 0.5, y: cell.y + 0.5 };
}

/** The first tyre contact outside the threshold and the hedge where the ride ends. */
export function mopedPath(sector: SectorId) {
  const sill = THRESHOLDS[sector];
  const impact = mopedImpact(sector);
  const dx = impact.x - sill.gx, dy = impact.y - sill.gy;
  const clearance = 1.35 / Math.hypot(dx, dy);
  return [{ x: sill.gx + clearance * dx, y: sill.gy + clearance * dy }, impact] as const;
}

export function markEpic(state: GameState, key: string, value = 1): GameState {
  return { ...state, flags: { ...state.flags, ['epic.' + key]: value } };
}

export function epicFlag(state: GameState, key: string): number {
  const value = state.flags['epic.' + key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** A wreck stays where the moped was aimed. Existing saves already record both flags. */
export function wreckSector(state: GameState): SectorId | undefined {
  return epicFlag(state, 'spent') ? SECTOR_IDS[epicFlag(state, 'lane') % SECTOR_IDS.length] : undefined;
}

export type PackTrail = 'together' | 'digging' | 'ditch' | 'fence';

/** Fresh tracks stay visible from the fifth dawn until the next nightfall. */
export function packTrail(state: GameState): PackTrail | undefined {
  if (!(state.day === 5 && state.phase === 'morning' || state.day === 6 && state.phase === 'day')) return;
  if (epicFlag(state, 'cub')) return 'together';
  const exit = epicFlag(state, 'packExit');
  if (exit === 1) return 'digging';
  if (exit === 2) return 'ditch';
  // Older saves recorded only a rescue. On a completed fifth night the adult
  // prints are known, but a closed gate and a mistimed lift cannot be distinguished.
  if (state.lastNight?.night === 5) return 'fence';
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

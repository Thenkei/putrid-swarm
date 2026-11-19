import { LOCATIONS } from './data/locations';
import { ENTRIES, sectorOf } from './map';
import type { Enemy } from './night';
import type { GameState, SectorId } from './types';

export const SCAN_SECONDS = 10;
export const SCAN_RANGE = 9;
const DETECTOR_INDEX = LOCATIONS.hardware.spots.findIndex(spot => spot.key === 'detector');

export function hasDetector(state: Pick<GameState, 'locations'>): boolean {
  return state.locations.hardware.searched.includes(DETECTOR_INDEX);
}

/** Distance from the door in yard cells. Contacts outside the failed sector are ignored. */
export function detectContact(sector: SectorId, enemies: readonly Pick<Enemy, 'alive' | 'x' | 'y'>[]): number | null {
  const door = ENTRIES[sector];
  let nearest = Infinity;
  for (const enemy of enemies) {
    if (!enemy.alive || sectorOf(Math.floor(enemy.x), Math.floor(enemy.y)) !== sector) continue;
    nearest = Math.min(nearest, Math.hypot(enemy.x - door.x - 0.5, enemy.y - door.y - 0.5));
  }
  return nearest <= SCAN_RANGE ? nearest : null;
}

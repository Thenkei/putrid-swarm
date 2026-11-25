import { outageFor } from './orchard';
import type { GameState, SectorId } from './types';
import { SECTOR_IDS } from './types';
import { canAfford, spend } from './yard';

export const RATTLE_COST = { wire: 1 } as const;
export const RATTLE_HOURS = 0.25;
const NIGHT = 'rattle:night';
const SECTOR = 'rattle:sector';

export function rattleForNight(state: Pick<GameState, 'day' | 'flags'>): SectorId | null {
  if (state.flags[NIGHT] !== state.day) return null;
  const index = state.flags[SECTOR];
  return typeof index === 'number' ? SECTOR_IDS[index - 1] ?? null : null;
}

export function canRigRattle(state: GameState): boolean {
  return state.phase === 'day' && state.where === 'home' && !!outageFor(state) && !rattleForNight(state)
    && state.hoursLeft >= RATTLE_HOURS && canAfford(state.inventory, RATTLE_COST);
}

export function rigRattle(state: GameState, sector: SectorId): GameState | null {
  if (!canRigRattle(state) || outageFor(state)?.sector !== sector) return null;
  const stock = spend(state.inventory, RATTLE_COST);
  if (!stock.ok) return null;
  return {
    ...state,
    inventory: stock.value,
    hoursLeft: state.hoursLeft - RATTLE_HOURS,
    flags: { ...state.flags, [NIGHT]: state.day, [SECTOR]: SECTOR_IDS.indexOf(sector) + 1 },
  };
}

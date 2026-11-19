import { LOCATIONS } from './data/locations';
import { SIREN_SECTORS, sirenPackFor, type SirenSector } from './data/waves';
import type { GameState } from './types';
import { spend } from './yard';

const SIREN_INDEX = LOCATIONS.townhall.spots.findIndex(spot => spot.key === 'siren');
const SCHEDULED_NIGHT = 'siren:night';
const APPROACH = 'siren:approach';
export const SIREN_COST = { battery: 1 } as const;

export function hasSiren(state: Pick<GameState, 'locations'>): boolean {
  return state.locations.townhall.searched.includes(SIREN_INDEX);
}

export function canPlanSiren(state: GameState): boolean {
  return state.phase === 'day' && state.where === 'home' && hasSiren(state)
    && !state.flags[SCHEDULED_NIGHT] && sirenPackFor(state.day) !== null;
}

export function sirenForNight(state: Pick<GameState, 'day' | 'flags'>): SirenSector | null {
  if (state.flags[SCHEDULED_NIGHT] !== state.day) return null;
  return SIREN_SECTORS[(state.flags[APPROACH] ?? 0) - 1] ?? null;
}

export function scheduleSiren(state: GameState, sector: SirenSector): GameState | null {
  if (!canPlanSiren(state) || !SIREN_SECTORS.includes(sector)) return null;
  const stock = spend(state.inventory, SIREN_COST);
  if (!stock.ok) return null;
  return {
    ...state,
    inventory: stock.value,
    flags: { ...state.flags, [SCHEDULED_NIGHT]: state.day, [APPROACH]: SIREN_SECTORS.indexOf(sector) + 1 },
  };
}

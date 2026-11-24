import { BOSS_NIGHT } from './data/locations';
import type { Cost, GameState } from './types';

/** Only parts handed over with a garage bill belong on the mechanic's invoice. */
export function recordMechanicGift(flags: GameState['flags'], gift: Cost): GameState['flags'] {
  return {
    ...flags,
    bills: (flags.bills ?? 0) + 1,
    'bills:springs': (flags['bills:springs'] ?? 0) + (gift.springs ?? 0),
    'bills:scrap': (flags['bills:scrap'] ?? 0) + (gift.scrap ?? 0),
  };
}

export function mechanicInvoice(state: GameState) {
  const springs = state.flags['bills:springs'] ?? 0;
  const scrap = state.flags['bills:scrap'] ?? 0;
  // Earlier saves counted bills but discarded their contents. Each known bill is one
  // spring or a pair of scrap pieces. An older bill must keep its missing description.
  const unitemized = Math.max(0, (state.flags.bills ?? 0) - springs - scrap / 2);
  return { springs, scrap, unitemized };
}

export function pinnedInvoice(state: GameState) {
  const report = state.lastNight;
  const night = BOSS_NIGHT.mechanic;
  if (!report?.survived || report.night !== night || !report.mechanicStoppedAt) return null;
  const atDawn = state.phase === 'morning' && state.day === night;
  const nextDay = state.phase === 'day' && state.day === night + 1;
  if (!atDawn && !nextDay) return null;
  const items = mechanicInvoice(state);
  return items.springs || items.scrap || items.unitemized ? { ...items, sector: report.mechanicStoppedAt } : null;
}

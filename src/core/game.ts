// Campaign state machine: day (home ⇄ outings) → night → morning → next day, plus lost / won.
// Every transition is a pure function; scenes never mutate GameState.

import { BARRICADE, HOUSE_MAX_HP } from './data/devices';
import { BOSS_NIGHT, DAY_HOURS, LOCATIONS, SEARCH_HOURS, type LocationDef } from './data/locations';
import { LAST_NIGHT } from './data/waves';
import type { NightSim } from './night';
import { createRng } from './rng';
import type { Cost, DeviceInstance, GameState, Inventory, LocationId, LocationProgress, NeighborId, NightReport, ResourceId, Result } from './types';
import { LOCATION_IDS, RESOURCE_IDS, err, ok } from './types';
import { DEVICES } from './data/devices';
import { gain } from './yard';

export type DayError =
  | { readonly code: 'wrong_phase' }
  | { readonly code: 'not_home' }
  | { readonly code: 'not_there' }
  | { readonly code: 'locked'; readonly unlockDay: number }
  | { readonly code: 'no_time'; readonly needed: number }
  | { readonly code: 'already_searched' }
  | { readonly code: 'unknown_spot' }
  | { readonly code: 'escorted_out' };

const STARTING_INVENTORY: Inventory = { wood: 10, scrap: 5, springs: 2, wire: 3, battery: 1 };

/**
 * What is already in place when the smoke clears, so the first night teaches by example:
 * a palisade across the drive with one gap and automatic stakes in it, a log hung over the
 * front step to drop by hand on whatever got through, and stakes on the barn doorstep.
 */
const STARTING_DEVICES: readonly Omit<DeviceInstance, 'id' | 'hp' | 'broken' | 'facing'>[] = [
  { type: 'spikes', x: 10, y: 16 },
  ...[6, 7, 8, 9, 11, 12, 13, 14].map((x) => ({ type: 'fence', x, y: 16 }) as const),
  { type: 'log', x: 10, y: 14 },
  { type: 'spikes', x: 14, y: 11 },
];

export function newGame(seed: number): GameState {
  const emptyProgress: LocationProgress = { searched: [], visits: 0 };
  const locations = Object.fromEntries(LOCATION_IDS.map((id) => [id, emptyProgress])) as Record<LocationId, LocationProgress>;
  const devices = STARTING_DEVICES.map((d, i) => ({ ...d, id: i + 1, facing: 0 as const, hp: DEVICES[d.type].maxHp, broken: false }));
  const barricade = { hp: BARRICADE.maxHp[0], level: 0 } as const;
  return {
    version: 1,
    seed,
    rng: seed >>> 0,
    day: 1,
    phase: 'day',
    hoursLeft: DAY_HOURS,
    where: 'home',
    inventory: STARTING_INVENTORY,
    yard: {
      devices,
      nextDeviceId: devices.length + 1,
      barricades: { portail: barricade, grange: barricade, arriere: barricade, verger: barricade },
      houseHp: HOUSE_MAX_HP,
      decals: [],
    },
    locations,
    flags: {},
    lastNight: null,
    totals: { kills: 0, triggers: 0, searches: 0 },
  };
}

// ───────────────────────────── Neighbours ─────────────────────────────

export type NeighborStatus = 'alive' | 'gone';

/** Neighbours are met alive up to the day of their night; afterwards their place stands empty. */
export const neighborStatus = (id: NeighborId, day: number): NeighborStatus => (day <= BOSS_NIGHT[id] ? 'alive' : 'gone');

export const bossOfNight = (night: number): NeighborId | null =>
  (Object.entries(BOSS_NIGHT).find(([, n]) => n === night)?.[0] as NeighborId | undefined) ?? null;

// ───────────────────────────── Outings ─────────────────────────────

export const isUnlocked = (location: LocationDef, day: number): boolean => day >= location.unlockDay;

/** A trip is only allowed if the drive back still fits in the daylight. */
export const roundTripHours = (location: LocationDef): number => location.travelHours * 2;

export interface Encounter {
  readonly neighbor: NeighborId;
  /** Which line of the encounter to show: first meeting of the day or a later one. */
  readonly first: boolean;
  readonly gift: Cost;
  readonly hoursLost: number;
}

export interface TravelOutcome {
  readonly state: GameState;
  readonly encounter: Encounter | null;
}

const flagKey = (kind: string, id: string, day: number): string => `${kind}:${id}:${day}`;

export function travelTo(state: GameState, id: LocationId): Result<TravelOutcome, DayError> {
  if (state.phase !== 'day') return err({ code: 'wrong_phase' });
  if (state.where !== 'home') return err({ code: 'not_home' });
  const location = LOCATIONS[id];
  if (!isUnlocked(location, state.day)) return err({ code: 'locked', unlockDay: location.unlockDay });
  const needed = roundTripHours(location);
  if (state.hoursLeft + 1e-9 < needed) return err({ code: 'no_time', needed });

  let next: GameState = {
    ...state,
    where: id,
    hoursLeft: state.hoursLeft - location.travelHours,
    locations: { ...state.locations, [id]: { ...state.locations[id], visits: state.locations[id].visits + 1 } },
  };

  let encounter: Encounter | null = null;
  const neighbor = location.neighbor;
  if (neighbor && neighborStatus(neighbor, state.day) === 'alive') {
    const key = flagKey('met', neighbor, state.day);
    const first = !next.flags[key];
    const rng = createRng(next.rng);
    let gift: Cost = {};
    let hoursLost = 0;
    if (first) {
      switch (neighbor) {
        case 'mower':
          // A guided tour of the lawn stripes is not optional.
          hoursLost = 0.25;
          break;
        case 'mechanic':
          gift = rng.chance(0.5) ? { springs: 1 } : { scrap: 2 };
          next = { ...next, flags: { ...next.flags, bills: (next.flags['bills'] ?? 0) + 1 } };
          break;
        case 'mail':
          gift = { [rng.pick(RESOURCE_IDS)]: 2 } as Cost;
          break;
        case 'mayor':
          gift = { wood: 2 };
          break;
        case 'chief':
          break;
      }
    }
    // Never let the lecture strand the player in town after dark.
    hoursLost = Math.min(hoursLost, Math.max(0, next.hoursLeft - location.travelHours));
    next = {
      ...next,
      rng: rng.state(),
      inventory: gain(next.inventory, gift),
      hoursLeft: next.hoursLeft - hoursLost,
      flags: { ...next.flags, [key]: 1 },
    };
    encounter = { neighbor, first, gift, hoursLost };
  }
  return ok({ state: next, encounter });
}

export interface SearchOutcome {
  readonly state: GameState;
  readonly loot: Cost;
}

/** While the chief still keeps order, he walks you out after two rummages per visit. */
export const CHIEF_SEARCH_LIMIT = 2;

export function searchSpot(state: GameState, spotIndex: number): Result<SearchOutcome, DayError> {
  if (state.phase !== 'day') return err({ code: 'wrong_phase' });
  if (state.where === 'home') return err({ code: 'not_there' });
  const location = LOCATIONS[state.where];
  const spot = location.spots[spotIndex];
  if (!spot) return err({ code: 'unknown_spot' });
  const progress = state.locations[location.id];
  if (progress.searched.includes(spotIndex)) return err({ code: 'already_searched' });
  // The drive home must still fit after the search.
  const needed = SEARCH_HOURS + location.travelHours;
  if (state.hoursLeft + 1e-9 < needed) return err({ code: 'no_time', needed });

  const visitKey = flagKey('searches', location.id, state.day) + `:${progress.visits}`;
  const searchesThisVisit = state.flags[visitKey] ?? 0;
  if (location.neighbor === 'chief' && neighborStatus('chief', state.day) === 'alive' && searchesThisVisit >= CHIEF_SEARCH_LIMIT) {
    return err({ code: 'escorted_out' });
  }

  const rng = createRng(state.rng);
  const loot: Partial<Record<ResourceId, number>> = {};
  for (const id of RESOURCE_IDS) {
    const range = spot.loot[id];
    if (range) loot[id] = rng.int(range[0], range[1]);
  }
  return ok({
    loot,
    state: {
      ...state,
      rng: rng.state(),
      hoursLeft: state.hoursLeft - SEARCH_HOURS,
      inventory: gain(state.inventory, loot),
      locations: { ...state.locations, [location.id]: { ...progress, searched: [...progress.searched, spotIndex] } },
      flags: { ...state.flags, [visitKey]: searchesThisVisit + 1 },
      totals: { ...state.totals, searches: state.totals.searches + 1 },
    },
  });
}

export function returnHome(state: GameState): Result<GameState, DayError> {
  if (state.phase !== 'day') return err({ code: 'wrong_phase' });
  if (state.where === 'home') return err({ code: 'not_there' });
  const location = LOCATIONS[state.where];
  return ok({ ...state, where: 'home', hoursLeft: Math.max(0, state.hoursLeft - location.travelHours) });
}

// ───────────────────────────── Phase transitions ─────────────────────────────

/** Day → night. Only possible from home: the car is in the yard before dark. */
export function startNight(state: GameState): Result<GameState, DayError> {
  if (state.phase !== 'day') return err({ code: 'wrong_phase' });
  if (state.where !== 'home') return err({ code: 'not_home' });
  return ok({ ...state, phase: 'night', hoursLeft: 0 });
}

/** Night → morning / lost / won. The yard handed to the next day is the simulation's own result. */
export function concludeNight(state: GameState, sim: NightSim): GameState {
  if (state.phase !== 'night') return state;
  const report: NightReport = sim.report();
  const kills = Object.values(report.kills).reduce((sum, n) => sum + (n ?? 0), 0);
  const base: GameState = {
    ...state,
    yard: sim.toYard(state.yard),
    lastNight: report,
    totals: { ...state.totals, kills: state.totals.kills + kills, triggers: state.totals.triggers + report.triggers },
  };
  if (!report.survived) return { ...base, phase: 'lost' };
  if (state.day >= LAST_NIGHT) return { ...base, phase: 'won' };
  return { ...base, phase: 'morning' };
}

/** Morning → next day. */
export function startNextDay(state: GameState): GameState {
  if (state.phase !== 'morning') return state;
  return { ...state, phase: 'day', day: state.day + 1, hoursLeft: DAY_HOURS, where: 'home' };
}

export const clockLabel = (hoursLeft: number): string => {
  const elapsed = DAY_HOURS - hoursLeft;
  const total = Math.round((7 + elapsed) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

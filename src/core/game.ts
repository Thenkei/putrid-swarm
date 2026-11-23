// Campaign state machine: day (home ⇄ outings) → night → morning → next day, until the house is lost or the seventh night held.
// Every transition is a pure function; scenes never mutate GameState.

import { BARRICADE, HOUSE_MAX_HP } from './data/devices';
import { BOSS_NIGHT, CONCEAL_HOURS, COVER_FIND_CHANCE, DAILY_LOOT_CHANCE, DAY_HOURS, HARDWARE_SPRING_BIN, LOCATIONS, SEARCH_HOURS, SPRING_RECEIPT_OFFER, type LocationDef } from './data/locations';
import { shouldStopAtDusk } from './crossbow-road';
import { GARAGE_WORKBENCH, VICE_ATTEMPT_DAY, hasViceLeftovers, isGarageVice, openViceOnReturn } from './garage-vice';
import { LAST_NIGHT } from './data/waves';
import type { NightSim } from './night';
import { NO_STOCK, rollAmbush, rollDispute, walkAway, type Resolution } from './encounters';
import { ORCHARD, awaitsOrchard, isFate, type Ending } from './orchard';
import { chapterWaiting, dawnOf, openChapters, type ChapterId } from './chapters';
import { SHED, awaitsShed, isShedFate, type ShedResult } from './shed';
import { QUIET_RADIO, aftermathOf, awaitsRadio, rivalOf, stockAfter, type RadioResult } from './radio';
import { acquaintance } from './encounters';
import { createRng, type Rng } from './rng';
import { spotRevealed } from './planque';
import { FAILED_ATTEMPT_NOISE, makeNoise, searchesLostToNoise } from './street-noise';
import { unloadMoped } from './epics';
import type { Cost, DeviceInstance, GameState, Inventory, LocationId, LocationProgress, NeighborId, NightReport, OutingMark, ResourceId, Result } from './types';
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
  | { readonly code: 'escorted_out' }
  /** Someone claims this spot: it is settled with them, not rummaged behind their back. */
  | { readonly code: 'disputed' }
  /** A wager or a scuffle is in progress. */
  | { readonly code: 'busy' }
  | { readonly code: 'not_on_road' }
  /** The road home is barred: that comes first. */
  | { readonly code: 'encounter_pending' };

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
  const emptyProgress: LocationProgress = { searched: [], looted: [], covered: [], lootCheckedDay: null, visits: 0 };
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
    outing: null,
    encounter: null,
    people: {},
    yard: {
      devices,
      nextDeviceId: devices.length + 1,
      barricades: { portail: barricade, grange: barricade, arriere: barricade, verger: barricade },
      houseHp: HOUSE_MAX_HP,
      decals: [],
    },
    locations,
    springReceipt: 'none',
    flags: {},
    lastNight: null,
    orchard: 'quiet',
    shed: 'quiet',
    intel: [],
    radio: QUIET_RADIO,
    fate: null,
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

/** A neighbour found at home on arrival: a word, sometimes a present, sometimes a lecture. */
export interface NeighborMeeting {
  readonly neighbor: NeighborId;
  /** Which line to show: first meeting of the day or a later one. */
  readonly first: boolean;
  readonly gift: Cost;
  readonly hoursLost: number;
}

export interface TravelOutcome {
  readonly state: GameState;
  readonly meeting: NeighborMeeting | null;
}

const flagKey = (kind: string, id: string, day: number): string => `${kind}:${id}:${day}`;
const visitKeyFor = (state: GameState, id: LocationId): string => `${flagKey('searches', id, state.day)}:${state.locations[id].visits}`;

/** Names the next paid search at the current location; it changes after every attempt, retries included. */
export function searchAttemptKey(state: GameState): string {
  if (state.where === 'home' || state.where === 'road') return '';
  const visitKey = visitKeyFor(state, state.where);
  return `${visitKey}:${state.flags[visitKey] ?? 0}`;
}

/** The mower's first guided tour each day uses a quarter hour, up to the time available before the return drive. */
function greetingHours(state: GameState, location: LocationDef): number {
  if (location.neighbor !== 'mower' || neighborStatus('mower', state.day) === 'gone' || state.flags[flagKey('met', 'mower', state.day)]) return 0;
  return Math.min(0.25, Math.max(0, state.hoursLeft - roundTripHours(location)));
}

export function visitSearchLimit(location: LocationDef, day: number): number {
  return location.neighbor === 'chief' && neighborStatus('chief', day) === 'alive' ? CHIEF_SEARCH_LIMIT : Infinity;
}

export function remainingSearches(state: GameState, location: LocationDef): number {
  const { searched } = state.locations[location.id];
  return location.spots.filter((spot, index) => spotRevealed(state, spot) && !searched.includes(index)).length;
}

/** Searches the chief still allows on this visit; Infinity where nobody counts them. */
function chiefAllowance(state: GameState, location: LocationDef): number {
  return visitSearchLimit(location, state.day) - (state.flags[visitKeyFor(state, location.id)] ?? 0);
}

/**
 * Searches this visit can still pay for: the chief's allowance or the lots left, whichever runs out
 * first, less one for every `NOISE_PER_LOST_SEARCH` the street has heard.
 */
export function visitSearchesLeft(state: GameState, location: LocationDef): number {
  const allowed = Math.min(chiefAllowance(state, location), remainingSearches(state, location));
  return Math.max(0, allowed - searchesLostToNoise(state, location.id));
}

/** What ends searching on this visit: the chief walking the player out, or lots left that are now too loud to reach. */
export type SearchStop = 'escorted' | 'noise';

/** Null while this visit can still search, or when the place is simply emptied. */
export function searchStop(state: GameState, location: LocationDef): SearchStop | null {
  if (chiefAllowance(state, location) <= 0) return 'escorted';
  return visitSearchesLeft(state, location) === 0 && remainingSearches(state, location) > 0 ? 'noise' : null;
}

/** Search limit and yard daylight after a trip at that limit, before any encounters. */
export function planVisit(state: GameState, location: LocationDef): { searches: number; hoursAfterReturn: number } {
  const time = state.hoursLeft - roundTripHours(location) - greetingHours(state, location);
  const remaining = remainingSearches(state, location);
  const free = time >= -1e-9 && hasViceLeftovers(state, location.id, GARAGE_WORKBENCH) && !state.locations.garage.searched.includes(GARAGE_WORKBENCH) ? 1 : 0;
  const timed = Math.max(0, Math.min(Math.floor((time + 1e-9) / SEARCH_HOURS), remaining - free, visitSearchLimit(location, state.day)));
  return { searches: free + timed, hoursAfterReturn: Math.max(0, time - timed * SEARCH_HOURS) };
}

export function concealableSpots(state: GameState): readonly number[] {
  const { where, outing, encounter } = state;
  if (state.phase !== 'day' || where === 'home' || where === 'road' || outing?.to !== where) return [];
  const location = LOCATIONS[where];
  if (state.hoursLeft + 1e-9 < CONCEAL_HOURS + location.travelHours) return [];
  if (encounter?.kind === 'dispute' && encounter.stage !== 'open' && encounter.stage !== 'refused') return [];
  const { covered, searched } = state.locations[where];
  const visitKey = visitKeyFor(state, where);
  if ((state.flags[visitKey] ?? 0) >= visitSearchLimit(location, state.day)) return [];
  if (covered.some((index) => !searched.includes(index))) return [];
  return location.spots.flatMap((spot, index) => {
    const claimed = encounter?.kind === 'dispute' && encounter.spot === index;
    const open = !spot.requiresDirectory && Object.keys(spot.loot).length > 0 && !searched.includes(index);
    return open && !claimed && !hasViceLeftovers(state, where, index) ? [index] : [];
  });
}

/** Cover one remaining lot, keeping enough daylight to drive home. */
export function concealSpot(state: GameState, index: number): GameState {
  const id = state.outing?.to;
  if (!id || !concealableSpots(state).includes(index)) return state;
  const progress = state.locations[id];
  return {
    ...state,
    hoursLeft: state.hoursLeft - CONCEAL_HOURS,
    locations: { ...state.locations, [id]: { ...progress, covered: [...progress.covered, index] } },
  };
}

/** Discover at most one missing lot per visit. A resident keeps watch until their night. */
function rollLooting(state: GameState, location: LocationDef, rng: Rng): number | undefined {
  const { lootCheckedDay, searched, covered } = state.locations[location.id];
  if (lootCheckedDay === null || searched.length >= location.spots.length) return;
  const guardedThrough = location.neighbor ? BOSS_NIGHT[location.neighbor] : 0;
  const daysExposed = state.day - Math.max(lootCheckedDay, guardedThrough);
  if (daysExposed <= 0) return;
  // Equipment puzzles such as the crossbow case have no material lot to steal.
  const lots = location.spots.flatMap((spot, index) => {
    const unattended = !spot.requiresDirectory && !hasViceLeftovers(state, location.id, index);
    return unattended && Object.keys(spot.loot).length > 0 && !searched.includes(index) ? [index] : [];
  });
  if (lots.length === 0 || !rng.chance(1 - (1 - DAILY_LOOT_CHANCE) ** daysExposed)) return;
  const leavesReceipt = location.id === 'hardware' && state.springReceipt === 'none'
    && lots.includes(HARDWARE_SPRING_BIN) && !covered.includes(HARDWARE_SPRING_BIN);
  const target = rng.pick(leavesReceipt ? [HARDWARE_SPRING_BIN] : lots);
  return !covered.includes(target) || rng.chance(COVER_FIND_CHANCE) ? target : undefined;
}

export function travelTo(state: GameState, id: LocationId): Result<TravelOutcome, DayError> {
  if (state.phase !== 'day') return err({ code: 'wrong_phase' });
  if (state.where !== 'home') return err({ code: 'not_home' });
  const location = LOCATIONS[id];
  if (!isUnlocked(location, state.day)) return err({ code: 'locked', unlockDay: location.unlockDay });
  const needed = roundTripHours(location);
  if (state.hoursLeft + 1e-9 < needed) return err({ code: 'no_time', needed });

  const progress = state.locations[id];
  const rng = createRng(state.rng);
  const arrival = openViceOnReturn(state, id);
  const looted = rollLooting(arrival, location, rng);
  const outing = { to: id, trunk: NO_STOCK, parted: NO_STOCK, major: false, marks: [] };
  const visit = { ...progress, visits: progress.visits + 1, lootCheckedDay: progress.lootCheckedDay === null ? null : state.day };
  let next: GameState = {
    ...arrival,
    where: id,
    hoursLeft: state.hoursLeft - location.travelHours,
    outing,
    encounter: null,
    locations: { ...state.locations, [id]: visit },
  };

  if (looted !== undefined) {
    const lootNotice = (state.flags['looting'] ?? 0) + 1;
    return ok({
      state: {
        ...next,
        rng: rng.state(),
        flags: { ...next.flags, looting: lootNotice },
        outing: { ...outing, lootNotice },
        locations: { ...next.locations, [id]: { ...visit, searched: [...visit.searched, looted], looted: [...visit.looted, looted] } },
        springReceipt: id === 'hardware' && looted === HARDWARE_SPRING_BIN && next.springReceipt === 'none' ? 'left' : next.springReceipt,
      },
      meeting: null,
    });
  }

  let meeting: NeighborMeeting | null = null;
  const neighbor = location.neighbor;
  const neighborAtHome = neighbor !== null && neighborStatus(neighbor, state.day) === 'alive';
  if (neighbor && neighborAtHome) {
    const key = flagKey('met', neighbor, state.day);
    const first = !next.flags[key];
    let gift: Cost = {};
    const hoursLost = greetingHours(state, location);
    if (first) {
      switch (neighbor) {
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
    next = {
      ...next,
      outing: next.outing && { ...next.outing, trunk: gain(next.outing.trunk, gift) },
      hoursLeft: next.hoursLeft - hoursLost,
      flags: { ...next.flags, [key]: 1 },
    };
    meeting = { neighbor, first, gift, hoursLost };
  }

  // Where nobody minds the place any more, somebody else may have had the same idea.
  const dispute = rollDispute(next, location, neighborAtHome, rng);
  next = { ...next, rng: rng.state() };
  if (dispute && next.outing) next = { ...next, encounter: dispute.encounter, flags: dispute.flags, outing: { ...next.outing, major: true } };
  return ok({ state: next, meeting });
}

/** The wire was left in plain sight, so collecting it takes no daylight. */
export function takeSpringReceipt(state: GameState): GameState {
  const { outing } = state;
  if (state.phase !== 'day' || state.where !== 'hardware' || outing?.to !== 'hardware' || state.springReceipt !== 'left') return state;
  return { ...state, springReceipt: 'held', outing: { ...outing, trunk: gain(outing.trunk, SPRING_RECEIPT_OFFER) } };
}

export interface SearchOutcome {
  readonly state: GameState;
  readonly loot: Cost;
}

/** While the chief still keeps order, he walks you out after two rummages per visit. */
export const CHIEF_SEARCH_LIMIT = 2;

/** Immutable outcomes of one eligible attempt, all based on the same daylight payment. */
export interface SearchAttempt {
  readonly paid: GameState;
  /** A miss is heard in the street (see core/street-noise.ts). */
  readonly failure: GameState;
  readonly success: SearchOutcome;
}

export function prepareSearch(state: GameState, spotIndex: number): Result<SearchAttempt, DayError> {
  if (state.phase !== 'day') return err({ code: 'wrong_phase' });
  if (state.where === 'home' || state.where === 'road') return err({ code: 'not_there' });
  const location = LOCATIONS[state.where];
  const spot = location.spots[spotIndex];
  if (!spot || !spotRevealed(state, spot)) return err({ code: 'unknown_spot' });
  const progress = state.locations[location.id];
  if (progress.searched.includes(spotIndex)) return err({ code: 'already_searched' });
  const { encounter, outing } = state;
  if (!outing) return err({ code: 'not_there' });
  if (encounter?.kind === 'dispute') {
    if (encounter.stage === 'game' || encounter.stage === 'price' || encounter.stage === 'fight') return err({ code: 'busy' });
    if (encounter.spot === spotIndex) return err({ code: 'disputed' });
  }
  // The drive home must still fit after the search.
  const opened = hasViceLeftovers(state, location.id, spotIndex);
  const searchHours = opened ? 0 : SEARCH_HOURS;
  const needed = searchHours + location.travelHours;
  if (state.hoursLeft + 1e-9 < needed) return err({ code: 'no_time', needed });

  if (visitSearchesLeft(state, location) === 0) return err({ code: 'escorted_out' });
  const visitKey = visitKeyFor(state, location.id);
  const searchesThisVisit = state.flags[visitKey] ?? 0;

  const rng = createRng(state.rng);
  const loot: Partial<Record<ResourceId, number>> = {};
  for (const id of RESOURCE_IDS) {
    if (opened && id === 'battery') continue;
    const range = spot.loot[id];
    if (range) loot[id] = rng.int(range[0], range[1]);
  }
  const paid: GameState = {
    ...state,
    hoursLeft: state.hoursLeft - searchHours,
    flags: {
      ...state.flags,
      [visitKey]: searchesThisVisit + 1,
      ...(!opened && isGarageVice(location.id, spotIndex) ? { [VICE_ATTEMPT_DAY]: state.day } : {}),
    },
  };
  const failed = makeNoise(paid, FAILED_ATTEMPT_NOISE);
  return ok({
    paid,
    failure: spot.fatalMiss ? { ...failed, phase: 'lost', fate: spot.fatalMiss, outing: null, encounter: null } : failed,
    success: {
      loot,
      state: {
        ...paid,
        rng: rng.state(),
        outing: { ...outing, trunk: gain(outing.trunk, loot) },
        locations: {
          ...state.locations,
          [location.id]: { ...progress, searched: [...progress.searched, spotIndex], covered: progress.covered.filter((index) => index !== spotIndex), lootCheckedDay: state.day },
        },
        totals: { ...state.totals, searches: state.totals.searches + 1 },
      },
    },
  });
}

/** Resolve a successful search in one step for headless campaign callers. */
export function searchSpot(state: GameState, spotIndex: number): Result<SearchOutcome, DayError> {
  const attempt = prepareSearch(state, spotIndex);
  return attempt.ok ? ok(attempt.value.success) : attempt;
}

export interface Departure {
  readonly state: GameState;
  /** How a dispute left unsettled ended when the break drove off. */
  readonly forfeit: Resolution | null;
}

/**
 * Leaves a location for the road home. The load is not safe yet: this is where a group may
 * bar the way, and the refuge is only reached through `arriveHome`.
 */
export function leaveLocation(state: GameState): Result<Departure, DayError> {
  if (state.phase !== 'day') return err({ code: 'wrong_phase' });
  if (state.where === 'home' || state.where === 'road') return err({ code: 'not_there' });
  const location = LOCATIONS[state.where];

  let next = state;
  let forfeit: Resolution | null = null;
  if (next.encounter) {
    const settled = walkAway(next);
    if (!settled.ok) return err({ code: 'busy' });
    next = settled.value.state;
    forfeit = settled.value.resolution;
  }

  next = { ...next, where: 'road', hoursLeft: Math.max(0, next.hoursLeft - location.travelHours) };
  if (next.outing && shouldStopAtDusk(next, next.hoursLeft)) next = { ...next, outing: { ...next.outing, crossbowStop: true } };
  const rng = createRng(next.rng);
  const ambush = rollAmbush(next, rng);
  next = { ...next, rng: rng.state() };
  if (ambush && next.outing) next = { ...next, encounter: ambush.encounter, flags: ambush.flags, outing: { ...next.outing, major: true } };
  return ok({ state: next, forfeit });
}

export interface Arrival {
  readonly state: GameState;
  /** What was unloaded into the refuge's stock. */
  readonly brought: Inventory;
  /** What the outing handed over or had taken on the way. */
  readonly parted: Inventory;
  readonly marks: readonly OutingMark[];
}

/** Pulls into the yard and unloads. Only now does the outing's load count as the refuge's. */
export function arriveHome(state: GameState): Result<Arrival, DayError> {
  if (state.phase !== 'day') return err({ code: 'wrong_phase' });
  if (state.where !== 'road' || !state.outing) return err({ code: 'not_on_road' });
  if (state.encounter || state.outing.crossbowStop) return err({ code: 'encounter_pending' });
  const { trunk, parted, state: unloaded } = unloadMoped(state, state.outing.trunk, state.outing.parted);
  return ok({
    state: { ...unloaded, where: 'home', inventory: gain(state.inventory, trunk), outing: null },
    brought: trunk,
    parted,
    marks: state.outing.marks,
  });
}

// ───────────────────────────── Phase transitions ─────────────────────────────

/** Day → night. Only possible from home: the car is in the yard before dark. */
export function startNight(state: GameState): Result<GameState, DayError> {
  if (state.phase !== 'day') return err({ code: 'wrong_phase' });
  if (state.where !== 'home') return err({ code: 'not_home' });
  return ok({ ...state, phase: 'night', hoursLeft: 0 });
}

/**
 * Night → morning, or the end: `lost` when the house fell, `held` when the last night was survived.
 * The yard handed to the next day is the simulation's own result.
 */
export function concludeNight(state: GameState, sim: NightSim): GameState {
  if (state.phase !== 'night') return state;
  const report: NightReport = sim.report();
  const kills = Object.values(report.kills).reduce((sum, n) => sum + (n ?? 0), 0);
  // A night survived may leave something to go and see in the morning (see core/chapters.ts).
  const base: GameState = openChapters(
    {
      ...state,
      yard: sim.toYard(state.yard),
      lastNight: report,
      totals: { ...state.totals, kills: state.totals.kills + kills, triggers: state.totals.triggers + report.triggers },
    },
    report,
  );
  if (!report.survived) return { ...base, phase: 'lost' };
  if (state.day >= LAST_NIGHT) return { ...base, phase: 'held' };
  return { ...base, phase: 'morning' };
}

/** Morning → next day. Not before a chapter this morning waits for has been played (a camera is dark, someone is in the shed). */
export function startNextDay(state: GameState): GameState {
  if (state.phase !== 'morning' || chapterWaiting(state) !== null) return state;
  const { morningTape: _played, ...campaign } = state;
  const next: GameState = { ...campaign, phase: 'day', day: state.day + 1, where: 'home', outing: null, encounter: null };
  // What the chapters already played still do to every morning: a dressing, a man to water, a bundle at the gate.
  const dawn = dawnOf(next);
  return { ...next, hoursLeft: Math.max(0, DAY_HOURS + dawn.hours), inventory: gain(next.inventory, dawn.gift) };
}

// ───────────────────────────── The orchard ─────────────────────────────

export type OrchardError = { readonly code: 'not_awaited' } | { readonly code: 'no_fate' };

/**
 * How the morning in the orchard ended, written into the campaign: the day starts with both arms,
 * or late and with one, or the run stops there.
 */
export function settleOrchard(state: GameState, ending: Ending): Result<GameState, OrchardError> {
  if (!awaitsOrchard(state)) return err({ code: 'not_awaited' });
  if (isFate(ending)) return ok({ ...state, phase: 'lost', fate: ending });
  const settled: GameState = { ...state, orchard: ending };
  const day = startNextDay(settled);
  // The day it happens, part of the morning is spent face down in the grass.
  return ok(ending === 'maimed' ? { ...day, hoursLeft: Math.max(0, day.hoursLeft - ORCHARD.faintHours) } : day);
}

/** A run a chapter ended goes back to that morning, the night before still won, the chapter waiting again. */
export function retryChapter(state: GameState): Result<{ state: GameState; chapter: ChapterId }, OrchardError> {
  if (state.phase !== 'lost' || state.fate === null || state.fate === 'lift') return err({ code: 'no_fate' });
  const morning: GameState = { ...state, phase: 'morning', fate: null };
  const chapter = chapterWaiting(morning);
  if (chapter === null) return err({ code: 'no_fate' });
  return ok({ state: morning, chapter });
}

/** The orchard's own name for it, kept for its callers. */
export function retryOrchard(state: GameState): Result<GameState, OrchardError> {
  const again = retryChapter(state);
  return again.ok ? ok(again.value.state) : again;
}

// ───────────────────────────── The shed ─────────────────────────────

/**
 * How the morning in the shed ended, written into the campaign: the day starts with what he told (his
 * van's load in the stock, the rest on the "tonight" card) and the daylight the shed took — or the run
 * stops there.
 */
export function settleShed(state: GameState, result: ShedResult): Result<GameState, OrchardError> {
  if (!awaitsShed(state)) return err({ code: 'not_awaited' });
  if (isShedFate(result.ending)) return ok({ ...state, phase: 'lost', fate: result.ending });
  const learned = [...new Set([...state.intel, ...result.learned])];
  const stocked = learned.includes('stash') && !state.intel.includes('stash') ? gain(state.inventory, SHED.stash) : state.inventory;
  // The day that follows is the one the shed was played on: what it does to later mornings starts tomorrow.
  const day = startNextDay({ ...state, shed: result.ending, intel: learned, inventory: stocked });
  return ok({ ...day, hoursLeft: Math.max(0, day.hoursLeft - result.hours) });
}

// ───────────────────────────── The radio ─────────────────────────────

/**
 * How the morning on the radio ended, written into the campaign: the last day starts with what the call
 * led to — a load in the stock or a visit taken out of it, daylight spent or given, the caller's opinion of
 * the player — and the call itself kept, for the night's door and the end. Nothing here ends a run.
 */
export function settleRadio(state: GameState, result: RadioResult): Result<GameState, OrchardError> {
  const call = state.radio.call;
  if (!awaitsRadio(state) || !call) return err({ code: 'not_awaited' });
  const after = aftermathOf(call, result.answer, state.inventory);
  const { stock, took } = stockAfter(state.inventory, after);
  const rival = rivalOf(call.caller);
  const people = rival && after.standing ? { ...state.people, [rival]: { ...acquaintance(state, rival), standing: after.standing } } : state.people;
  const radio = { stage: 'done', call, ending: result.ending, answer: result.answer, sighted: [...result.sighted], paid: after.pay, took } as const;
  const day = startNextDay({ ...state, inventory: stock, people, radio });
  return ok({ ...day, hoursLeft: Math.min(DAY_HOURS, Math.max(0, day.hoursLeft - result.hours - after.hours)) });
}

export const clockLabel = (hoursLeft: number): string => {
  const elapsed = DAY_HOURS - hoursLeft;
  const total = Math.round((7 + elapsed) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

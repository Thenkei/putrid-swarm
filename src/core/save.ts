// Save-game (de)serialisation. Parsing is defensive: a corrupt or foreign blob yields null,
// never a half-valid GameState.

import type { Acquaintance, Ambush, Cost, DeviceInstance, Dispute, Encounter, ChapterFate, Fate, Fight, GameState, Intel, Inventory, NightHighlight, OrchardChapter, Outing, Phase, RivalId, SectorId, ShedChapter, Stance, Standing, TrapTally } from './types';
import { chapterOfFate, chapterWaiting } from './chapters';
import { CALLERS, ENDINGS as RADIO_ENDINGS, QUIET_RADIO, optionOf, rollCall, type AnswerId, type Call, type CallerId, type Ending as RadioEnding, type RadioStage } from './radio';
import { createRng } from './rng';
import { facingsOf } from './data/devices';
import { ENCOUNTER } from './data/rivals';
import { LOCATIONS } from './data/locations';
import { GROUP_IDS, INTEL_IDS, LOCATION_IDS, RESOURCE_IDS, RIVAL_IDS, SECTOR_IDS } from './types';

export const SAVE_VERSION = 1;
const PHASES: readonly Phase[] = ['day', 'night', 'morning', 'lost', 'held'];
/** Saved when holding the seventh night still counted as winning: the same run, under its new name. */
const LEGACY_PHASES: Readonly<Record<string, Phase>> = { won: 'held' };

export const serialize = (state: GameState): string => JSON.stringify(state);

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Devices saved before they could be turned have no facing. Palisades then followed their
 * neighbours (a run along y was drawn turned); everything else faced the default way.
 */
function withFacing(devices: readonly DeviceInstance[]): DeviceInstance[] {
  const fenceAt = (x: number, y: number): boolean => devices.some((d) => d.type === 'fence' && d.x === x && d.y === y);
  return devices.map((d) => {
    if (Number.isInteger(d.facing) && d.facing >= 0 && d.facing < facingsOf(d.type)) return d;
    const alongY = d.type === 'fence' && (fenceAt(d.x, d.y - 1) || fenceAt(d.x, d.y + 1)) && !(fenceAt(d.x - 1, d.y) || fenceAt(d.x + 1, d.y));
    return { ...d, facing: alongY ? 1 : 0 };
  });
}

/** A day a device says it was laid on is only kept if it is one: anything else is a piece that has always been there. */
function withBuiltDay(devices: readonly DeviceInstance[]): DeviceInstance[] {
  return devices.map((d) => {
    const { builtDay, ...rest } = d;
    return isNumber(builtDay) && Number.isInteger(builtDay) && builtDay >= 1 ? d : rest;
  });
}

/** Reports saved before traps were tallied have nothing per trap; a malformed entry is dropped. */
function parseTallies(v: unknown): Record<number, TrapTally> {
  if (!isRecord(v)) return {};
  const tallies: Record<number, TrapTally> = {};
  for (const [id, raw] of Object.entries(v)) {
    const count = (n: unknown): n is number => isNumber(n) && Number.isInteger(n) && n >= 0;
    if (Number.isInteger(Number(id)) && isRecord(raw) && count(raw['fired']) && count(raw['hits']) && count(raw['kills'])) {
      tallies[Number(id)] = { fired: raw['fired'], hits: raw['hits'], kills: raw['kills'] };
    }
  }
  return tallies;
}

// ───────────────────────────── Outings and encounters ─────────────────────────────
// Saved before encounters existed, a game has none of this: it is at the refuge or at a location
// with an empty boot. Anything present but malformed is dropped rather than half-trusted.

const STANDINGS: readonly Standing[] = ['grudge', 'stranger', 'owes'];
const STANCES: readonly Stance[] = ['guard', 'rush', 'falter'];
const isCount = (v: unknown): v is number => isNumber(v) && Number.isInteger(v) && v >= 0;
const isLocation = (v: unknown): v is (typeof LOCATION_IDS)[number] => LOCATION_IDS.includes(v as (typeof LOCATION_IDS)[number]);
const isRival = (v: unknown): v is RivalId => RIVAL_IDS.includes(v as RivalId);
const isStock = (v: unknown): v is Inventory => isRecord(v) && RESOURCE_IDS.every((id) => isCount(v[id]));
const isCost = (v: unknown): v is Cost => isRecord(v) && Object.entries(v).every(([id, n]) => RESOURCE_IDS.includes(id as (typeof RESOURCE_IDS)[number]) && isCount(n));
const isFraction = (v: unknown): v is number => isNumber(v) && v >= 0 && v <= 1;

const isFight = (v: unknown): v is Fight =>
  isRecord(v) &&
  Array.isArray(v['stances']) &&
  v['stances'].length === ENCOUNTER.exchanges &&
  v['stances'].every((s) => STANCES.includes(s as Stance)) &&
  isCount(v['exchange']) &&
  v['exchange'] < ENCOUNTER.exchanges &&
  isCount(v['blows']) &&
  typeof v['staggered'] === 'boolean';

function parseDispute(v: Record<string, unknown>): Dispute | null {
  const game = v['game'];
  const valid =
    isRival(v['rival']) &&
    isLocation(v['location']) &&
    isCount(v['spot']) &&
    v['spot'] < LOCATIONS[v['location']].spots.length &&
    isCost(v['lot']) &&
    isCost(v['price']) &&
    typeof v['yields'] === 'boolean' &&
    typeof v['plays'] === 'boolean' &&
    ['open', 'refused', 'game', 'fight'].includes(v['stage'] as string) &&
    isRecord(game) &&
    Array.isArray(game['theirs']) &&
    game['theirs'].length === ENCOUNTER.throws &&
    game['theirs'].every(isFraction) &&
    Array.isArray(game['yours']) &&
    game['yours'].length < ENCOUNTER.throws &&
    game['yours'].every(isFraction) &&
    isFight(v['fight']);
  return valid ? (v as unknown as Dispute) : null;
}

function parseAmbush(v: Record<string, unknown>): Ambush | null {
  const valid =
    GROUP_IDS.includes(v['group'] as (typeof GROUP_IDS)[number]) &&
    isCount(v['toll']) &&
    Array.isArray(v['accepts']) &&
    v['accepts'].every((id) => RESOURCE_IDS.includes(id as (typeof RESOURCE_IDS)[number])) &&
    isCost(v['need']) &&
    isNumber(v['detourHours']) &&
    v['detourHours'] >= 0 &&
    (v['member'] === null || isRival(v['member'])) &&
    STANDINGS.includes(v['memberStanding'] as Standing) &&
    (v['stage'] === 'open' || v['stage'] === 'fight') &&
    isFight(v['fight']);
  return valid ? (v as unknown as Ambush) : null;
}

function parseOuting(v: unknown): Outing | null {
  if (!isRecord(v) || !isLocation(v['to']) || !isStock(v['trunk']) || !isStock(v['parted'])) return null;
  const marks = Array.isArray(v['marks']) ? v['marks'].filter((m) => isRecord(m) && typeof m['who'] === 'string' && typeof m['outcome'] === 'string') : [];
  return { to: v['to'], trunk: v['trunk'], parted: v['parted'], major: v['major'] === true, marks: marks as Outing['marks'] };
}

function parsePeople(v: unknown): GameState['people'] {
  if (!isRecord(v)) return {};
  const people: Partial<Record<RivalId, Acquaintance>> = {};
  for (const id of RIVAL_IDS) {
    const who = v[id];
    if (isRecord(who) && STANDINGS.includes(who['standing'] as Standing) && isCount(who['met'])) {
      people[id] = { standing: who['standing'] as Standing, met: who['met'], fought: who['fought'] === true };
    }
  }
  return people;
}

/** The part of a save that describes the trip in progress, made consistent with where the player is. */
function parseTrip(data: Record<string, unknown>, where: GameState['where']): Pick<GameState, 'where' | 'outing' | 'encounter' | 'people'> {
  const people = parsePeople(data['people']);
  if (where === 'home') return { where, outing: null, encounter: null, people };

  const outing = parseOuting(data['outing']);
  // On the road with nothing to say what was loaded: the drive is over, nothing was lost.
  if (where === 'road' && !outing) return { where: 'home', outing: null, encounter: null, people };
  const trip: Outing = outing ?? { to: where as Outing['to'], trunk: { wood: 0, scrap: 0, springs: 0, wire: 0, battery: 0 }, parted: { wood: 0, scrap: 0, springs: 0, wire: 0, battery: 0 }, major: false, marks: [] };

  const raw = data['encounter'];
  let encounter: Encounter | null = null;
  if (isRecord(raw)) {
    // A dispute belongs to the place the player is at; a roadblock to the road.
    if (raw['kind'] === 'dispute' && where !== 'road') {
      const dispute = parseDispute(raw);
      encounter = dispute && dispute.location === where ? dispute : null;
    } else if (raw['kind'] === 'ambush' && where === 'road') {
      encounter = parseAmbush(raw);
    }
  }
  return { where, outing: trip, encounter, people };
}

// ───────────────────────────── The orchard ─────────────────────────────
// Saved before the orchard existed, a game has no chapter and no fate: the orchard is quiet and the
// run, if it is over, was lost to the house.

const CHAPTERS: readonly OrchardChapter[] = ['quiet', 'cut', 'spared', 'maimed'];
const FATES: readonly ChapterFate[] = ['throat', 'turned', 'bled', 'bitten'];

function parseOrchard(data: Record<string, unknown>): Pick<GameState, 'orchard'> {
  return { orchard: CHAPTERS.includes(data['orchard'] as OrchardChapter) ? (data['orchard'] as OrchardChapter) : 'quiet' };
}

// ───────────────────────────── The shed ─────────────────────────────
// Saved before the shed existed, a game has nobody in it and nothing told.

const SHEDS: readonly ShedChapter[] = ['quiet', 'waiting', 'freed', 'finished', 'chained', 'emptied'];

function parseShed(data: Record<string, unknown>): Pick<GameState, 'shed' | 'intel'> {
  const shed = SHEDS.includes(data['shed'] as ShedChapter) ? (data['shed'] as ShedChapter) : 'quiet';
  const raw = Array.isArray(data['intel']) ? data['intel'] : [];
  // Nothing can have been told before the shed was played; what is unknown or repeated is dropped.
  const intel = shed === 'quiet' || shed === 'waiting' ? [] : INTEL_IDS.filter((id: Intel) => raw.includes(id));
  return { shed, intel };
}

// ───────────────────────────── The radio ─────────────────────────────
// Saved before the radio existed, a game has heard nothing on it. A call that is malformed while one is
// waiting is rolled again from the run's seed rather than lost; anything else malformed is dropped.

const RADIO_STAGES: readonly RadioStage[] = ['quiet', 'waiting', 'done'];
const isUnit = (v: unknown): v is number => isNumber(v) && v >= 0 && v <= 1;

function parseCall(v: unknown): Call | null {
  if (!isRecord(v)) return null;
  const valid =
    CALLERS.includes(v['caller'] as CallerId) &&
    typeof v['secret'] === 'boolean' &&
    isUnit(v['at']) &&
    isNumber(v['phase']) &&
    isUnit(v['news']) &&
    (v['baker'] === null || isUnit(v['baker']));
  return valid ? { caller: v['caller'] as CallerId, secret: v['secret'] as boolean, at: v['at'] as number, phase: v['phase'] as number, news: v['news'] as number, baker: v['baker'] as number | null } : null;
}

function parseRadio(data: Record<string, unknown>, people: GameState['people'], shed: ShedChapter, seed: number): Pick<GameState, 'radio'> {
  const raw = data['radio'];
  if (!isRecord(raw) || !RADIO_STAGES.includes(raw['stage'] as RadioStage) || raw['stage'] === 'quiet') return { radio: QUIET_RADIO };
  const call = parseCall(raw['call']);
  if (raw['stage'] === 'waiting') return { radio: { ...QUIET_RADIO, stage: 'waiting', call: call ?? rollCall({ people, shed }, createRng(seed ^ 0x5ad10)) } };
  const ending = RADIO_ENDINGS.includes(raw['ending'] as RadioEnding) ? (raw['ending'] as RadioEnding) : null;
  if (!call || !ending) return { radio: QUIET_RADIO };
  // Only an answer that call offers, and only for an ending that is an answer.
  const answer = ending !== 'silence' && ending !== 'off' && optionOf(call.caller, raw['answer'] as AnswerId) ? (raw['answer'] as AnswerId) : null;
  const sighted = Array.isArray(raw['sighted']) && answer ? SECTOR_IDS.filter((id) => (raw['sighted'] as unknown[]).includes(id)) : [];
  return { radio: { stage: 'done', call, ending, answer, sighted, paid: isCost(raw['paid']) ? raw['paid'] : {}, took: isCost(raw['took']) ? raw['took'] : {} } };
}

/** A fate only means something on a run a chapter ended, on the morning that chapter was waiting. */
function parseFate(data: Record<string, unknown>, state: GameState): Fate | null {
  if (data['fate'] === 'lift') return state.phase === 'lost' && state.where === 'garage' ? 'lift' : null;
  const fate = FATES.includes(data['fate'] as ChapterFate) ? (data['fate'] as ChapterFate) : null;
  if (fate === null || state.phase !== 'lost') return null;
  return chapterWaiting({ ...state, phase: 'morning' }) === chapterOfFate(fate) ? fate : null;
}

function isNightHighlight(value: unknown): value is NightHighlight {
  if (!isRecord(value)) return false;
  if (value.kind === 'breach') return SECTOR_IDS.includes(value.sector as SectorId);
  return isCount(value.deviceId) && (value.kind === 'broken' || (value.kind === 'catch' && isCount(value.kills) && value.kills > 0));
}

export function deserialize(raw: string): GameState | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || data['version'] !== SAVE_VERSION) return null;
  if (!isNumber(data['seed']) || !isNumber(data['rng']) || !isNumber(data['day']) || !isNumber(data['hoursLeft'])) return null;
  const phase = LEGACY_PHASES[data['phase'] as string] ?? data['phase'];
  if (!PHASES.includes(phase as Phase)) return null;
  if (data['where'] !== 'home' && data['where'] !== 'road' && !isLocation(data['where'])) return null;

  const inventory = data['inventory'];
  if (!isRecord(inventory) || !RESOURCE_IDS.every((id) => isNumber(inventory[id]) && (inventory[id] as number) >= 0)) return null;

  const yard = data['yard'];
  if (!isRecord(yard) || !Array.isArray(yard['devices']) || !Array.isArray(yard['decals'])) return null;
  if (!isNumber(yard['houseHp']) || !isNumber(yard['nextDeviceId'])) return null;
  const barricades = yard['barricades'];
  if (!isRecord(barricades) || !SECTOR_IDS.every((s) => isRecord(barricades[s]) && isNumber((barricades[s] as Record<string, unknown>)['hp']))) return null;

  const locations = data['locations'];
  if (!isRecord(locations) || !LOCATION_IDS.every((id) => isRecord(locations[id]) && Array.isArray((locations[id] as Record<string, unknown>)['searched']))) {
    return null;
  }
  if (!isRecord(data['flags']) || !isRecord(data['totals'])) return null;

  // A night in progress is not resumable: restart that night from the evening.
  const parsed = { ...data, phase } as unknown as GameState;
  // Reports saved before automatic traps existed have no count for them.
  const lastNight = parsed.lastNight && {
    ...parsed.lastNight,
    autoTriggers: isNumber(parsed.lastNight.autoTriggers) ? parsed.lastNight.autoTriggers : 0,
    // Reports saved before a camera could go dark have none.
    cameraLost: SECTOR_IDS.includes(parsed.lastNight.cameraLost as SectorId) ? parsed.lastNight.cameraLost : null,
    traps: parseTallies((parsed.lastNight as { traps?: unknown }).traps),
  };
  if (lastNight) {
    if (!isNightHighlight(lastNight.highlight)) delete lastNight.highlight;
    if (!SECTOR_IDS.includes(lastNight.firstHouseHit as SectorId)) delete lastNight.firstHouseHit;
  }
  const shed = parseShed(data);
  const radio = parseRadio(data, parsePeople(data['people']), shed.shed, data['seed'] as number);
  const chaptered: GameState = { ...parsed, lastNight, ...parseOrchard(data), ...shed, ...radio, fate: null };
  const reported: GameState = { ...chaptered, fate: parseFate(data, chaptered) };
  // Outside the day nobody is out: the trip, if a save still carries one, is over.
  const trip = reported.fate === 'lift' ? { where: 'garage' as const, outing: null, encounter: null, people: parsePeople(data['people']) } : parseTrip(data, parsed.phase === 'day' ? parsed.where : 'home');
  const state: GameState = { ...reported, ...trip, yard: { ...reported.yard, devices: withBuiltDay(withFacing(reported.yard.devices)) } };
  return state.phase === 'night' ? { ...state, phase: 'day', where: 'home', hoursLeft: 0 } : state;
}

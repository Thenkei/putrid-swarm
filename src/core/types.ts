// Domain types for the Putrid Swarm simulation. Nothing in src/core touches the DOM.

import type { RadioChapter } from './radio';

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const RESOURCE_IDS = ['wood', 'scrap', 'springs', 'wire', 'battery'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type Inventory = Readonly<Record<ResourceId, number>>;
export type Cost = Readonly<Partial<Record<ResourceId, number>>>;

export const SECTOR_IDS = ['portail', 'grange', 'arriere', 'verger'] as const;
/** A sector is both an approach to the house and the camera that watches it. */
export type SectorId = (typeof SECTOR_IDS)[number];

/** Build-menu order: the obstacle, the automatic traps, then the ones fired from the desk. */
export const DEVICE_TYPE_IDS = ['fence', 'spikes', 'net', 'log', 'barrier', 'horn', 'floodlight'] as const;
export type DeviceTypeId = (typeof DEVICE_TYPE_IDS)[number];

export const ENEMY_TYPE_IDS = [
  'shambler',
  'runner',
  'brute',
  'dog',
  'boar',
  'deer',
  'mower',
  'mechanic',
  'mail',
  'chief',
  'mayor',
] as const;
export type EnemyTypeId = (typeof ENEMY_TYPE_IDS)[number];

export const NEIGHBOR_IDS = ['mower', 'mechanic', 'mail', 'chief', 'mayor'] as const;
export type NeighborId = (typeof NEIGHBOR_IDS)[number];

export const LOCATION_IDS = ['shed', 'garage', 'hardware', 'grocery', 'post', 'police', 'townhall'] as const;
export type LocationId = (typeof LOCATION_IDS)[number];

/** Living survivors met over a disputed lot. Unlike the neighbours, they never come back as bosses. */
export const RIVAL_IDS = ['dealer', 'camper'] as const;
export type RivalId = (typeof RIVAL_IDS)[number];

/** Groups that stop the break on the way home to claim part of the load. */
export const GROUP_IDS = ['committee', 'van'] as const;
export type GroupId = (typeof GROUP_IDS)[number];

export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** A defense placed in the yard. Persisted between days. */
/**
 * Which way a device is turned on its cell: 0 runs along the grid's x axis, 1 along its y axis.
 * Palisades have two more, for runs laid corner to corner: 2 along the x = −y diagonal (a level
 * line on screen), 3 along the x = y diagonal (straight toward the viewer).
 * It decides how the piece is drawn and nothing else — a palisade blocks its cell whichever way it faces.
 */
export type Facing = 0 | 1 | 2 | 3;

export interface DeviceInstance {
  readonly id: number;
  readonly type: DeviceTypeId;
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  readonly hp: number;
  readonly broken: boolean;
  /** The day it was laid. Until that day's night it can be taken back whole (see `isFresh` in yard.ts). */
  readonly builtDay?: number;
}

export interface BarricadeState {
  readonly hp: number;
  /** 0 = planks, 1 = reinforced with sheet metal (higher max hp). */
  readonly level: 0 | 1;
}

export type DecalKind = 'mown' | 'splat' | 'debris';
export interface Decal {
  readonly kind: DecalKind;
  readonly x: number;
  readonly y: number;
}

export interface YardState {
  readonly devices: readonly DeviceInstance[];
  readonly nextDeviceId: number;
  readonly barricades: Readonly<Record<SectorId, BarricadeState>>;
  /** 0 means the house has been overrun. */
  readonly houseHp: number;
  readonly decals: readonly Decal[];
}

/**
 * `lost`: the house fell (or, with a `fate`, the orchard ended it). `held`: the seventh night was held —
 * and the seventh dawn does not send them home, so the run ends on the mower all the same. There is no
 * phase for a run that was won: every run ends with the village in the garden.
 */
export type Phase = 'day' | 'night' | 'morning' | 'lost' | 'held';

export type NightHighlight =
  | { readonly kind: 'breach'; readonly sector: SectorId }
  | { readonly kind: 'broken'; readonly deviceId: number }
  | { readonly kind: 'catch'; readonly deviceId: number; readonly kills: number };

/** What one trap did over a night: how often it went off, what stood in it when it did, what it put down. */
export interface TrapTally {
  readonly fired: number;
  readonly hits: number;
  readonly kills: number;
}

export interface NightReport {
  /** Absent in older saves, or on nights without a qualifying event. */
  readonly highlight?: NightHighlight;
  readonly night: number;
  readonly survived: boolean;
  readonly kills: Readonly<Partial<Record<EnemyTypeId, number>>>;
  readonly breaches: number;
  readonly houseDamage: number;
  readonly devicesBroken: number;
  readonly barricadeDamage: Readonly<Record<SectorId, number>>;
  /** Traps fired from the desk. */
  readonly triggers: number;
  /** Traps that went off by themselves. */
  readonly autoTriggers: number;
  readonly letterDelivered?: true;
  readonly bossDefeated: NeighborId | null;
  readonly durationSeconds: number;
  /** A camera that stopped sending during the night, and is still dark in the morning. */
  readonly cameraLost: SectorId | null;
  /** Every trap that stood in the yard that night, by device id — the ones that never went off included. */
  readonly traps: Readonly<Record<number, TrapTally>>;
}

export interface LocationProgress {
  /** Indices of the search spots already emptied. */
  readonly searched: readonly number[];
  /** Which of those spots were emptied while the player was away. */
  readonly looted: readonly number[];
  /** At most one unopened cover, plus the covers found pulled aside over stolen lots. */
  readonly covered: readonly number[];
  /** Last visit after collecting loot here, or null before taking any. */
  readonly lootCheckedDay: number | null;
  readonly visits: number;
}

/** The note left in the hardware shop, taken along, then shown to the dealer. */
export type SpringReceipt = 'none' | 'left' | 'held' | 'answered';

// ───────────────────────────── Outings and encounters ─────────────────────────────

/** How a survivor stands with the player. One favour is owed at most, and a grudge is not a score. */
export type Standing = 'grudge' | 'stranger' | 'owes';

export interface Acquaintance {
  readonly standing: Standing;
  /** Disputes met with them so far. */
  readonly met: number;
  /** It came to blows at least once: they still wear the mark. */
  readonly fought: boolean;
}

/** What the other side shows it is about to do in a scuffle. */
export type Stance = 'guard' | 'rush' | 'falter';

/** A short confrontation: three exchanges at most, over one thing. */
export interface Fight {
  /** The other side's three intentions, fixed when the encounter is created. */
  readonly stances: readonly Stance[];
  /** Exchanges already played. */
  readonly exchange: number;
  /** Blows taken; each one is daylight spent getting one's breath back. */
  readonly blows: number;
  /** A shove landed: the next exchange is an opening whatever was planned. */
  readonly staggered: boolean;
}

/** Three washers each, thrown at a biscuit tin. Positions run 0..1 along the plank. */
export interface WasherGame {
  /** Where the rival's washers land, fixed when the encounter is created. */
  readonly theirs: readonly number[];
  /** Where the player's washers landed so far. */
  readonly yours: readonly number[];
}

/** Someone is already at one search spot of a location and claims what is in it. */
export interface Dispute {
  readonly kind: 'dispute';
  readonly rival: RivalId;
  readonly location: LocationId;
  /** The search spot held back while the lot is disputed. */
  readonly spot: number;
  /** What is in it, rolled once. */
  readonly lot: Cost;
  /** What the rival takes from the boot for the whole lot. */
  readonly price: Cost;
  /** Whether they give way to a threat. Shown to the player as how they hold themselves. */
  readonly yields: boolean;
  /** Whether they will settle it with washers. */
  readonly plays: boolean;
  readonly receiptAnswered?: true;
  /** `refused`: a threat was made and did not work. */
  readonly stage: 'open' | 'refused' | 'game' | 'price' | 'fight';
  readonly game: WasherGame;
  readonly fight: Fight;
}

/** A group bars the road home and wants part of what is in the boot. */
export interface Ambush {
  readonly kind: 'ambush';
  readonly group: GroupId;
  /** Pieces of the load they ask for; the player picks which. */
  readonly toll: number;
  /** What they will take as payment. */
  readonly accepts: readonly ResourceId[];
  /** The one thing they came for: fewer pieces of it settle the matter. */
  readonly need: Cost;
  /** The way round, in hours. */
  readonly detourHours: number;
  /** A survivor in the group and how they stood with the player when it formed. */
  readonly member: RivalId | null;
  readonly memberStanding: Standing;
  readonly stage: 'open' | 'fight';
  readonly fight: Fight;
}

export type Encounter = Dispute | Ambush;

/** How an encounter ended, kept for the outing's report. */
export type OutcomeId =
  | 'shared'
  | 'traded'
  | 'favor'
  | 'game_won'
  | 'game_tied'
  | 'game_lost'
  | 'scared'
  | 'backed_down'
  | 'conceded'
  | 'fight_won'
  | 'fight_split'
  | 'fight_lost'
  | 'paid'
  | 'bargained'
  | 'waved'
  | 'detour'
  | 'held'
  | 'robbed_half'
  | 'robbed';

export interface OutingMark {
  readonly who: RivalId | GroupId;
  readonly outcome: OutcomeId;
}

/** One trip in the break. What it loads is not safe until the refuge. */
export interface Outing {
  readonly to: LocationId;
  /** The load: everything found or won since leaving, less what was handed over. */
  readonly trunk: Inventory;
  /** What left the boot again before the refuge: traded, paid, taken. */
  readonly parted: Inventory;
  /** Whether an encounter with something at stake was already met on this trip. */
  readonly major: boolean;
  readonly marks: readonly OutingMark[];
  /** The last stretch is blocked by infected and must be played before unloading. */
  readonly crossbowStop?: true;
  /** Pending arrival remark, numbered across the run. */
  readonly lootNotice?: number;
}

// ───────────────────────────── The orchard ─────────────────────────────

/**
 * The morning in the orchard, once per run: nothing yet, a camera gone dark that has to be looked at,
 * then how it went — the rabbit was shooed off, or it cost the left arm.
 */
export type OrchardChapter = 'quiet' | 'cut' | 'spared' | 'maimed';

/**
 * The ways a played chapter ends a run: in the orchard, bitten at the throat, turned before the arm was
 * off, bled dry; in the shed, bitten by the man on the chain.
 */
export type OrchardFate = 'throat' | 'turned' | 'bled';
export type ChapterFate = OrchardFate | 'bitten';
export type Fate = ChapterFate | 'lift';

// ───────────────────────────── The shed ─────────────────────────────

/**
 * The morning in the shed, once per run: nothing yet, one of them shut in it overnight and waiting, then
 * what was done with him — let go, finished off, left chained, or used up until nothing of him was left.
 */
export type ShedChapter = 'quiet' | 'waiting' | 'freed' | 'finished' | 'chained' | 'emptied';

/** What he told that is worth something: where his van is, what tonight is made of, how the chief works. */
export const INTEL_IDS = ['stash', 'tonight', 'chief'] as const;
export type Intel = (typeof INTEL_IDS)[number];

export interface GameState {
  readonly version: 1;
  readonly seed: number;
  /** Serialised RNG cursor so reloads do not re-roll loot. */
  readonly rng: number;
  /** 1-based. Night N follows day N. */
  readonly day: number;
  readonly phase: Phase;
  readonly hoursLeft: number;
  /** `road`: driving back, the load not yet unloaded. */
  readonly where: 'home' | LocationId | 'road';
  /** The refuge's stock. An outing can add to it on arrival and never takes from it. */
  readonly inventory: Inventory;
  /** The trip in progress; null at the refuge. */
  readonly outing: Outing | null;
  /** The encounter in progress, at whatever stage it was left. */
  readonly encounter: Encounter | null;
  readonly people: Readonly<Partial<Record<RivalId, Acquaintance>>>;
  readonly yard: YardState;
  readonly locations: Readonly<Record<LocationId, LocationProgress>>;
  readonly springReceipt: SpringReceipt;
  readonly flags: Readonly<Record<string, number>>;
  readonly lastNight: NightReport | null;
  readonly orchard: OrchardChapter;
  readonly shed: ShedChapter;
  /** What the man in the shed told. */
  readonly intel: readonly Intel[];
  /** The morning on the radio: who called, what was answered, and what came of it (core/radio.ts). */
  readonly radio: RadioChapter;
  /** Why the run stopped, when it was not the house that fell. */
  readonly fate: Fate | null;
  readonly totals: {
    readonly kills: number;
    readonly triggers: number;
    readonly searches: number;
  };
}

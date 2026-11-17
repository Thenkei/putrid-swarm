// Domain types for the Putrid Swarm simulation. Nothing in src/core touches the DOM.

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

export type Phase = 'day' | 'night' | 'morning' | 'lost' | 'won';

export interface NightReport {
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
  readonly bossDefeated: NeighborId | null;
  readonly durationSeconds: number;
}

export interface LocationProgress {
  /** Indices of the search spots already emptied. */
  readonly searched: readonly number[];
  readonly visits: number;
}

export interface GameState {
  readonly version: 1;
  readonly seed: number;
  /** Serialised RNG cursor so reloads do not re-roll loot. */
  readonly rng: number;
  /** 1-based. Night N follows day N. */
  readonly day: number;
  readonly phase: Phase;
  readonly hoursLeft: number;
  readonly where: 'home' | LocationId;
  readonly inventory: Inventory;
  readonly yard: YardState;
  readonly locations: Readonly<Record<LocationId, LocationProgress>>;
  readonly flags: Readonly<Record<string, number>>;
  readonly lastNight: NightReport | null;
  readonly totals: {
    readonly kills: number;
    readonly triggers: number;
    readonly searches: number;
  };
}

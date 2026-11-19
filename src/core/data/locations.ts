// Daytime destinations. Positions are fractions of the plate (0..1) so art can be swapped without touching logic.

import type { LocationId, NeighborId, ResourceId } from '../types';

export type LootTable = Readonly<Partial<Record<ResourceId, readonly [min: number, max: number]>>>;

export interface SearchSpot {
  /** i18n suffix: `spot.<location>.<key>`. */
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly loot: LootTable;
  readonly fatalMiss?: 'lift';
  readonly requiresDirectory?: true;
}

export interface LocationDef {
  readonly id: LocationId;
  /** One-way drive, in hours. */
  readonly travelHours: number;
  /** First day the place can be reached. */
  readonly unlockDay: number;
  readonly plate: string;
  /** Pin position on the village map plate. */
  readonly pin: { readonly x: number; readonly y: number };
  readonly neighbor: NeighborId | null;
  readonly spots: readonly SearchSpot[];
}

/** Where the refuge sits on the village map plate. */
export const HOME_PIN = { x: 0.22, y: 0.72 } as const;

export const DAY_HOURS = 12;
export const DAY_START_HOUR = 7;
export const SEARCH_HOURS = 0.5;
export const DAILY_LOOT_CHANCE = 0.25;

/** The night each neighbour comes back as a boss. They are met alive on every day up to and including that one. */
export const BOSS_NIGHT: Readonly<Record<NeighborId, number>> = {
  mower: 2,
  mechanic: 4,
  mail: 5,
  chief: 6,
  mayor: 7,
};

const destinations = {
  shed: {
    id: 'shed',
    travelHours: 0.25,
    unlockDay: 1,
    plate: 'plate_loc_shed',
    pin: { x: 0.6, y: 0.72 },
    neighbor: 'mower',
    spots: [
      { key: 'planks', x: 0.84, y: 0.64, loot: { wood: [4, 6] } },
      { key: 'mesh', x: 0.84, y: 0.46, loot: { wire: [3, 4] } },
      { key: 'bench', x: 0.22, y: 0.52, loot: { scrap: [2, 3], springs: [2, 3] } },
      { key: 'drawers', x: 0.66, y: 0.4, loot: { springs: [2, 3], wire: [1, 1] } },
      { key: 'toolwall', x: 0.33, y: 0.22, loot: { scrap: [3, 4], wood: [2, 3] } },
      { key: 'parcel-cache', x: 0.48, y: 0.69, requiresDirectory: true, loot: { battery: [2, 2], springs: [2, 2] } },
    ],
  },
  garage: {
    id: 'garage',
    travelHours: 0.5,
    unlockDay: 1,
    plate: 'plate_loc_garage',
    pin: { x: 0.2, y: 0.43 },
    neighbor: 'mechanic',
    spots: [
      { key: 'workbench', x: 0.3, y: 0.38, loot: { springs: [3, 4], battery: [1, 1] } },
      { key: 'locker', x: 0.455, y: 0.24, loot: { scrap: [3, 4], wire: [2, 3] } },
      { key: 'storeroom', x: 0.77, y: 0.22, loot: { battery: [2, 3], scrap: [2, 3] } },
      { key: 'shelves', x: 0.88, y: 0.31, loot: { scrap: [4, 5], springs: [1, 1] } },
      { key: 'toolchest', x: 0.83, y: 0.44, loot: { springs: [2, 3], scrap: [3, 3] } },
      { key: 'wreck', fatalMiss: 'lift', x: 0.6, y: 0.5, loot: { battery: [1, 1], springs: [3, 3] } },
      { key: 'crossbow', x: 0.36, y: 0.55, loot: {} },
    ],
  },
  hardware: {
    id: 'hardware',
    travelHours: 0.75,
    unlockDay: 1,
    plate: 'plate_loc_hardware',
    pin: { x: 0.49, y: 0.45 },
    neighbor: null,
    spots: [
      { key: 'timber', x: 0.33, y: 0.28, loot: { wood: [5, 7] } },
      { key: 'meshrolls', x: 0.5, y: 0.25, loot: { wire: [4, 5] } },
      { key: 'springbin', x: 0.5, y: 0.72, loot: { springs: [3, 4], scrap: [1, 1] } },
      { key: 'shelves', x: 0.14, y: 0.3, loot: { scrap: [3, 4], wire: [1, 1] } },
      { key: 'counter', x: 0.27, y: 0.58, loot: { battery: [1, 1], scrap: [2, 3] } },
      { key: 'detector', x: 0.38, y: 0.48, loot: {} },
    ],
  },
  grocery: {
    id: 'grocery',
    travelHours: 0.75,
    unlockDay: 2,
    plate: 'plate_loc_grocery',
    pin: { x: 0.78, y: 0.47 },
    neighbor: null,
    spots: [
      { key: 'batteries', x: 0.17, y: 0.47, loot: { battery: [3, 4] } },
      { key: 'crates', x: 0.18, y: 0.78, loot: { wood: [4, 5] } },
      { key: 'fridge', x: 0.48, y: 0.21, loot: { scrap: [3, 4], wire: [1, 1] } },
      { key: 'trolley', x: 0.6, y: 0.8, loot: { scrap: [3, 3], springs: [1, 1] } },
      { key: 'backroom', x: 0.84, y: 0.4, loot: { wood: [3, 4], battery: [1, 1] } },
      { key: 'records', x: 0.33, y: 0.81, loot: { scrap: [2, 2], battery: [1, 1] } },
      { key: 'vachette', x: 0.87, y: 0.68, loot: { wire: [2, 2], battery: [2, 2] } },
    ],
  },
  post: {
    id: 'post',
    travelHours: 1,
    unlockDay: 2,
    plate: 'plate_loc_post',
    pin: { x: 0.2, y: 0.24 },
    neighbor: 'mail',
    spots: [
      { key: 'parcels', x: 0.3, y: 0.5, loot: { battery: [2, 3], springs: [2, 3] } },
      { key: 'string', x: 0.75, y: 0.6, loot: { wire: [4, 5] } },
      { key: 'cage', x: 0.83, y: 0.28, loot: { battery: [2, 3], scrap: [3, 3] } },
      { key: 'sacks', x: 0.5, y: 0.32, loot: { wire: [2, 3], wood: [2, 3] } },
      { key: 'bicycle', x: 0.33, y: 0.8, loot: { scrap: [3, 4], springs: [1, 1] } },
      { key: 'minitel', x: 0.65, y: 0.60, loot: {} },
    ],
  },
  police: {
    id: 'police',
    travelHours: 1,
    unlockDay: 3,
    plate: 'plate_loc_police',
    pin: { x: 0.52, y: 0.22 },
    neighbor: 'chief',
    spots: [
      { key: 'radios', x: 0.12, y: 0.42, loot: { battery: [3, 4] } },
      { key: 'barriers', x: 0.26, y: 0.72, loot: { scrap: [4, 5], springs: [1, 1] } },
      { key: 'locker', x: 0.52, y: 0.3, loot: { scrap: [3, 4], wire: [2, 3] } },
      { key: 'cell', x: 0.74, y: 0.32, loot: { scrap: [3, 3], springs: [2, 3] } },
      { key: 'desk', x: 0.33, y: 0.4, loot: { battery: [1, 1], wire: [2, 3] } },
    ],
  },
  townhall: {
    id: 'townhall',
    travelHours: 1.25,
    unlockDay: 4,
    plate: 'plate_loc_townhall',
    pin: { x: 0.86, y: 0.21 },
    neighbor: 'mayor',
    spots: [
      { key: 'boards', x: 0.16, y: 0.45, loot: { wood: [6, 8] } },
      { key: 'pa', x: 0.15, y: 0.78, loot: { battery: [3, 4], wire: [2, 3] } },
      { key: 'sideboard', x: 0.62, y: 0.36, loot: { wire: [4, 5] } },
      { key: 'chairs', x: 0.47, y: 0.55, loot: { scrap: [4, 5], springs: [2, 3] } },
      { key: 'leaflets', x: 0.74, y: 0.72, loot: { wood: [3, 4], scrap: [1, 1] } },
      { key: 'siren', x: 0.33, y: 0.56, loot: {} },
    ],
  },
} as const satisfies Readonly<Record<LocationId, LocationDef>>;

export type SpotKey<L extends LocationId> = (typeof destinations)[L]['spots'][number]['key'];
export const LOCATIONS: Readonly<Record<LocationId, LocationDef>> = destinations;

export const HARDWARE_SPRING_BIN = destinations.hardware.spots.findIndex((spot) => spot.key === 'springbin');
export const SPRING_RECEIPT_OFFER = { wire: 1 };

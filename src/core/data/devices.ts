// Tuning table for every defense. Combat logic reads these numbers; it never hard-codes them.

import type { Cost, DeviceTypeId, Facing } from '../types';


export interface DeviceDef {
  readonly id: DeviceTypeId;
  readonly cost: Cost;
  /** Hours of daylight spent building one. */
  readonly buildHours: number;
  readonly maxHp: number;
  /**
   * `passive` just stands there (palisade); `auto` goes off by itself when the infected step into
   * it; `manual` waits for the camera desk.
   */
  readonly mode: DeviceMode;
  /** Blocks walking infected permanently (palisade). */
  readonly blocks: boolean;
  /** Seconds the effect lasts once triggered. */
  readonly activeSeconds: number;
  /** Seconds to re-arm after the effect ends. */
  readonly rearmSeconds: number;
  /** Percent of the night's battery spent per trigger. */
  readonly energy: number;
  /** Effect radius in cells. */
  readonly radius: number;
  readonly damage: number;
  /**
   * Cells within which infected count as "on" the trap, and how many it takes: an automatic trap
   * fires on that, a manual one is flagged as worth firing. A heavy (boss, ram, butcher) is enough alone.
   */
  readonly reach: number;
  readonly targets: number;
}

export type DeviceMode = 'passive' | 'auto' | 'manual';

export const DEVICES: Readonly<Record<DeviceTypeId, DeviceDef>> = {
  fence: {
    id: 'fence',
    cost: { wood: 1 },
    buildHours: 0.1,
    maxHp: 140,
    mode: 'passive',
    blocks: true,
    activeSeconds: 0,
    rearmSeconds: 0,
    energy: 0,
    radius: 0,
    damage: 0,
    reach: 0,
    targets: 0,
  },
  spikes: {
    id: 'spikes',
    cost: { springs: 1, scrap: 2 },
    buildHours: 0.5,
    maxHp: 90,
    mode: 'auto',
    blocks: false,
    activeSeconds: 0.7,
    rearmSeconds: 4,
    energy: 0,
    radius: 1.05,
    damage: 60,
    reach: 0.85,
    targets: 1,
  },
  log: {
    id: 'log',
    cost: { wood: 3, wire: 1, scrap: 1 },
    buildHours: 0.75,
    maxHp: 130,
    mode: 'manual',
    blocks: false,
    activeSeconds: 0.9,
    rearmSeconds: 11,
    energy: 0,
    radius: 1.8,
    damage: 130,
    reach: 1.7,
    targets: 2,
  },
  net: {
    id: 'net',
    cost: { wire: 2, wood: 1 },
    buildHours: 0.5,
    maxHp: 70,
    mode: 'auto',
    blocks: false,
    activeSeconds: 5.5,
    rearmSeconds: 10,
    energy: 0,
    radius: 1.9,
    damage: 0,
    reach: 1.3,
    targets: 2,
  },
  barrier: {
    id: 'barrier',
    cost: { wood: 2, springs: 1, scrap: 1 },
    buildHours: 0.5,
    maxHp: 220,
    mode: 'manual',
    blocks: false,
    activeSeconds: 7,
    rearmSeconds: 9,
    energy: 0,
    radius: 0,
    damage: 0,
    reach: 2,
    targets: 3,
  },
  horn: {
    id: 'horn',
    cost: { battery: 1, scrap: 2 },
    buildHours: 0.5,
    maxHp: 70,
    mode: 'manual',
    blocks: false,
    activeSeconds: 6,
    rearmSeconds: 10,
    energy: 18,
    radius: 7,
    damage: 0,
    reach: 6,
    targets: 4,
  },
  floodlight: {
    id: 'floodlight',
    cost: { battery: 1, scrap: 1, wire: 1 },
    buildHours: 0.5,
    maxHp: 60,
    mode: 'manual',
    blocks: false,
    activeSeconds: 8,
    rearmSeconds: 8,
    energy: 14,
    radius: 4.5,
    damage: 0,
    reach: 4,
    targets: 3,
  },
};

/** How many ways a device can be turned: palisades also follow the diagonals, everything else has two sides. */
export const facingsOf = (type: DeviceTypeId): 2 | 4 => (DEVICES[type].blocks ? 4 : 2);

/** The next facing when a device is turned. */
export const turned = (type: DeviceTypeId, facing: Facing): Facing => ((facing + 1) % facingsOf(type)) as Facing;

export const isManual = (type: DeviceTypeId): boolean => DEVICES[type].mode === 'manual';
export const isAuto = (type: DeviceTypeId): boolean => DEVICES[type].mode === 'auto';
/** Anything that does something at night, as opposed to a palisade. */
export const isTrap = (type: DeviceTypeId): boolean => DEVICES[type].mode !== 'passive';

/** Shared modifiers. */
export const COMBAT = {
  nettedDamageMultiplier: 1.5,
  litDamageMultiplier: 1.5,
  litSpeedMultiplier: 0.55,
  logStunSeconds: 1.3,
  logKnockbackCells: 1.4,
  logCrawlReach: 0.95,
  logCrawlLowerSeconds: 0.23,
  logCrawlSpeedMultiplier: 0.58,
  bossControlFactor: 0.55,
  nightEnergy: 100,
} as const;

export const BARRICADE = {
  maxHp: [160, 280] as const,
  repairPerWood: 40,
  repairHours: 0.25,
  reinforceCost: { scrap: 3, wood: 1 } as Cost,
  reinforceHours: 0.5,
} as const;

export const HOUSE_MAX_HP = 100;
export const HOUSE_REPAIR = { cost: { wood: 2, scrap: 1 } as Cost, hours: 0.5, amount: 15 } as const;

/** Fraction of the build cost needed to fix a broken device, rounded up per resource. */
export const REPAIR_COST_FRACTION = 0.5;
/** Fraction of the build cost recovered when dismantling an intact device, rounded up (a palisade comes back whole). */
export const DISMANTLE_REFUND_FRACTION = 0.5;

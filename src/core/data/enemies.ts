// Tuning table for the infected. Behaviours live in core/night.ts and switch on `kind`/`traits`.

import type { EnemyTypeId, NeighborId } from '../types';

export interface EnemyDef {
  readonly id: EnemyTypeId;
  readonly hp: number;
  /** Cells per second. */
  readonly speed: number;
  /** Damage per second against a barricade (or per blow for wind-up attackers). */
  readonly barricadeDamage: number;
  /** House integrity lost when it gets inside through a breach. */
  readonly houseDamage: number;
  /** Walks through palisades by smashing them. */
  readonly breaksFences: boolean;
  /** Clears palisades and raised barriers in a bound. */
  readonly jumps: boolean;
  /** Drops low before crossing a suspended log. */
  readonly crawlsUnderLogs: boolean;
  /** Breaks the traps it steps on. */
  readonly tramples: boolean;
  /** Picks the weakest door on the whole lot instead of the nearest one. */
  readonly flanks: boolean;
  /** Seconds of telegraphed wind-up before each blow; 0 = continuous gnawing. */
  readonly windupSeconds: number;
  readonly boss: NeighborId | null;
  /** Collision/visual scale relative to a villager. */
  readonly size: number;
}

const base = {
  breaksFences: false,
  jumps: false,
  crawlsUnderLogs: false,
  tramples: false,
  flanks: false,
  windupSeconds: 0,
  boss: null,
  size: 1,
} as const;

export const ENEMIES: Readonly<Record<EnemyTypeId, EnemyDef>> = {
  shambler: { ...base, id: 'shambler', hp: 60, speed: 0.85, barricadeDamage: 2.5, houseDamage: 3 },
  runner: { ...base, id: 'runner', hp: 38, speed: 1.75, barricadeDamage: 2, houseDamage: 2, crawlsUnderLogs: true },
  brute: { ...base, id: 'brute', hp: 230, speed: 0.6, barricadeDamage: 7, houseDamage: 8, tramples: true, size: 1.25 },
  dog: { ...base, id: 'dog', hp: 34, speed: 2.3, barricadeDamage: 2, houseDamage: 2, flanks: true, size: 0.7, crawlsUnderLogs: true },
  boar: {
    ...base,
    id: 'boar',
    hp: 170,
    speed: 1.25,
    barricadeDamage: 26,
    houseDamage: 6,
    breaksFences: true,
    tramples: true,
    windupSeconds: 0.9,
    size: 1.05,
  },
  deer: { ...base, id: 'deer', hp: 55, speed: 2.0, barricadeDamage: 3, houseDamage: 3, jumps: true, size: 1.1 },

  mower: {
    ...base,
    id: 'mower',
    hp: 650,
    speed: 1.6,
    barricadeDamage: 45,
    houseDamage: 10,
    breaksFences: true,
    tramples: true,
    windupSeconds: 1.7,
    boss: 'mower',
    size: 1.35,
  },
  mechanic: {
    ...base,
    id: 'mechanic',
    hp: 720,
    speed: 0.55,
    barricadeDamage: 50,
    houseDamage: 9,
    breaksFences: true,
    tramples: true,
    windupSeconds: 1.5,
    boss: 'mechanic',
    size: 1.45,
  },
  mail: { ...base, id: 'mail', hp: 480, speed: 2.4, barricadeDamage: 10, houseDamage: 7, boss: 'mail', size: 1.25 },
  chief: { ...base, id: 'chief', hp: 560, speed: 0.7, barricadeDamage: 8, houseDamage: 6, boss: 'chief', size: 1.4 },
  mayor: {
    ...base,
    id: 'mayor',
    hp: 950,
    speed: 0.45,
    barricadeDamage: 20,
    houseDamage: 8,
    breaksFences: true,
    tramples: true,
    windupSeconds: 2.2,
    boss: 'mayor',
    size: 1.5,
  },
};

export const BOSS = {
  mower: { chargeSpeed: 5.2, jamSeconds: 2.6, relocateSpeed: 2.4 },
  mail: { deliveryNight: 5, knocksPerDoor: 2, knockInterval: 0.55, signatureSeconds: 6 },
  chief: { auraRadius: 3.6, auraDamageTaken: 0.72, selfDamageTaken: 0.6, whistleEvery: 11, watchLead: 0.85, whistleSeconds: 3.5, whistleSpeed: 1.35 },
  mayor: { speechEvery: 13, reinforcements: { shambler: 4, runner: 1 } },
  mechanic: { blowInterval: 3, chainSeconds: 0.72 },
} as const;

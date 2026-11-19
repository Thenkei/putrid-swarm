// The seven-night campaign. Each night is a list of waves; a wave is a set of spawn groups.
// Times are seconds from the start of the wave.

import type { EnemyTypeId, SectorId } from '../types';

export interface SpawnGroup {
  readonly sector: SectorId;
  readonly type: EnemyTypeId;
  readonly count: number;
  /** Seconds between two spawns of the group. */
  readonly every: number;
  /** Delay before the first spawn, from the wave start. */
  readonly delay: number;
}

export interface Wave {
  /** Seconds after the previous wave started (the first wave starts after `NIGHT_LEAD_IN`). */
  readonly after: number;
  readonly groups: readonly SpawnGroup[];
}

export interface NightPlan {
  readonly waves: readonly Wave[];
}

export const NIGHT_LEAD_IN = 5;
export const LAST_NIGHT = 7;

const g = (sector: SectorId, type: EnemyTypeId, count: number, every: number, delay = 0): SpawnGroup => ({ sector, type, count, every, delay });

export const NIGHTS: readonly NightPlan[] = [
  // Night 1 — villagers only, almost all by the gate. The yard that is already in place holds it:
  // the point is to watch the automatic traps work and to drop the log once or twice.
  {
    waves: [
      { after: 0, groups: [g('portail', 'shambler', 4, 3.2)] },
      { after: 24, groups: [g('portail', 'shambler', 5, 2.6)] },
      { after: 26, groups: [g('grange', 'shambler', 4, 2.8), g('portail', 'shambler', 4, 2.6, 6), g('portail', 'runner', 1, 1, 14)] },
    ],
  },
  // Night 2 — Le Tondeur.
  {
    waves: [
      { after: 0, groups: [g('portail', 'shambler', 7, 2.2), g('verger', 'shambler', 4, 3, 4)] },
      { after: 28, groups: [g('arriere', 'shambler', 6, 2.2), g('grange', 'runner', 4, 2.6, 3), g('portail', 'runner', 3, 3, 9)] },
      { after: 30, groups: [g('portail', 'mower', 1, 1), g('portail', 'shambler', 6, 2.8, 4), g('verger', 'shambler', 5, 3, 8), g('arriere', 'runner', 3, 3.5, 14)] },
    ],
  },
  // Night 3 — the forest joins in: prowlers, battering rams, jumpers.
  {
    waves: [
      { after: 0, groups: [g('arriere', 'shambler', 6, 2.2), g('verger', 'dog', 4, 2.4, 3)] },
      { after: 27, groups: [g('portail', 'shambler', 7, 2), g('arriere', 'boar', 2, 7, 4), g('grange', 'dog', 4, 2.2, 8)] },
      { after: 30, groups: [g('verger', 'deer', 4, 2.8), g('arriere', 'shambler', 6, 2.1, 2), g('portail', 'boar', 2, 8, 6), g('grange', 'runner', 4, 2.4, 10)] },
      { after: 30, groups: [g('portail', 'brute', 1, 1), g('portail', 'shambler', 6, 1.8, 2), g('verger', 'dog', 5, 1.8, 5), g('arriere', 'deer', 4, 2.4, 9)] },
    ],
  },
  // Night 4 — Le Dépanneur and his palan.
  {
    waves: [
      { after: 0, groups: [g('grange', 'shambler', 8, 1.9), g('portail', 'dog', 4, 2.2, 4), g('verger', 'shambler', 4, 2.8, 8)] },
      { after: 28, groups: [g('arriere', 'boar', 2, 6), g('portail', 'shambler', 8, 1.8, 2), g('grange', 'runner', 5, 2.2, 6)] },
      {
        after: 30,
        groups: [g('grange', 'mechanic', 1, 1), g('grange', 'shambler', 7, 2.4, 5), g('arriere', 'deer', 4, 2.6, 6), g('portail', 'brute', 1, 1, 10), g('verger', 'dog', 5, 2, 14)],
      },
    ],
  },
  // Night 5 — La Dernière Tournée.
  {
    waves: [
      { after: 0, groups: [g('portail', 'runner', 6, 1.8), g('arriere', 'shambler', 8, 1.9, 3), g('verger', 'boar', 2, 6, 8)] },
      { after: 28, groups: [g('grange', 'brute', 2, 8), g('grange', 'shambler', 7, 1.9, 3), g('verger', 'deer', 5, 2.2, 6), g('portail', 'dog', 5, 1.8, 10)] },
      {
        after: 30,
        groups: [g('portail', 'mail', 1, 1), g('portail', 'shambler', 8, 2, 4), g('arriere', 'runner', 6, 2, 6), g('grange', 'boar', 2, 7, 10), g('verger', 'shambler', 6, 2.4, 14)],
      },
    ],
  },
  // Night 6 — Le Chef de la Police maintains order.
  {
    waves: [
      { after: 0, groups: [g('verger', 'shambler', 7, 1.9), g('grange', 'dog', 5, 1.9, 3), g('arriere', 'brute', 1, 1, 8)] },
      { after: 28, groups: [g('portail', 'boar', 1, 1), g('portail', 'shambler', 7, 1.9, 2), g('arriere', 'deer', 4, 2.4, 5), g('grange', 'runner', 5, 2.1, 9)] },
      {
        after: 30,
        groups: [
          g('portail', 'shambler', 6, 1.9),
          g('portail', 'chief', 1, 1, 5),
          g('portail', 'brute', 1, 1, 9),
          g('verger', 'dog', 4, 2, 9),
          g('grange', 'shambler', 5, 2.4, 12),
          g('arriere', 'boar', 1, 1, 16),
        ],
      },
    ],
  },
  // Night 7 — Le Maire is still campaigning.
  {
    waves: [
      { after: 0, groups: [g('portail', 'shambler', 8, 1.8), g('grange', 'runner', 5, 2), g('arriere', 'dog', 5, 1.9, 6), g('verger', 'boar', 2, 6, 9)] },
      { after: 28, groups: [g('arriere', 'brute', 1, 1), g('arriere', 'shambler', 7, 1.9, 2), g('verger', 'deer', 5, 2.1, 5), g('grange', 'boar', 2, 6, 9), g('portail', 'runner', 5, 2, 12)] },
      {
        after: 32,
        groups: [
          g('portail', 'shambler', 6, 1.9),
          g('portail', 'mayor', 1, 1, 4),
          g('portail', 'brute', 1, 1, 8),
          g('grange', 'dog', 5, 1.9, 9),
          g('verger', 'shambler', 6, 2.2, 12),
          g('arriere', 'runner', 5, 2.1, 16),
        ],
      },
    ],
  },
];

export const SIREN_SECTORS = ['portail', 'verger'] as const;
export type SirenSector = (typeof SIREN_SECTORS)[number];

function divertiblePack(plan: NightPlan): { wave: number; group: number; pack: SpawnGroup } | null {
  for (const [index, wave] of plan.waves.entries()) {
    const group = wave.groups.findIndex(pack => pack.type === 'shambler' && pack.sector !== 'portail' && pack.sector !== 'verger');
    if (group >= 0) return { wave: index + 1, group, pack: wave.groups[group]! };
  }
  return null;
}

export const planForNight = (night: number, siren: SirenSector | null = null): NightPlan => {
  const plan = NIGHTS[Math.min(Math.max(night, 1), NIGHTS.length) - 1];
  if (!plan) throw new Error(`No plan for night ${night}`);
  const moved = siren ? divertiblePack(plan) : null;
  if (!siren || !moved) return plan;
  return {
    waves: plan.waves.map((wave, index) => index + 1 === moved.wave
      ? { ...wave, groups: wave.groups.map((pack, group) => group === moved.group ? { ...pack, sector: siren } : pack) }
      : wave),
  };
};

export const sirenPackFor = (night: number) => divertiblePack(planForNight(night));

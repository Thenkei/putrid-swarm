// Who the break can run into on an outing, and the numbers their encounters are tuned with.
// These are starting values from docs/RENCONTRES_EN_VOITURE.md, meant to be moved after playtests.

import type { GroupId, ResourceId, RivalId, Stance, Standing } from '../types';

/** Rough worth of one piece, to compare lots made of different things. */
export const RESOURCE_VALUE: Readonly<Record<ResourceId, number>> = { wood: 1, scrap: 1, wire: 1.5, springs: 2, battery: 3 };

export type StanceWeights = Readonly<Record<Stance, number>>;

export interface RivalDef {
  readonly id: RivalId;
  /** First day they can be met. */
  readonly fromDay: number;
  /** What they take in a trade, most wanted first. */
  readonly wants: readonly ResourceId[];
  /** Whether they carry washers and settle things with them. */
  readonly plays: boolean;
  /** Whether a threat can make them give way at all. */
  readonly nervous: boolean;
  /** What they will not let go of, threat or not. */
  readonly needs: ResourceId | null;
  /** How wide of the tin their washers land (0 = always in). */
  readonly spread: number;
  readonly stances: StanceWeights;
}

export const RIVALS: Readonly<Record<RivalId, RivalDef>> = {
  // The recurring survivor: a flea-market dealer who was haggling long before the outbreak.
  dealer: {
    id: 'dealer',
    fromDay: 1,
    wants: ['scrap', 'wood', 'wire'],
    plays: true,
    nervous: false,
    needs: null,
    spread: 0.4,
    stances: { guard: 3, rush: 2, falter: 1 },
  },
  // A holidaymaker stranded far from home: alone, jumpy, and after a battery to leave.
  camper: {
    id: 'camper',
    fromDay: 2,
    wants: ['battery', 'wire', 'wood'],
    plays: false,
    nervous: true,
    needs: 'battery',
    spread: 0.5,
    stances: { guard: 1, rush: 2, falter: 3 },
  },
};

export interface GroupDef {
  readonly id: GroupId;
  readonly fromDay: number;
  /** What they have no use for. */
  readonly refuses: readonly ResourceId[];
  /** The one thing they came for. */
  readonly need: ResourceId;
  /** The way round them, in hours. */
  readonly detourHours: number;
  /** A survivor who stands with them once the player knows that face. */
  readonly member: RivalId;
  readonly stances: StanceWeights;
}

export const GROUPS: Readonly<Record<GroupId, GroupDef>> = {
  // Neighbours who decided that what leaves the village is owed a contribution.
  committee: {
    id: 'committee',
    fromDay: 2,
    refuses: [],
    need: 'wire',
    detourHours: 0.5,
    member: 'dealer',
    stances: { guard: 2, rush: 2, falter: 2 },
  },
  // People from another town with a van that will not start.
  van: {
    id: 'van',
    fromDay: 3,
    refuses: ['wood'],
    need: 'battery',
    detourHours: 0.75,
    member: 'camper',
    stances: { guard: 3, rush: 2, falter: 1 },
  },
};

export const ENCOUNTER = {
  /** Encounters with something at stake, per day. One at most per outing. */
  majorsPerDay: 2,
  /** A plain rummage comes first: nobody disputes anything before this many searches. */
  searchesBeforeFirst: 1,
  /** Odds that someone is already there, once the first dispute has been met. */
  disputeChance: 0.5,
  /** Odds of being stopped on the way home, once the first roadblock has been met. */
  ambushChance: 0.35,
  ambushFromDay: 2,
  /** Nobody bars the road for a near-empty boot. */
  ambushMinLoad: 6,
  /** Share of the load a group asks for, and its bounds in pieces. */
  tollShare: 0.3,
  tollMin: 2,
  tollMax: 4,
  /** Share of the toll's worth that their one need settles. */
  needShare: 0.6,
  /** Share of a lot's worth asked in trade, by standing. */
  priceShare: { grudge: 0.6, stranger: 0.35, owes: 0.35 } satisfies Record<Standing, number>,
  hours: {
    share: 0.25,
    trade: 0.25,
    favor: 0.25,
    threat: 0.25,
    game: 0.5,
    bargain: 0.25,
    /** A scuffle costs this, plus as much again per blow taken, up to the cap. */
    fight: 0.25,
    blow: 0.25,
    fightMax: 0.75,
  },
  exchanges: 3,
  throws: 3,
} as const;

/**
 * The washers plank, in throw lengths: 0 is the chalk line the washers are thrown from.
 * The tin and the ring match the painted board, which ends a little past the ring.
 */
export const WASHERS = {
  tin: 0.7,
  /** Within this of the tin's centre: in the tin, two points. */
  tinHalf: 0.08,
  /** Within this: inside the chalk ring, one point. */
  ringHalf: 0.14,
  /** Past this the washer leaves the plank. */
  end: 0.87,
} as const;

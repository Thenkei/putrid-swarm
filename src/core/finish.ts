// How well a town puzzle was solved decides where in each loot range the find lands. Every miss
// ends an attempt, so the only slips a success can carry are an earlier failed attempt at the same
// spot on this visit, and noise the street heard on the way. Slips are kept like the street noise:
// per visit, so a new visit (or a new day) starts clean, and saves keep them.

import type { Puzzle } from './scavenge';
import type { GameState, LocationId } from './types';

/** `clean` pays the top of every loot range, `rough` the bottom, `plain` the usual roll. */
export type Finish = 'clean' | 'plain' | 'rough';

/**
 * Whether a kind of puzzle can be solved well or badly. The graded ones are skill puzzles where a
 * wrong move fails the attempt (a sum, a route, a catch, a ring, a grab), and a rummage can also be
 * heard. Records and the directory are a single choice and the fairground can be run untimed: they
 * always roll.
 */
const GRADED: Readonly<Record<Puzzle['kind'], boolean>> = {
  scale: true,
  circuit: true,
  timing: true,
  padlock: true,
  rummage: true,
  records: false,
  directory: false,
  vachette: false,
};

export interface AttemptRecord {
  /** An earlier attempt at this spot failed during the current visit. */
  readonly slipped: boolean;
  /** Street noise the successful attempt itself made (today only a rummage at its "heard" threshold). */
  readonly heard: number;
}

/** Clean: solved at the first attempt of the visit and unheard. Rough: solved after a failed attempt. */
export function gradeFinish(kind: Puzzle['kind'], { slipped, heard }: AttemptRecord): Finish {
  if (!GRADED[kind]) return 'plain';
  if (slipped) return 'rough';
  return heard > 0 ? 'plain' : 'clean';
}

/** One resource's find: the range's ends for a clean or rough finish, the roll otherwise. */
export function lootFor(finish: Finish, [min, max]: readonly [number, number], roll: number): number {
  if (finish === 'clean') return max;
  if (finish === 'rough') return min;
  return roll;
}

const slipKey = (state: GameState, id: LocationId, spot: number): string => `slip:${id}:${state.day}:${state.locations[id].visits}:${spot}`;

export function hasSlipped(state: GameState, id: LocationId, spot: number): boolean {
  return (state.flags[slipKey(state, id, spot)] ?? 0) > 0;
}

/** Marks a failed attempt at `spot` for the rest of the current visit. */
export function recordSlip(state: GameState, id: LocationId, spot: number): GameState {
  return { ...state, flags: { ...state.flags, [slipKey(state, id, spot)]: 1 } };
}

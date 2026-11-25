// The town's puzzles tighten as the campaign wears on. The opening days keep the boards the game was tuned
// on; every later setting stays solvable by skill alone (tests/scavenge.test.ts proves it for each level).
import type { RummageShape } from './rummage';
import type { CircuitShape, ScaleShape } from './scavenge';
import type { GameState } from './types';

export type PuzzleLevel = 0 | 1 | 2;
export const PUZZLE_LEVELS: readonly PuzzleLevel[] = [0, 1, 2];

/** First day of each level after the opening's: days 1–3 play level 0, days 4–5 level 1, days 6–7 level 2. */
const LEVEL_STARTS = [4, 6] as const;

export const puzzleLevel = ({ day }: Pick<GameState, 'day'>): PuzzleLevel =>
  LEVEL_STARTS.filter(start => day >= start).length as PuzzleLevel;

export interface PuzzleTuning {
  /** Width of each catch band, as a share of the track. */
  readonly catchWidth: number;
  readonly circuit: CircuitShape;
  /** How many times faster than on the opening days the padlock rings turn. */
  readonly ringPace: number;
  /**
   * The noise is always every container's cost but one loud one's: exactly what testing the quiet ones
   * first needs. One less leaves a guess; any more only forgives careless orders. So the noise follows
   * the other two, and fewer loud containers is what tightens the pile: a third one would need a seventh
   * noise and let more careless orders through. One loud container at triple cost is as harsh as the
   * pile gets: dearer still, it could no longer be afforded late, which only steers a careless hand to
   * the safe tests.
   */
  readonly rummage: RummageShape;
  readonly scale: ScaleShape;
}

/** Records, directory and the fairground do not change with the day: see the README. */
export const PUZZLE_CURVE: Readonly<Record<PuzzleLevel, PuzzleTuning>> = {
  0: {
    catchWidth: 0.23, circuit: { side: 3, minRoute: 5 }, ringPace: 1,
    rummage: { loud: 2, loudCost: 2, noise: 6 }, scale: { tags: 5, heaviest: 8 },
  },
  1: {
    catchWidth: 0.2, circuit: { side: 3, minRoute: 7 }, ringPace: 1.15,
    rummage: { loud: 1, loudCost: 2, noise: 5 }, scale: { tags: 6, heaviest: 10 },
  },
  2: {
    catchWidth: 0.17, circuit: { side: 4, minRoute: 8 }, ringPace: 1.3,
    rummage: { loud: 1, loudCost: 3, noise: 5 }, scale: { tags: 7, heaviest: 12 },
  },
};

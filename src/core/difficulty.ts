// The town's puzzles tighten as the campaign wears on. The opening days keep the boards the game was tuned
// on; every later setting stays solvable by skill alone (tests/scavenge.test.ts proves it for each level).
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
  readonly scale: ScaleShape;
}

/** Rummage, records, directory and the fairground do not change with the day: see the README. */
export const PUZZLE_CURVE: Readonly<Record<PuzzleLevel, PuzzleTuning>> = {
  0: { catchWidth: 0.23, circuit: { side: 3, minRoute: 5 }, ringPace: 1, scale: { tags: 5, heaviest: 8 } },
  1: { catchWidth: 0.2, circuit: { side: 3, minRoute: 7 }, ringPace: 1.15, scale: { tags: 6, heaviest: 10 } },
  2: { catchWidth: 0.17, circuit: { side: 4, minRoute: 8 }, ringPace: 1.3, scale: { tags: 7, heaviest: 12 } },
};

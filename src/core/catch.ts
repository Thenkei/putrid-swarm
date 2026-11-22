import type { Rng } from './rng';

/** Width of each catch band, as a share of the track. */
export const CATCH_WIDTH = 0.23;
/** Clear track left between the two bands so the second never sits where the first one was. */
const CATCH_GAP = 0.08;
const FIRST = [15, 35] as const;
/** Furthest left edge for the second band, so even mirrored it stays a hand's width off the stop. */
const LAST = 72;

/**
 * Where the two bands of a timing puzzle sit, left edges in [0, 1]. Both come from the attempt's
 * RNG, and half the time the pair is mirrored, so neither the first nor the second catch can be learnt.
 */
export function catchBands(rng: Rng): readonly [number, number] {
  const first = rng.int(FIRST[0], FIRST[1]) / 100;
  const second = rng.int(Math.round((first + CATCH_WIDTH + CATCH_GAP) * 100), LAST) / 100;
  if (!rng.chance(0.5)) return [first, second];
  return [1 - first - CATCH_WIDTH, 1 - second - CATCH_WIDTH];
}

export const inBand = (position: number, start: number): boolean => position >= start && position <= start + CATCH_WIDTH;

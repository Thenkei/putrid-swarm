import type { Rng } from './rng';
import type { CatchMotion } from './scavenge';

/** Clear track left between the two bands so the second never sits where the first one was. */
const CATCH_GAP = 0.08;
const FIRST = [15, 35] as const;
/** Furthest left edge for the second band, so even mirrored the widest band stays a hand's width off the stop. */
const LAST = 72;
/** Half-sweeps per second: the needle crosses the whole track in about 1.6 s. */
export const NEEDLE_PACE = 0.62;

/**
 * Where the two bands of a timing puzzle sit, left edges in [0, 1], for bands `width` of the track wide.
 * Both come from the attempt's RNG, and half the time the pair is mirrored, so neither the first nor
 * the second catch can be learnt.
 */
export function catchBands(rng: Rng, width: number): readonly [number, number] {
  const first = rng.int(FIRST[0], FIRST[1]) / 100;
  const second = rng.int(Math.round((first + width + CATCH_GAP) * 100), LAST) / 100;
  if (!rng.chance(0.5)) return [first, second];
  return [1 - first - width, 1 - second - width];
}

export const inBand = (position: number, start: number, width: number): boolean => position >= start && position <= start + width;

/**
 * The needle's place on the track, in [0, 1], at `phase` in [0, 2): out on the first half, back on the
 * second. A hanging load slows at the ends of its swing; a slide or a lift keeps an even pace.
 */
export function needleAt(phase: number, motion: CatchMotion): number {
  const sweep = 1 - Math.abs(phase - 1);
  return motion === 'swing' ? (1 - Math.cos(sweep * Math.PI)) / 2 : sweep;
}

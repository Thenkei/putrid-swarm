import { shuffled } from './scavenge';
import type { Rng } from './rng';

/** Six containers, two of which hold the loot. How loud testing them is comes with the day: see `RummageShape`. */
export const RUMMAGE = { items: 6, wanted: 2 } as const;

/** A loud test makes twice or three times the noise of a quiet one; the panel says which in words. */
export type LoudCost = 2 | 3;

/**
 * The first `loud` names of a spot's list are noisy containers (a tin, a glass jar) and cost `loudCost`
 * noise to test; the rest cost one. `noise` is all a rummage may make.
 */
export interface RummageShape {
  readonly loud: number;
  readonly loudCost: LoudCost;
  readonly noise: number;
}

export type ProbeResult = { readonly good: true } | { readonly good: false; readonly found: 0 | 1 };
export type TakeResult = 'kept' | 'done' | 'wrong';

export const probeCost = (item: number, shape: RummageShape): number => (item < shape.loud ? shape.loudCost : 1);

/**
 * Testing a container (shaking, weighing, feeling) says what is inside but makes noise. At every level
 * the noise is exactly what testing the quiet containers first needs: either they show both good ones,
 * or loud tests settle the rest, and the last loud container never needs a test because elimination
 * names it. Testing every loud one early can leave two untested containers and a guess. A wrong grab
 * ends the attempt. Each level's shape is in `PUZZLE_CURVE` (difficulty.ts); tests/scavenge.test.ts
 * proves the rule over every deal at every level.
 */
export class Rummage {
  /** Display order: indices into the spot's item names. */
  readonly order: readonly number[];
  private readonly good: ReadonlySet<number>;
  private readonly junk: readonly (0 | 1)[];
  private readonly probed = new Set<number>();
  private readonly taken = new Set<number>();

  constructor(rng: Rng, readonly shape: RummageShape) {
    const all = Array.from({ length: RUMMAGE.items }, (_, i) => i);
    this.order = shuffled(all, rng);
    this.good = new Set(shuffled(all, rng).slice(0, RUMMAGE.wanted));
    this.junk = all.map(() => (rng.chance(0.5) ? 1 : 0));
  }

  /** Noise one test of `item` makes. */
  cost(item: number): number {
    return probeCost(item, this.shape);
  }

  get noiseUsed(): number {
    return [...this.probed].reduce((sum, item) => sum + this.cost(item), 0);
  }

  get noiseLeft(): number {
    return this.shape.noise - this.noiseUsed;
  }

  get found(): number {
    return this.taken.size;
  }

  isProbed(item: number): boolean {
    return this.probed.has(item);
  }

  isTaken(item: number): boolean {
    return this.taken.has(item);
  }

  canProbe(item: number): boolean {
    return !this.probed.has(item) && this.cost(item) <= this.noiseLeft;
  }

  /** What is inside `item`. Re-testing is free; a test the noise cannot cover returns null. */
  probe(item: number): ProbeResult | null {
    if (!this.probed.has(item)) {
      if (!this.canProbe(item)) return null;
      this.probed.add(item);
    }
    return this.reveal(item);
  }

  reveal(item: number): ProbeResult {
    return this.good.has(item) ? { good: true } : { good: false, found: this.junk[item]! };
  }

  take(item: number): TakeResult {
    if (!this.good.has(item)) return 'wrong';
    this.taken.add(item);
    return this.taken.size >= RUMMAGE.wanted ? 'done' : 'kept';
  }
}

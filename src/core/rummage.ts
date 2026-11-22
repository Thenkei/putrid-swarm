import { shuffled } from './scavenge';
import type { Rng } from './rng';

/**
 * Six containers, two of which hold the loot. The first `loud` names of a spot's list are noisy ones
 * (a tin, a glass jar) and cost two noise to test; the rest cost one.
 */
export const RUMMAGE = { items: 6, wanted: 2, loud: 2, noise: 6 } as const;

export type ProbeResult = { readonly good: true } | { readonly good: false; readonly found: 0 | 1 };
export type TakeResult = 'kept' | 'done' | 'wrong';

export const probeCost = (item: number): number => (item < RUMMAGE.loud ? 2 : 1);

/**
 * Testing a container (shaking, weighing, feeling) says what is inside but makes noise. Six noise is
 * exactly enough when the quiet four go first: either they show both good ones, or one loud test
 * settles the last, or both loud ones are good by elimination. Testing the loud ones early can
 * leave two untested containers and a guess. A wrong grab ends the attempt.
 */
export class Rummage {
  /** Display order: indices into the spot's item names. */
  readonly order: readonly number[];
  private readonly good: ReadonlySet<number>;
  private readonly junk: readonly (0 | 1)[];
  private readonly probed = new Set<number>();
  private readonly taken = new Set<number>();

  constructor(rng: Rng) {
    const all = Array.from({ length: RUMMAGE.items }, (_, i) => i);
    this.order = shuffled(all, rng);
    this.good = new Set(shuffled(all, rng).slice(0, RUMMAGE.wanted));
    this.junk = all.map(() => (rng.chance(0.5) ? 1 : 0));
  }

  get noiseLeft(): number {
    return RUMMAGE.noise - [...this.probed].reduce((sum, item) => sum + probeCost(item), 0);
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
    return !this.probed.has(item) && probeCost(item) <= this.noiseLeft;
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

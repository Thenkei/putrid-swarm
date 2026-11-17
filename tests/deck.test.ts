import { describe, expect, it } from 'vitest';
import { Decks } from '../src/engine/deck';

/** A small deterministic generator, so the shuffles are the same on every run. */
const seeded = (seed: number) => (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

describe('variant decks', () => {
  it('deals every item once before any comes back', () => {
    const decks = new Decks<string>(seeded(7));
    const items = ['a', 'b', 'c', 'd', 'e'];
    for (let round = 0; round < 20; round++) {
      const dealt = items.map(() => decks.next('k', items));
      expect([...dealt].sort()).toEqual(items);
    }
  });

  it('never deals the same item twice in a row, across reshuffles included', () => {
    for (const size of [2, 3, 5, 10]) {
      const decks = new Decks<number>(seeded(size));
      const items = Array.from({ length: size }, (_, i) => i);
      let previous: number | undefined;
      for (let i = 0; i < 400; i++) {
        const next = decks.next('k', items);
        expect(next).not.toBe(previous);
        previous = next;
      }
    }
  });

  it('keeps separate decks per key and copes with a changing list', () => {
    const decks = new Decks<string>(seeded(3));
    expect(decks.next('empty', [])).toBeUndefined();
    expect(decks.next('one', ['only'])).toBe('only');
    expect(decks.next('one', ['only'])).toBe('only');
    // Items that are no longer offered (a recording that failed to load) are never dealt.
    decks.next('k', ['a', 'b', 'c']);
    for (let i = 0; i < 20; i++) expect(decks.next('k', ['a', 'b'])).not.toBe('c');
  });
});

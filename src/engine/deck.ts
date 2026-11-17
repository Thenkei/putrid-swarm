// Picks among several equivalent things (recordings of a sound, lines for a moment) without the
// repetition plain randomness gives: each key has a shuffled deck that is dealt to the end before
// it is reshuffled, and a new deck never opens with the item that closed the previous one.

export class Decks<T> {
  private readonly decks = new Map<string, T[]>();
  private readonly last = new Map<string, T>();

  constructor(private readonly random: () => number = Math.random) {}

  /** The next of `items` for `key`, or undefined when there is none. `items` may change between calls. */
  next(key: string, items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    let deck = (this.decks.get(key) ?? []).filter((item) => items.includes(item));
    if (deck.length === 0) {
      deck = [...items];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j] as T, deck[i] as T];
      }
      // Dealt from the end: keep the previous item away from it.
      const end = deck.length - 1;
      if (end > 0 && deck[end] === this.last.get(key)) [deck[0], deck[end]] = [deck[end] as T, deck[0] as T];
    }
    const item = deck.pop() as T;
    this.decks.set(key, deck);
    this.last.set(key, item);
    return item;
  }
}

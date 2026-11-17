// The camera desk with one hand left: the orchard took the other.
//
// Two hands work the desk at once: one on the trap row, one on the camera keys. One hand cannot be on
// both. After it has pressed something on one row, it takes a moment before it can press on the other;
// a press made during that moment waits for it and is done as soon as it gets there. Pressing again on
// the same row costs nothing, and a hand that has been idle long enough is ready for either.

export const ONE_HAND = {
  /** Seconds from a press on one row until the hand can press on the other. */
  crossSeconds: 1,
  /** Presses that can wait for the hand at once; one more is refused, and says so. */
  queueLimit: 4,
} as const;

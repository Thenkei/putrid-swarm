// What the game is being opened on. It is played with a keyboard and a mouse: a browser cannot say
// whether a keyboard is plugged in, but a touch screen with no mouse and nothing to hover with is a
// phone or a tablet, and that is worth saying before several dozen megabytes are fetched.

export interface Pointers {
  /** The screen takes fingers. */
  readonly touch: boolean;
  /** Something as precise as a mouse is attached. */
  readonly finePointer: boolean;
  /** Something that can hover is attached. */
  readonly hover: boolean;
}

/** A touch laptop has a trackpad and passes; so does a tablet with a mouse. */
export const touchOnly = (pointers: Pointers): boolean => pointers.touch && !pointers.finePointer && !pointers.hover;

export function readPointers(): Pointers {
  const matches = (query: string): boolean => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      // No media queries: assume a desk, which is what the game is made for.
      return true;
    }
  };
  // Browsers do not agree on how a touch screen is announced: any one of the three will do.
  const touch = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window || (matches('(any-pointer: coarse)') && !matches('(any-pointer: fine)'));
  return { touch, finePointer: matches('(any-pointer: fine)'), hover: matches('(any-hover: hover)') };
}

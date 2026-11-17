// Every ending the game can show, and which of them a player has seen.
//
// One list for the whole game, by chapter. A chapter with endings of its own adds one line to
// `ENDINGS` and calls `remember` (engine/progress.ts) with `endingId(chapter, ending)` when one is
// reached; the title screen's count and every per-chapter count follow from that line. This module
// is the catalogue and the rules for reading what was stored; keeping it is the engine's business.

import type { Ending as OrchardEnding } from './orchard';

/**
 * In the order they are listed to the player. Never rename an entry: ids are what browsers have
 * stored. Removing one only stops counting it.
 */
export const ENDINGS = {
  /** The morning after night 2: shooed off, an arm, or the three ways it ends the run. */
  orchard: ['spared', 'maimed', 'throat', 'turned', 'bled'] satisfies readonly OrchardEnding[],
  /**
   * How the house is left: at the desk (nights 1–4), on the mower after the house fell (5–7), on the
   * mower after the seventh dawn; and, whichever night it was, the song played to its last chord.
   */
  finale: ['desk', 'rampage', 'dawn', 'chord'],
} as const;

export type Chapter = keyof typeof ENDINGS;
export type EndingOf<C extends Chapter> = (typeof ENDINGS)[C][number];
export type EndingId = { [C in Chapter]: `${C}.${EndingOf<C>}` }[Chapter];

export const CHAPTERS = Object.keys(ENDINGS) as readonly Chapter[];

export const endingId = <C extends Chapter>(chapter: C, ending: EndingOf<C>): EndingId => `${chapter}.${ending}` as EndingId;

/** Every ending of the game, chapter by chapter. */
export const ALL_ENDINGS: readonly EndingId[] = CHAPTERS.flatMap((chapter) => (ENDINGS[chapter] as readonly string[]).map((ending) => `${chapter}.${ending}` as EndingId));

const isEndingId = (value: unknown): value is EndingId => typeof value === 'string' && (ALL_ENDINGS as readonly string[]).includes(value);

/** What was stored, made sense of: anything unknown, repeated or malformed is dropped; catalogue order. */
export function parseSeen(raw: unknown): EndingId[] {
  if (!Array.isArray(raw)) return [];
  const found = new Set(raw.filter(isEndingId));
  return ALL_ENDINGS.filter((id) => found.has(id));
}

/** The orchard counted its endings by bare name, under a key of its own, before this list existed. */
export function parseOrchardLegacy(raw: unknown): EndingId[] {
  if (!Array.isArray(raw)) return [];
  return parseSeen(raw.filter((v): v is string => typeof v === 'string').map((ending) => `orchard.${ending}`));
}

/** Both lists as one. */
export const mergeSeen = (...lists: readonly (readonly EndingId[])[]): EndingId[] => parseSeen(lists.flat());

/** The list with one more ending in it, and whether it is the first time. */
export function withSeen(seen: readonly EndingId[], id: EndingId): { readonly seen: EndingId[]; readonly first: boolean } {
  const first = !seen.includes(id);
  return { seen: first ? mergeSeen(seen, [id]) : [...seen], first };
}

export interface Tally {
  readonly seen: number;
  readonly total: number;
}

/** How many have been seen, in one chapter or in the whole game. */
export function tallyOf(seen: readonly EndingId[], chapter?: Chapter): Tally {
  const pool = chapter ? ALL_ENDINGS.filter((id) => id.startsWith(`${chapter}.`)) : ALL_ENDINGS;
  return { seen: pool.filter((id) => seen.includes(id)).length, total: pool.length };
}

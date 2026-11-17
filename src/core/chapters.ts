// Played chapters: scripted mornings that hold the day back until they have been played.
//
// Each chapter says which night opens it, whether this morning is waiting for it, what it still does to
// every morning once it has been played, and which fates it can end a run with. The campaign and the
// morning scene only ever ask this registry; a new chapter is one more entry here.

import { DAY_HOURS } from './data/locations';
import { awaitsOrchard, daylight } from './orchard';
import { awaitsRadio, opensRadio, radioDawn } from './radio';
import { awaitsShed, opensShed, shedDawn } from './shed';
import type { Cost, Fate, GameState, NightReport } from './types';

export const CHAPTER_IDS = ['orchard', 'shed', 'radio'] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

/** What a chapter does to the start of a day: hours of daylight added (negative: taken), and things found at the door. */
export interface Dawn {
  readonly hours: number;
  readonly gift: Cost;
}

interface Chapter {
  readonly id: ChapterId;
  /** Whether this morning waits for it. */
  readonly awaits: (state: GameState) => boolean;
  /** Called with every night that was survived: the state with the chapter opened, if that night opens it. */
  readonly opens: (state: GameState, report: NightReport) => GameState;
  /** What it still does to the start of a day, once played. `state.day` is the day that starts. */
  readonly dawn: (state: GameState) => Dawn;
  readonly fates: readonly Fate[];
}

const CHAPTERS: readonly Chapter[] = [
  {
    id: 'orchard',
    awaits: awaitsOrchard,
    // A camera that died in the night is still dark at dawn: someone has to go and look.
    opens: (state, report) => (report.cameraLost !== null && state.orchard === 'quiet' ? { ...state, orchard: 'cut' } : state),
    dawn: (state) => ({ hours: daylight(state) - DAY_HOURS, gift: {} }),
    fates: ['throat', 'turned', 'bled'],
  },
  {
    id: 'shed',
    awaits: awaitsShed,
    opens: opensShed,
    dawn: shedDawn,
    fates: ['bitten'],
  },
  {
    // The morning after night 6: a voice on the CB. Nothing in it ends the run; what it leads to is the
    // last day's and the last night's, and settled when it is played.
    id: 'radio',
    awaits: awaitsRadio,
    opens: opensRadio,
    dawn: radioDawn,
    fates: [],
  },
];

/** The chapter this morning is waiting for, if any. */
export const chapterWaiting = (state: GameState): ChapterId | null => CHAPTERS.find((chapter) => chapter.awaits(state))?.id ?? null;

/** Lets every chapter see the night that was just survived. */
export const openChapters = (state: GameState, report: NightReport): GameState =>
  report.survived ? CHAPTERS.reduce((next, chapter) => chapter.opens(next, report), state) : state;

/** Everything the chapters already played do to the start of `state.day`. */
export function dawnOf(state: GameState): Dawn {
  const gift: Partial<Record<keyof Cost, number>> = {};
  let hours = 0;
  for (const chapter of CHAPTERS) {
    const dawn = chapter.dawn(state);
    hours += dawn.hours;
    for (const [id, n] of Object.entries(dawn.gift) as [keyof Cost, number][]) gift[id] = (gift[id] ?? 0) + n;
  }
  return { hours, gift };
}

/** Which chapter a fate belongs to. */
export const chapterOfFate = (fate: Fate): ChapterId => (CHAPTERS.find((chapter) => chapter.fates.includes(fate)) as Chapter).id;

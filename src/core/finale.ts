// How a run ends when the house falls.
//
// Early on it is short: the door of the control room gives way. From the fifth night the evening is
// not over — there is a ride-on mower in the shed with a blade on the front and two amplifier stacks
// on the back, and a keyboard to play it like a guitar. Nothing played there changes how it ends;
// it only decides how loud. This module holds the rules of that jam: the chart and what a strum is worth.

import type { GameState } from './types';

export const FINALE = {
  /** From this night on, losing the house leads to the shed instead of the desk. */
  rampageFromNight: 5,
  /** The track: its tempo, where its first beat falls and how long it runs (measured, see tools/beat.mjs). */
  bpm: 150,
  offset: 0.13,
  seconds: 80,
  /** Seconds of playing before leaving is offered. */
  skipAfter: 30,
  /** How far from a note, in seconds, a strum still counts. */
  perfect: 0.075,
  good: 0.16,
  /** How long a note is on screen before it is due. */
  lead: 1.5,
  /** Bars left empty at the start, to find the keys, and at the end, for the last chord to ring. */
  barsIn: 2,
  barsOut: 2,
  /**
   * Semitones above the one recorded chord, per chord key: an E minor pentatonic up to the octave,
   * so nothing played over the track can sound wrong.
   */
  semitones: [0, 3, 5, 7, 10, 12],
} as const;

export const CHORDS = FINALE.semitones.length;

export type FinaleKind = 'desk' | 'rampage';

/** Which end a lost house leads to. Null when the run did not end that way (still going, won, or the orchard). */
export const finaleOf = (state: Pick<GameState, 'phase' | 'fate' | 'day'>): FinaleKind | null =>
  state.phase !== 'lost' || state.fate !== null ? null : state.day >= FINALE.rampageFromNight ? 'rampage' : 'desk';

// ───────────────────────────── The chart ─────────────────────────────

export interface Note {
  readonly time: number;
  /** Index of the chord key, 0..CHORDS-1. */
  readonly chord: number;
}

const _ = null;
type Riff = readonly (number | null)[];
/** One bar each, eight quavers. Three levels: finding the keys, getting going, showing off. */
const RIFFS: readonly (readonly Riff[])[] = [
  [
    [0, _, 0, _, 0, _, 0, _],
    [0, _, 0, _, 1, _, 1, _],
    [2, _, 2, _, 1, _, 0, _],
    [0, _, _, _, 3, _, _, _],
  ],
  [
    [0, _, 0, 0, _, 1, _, 2],
    [0, 0, _, 0, 2, _, 1, _],
    [3, _, 3, _, 2, 2, _, 0],
    [0, _, 1, _, 2, _, 3, _],
    [4, _, 4, 4, _, 3, _, 2],
  ],
  [
    [0, 0, 1, 0, 2, 0, 3, _],
    [5, _, 4, 4, 3, _, 2, 2],
    [0, 0, 0, _, 3, 3, 3, _],
    [0, 1, 2, 3, 4, 5, _, 5],
    [2, 2, _, 2, 4, _, 5, 5],
  ],
];

/** The notes of the whole track, in order. The same every time: it is a song, not a draw. */
export function chartOf(seconds: number = FINALE.seconds, bpm: number = FINALE.bpm, offset: number = FINALE.offset): Note[] {
  const quaver = 30 / bpm;
  const bar = quaver * 8;
  const bars = Math.floor((seconds - offset) / bar);
  const notes: Note[] = [];
  for (let b = FINALE.barsIn; b < bars - FINALE.barsOut; b++) {
    const played = b - FINALE.barsIn;
    const level = played < 6 ? 0 : played < 18 ? 1 : 2;
    const riffs = RIFFS[level] as readonly Riff[];
    // Every fourth bar of a level answers the three before it, a level down: room to breathe.
    const riff = (played % 4 === 3 && level > 0 ? (RIFFS[level - 1] as readonly Riff[])[played % 4] : riffs[(played * 3 + level) % riffs.length]) as Riff;
    riff.forEach((chord, slot) => {
      if (chord !== null) notes.push({ time: offset + b * bar + slot * quaver, chord });
    });
  }
  return notes;
}

// ───────────────────────────── The jam ─────────────────────────────

export interface Jam {
  /** Index of the first note not yet played or let go by. */
  readonly next: number;
  /** Infected mown down by sound alone. */
  readonly mown: number;
  readonly combo: number;
  readonly best: number;
  readonly perfect: number;
  readonly good: number;
  readonly missed: number;
  readonly strums: number;
}

export const startJam = (): Jam => ({ next: 0, mown: 0, combo: 0, best: 0, perfect: 0, good: 0, missed: 0, strums: 0 });

/**
 * `perfect` / `good`: the right chord on a note. `wrong`: a note was due, another chord was held.
 * `free`: a chord with no note due — still loud. `air`: the strings were hit with no chord held.
 */
export type Verdict = 'perfect' | 'good' | 'wrong' | 'free' | 'air';

export interface Strum {
  readonly jam: Jam;
  readonly verdict: Verdict;
  /** Infected this strum knocked over. */
  readonly mown: number;
}

/** Lets go of the notes that went by unplayed. */
export function settle(jam: Jam, chart: readonly Note[], time: number): Jam {
  let { next } = jam;
  while (next < chart.length && time > (chart[next] as Note).time + FINALE.good) next++;
  const missed = next - jam.next;
  return missed === 0 ? jam : { ...jam, next, missed: jam.missed + missed, combo: 0 };
}

/** The strings are hit at `time`, with a chord key held or not. */
export function strum(before: Jam, chart: readonly Note[], time: number, chord: number | null): Strum {
  const jam = { ...settle(before, chart, time), strums: before.strums + 1 };
  if (chord === null) return { jam, verdict: 'air', mown: 0 };
  const note = chart[jam.next];
  const due = note !== undefined && Math.abs(time - note.time) <= FINALE.good;
  if (!due) return { jam: { ...jam, mown: jam.mown + 1 }, verdict: 'free', mown: 1 };
  if (note.chord !== chord) return { jam: { ...jam, combo: 0, mown: jam.mown + 1 }, verdict: 'wrong', mown: 1 };
  const perfect = Math.abs(time - note.time) <= FINALE.perfect;
  const combo = jam.combo + 1;
  // A run of right notes carries: every eight in a row is one more body per strum.
  const mown = (perfect ? 3 : 2) + Math.floor(combo / 8);
  return {
    jam: {
      ...jam,
      next: jam.next + 1,
      combo,
      best: Math.max(jam.best, combo),
      perfect: jam.perfect + (perfect ? 1 : 0),
      good: jam.good + (perfect ? 0 : 1),
      mown: jam.mown + mown,
    },
    verdict: perfect ? 'perfect' : 'good',
    mown,
  };
}

/** Playback rate that turns the recorded chord into the one a key stands for. */
export const chordRate = (chord: number): number => 2 ** ((FINALE.semitones[chord] ?? 0) / 12);

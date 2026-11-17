// How a run ends. Every run ends with the village in the garden; what changes is how it is left.
//
// A house that falls early is left at the desk: the door of the control room gives way. From the
// fifth night — and at the seventh dawn, when they do not leave — there is a ride-on mower in the
// shed with a blade on the front and two amplifier stacks on the back, and a keyboard to play it like
// a guitar. Nothing played there changes how it ends; it only decides how loud. This module holds the
// rules of that jam: the shape of the song, the chart laid on it, what a strum is worth, and what is
// kept of it afterwards.

import { endingId, type EndingId } from './endings';
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
  /** Bars left empty at the start, to find the keys. */
  barsIn: 2,
} as const;

/**
 * Two ways to play the same song. `soft` is for listening: three keys, crotchets at most, notes that
 * take their time crossing the screen and forgive a late hand. `hard` is the song as written.
 */
export type JamMode = 'soft' | 'hard';
export const JAM_MODES: readonly JamMode[] = ['soft', 'hard'];

export interface JamRules {
  /** How far from a note, in seconds, a strum still counts. */
  readonly perfect: number;
  readonly good: number;
  /** How long a note is on screen before it is due. */
  readonly lead: number;
  /**
   * Semitones above the one recorded chord, per chord key. Either set stays inside E minor, so
   * nothing played over the track can sound wrong: E–A–B, the three chords of every rock song, or
   * the pentatonic up to the octave.
   */
  readonly semitones: readonly number[];
}

export const JAM: Readonly<Record<JamMode, JamRules>> = {
  soft: { perfect: 0.11, good: 0.24, lead: 2.6, semitones: [0, 5, 7] },
  hard: { perfect: 0.075, good: 0.16, lead: 1.5, semitones: [0, 3, 5, 7, 10, 12] },
};

/** How many chord keys a mode plays with. */
export const chordsOf = (mode: JamMode): number => JAM[mode].semitones.length;

/** At the desk (a house lost early), on the mower (a house lost from the fifth night), on the mower at the seventh dawn. */
export type FinaleKind = 'desk' | 'rampage' | 'dawn';

/** Which end a finished run leads to. Null while it is still going, and when the orchard ended it. */
export function finaleOf(state: Pick<GameState, 'phase' | 'fate' | 'day'>): FinaleKind | null {
  if (state.fate !== null) return null;
  if (state.phase === 'held') return 'dawn';
  if (state.phase !== 'lost') return null;
  return state.day >= FINALE.rampageFromNight ? 'rampage' : 'desk';
}

/** Whether that end goes out through the shed, with the song. */
export const playsTheSong = (kind: FinaleKind): boolean => kind !== 'desk';

// ───────────────────────────── The song ─────────────────────────────

/** Seconds per bar of four beats. */
export const BAR_SECONDS = (4 * 60) / FINALE.bpm;
/** Where bar `bar` of the track begins (bar 0 begins on the first beat). */
export const barStart = (bar: number): number => FINALE.offset + bar * BAR_SECONDS;

/**
 * `riff`: the chugging riff on its own. `lead`: the riff with a guitar line over it. `solo`: the same
 * kind of bar in the second half, the line at its most present. `outro`: the line gone, the drums
 * filling in toward the last chord.
 */
export type SectionKind = 'riff' | 'lead' | 'solo' | 'outro';

export interface Section {
  readonly kind: SectionKind;
  /** First and last bar, inclusive. */
  readonly from: number;
  readonly to: number;
}

/**
 * mus_finale, bar by bar. Measured, not heard: `node tools/beat.mjs public/assets/audio/mus_finale.mp3 --bars`
 * decodes the track with ffmpeg and reads every bar of the grid above (spectra every 12 ms) for its
 * loudness, attacks, brightness (spectral centroid), how far a single line stands out of the wall of
 * guitars between 0.5 and 2.5 kHz, how far that line's pitch wanders, which pitch classes dominate, and
 * where the kick drops out under toms and snare. What it found:
 *
 * - Beat one of every bar is a beat of the grid counted in fours from the first: the harmony changes
 *   there most, the five drum fills it finds all take the last beat of their bar, and the final chord
 *   lands on a beat one. Three votes out of three; the other three groupings get none.
 * - Two kinds of bar, which a two-means clustering on brightness and line prominence separates
 *   cleanly: a dark riff on E–F with nothing singing over it (centroid ≈ 500 Hz, line ≈ 11.5 dB above
 *   its surroundings) and the riff with a line over it (≈ 590 Hz, ≈ 14.5 dB). Riff 0–7, line 8–23,
 *   riff 24–31 (the opening riff again: the most self-similar stretch of the track), line 32–47.
 * - Under the line the harmony turns every two bars: two on E, where the line moves (its pitch spread
 *   over a bar is 2–16 semitones), then two on F#–C#, where it holds one note (spread ≈ 0). Those are
 *   `away`. The loudness never moves (−17.6 ± 0.3 dB a bar: the track is a brick wall), so where the
 *   music breathes is there and in the fills, not in its level.
 * - The line stands out most and moves most over bars 40–45 (`peak`), and drops back to the riff's
 *   level on 46–47 while the harmony stops moving.
 * - The kick drops under a fill on the fourth beat of bars 7, 15, 31 and 39, and from the third beat
 *   of bar 47.
 * - The final chord hits at 76.95 s — beat one of bar 48 on the grid, 76.93 — rings to ≈ 77.8 s, and
 *   the track is silent (40 dB down) from 78.7 s.
 *
 * Read into it rather than measured: that the second half of the line (32–45) is the solo the track
 * was asked for. It measures as the same kind of bar as 8–23, only with a slightly more mobile line,
 * peaking at 40–45; the generation brief put a solo in the second half, and nothing else there could be it.
 */
export const SONG = {
  sections: [
    { kind: 'riff', from: 0, to: 7 },
    { kind: 'lead', from: 8, to: 23 },
    { kind: 'riff', from: 24, to: 31 },
    { kind: 'solo', from: 32, to: 45 },
    { kind: 'outro', from: 46, to: 47 },
  ] satisfies readonly Section[],
  /** The solo at its most present. */
  peak: { from: 40, to: 45 },
  /** Bars on F#–C#, the line holding a note. */
  away: [10, 11, 14, 15, 18, 19, 22, 23, 34, 35, 38, 39, 42, 43, 46, 47],
  /** Bars ending in a drum fill, and the beat (1–4) it starts on. */
  fills: [
    { bar: 7, beat: 4 },
    { bar: 15, beat: 4 },
    { bar: 31, beat: 4 },
    { bar: 39, beat: 4 },
    { bar: 47, beat: 3 },
  ],
  finalChord: {
    /** It falls on beat one of this bar. */
    bar: 48,
    /** Where the measurement put its attack, for comparison with the grid. */
    measured: 76.95,
    ringsUntil: 77.8,
    /** The song is over: the scene moves on from here. */
    silence: 78.7,
  },
} as const;

/** When the last chord falls, on the grid. */
export const FINAL_CHORD = barStart(SONG.finalChord.bar);

/** The section a bar belongs to; null before the first and from the final chord on. */
export const sectionOf = (bar: number): Section | null => SONG.sections.find((s) => bar >= s.from && bar <= s.to) ?? null;

/** The section playing at a moment of the song. */
export const sectionAt = (time: number): Section | null => sectionOf(Math.floor((time - FINALE.offset) / BAR_SECONDS));

// ───────────────────────────── The chart ─────────────────────────────

export interface Note {
  readonly time: number;
  /** Index of the chord key, 0..CHORDS-1. */
  readonly chord: number;
}

const _ = null;
type Riff = readonly (number | null)[];

/** What a bar of the chart is doing, from where it falls in the song. */
type Role = 'riff' | 'riffAgain' | 'leadHome' | 'leadAway' | 'soloHome' | 'soloAway' | 'peakHome' | 'peakAway' | 'outro';

/**
 * One bar each, eight quavers; a role's riffs are played in turn. Over E (`Home`) the chart moves with
 * the line; over F#–C# (`Away`) it holds, higher up, the way the line does. The riffs sit on the root.
 * The solo climbs, and at its peak every quaver is a note (hard) or every beat is (soft).
 */
const RIFFS: Readonly<Record<JamMode, Readonly<Record<Role, readonly Riff[]>>>> = {
  // Never faster than the beat, never more than three keys (E, A, B).
  soft: {
    riff: [
      [0, _, _, _, 0, _, _, _],
      [0, _, _, _, 1, _, _, _],
      [0, _, _, _, 0, _, _, _],
      [0, _, _, _, 2, _, _, _],
    ],
    riffAgain: [
      [0, _, 0, _, 0, _, _, _],
      [0, _, 0, _, 1, _, _, _],
      [0, _, 0, _, _, _, 1, _],
      [0, _, 0, _, 2, _, _, _],
    ],
    leadHome: [
      [0, _, _, _, 1, _, 2, _],
      [0, _, 1, _, _, _, 2, _],
      [2, _, _, _, 1, _, 0, _],
    ],
    leadAway: [
      [1, _, _, _, _, _, _, _],
      [2, _, _, _, _, _, 1, _],
      [1, _, _, _, 2, _, _, _],
    ],
    soloHome: [
      [0, _, 1, _, 2, _, 1, _],
      [2, _, 1, _, 2, _, 0, _],
      [0, _, 2, _, 1, _, 2, _],
    ],
    soloAway: [
      [2, _, _, _, 2, _, _, _],
      [1, _, _, _, 2, _, _, _],
    ],
    peakHome: [
      [0, _, 1, _, 2, _, 2, _],
      [2, _, 1, _, 2, _, 1, _],
      [1, _, 2, _, 1, _, 2, _],
      [2, _, 2, _, 1, _, 2, _],
    ],
    peakAway: [
      [2, _, _, _, 2, _, 1, _],
      [2, _, 1, _, 2, _, _, _],
    ],
    outro: [
      [2, _, _, _, _, _, _, _],
      [1, _, _, _, _, _, _, _],
    ],
  },
  // Six keys: E G A B D E'.
  hard: {
    riff: [
      [0, _, 0, _, 0, _, 0, _],
      [0, _, 0, _, 1, _, 0, _],
      [0, _, 0, _, 0, _, 2, _],
      [0, _, 0, _, 1, _, 2, _],
    ],
    riffAgain: [
      [0, 0, _, 0, 0, _, 1, _],
      [0, 0, _, 0, 0, _, 2, 1],
      [0, 0, _, 0, 2, _, 1, _],
      [0, _, 0, 0, _, 0, 3, _],
    ],
    leadHome: [
      [0, _, 2, _, 3, _, 2, _],
      [0, _, _, 2, _, 3, 4, _],
      [3, _, 2, _, 0, _, 2, 3],
      [0, 2, _, 3, _, 4, _, 3],
    ],
    leadAway: [
      [3, _, _, _, 3, _, _, _],
      [4, _, _, 3, _, _, 2, _],
      [2, _, _, _, 4, _, _, _],
      [3, _, _, 3, _, _, 4, _],
    ],
    soloHome: [
      [0, 1, 2, 3, 4, _, 3, _],
      [5, _, 4, 3, _, 2, 3, _],
      [2, 3, 4, _, 5, _, 4, _],
      [0, 2, 3, 4, _, 5, _, 5],
    ],
    soloAway: [
      [4, _, _, 4, 5, _, _, _],
      [5, _, _, _, 5, _, 4, _],
    ],
    peakHome: [
      [0, 1, 2, 3, 4, 5, 4, 5],
      [5, 4, 5, 3, 4, 2, 3, 5],
      [3, 4, 5, 4, 5, 3, 4, 5],
      [5, 5, 4, 5, 3, 4, 5, 5],
    ],
    peakAway: [
      [5, _, 5, _, 5, 4, 5, _],
      [4, _, 5, _, 5, _, 5, 5],
    ],
    outro: [
      [3, _, _, _, 2, _, _, _],
      [0, _, 0, _, 0, _, 0, _],
    ],
  },
};

/** Everything the chart needs to know about one bar. */
export interface BarPlan {
  readonly bar: number;
  readonly section: Section;
  /** How many sections of the same kind came before this one. */
  readonly round: number;
  readonly away: boolean;
  readonly peak: boolean;
  /** The beat (1–4) from which the drums fill alone, if they do. */
  readonly fill: number | null;
}

export function planOf(bar: number): BarPlan | null {
  const section = sectionOf(bar);
  if (!section) return null;
  return {
    bar,
    section,
    round: SONG.sections.filter((s) => s.kind === section.kind && s.from < section.from).length,
    away: (SONG.away as readonly number[]).includes(bar),
    peak: bar >= SONG.peak.from && bar <= SONG.peak.to,
    fill: SONG.fills.find((f) => f.bar === bar)?.beat ?? null,
  };
}

function roleOf(plan: BarPlan): Role {
  switch (plan.section.kind) {
    case 'riff':
      return plan.round === 0 ? 'riff' : 'riffAgain';
    case 'lead':
      return plan.away ? 'leadAway' : 'leadHome';
    case 'solo':
      if (plan.peak) return plan.away ? 'peakAway' : 'peakHome';
      return plan.away ? 'soloAway' : 'soloHome';
    case 'outro':
      return 'outro';
  }
}

/**
 * The notes of the whole track, in order. The same every time: it is a song, not a draw. Two bars to
 * find the keys, then each bar plays its role; a fill is left to the drums, and the last note is the
 * final chord, on the root.
 */
export function chartOf(mode: JamMode = 'hard'): Note[] {
  const quaver = 30 / FINALE.bpm;
  const notes: Note[] = [];
  const turns = new Map<Role, number>();
  for (let bar = FINALE.barsIn; bar < SONG.finalChord.bar; bar++) {
    const plan = planOf(bar);
    if (!plan) continue;
    const role = roleOf(plan);
    const riffs = RIFFS[mode][role];
    const turn = turns.get(role) ?? 0;
    turns.set(role, turn + 1);
    const riff = riffs[turn % riffs.length] as Riff;
    // The drums' fill is theirs: from its beat on, the strings rest.
    const restFrom = plan.fill === null ? riff.length : (plan.fill - 1) * 2;
    riff.forEach((chord, slot) => {
      if (chord !== null && slot < restFrom) notes.push({ time: barStart(bar) + slot * quaver, chord });
    });
  }
  notes.push({ time: FINAL_CHORD, chord: 0 });
  return notes;
}

// ───────────────────────────── What is kept of it ─────────────────────────────

/** How a song went, for the end screen and the record. */
export interface JamResult {
  /** The way it was counted (see `recordMode`). */
  readonly mode: JamMode;
  /** Everything knocked over: by the sound, and by the blade. */
  readonly mown: number;
  readonly best: number;
  readonly perfect: number;
  /** Played to the final chord, rather than left once leaving was offered. */
  readonly full: boolean;
}

/** The best song so far in one mode, kept across runs. */
export interface JamRecord {
  readonly mown: number;
  /** The longest streak ever, not necessarily in that song. */
  readonly best: number;
}

/** A song that went through both modes counts as the gentle one: the furious record is furious all the way. */
export const recordMode = (played: readonly JamMode[]): JamMode => (played.includes('soft') || played.length === 0 ? 'soft' : 'hard');

export interface RecordOutcome {
  readonly record: JamRecord;
  /** More mown than the record before it. */
  readonly beaten: boolean;
  /** What it stood at before; null the first time this mode was played. */
  readonly previous: JamRecord | null;
}

export function recordAfter(previous: JamRecord | null, result: JamResult): RecordOutcome {
  const beaten = previous !== null && result.mown > previous.mown;
  const first = previous === null;
  return {
    record: {
      mown: first || beaten ? result.mown : previous.mown,
      best: Math.max(previous?.best ?? 0, result.best),
    },
    beaten,
    previous,
  };
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** A stored record, or null when it is missing or makes no sense. */
export function parseRecord(raw: unknown): JamRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { mown, best } = raw as Record<string, unknown>;
  return isCount(mown) && isCount(best) ? { mown, best } : null;
}

/** The endings a finished last scene counts for. */
export function endingsOf(kind: FinaleKind, full: boolean): EndingId[] {
  const ending = endingId('finale', kind);
  return full && playsTheSong(kind) ? [ending, endingId('finale', 'chord')] : [ending];
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
export function settle(jam: Jam, chart: readonly Note[], time: number, mode: JamMode = 'hard'): Jam {
  let { next } = jam;
  while (next < chart.length && time > (chart[next] as Note).time + JAM[mode].good) next++;
  const missed = next - jam.next;
  return missed === 0 ? jam : { ...jam, next, missed: jam.missed + missed, combo: 0 };
}

/** The strings are hit at `time`, with a chord key held or not. */
export function strum(before: Jam, chart: readonly Note[], time: number, chord: number | null, mode: JamMode = 'hard'): Strum {
  const rules = JAM[mode];
  const jam = { ...settle(before, chart, time, mode), strums: before.strums + 1 };
  if (chord === null) return { jam, verdict: 'air', mown: 0 };
  const note = chart[jam.next];
  const due = note !== undefined && Math.abs(time - note.time) <= rules.good;
  if (!due) return { jam: { ...jam, mown: jam.mown + 1 }, verdict: 'free', mown: 1 };
  if (note.chord !== chord) return { jam: { ...jam, combo: 0, mown: jam.mown + 1 }, verdict: 'wrong', mown: 1 };
  const perfect = Math.abs(time - note.time) <= rules.perfect;
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
export const chordRate = (chord: number, mode: JamMode = 'hard'): number => 2 ** ((JAM[mode].semitones[chord] ?? 0) / 12);

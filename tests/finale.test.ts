import { describe, expect, it } from 'vitest';
import {
  BAR_SECONDS,
  FINAL_CHORD,
  FINALE,
  JAM,
  JAM_MODES,
  SONG,
  barStart,
  chartOf,
  chordRate,
  chordsOf,
  endingsOf,
  finaleOf,
  parseRecord,
  planOf,
  playsTheSong,
  recordAfter,
  recordMode,
  sectionAt,
  settle,
  startJam,
  strum,
  type Jam,
  type JamMode,
  type JamResult,
  type Note,
  type SectionKind,
} from '../src/core/finale';
import { newGame } from '../src/core/game';
import type { GameState } from '../src/core/types';

const CHORDS = chordsOf('hard');

const lost = (day: number, patch: Partial<GameState> = {}): GameState => ({ ...newGame(1), day, phase: 'lost', ...patch });

describe('the end: which one', () => {
  it('is the desk for a house lost on the first four nights, the shed from the fifth', () => {
    expect([1, 2, 3, 4].map((night) => finaleOf(lost(night)))).toEqual(['desk', 'desk', 'desk', 'desk']);
    expect([5, 6, 7].map((night) => finaleOf(lost(night)))).toEqual(['rampage', 'rampage', 'rampage']);
  });

  it('is the shed as well for a run that held the seventh night: the dawn does not send them home', () => {
    const held: GameState = { ...newGame(1), day: 7, phase: 'held' };
    expect(finaleOf(held)).toBe('dawn');
    expect(playsTheSong('dawn')).toBe(true);
    expect(playsTheSong('rampage')).toBe(true);
    expect(playsTheSong('desk')).toBe(false);
  });

  it('is none for a run that is not over, or that the orchard ended', () => {
    expect(finaleOf(newGame(1))).toBeNull();
    expect(finaleOf({ ...newGame(1), day: 3, phase: 'morning' })).toBeNull();
    expect(finaleOf(lost(2, { orchard: 'cut', fate: 'throat' }))).toBeNull();
  });
});

describe('the end: the song, as measured', () => {
  const kinds = (kind: SectionKind) => SONG.sections.filter((s) => s.kind === kind);

  it('covers every bar from the first beat to the final chord, once, in order', () => {
    let next = 0;
    for (const section of SONG.sections) {
      expect(section.from).toBe(next);
      expect(section.to).toBeGreaterThanOrEqual(section.from);
      next = section.to + 1;
    }
    expect(next).toBe(SONG.finalChord.bar);
    expect(sectionAt(FINALE.offset + 0.01)?.kind).toBe('riff');
    expect(sectionAt(barStart(40) + 0.5)?.kind).toBe('solo');
    expect(sectionAt(FINAL_CHORD + 0.1)).toBeNull();
  });

  it('puts the final chord on a beat one, where it was heard, before the silence and the end of the file', () => {
    expect(FINAL_CHORD).toBeCloseTo(FINALE.offset + SONG.finalChord.bar * BAR_SECONDS, 10);
    expect(Math.abs(FINAL_CHORD - SONG.finalChord.measured)).toBeLessThan(0.03);
    expect(SONG.finalChord.ringsUntil).toBeGreaterThan(FINAL_CHORD);
    expect(SONG.finalChord.silence).toBeGreaterThan(SONG.finalChord.ringsUntil);
    expect(SONG.finalChord.silence).toBeLessThan(FINALE.seconds);
  });

  it('turns away from E every other pair of bars, only while the line plays, and peaks inside the solo', () => {
    const [solo] = kinds('solo');
    expect(solo).toBeDefined();
    expect(SONG.peak.from).toBeGreaterThanOrEqual(solo?.from ?? Infinity);
    expect(SONG.peak.to).toBeLessThanOrEqual(solo?.to ?? -Infinity);
    for (const bar of SONG.away) {
      expect(['lead', 'solo', 'outro']).toContain(planOf(bar)?.section.kind);
      expect((bar - 8) % 4).toBeGreaterThanOrEqual(2);
    }
    for (const fill of SONG.fills) {
      expect(planOf(fill.bar)?.fill).toBe(fill.beat);
      expect(fill.beat).toBeGreaterThanOrEqual(1);
      expect(fill.beat).toBeLessThanOrEqual(4);
    }
    // The riff comes round twice: the second time is its own round.
    expect(kinds('riff').map((s) => planOf(s.from)?.round)).toEqual([0, 1]);
  });
});

describe('the end: the chart', () => {
  const chart = chartOf();
  const quaver = 30 / FINALE.bpm;

  it('is the same song every time', () => {
    expect(chartOf()).toEqual(chart);
  });

  it('sits on the beat grid of the track, in order, with room to find the keys', () => {
    expect(chart.length).toBeGreaterThan(120);
    chart.forEach((note, i) => {
      const slots = (note.time - FINALE.offset) / quaver;
      expect(Math.abs(slots - Math.round(slots))).toBeLessThan(1e-6);
      expect(note.chord).toBeGreaterThanOrEqual(0);
      expect(note.chord).toBeLessThan(CHORDS);
      if (i > 0) expect(note.time).toBeGreaterThan((chart[i - 1] as Note).time);
    });
    expect((chart[0] as Note).time).toBeGreaterThanOrEqual(FINALE.offset + FINALE.barsIn * quaver * 8 - 1e-9);
  });

  it('never asks for two notes closer than a quaver, and gets busier', () => {
    for (let i = 1; i < chart.length; i++) expect((chart[i] as Note).time - (chart[i - 1] as Note).time).toBeGreaterThan(quaver - 1e-6);
    const density = (from: number, to: number): number => chart.filter((n) => n.time >= from && n.time < to).length / (to - from);
    expect(density(40, 70)).toBeGreaterThan(density(4, 14));
  });

  it('leaves something to play after leaving is offered, and uses every chord', () => {
    expect(chart.some((n) => n.time > FINALE.skipAfter + 20)).toBe(true);
    expect(new Set(chart.map((n) => n.chord)).size).toBe(CHORDS);
  });
});

describe('the end: strumming', () => {
  const chart: Note[] = [
    { time: 1, chord: 0 },
    { time: 2, chord: 3 },
    { time: 3, chord: 1 },
  ];

  it('scores the right chord on time, better when it is dead on', () => {
    const dead = strum(startJam(), chart, 1.01, 0);
    expect(dead).toMatchObject({ verdict: 'perfect', mown: 3 });
    expect(dead.jam).toMatchObject({ next: 1, combo: 1, perfect: 1, mown: 3 });
    const near = strum(startJam(), chart, 1 + JAM.hard.good - 0.01, 0);
    expect(near).toMatchObject({ verdict: 'good', mown: 2 });
    expect(near.jam).toMatchObject({ next: 1, good: 1 });
  });

  it('breaks the streak on a wrong chord, and leaves the note to be played', () => {
    const first = strum(startJam(), chart, 1, 0).jam;
    const wrong = strum(first, chart, 2, 5);
    expect(wrong.verdict).toBe('wrong');
    expect(wrong.jam).toMatchObject({ combo: 0, next: 1 });
    expect(strum(wrong.jam, chart, 2.05, 3).verdict).toBe('perfect');
  });

  it('still makes noise between the notes, and none with no chord held', () => {
    const free = strum(startJam(), chart, 0.3, 2);
    expect(free).toMatchObject({ verdict: 'free', mown: 1 });
    expect(free.jam).toMatchObject({ next: 0, combo: 0, strums: 1 });
    const air = strum(startJam(), chart, 1, null);
    expect(air).toMatchObject({ verdict: 'air', mown: 0 });
    expect(air.jam.next).toBe(0);
  });

  it('lets go of notes that went by, and counts them', () => {
    const late = settle(strum(startJam(), chart, 1, 0).jam, chart, 2.5);
    expect(late).toMatchObject({ next: 2, missed: 1, combo: 0 });
    const untouched = startJam();
    expect(settle(untouched, chart, 0.5)).toBe(untouched);
  });

  it('carries a streak: every eight right notes in a row is one more per strum', () => {
    const long: Note[] = Array.from({ length: 20 }, (_, i) => ({ time: 1 + i * 0.4, chord: i % CHORDS }));
    let jam: Jam = startJam();
    const mown: number[] = [];
    for (const note of long) {
      const result = strum(jam, long, note.time, note.chord);
      jam = result.jam;
      mown.push(result.mown);
    }
    expect(mown[0]).toBe(3);
    expect(mown[7]).toBe(4);
    expect(mown[15]).toBe(5);
    expect(jam).toMatchObject({ combo: 20, best: 20, perfect: 20, missed: 0 });
  });

  it('plays the whole song clean, and mows more that way than by thrashing', () => {
    const chart = chartOf();
    let clean: Jam = startJam();
    for (const note of chart) clean = strum(clean, chart, note.time, note.chord).jam;
    expect(clean).toMatchObject({ next: chart.length, missed: 0, perfect: chart.length });
    let thrash: Jam = startJam();
    for (let t = 0; t < FINALE.seconds; t += 0.2) thrash = strum(thrash, chart, t + 0.1, 0).jam;
    expect(clean.mown).toBeGreaterThan(thrash.mown * 1.5);
    expect(thrash.mown).toBeGreaterThan(0);
  });

  it('tunes the chord keys to a pentatonic, the last one an octave up', () => {
    expect(chordRate(0)).toBe(1);
    expect(chordRate(CHORDS - 1)).toBeCloseTo(2, 10);
    for (let i = 1; i < CHORDS; i++) expect(chordRate(i)).toBeGreaterThan(chordRate(i - 1));
  });
});

describe('the end: the gentle way to play it', () => {
  const soft = chartOf('soft');
  const hard = chartOf('hard');
  const beat = 60 / FINALE.bpm;

  it('is the same song, with far fewer notes and only three keys', () => {
    expect(chartOf('soft')).toEqual(soft);
    expect(chordsOf('soft')).toBe(3);
    expect(soft.length).toBeGreaterThan(40);
    expect(soft.length).toBeLessThan(hard.length * 0.65);
    for (const note of soft) expect(note.chord).toBeLessThan(3);
    expect(new Set(soft.map((n) => n.chord)).size).toBe(3);
  });

  it('never asks for anything faster than the beat, and lands on it', () => {
    for (let i = 1; i < soft.length; i++) expect((soft[i] as Note).time - (soft[i - 1] as Note).time).toBeGreaterThan(beat - 1e-6);
    for (const note of soft) {
      const beats = (note.time - FINALE.offset) / beat;
      expect(Math.abs(beats - Math.round(beats))).toBeLessThan(1e-6);
    }
  });

  it('gives the notes longer on screen and forgives a later hand', () => {
    expect(JAM.soft.lead).toBeGreaterThan(JAM.hard.lead * 1.5);
    expect(JAM.soft.good).toBeGreaterThan(JAM.hard.good);
    const note = soft[0] as Note;
    const late = note.time + JAM.hard.good + 0.05;
    expect(strum(startJam(), soft, late, note.chord, 'soft').verdict).toBe('good');
    expect(strum(startJam(), soft, late, note.chord, 'hard').verdict).not.toBe('good');
    // A note is only let go once the wider window has closed.
    expect(settle(startJam(), soft, late, 'soft').next).toBe(0);
    expect(settle(startJam(), soft, late, 'hard').next).toBe(1);
  });

  it('plays clean from end to end, on three chords that belong to the key', () => {
    let jam: Jam = startJam();
    for (const note of soft) jam = strum(jam, soft, note.time, note.chord, 'soft').jam;
    expect(jam).toMatchObject({ next: soft.length, missed: 0, perfect: soft.length });
    // E, A, B: root, fourth, fifth.
    expect([0, 1, 2].map((chord) => Math.round(12 * Math.log2(chordRate(chord, 'soft'))))).toEqual([0, 5, 7]);
  });

  it('knows exactly two ways to play', () => {
    expect(JAM_MODES).toEqual(['soft', 'hard']);
  });
});

/** Which bar of the track a moment falls in. */
const barAt = (time: number): number => Math.floor((time - FINALE.offset) / BAR_SECONDS + 1e-9);
/** Notes per bar, averaged over a set of bars. */
const perBar = (chart: readonly Note[], bars: readonly number[]): number => (bars.length === 0 ? 0 : chart.filter((n) => bars.includes(barAt(n.time))).length / bars.length);
/** The played bars (after the count-in, before the final chord) that pass a test. */
const barsWhere = (test: (bar: number) => boolean): number[] => Array.from({ length: SONG.finalChord.bar - FINALE.barsIn }, (_, i) => i + FINALE.barsIn).filter(test);
const kindOf = (bar: number): SectionKind | undefined => planOf(bar)?.section.kind;
const MODES: readonly JamMode[] = ['soft', 'hard'];

describe('the end: the chart follows the song', () => {
  it('ends on the final chord, on the root, after the drums have had the last two beats to themselves', () => {
    for (const mode of MODES) {
      const chart = chartOf(mode);
      expect(chart.at(-1)).toEqual({ time: FINAL_CHORD, chord: 0 });
      expect(FINAL_CHORD - (chart.at(-2) as Note).time).toBeGreaterThanOrEqual(2 * (60 / FINALE.bpm) - 1e-9);
    }
  });

  it('leaves every drum fill to the drums', () => {
    for (const mode of MODES) {
      const chart = chartOf(mode);
      for (const fill of SONG.fills) {
        const from = barStart(fill.bar) + (fill.beat - 1) * (60 / FINALE.bpm);
        expect(chart.filter((n) => n.time >= from - 1e-9 && n.time < barStart(fill.bar + 1) - 1e-9)).toEqual([]);
      }
    }
  });

  it('sits on the root while the riff chugs', () => {
    for (const mode of MODES) {
      const riff = chartOf(mode).filter((n) => sectionAt(n.time)?.kind === 'riff');
      expect(riff.filter((n) => n.chord === 0).length).toBeGreaterThan(riff.length / 2);
    }
  });

  it('breathes where the line holds a note, and moves where it moves', () => {
    for (const mode of MODES) {
      const chart = chartOf(mode);
      const line = (bar: number) => kindOf(bar) === 'lead' || kindOf(bar) === 'solo';
      const away = barsWhere((bar) => line(bar) && planOf(bar)?.away === true);
      const home = barsWhere((bar) => line(bar) && planOf(bar)?.away === false);
      expect(perBar(chart, away)).toBeLessThan(perBar(chart, home) * 0.75);
    }
  });

  it('plays each section its own way: no bar of the line is played like a bar of the riff', () => {
    for (const mode of MODES) {
      const chart = chartOf(mode);
      const shape = (bar: number): string =>
        chart
          .filter((n) => barAt(n.time) === bar)
          .map((n) => `${Math.round((n.time - barStart(bar)) / (BAR_SECONDS / 8))}:${n.chord}`)
          .join(' ');
      const riff = new Set(barsWhere((bar) => kindOf(bar) === 'riff').map(shape));
      for (const bar of barsWhere((bar) => kindOf(bar) === 'lead' || kindOf(bar) === 'solo')) expect(riff.has(shape(bar))).toBe(false);
    }
  });

  it('gets busier the second time the riff comes round', () => {
    for (const mode of MODES) {
      const chart = chartOf(mode);
      const [first, again] = barsWhere((bar) => kindOf(bar) === 'riff').reduce<[number[], number[]]>(
        (split, bar) => {
          split[planOf(bar)?.round === 0 ? 0 : 1].push(bar);
          return split;
        },
        [[], []],
      );
      expect(perBar(chart, again)).toBeGreaterThan(perBar(chart, first));
    }
  });

  it('makes the solo the high point of the furious way: its peak the busiest stretch, the solo the highest', () => {
    const hard = chartOf('hard');
    const peak = barsWhere((bar) => planOf(bar)?.peak === true);
    expect(Math.max(...peak.map((bar) => perBar(hard, [bar])))).toBe(8);
    for (const kind of ['riff', 'lead', 'outro'] as const) expect(perBar(hard, peak)).toBeGreaterThan(perBar(hard, barsWhere((bar) => kindOf(bar) === kind)));
    expect(perBar(hard, peak)).toBeGreaterThan(perBar(hard, barsWhere((bar) => kindOf(bar) === 'solo' && planOf(bar)?.peak === false)));
    const height = (notes: readonly Note[]) => notes.reduce((sum, n) => sum + n.chord, 0) / Math.max(1, notes.length);
    const inSolo = hard.filter((n) => sectionAt(n.time)?.kind === 'solo');
    for (const kind of ['riff', 'lead'] as const) expect(height(inSolo)).toBeGreaterThan(height(hard.filter((n) => sectionAt(n.time)?.kind === kind)) + 0.5);
  });

  it('makes the solo the busiest stretch of the gentle way too, within its one note a beat', () => {
    const soft = chartOf('soft');
    const solo = perBar(soft, barsWhere((bar) => kindOf(bar) === 'solo'));
    for (const kind of ['riff', 'lead', 'outro'] as const) expect(solo).toBeGreaterThan(perBar(soft, barsWhere((bar) => kindOf(bar) === kind)));
  });
});

describe('the end: what is kept of the song', () => {
  const result = (mown: number, best = 10, mode: JamMode = 'soft'): JamResult => ({ mode, mown, best, perfect: 5, full: false });

  it('counts a song played both ways as the gentle one', () => {
    expect(recordMode(['hard'])).toBe('hard');
    expect(recordMode(['hard', 'soft'])).toBe('soft');
    expect(recordMode(['soft'])).toBe('soft');
    expect(recordMode([])).toBe('soft');
  });

  it('sets the record the first time without calling it beaten, then only moves it for more', () => {
    const first = recordAfter(null, result(120, 14));
    expect(first).toEqual({ record: { mown: 120, best: 14 }, beaten: false, previous: null });
    const worse = recordAfter(first.record, result(90, 30));
    expect(worse).toMatchObject({ record: { mown: 120, best: 30 }, beaten: false });
    expect(recordAfter(worse.record, result(120)).beaten).toBe(false);
    const better = recordAfter(worse.record, result(121, 3));
    expect(better).toEqual({ record: { mown: 121, best: 30 }, beaten: true, previous: { mown: 120, best: 30 } });
  });

  it('reads a stored record defensively', () => {
    expect(parseRecord({ mown: 12, best: 4 })).toEqual({ mown: 12, best: 4 });
    for (const garbage of [null, 'x', 12, [], { mown: -1, best: 2 }, { mown: 1.5, best: 2 }, { mown: 3 }]) expect(parseRecord(garbage)).toBeNull();
  });

  it('counts the endings it reached: the scene, and the last chord when the song was played out', () => {
    expect(endingsOf('desk', false)).toEqual(['finale.desk']);
    expect(endingsOf('desk', true)).toEqual(['finale.desk']);
    expect(endingsOf('rampage', false)).toEqual(['finale.rampage']);
    expect(endingsOf('dawn', true)).toEqual(['finale.dawn', 'finale.chord']);
  });
});

import { describe, expect, it } from 'vitest';
import { CHORDS, FINALE, chartOf, chordRate, finaleOf, settle, startJam, strum, type Jam, type Note } from '../src/core/finale';
import { newGame } from '../src/core/game';
import type { GameState } from '../src/core/types';

const lost = (day: number, patch: Partial<GameState> = {}): GameState => ({ ...newGame(1), day, phase: 'lost', ...patch });

describe('the end: which one', () => {
  it('is the desk for a house lost on the first four nights, the shed from the fifth', () => {
    expect([1, 2, 3, 4].map((night) => finaleOf(lost(night)))).toEqual(['desk', 'desk', 'desk', 'desk']);
    expect([5, 6, 7].map((night) => finaleOf(lost(night)))).toEqual(['rampage', 'rampage', 'rampage']);
  });

  it('is neither for a run that is not over, was won, or ended in the orchard', () => {
    expect(finaleOf(newGame(1))).toBeNull();
    expect(finaleOf({ ...newGame(1), day: 7, phase: 'won' })).toBeNull();
    expect(finaleOf(lost(2, { orchard: 'cut', fate: 'throat' }))).toBeNull();
  });
});

describe('the end: the chart', () => {
  const chart = chartOf();
  const quaver = 30 / FINALE.bpm;

  it('is the same song every time', () => {
    expect(chartOf()).toEqual(chart);
  });

  it('sits on the beat grid of the track, in order, with room at both ends', () => {
    expect(chart.length).toBeGreaterThan(120);
    chart.forEach((note, i) => {
      const slots = (note.time - FINALE.offset) / quaver;
      expect(Math.abs(slots - Math.round(slots))).toBeLessThan(1e-6);
      expect(note.chord).toBeGreaterThanOrEqual(0);
      expect(note.chord).toBeLessThan(CHORDS);
      if (i > 0) expect(note.time).toBeGreaterThan((chart[i - 1] as Note).time);
    });
    expect((chart[0] as Note).time).toBeGreaterThanOrEqual(FINALE.offset + FINALE.barsIn * quaver * 8 - 1e-9);
    expect((chart.at(-1) as Note).time).toBeLessThan(FINALE.seconds - FINALE.barsOut * quaver * 8);
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
    const near = strum(startJam(), chart, 1 + FINALE.good - 0.01, 0);
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

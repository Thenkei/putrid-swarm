import { describe, expect, it } from 'vitest';
import { ALL_ENDINGS, CHAPTERS, ENDINGS, endingId, mergeSeen, parseOrchardLegacy, parseSeen, tallyOf, withSeen, type EndingId } from '../src/core/endings';
import { isFate, type Ending } from '../src/core/orchard';

describe('the endings: one list for the whole game', () => {
  it('lists every chapter’s endings once, under the chapter’s name', () => {
    expect(new Set(ALL_ENDINGS).size).toBe(ALL_ENDINGS.length);
    expect(ALL_ENDINGS.length).toBe(CHAPTERS.reduce((sum, chapter) => sum + ENDINGS[chapter].length, 0));
    for (const id of ALL_ENDINGS) expect(CHAPTERS.some((chapter) => id.startsWith(`${chapter}.`))).toBe(true);
    expect(endingId('finale', 'dawn')).toBe('finale.dawn');
  });

  it('holds all five of the orchard’s, the three that end the run among them, and the four of the last scene', () => {
    const orchard: readonly Ending[] = ENDINGS.orchard;
    expect(orchard).toHaveLength(5);
    expect(orchard.filter(isFate)).toEqual(['throat', 'turned', 'bled']);
    expect(ENDINGS.finale).toEqual(['desk', 'rampage', 'dawn', 'chord']);
  });
});

describe('the endings: reading what a browser kept', () => {
  it('keeps what it knows, once each, in the order of the list, and drops the rest', () => {
    expect(parseSeen(['finale.dawn', 'orchard.spared', 'finale.dawn', 'nope', 3, null, 'orchard.'])).toEqual(['orchard.spared', 'finale.dawn']);
    for (const garbage of [null, undefined, 'finale.dawn', 42, { 0: 'finale.dawn' }]) expect(parseSeen(garbage)).toEqual([]);
  });

  it('carries over what the orchard counted on its own, by bare name', () => {
    expect(parseOrchardLegacy(['maimed', 'spared', 'rabbit', 7])).toEqual(['orchard.spared', 'orchard.maimed']);
    expect(parseOrchardLegacy('spared')).toEqual([]);
    expect(mergeSeen(parseOrchardLegacy(['throat']), ['finale.desk', 'orchard.throat'])).toEqual(['orchard.throat', 'finale.desk']);
  });

  it('says when an ending is seen for the first time, and only then', () => {
    const once = withSeen([], 'finale.rampage');
    expect(once).toEqual({ seen: ['finale.rampage'], first: true });
    expect(withSeen(once.seen, 'finale.rampage')).toEqual({ seen: ['finale.rampage'], first: false });
    expect(withSeen(once.seen, 'orchard.bled').seen).toEqual(['orchard.bled', 'finale.rampage']);
  });

  it('counts per chapter and for the whole game', () => {
    const seen: EndingId[] = ['orchard.spared', 'orchard.maimed', 'finale.chord'];
    expect(tallyOf(seen)).toEqual({ seen: 3, total: ALL_ENDINGS.length });
    expect(tallyOf(seen, 'orchard')).toEqual({ seen: 2, total: 5 });
    expect(tallyOf(seen, 'finale')).toEqual({ seen: 1, total: 4 });
    expect(tallyOf([])).toEqual({ seen: 0, total: ALL_ENDINGS.length });
  });
});

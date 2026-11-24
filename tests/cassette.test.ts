import { expect, it, vi } from 'vitest';
import { CassetteRecorder } from '../src/render/cassette';
import { newGame, startNextDay } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save';

it('keeps the clip through a morning reload and releases it when daylight starts', () => {
  const morningTape = { image: 'data:image/jpeg;base64,YWJj', times: [12.25, 12.38, 12.5] };
  const state = { ...newGame(42), phase: 'morning' as const, morningTape };
  const morning = deserialize(serialize(state))!;
  expect(morning.morningTape).toEqual(morningTape);
  expect(startNextDay(morning)).not.toHaveProperty('morningTape');
});

it('opens the morning without a tape when its stored recording is unreadable', () => {
  const morning = { ...newGame(42), phase: 'morning' as const };
  for (const tape of [
    { image: 'https://example.org/tape.jpg', times: [2, 3] },
    { image: 'data:image/jpeg;base64,YWJj', times: [12, 11] },
    { image: 'data:image/jpeg;base64,YWJj', times: [0, 60] },
    { image: 'data:image/jpeg;base64,YWJj', times: [] },
  ]) {
    expect(deserialize(JSON.stringify({ ...morning, morningTape: tape }))).toEqual(morning);
  }
});

it('keeps the lead-in, the real shots and the first frame back after an earlier breached door', () => {
  const copy = vi.fn();
  const context = () => ({ drawImage() {}, clearRect() {}, canvas: { toDataURL: () => 'data:image/jpeg;base64,YWJj' } });
  vi.stubGlobal('document', { createElement: () => ({ getContext: context }) });
  try {
    const tape = new CassetteRecorder();
    const breach = { kind: 'breach', sector: 'verger' } as const;
    const defense = { kind: 'defense', sector: 'arriere', feed: 'grange', started: 21 } as const;
    for (let i = 0; i < 21 * 8; i++) tape.record(i / 8, breach, breach.sector, false, copy);
    expect(tape.finish()?.times.at(-1)).toBe(.75);
    copy.mockClear();
    for (let i = 0; i <= 39; i++) {
      const t = 21 + i / 8;
      if (i === 20 || i === 27) tape.shot(t);
      tape.record(t, defense, defense.sector, true, copy);
    }
    tape.record(25.95, defense, defense.sector, false, copy);
    const keep = tape.finish()!;
    expect(copy.mock.calls.every(([id]) => id === 'grange')).toBe(true);
    expect(keep.times[0]).toBe(20);
    expect(keep.times.at(-1)).toBe(25.95);
    expect(keep.shots).toEqual([23.5, 24.375]);
    expect(keep.defense).toEqual(defense);
    tape.shot(38);
    tape.record(40, defense, defense.sector, false, copy);
    expect(tape.finish()).toEqual(keep);
    expect(deserialize(serialize({ ...newGame(1), phase: 'morning', morningTape: keep }))?.morningTape).toEqual(keep);
  } finally { vi.unstubAllGlobals(); }
});

it('rejects damaged shot timing and camera metadata while retaining the morning', () => {
  const base = { image: 'data:image/jpeg;base64,YWJj', times: [12, 17] };
  for (const extra of [{ shots: [11] }, { shots: [13, 13] }, { shots: [18] }, { defense: { kind: 'defense', sector: 'mars', feed: 'portail', started: 13 } }]) {
    expect(deserialize(JSON.stringify({ ...newGame(1), phase: 'morning', morningTape: { ...base, ...extra } }))?.morningTape).toBeUndefined();
  }
});

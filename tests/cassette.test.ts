import { expect, it } from 'vitest';
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

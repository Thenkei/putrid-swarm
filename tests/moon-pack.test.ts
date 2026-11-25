import { describe, expect, it } from 'vitest';
import { CUB_CROSSING, gatePassage, PACK_CYCLE } from '../src/core/moon-pack';
import { markEpic, packTrail } from '../src/core/epics';
import { newGame, startNextDay } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { serialize, deserialize } from '../src/core/save';
import type { GameState } from '../src/core/types';

describe('moonlit gate', () => {
  it('allows the cub through only after it crosses completely', () => {
    expect(gatePassage(3.1, 3.1)).toBe('crossing');
    expect(gatePassage(3.1, 4.0)).toBe('crossing');
    expect(gatePassage(3.1, 4.4)).toBe('through');
  });
  it('leaves a second opening for a player who waits or lowers early', () => {
    expect(gatePassage(11.1, 12.4)).toBe('through');
  });
  it('registers early, late and held-open impacts, including across a cycle', () => {
    expect(gatePassage(2.8, 4.5)).toBe('impact');
    expect(gatePassage(6.3, 7.0)).toBe('impact');
    expect(gatePassage(3.1, 11.4)).toBe('impact');
    expect(gatePassage(7.5, 7.5)).toBe('impact');
  });
  it('preserves a completed crossing when the next update also includes the impact', () => {
    for (const cycle of [0, 1, 4]) {
      const start = cycle * PACK_CYCLE;
      expect(gatePassage(start + 5.79, start + 7.01)).toBe('impact');
      expect(gatePassage(start + 5.79, start + 5.79 + CUB_CROSSING)).toBe('through');
      for (const offset of [2.99, 5.80, 5.81, 7.15]) {
        const opened = start + offset;
        expect(gatePassage(opened, opened + CUB_CROSSING)).toBe('impact');
      }
    }
  });
});

describe('the tracks at the refuge', () => {
  const game = newGame(54);
  const report = { ...new NightSim(5, game.yard, game.seed).report(), survived: true };
  const dawn: GameState = { ...game, phase: 'morning', day: 5, lastNight: report };
  it.each([
    ['cub', 1, 'together'], ['packExit', 1, 'digging'], ['packExit', 2, 'ditch'],
  ] as const)('keeps %s=%i on the morning and in a reloaded day-six yard', (flag, value, trail) => {
    const result = markEpic(dawn, flag, value);
    expect(packTrail(result)).toBe(trail);
    const day = startNextDay(result);
    expect(packTrail(deserialize(serialize(day))!)).toBe(trail);
    expect(packTrail({ ...day, phase: 'night' })).toBeUndefined();
    expect(packTrail({ ...day, day: 7 })).toBeUndefined();
  });
  it('keeps only the evidence a legacy save can establish', () => {
    expect(packTrail(dawn)).toBe('fence');
    expect(packTrail(markEpic(dawn, 'cub'))).toBe('together');
    expect(packTrail({ ...dawn, lastNight: null })).toBeUndefined();
    expect(packTrail({ ...dawn, phase: 'night' })).toBeUndefined();
  });
  it('rewinds a mid-night checkpoint without keeping abandoned tracks', () => {
    const saved = markEpic({ ...game, day: 5, phase: 'night' }, 'packExit', 1);
    expect(deserialize(serialize(saved))!.flags['epic.packExit']).toBeUndefined();
  });
});

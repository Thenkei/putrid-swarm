import { describe, expect, it } from 'vitest';
import { gatePassage } from '../src/core/moon-pack';

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
});

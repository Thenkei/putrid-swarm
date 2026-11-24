import { describe, expect, it } from 'vitest';
import { firstSwallows, flowerPose, gateHare, sunlight, SUNRISE_SECONDS } from '../src/render/sunrise';

describe('the return of daylight', () => {
  it('reaches full light before the handoff, including a night cleared ahead of the clock', () => {
    expect(sunlight(undefined)).toBe(0);
    expect(sunlight(0)).toBe(0);
    expect(sunlight(1)).toBeLessThan(sunlight(3));
    expect(sunlight(SUNRISE_SECONDS - .1)).toBe(1);
  });

  it('sends two swallows through in succession, then clears the sky', () => {
    const flight = (t: number) => [...firstSwallows(t, false)];
    expect(flight(0)).toHaveLength(0);
    expect(flight(.75)).toHaveLength(1);
    expect(flight(2)).toHaveLength(2);
    expect(flight(2.3)[0]!.x).toBeGreaterThan(flight(2)[0]!.x);
    expect(new Set(Array.from({ length: 80 }, (_, i) => flight(i / 20)[0]?.pose).filter(p => p !== undefined)).size).toBe(4);
    expect(flight(SUNRISE_SECONDS)).toHaveLength(0);
    expect([...firstSwallows(2, true)]).toHaveLength(0);
  });

  it('gives the hare a pause on both feet before it bounds into cover', () => {
    expect(gateHare(0, false)).toBeNull();
    const listener = gateHare(3, false);
    expect(listener).toMatchObject({ pose: 1, lift: 0, cover: 1 });
    expect(gateHare(3.6, false)).toEqual(listener);
    const bound = gateHare(4.85, false)!;
    expect(bound.lift).toBeGreaterThan(6);
    expect(bound.x).toBeGreaterThan(listener!.x);
    expect(gateHare(8, false)).toBeNull();
    expect(gateHare(1, true)).toEqual(gateHare(8, true));
  });

  it('keeps the flowers open through the morning after all four stages of bloom', () => {
    expect([...new Set(Array.from({ length: 50 }, (_, i) => flowerPose(i / 10, false)))]).toEqual([0, 1, 2, 3]);
    expect(flowerPose(50, false)).toBe(3);
    expect(flowerPose(0, true)).toBe(3);
  });
});

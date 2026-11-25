import { describe, expect, it } from 'vitest';
import { firstSwallows, flowerPose, gateHare, projectSwallow, sunlight, SUNRISE_SECONDS } from '../src/render/sunrise';
import { project } from '../src/render/projection';
import { SHADOW_REACH } from '../src/render/shadows';

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

  it.each([0, 1] as const)('casts the swooping birds along the painted light in view %s', rot => {
    for (const zoom of [.75, 1.5]) {
      const view = { rot, zoom, cx: 10, cy: 15, x: 40, y: 80, w: 400, h: 300 };
      for (const t of [.7, 1.6, 2.4, 3.1]) for (const bird of firstSwallows(t, false)) {
        const floor = project(view, bird.x, bird.y), { breast, shadow } = projectSwallow(view, bird);
        expect(floor.y - breast.y).toBeCloseTo(bird.height * zoom);
        expect(shadow.x - floor.x).toBeCloseTo(SHADOW_REACH.x * bird.height * zoom);
        expect(shadow.y - floor.y).toBeCloseTo(SHADOW_REACH.y * bird.height * zoom);
      }
    }
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

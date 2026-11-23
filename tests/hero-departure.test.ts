import { describe, expect, it, vi } from 'vitest';
import { DOOR_OUTWARD, THRESHOLDS } from '../src/house-layout';
import { heroApproachShot, sampleApproach } from '../src/render/hero-approach';

// The route uses the registered feet, timing and scene geometry without drawing the atlas.
vi.mock('../src/engine/assets', () => ({ sprite: () => ({}) }));

describe('the walk from the house to the wagon', () => {
  it.each([false, true])('clears the sill before either door closes (one arm = %s)', oneArmed => {
    for (const [visit, sector] of [[0, 'portail'], [2, 'grange']] as const) {
      const shot = heroApproachShot(visit, oneArmed, 1)!;
      expect(shot.start).toBe(sector);
      const sill = THRESHOLDS[sector];
      const [nx, ny] = DOOR_OUTWARD[sector];
      const beyondSill = (at: number) => {
        const { position } = sampleApproach(shot, at);
        return (position.x - sill.gx) * nx + (position.y - sill.gy) * ny;
      };
      expect(sampleApproach(shot, 0)).toMatchObject({ opening: 0, emergence: 0 });
      expect(beyondSill(.4)).toBeLessThan(0);
      expect(sampleApproach(shot, .65).opening).toBe(1);
      expect(beyondSill(shot.intro)).toBeGreaterThan(1);
      expect(sampleApproach(shot, shot.intro).position).toEqual(shot.walk[0]!.from);
      expect(sampleApproach(shot, shot.intro - 0.0001).position.x).toBeCloseTo(shot.walk[0]!.from.x);
      expect(sampleApproach(shot, shot.intro - 0.0001).position.y).toBeCloseTo(shot.walk[0]!.from.y);
      expect(sampleApproach(shot, shot.intro + .6).opening).toBe(0);
      const atCar = sampleApproach(shot, shot.duration);
      expect(atCar.position.x).toBeCloseTo(shot.walk.at(-1)!.to.x);
      expect(atCar.position.y).toBeCloseTo(shot.walk.at(-1)!.to.y);
      expect(sampleApproach(shot, shot.duration - .12)).toEqual(atCar);
    }
  });

  it('uses the upstairs escape only while its facade can support the climb', () => {
    expect(heroApproachShot(1, false, 1)!.start).toBe('window');
    expect(heroApproachShot(1, false, .5)!.start).toBe('portail');
    expect(heroApproachShot(1, true, .1)!.start).toBe('grange');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { DOOR_OUTWARD, THRESHOLDS } from '../src/house-layout';
import { heroApproachShot, sampleApproach } from '../src/render/hero-approach';
import { CAT_BONNET_AT, CAT_LANDS_AT, CAT_SETTLES_AT, catWakeTime, sampleYardCat } from '../src/render/yard-cat';
import { groundTerrainAt } from '../src/render/terrainfield';
import { carManeuver } from '../src/render/car-departure';

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

  it.each([0, 1, 2])('wakes the cat on an approaching boot and registers every outdoor step to its surface (exit %s)', visit => {
    for (const oneArm of [false, true]) {
      const shot = heroApproachShot(visit, oneArm, 1)!;
      const steps = shot.cues.filter(cue => cue.position);
      expect(steps.some(cue => cue.at === catWakeTime(shot))).toBe(true);
      for (const cue of steps) {
        const boots = sampleApproach(shot, cue.at).position;
        expect(cue.position).toEqual(boots);
        const terrain = groundTerrainAt(boots.x, boots.y);
        expect(cue.sound).toBe(terrain === 'gravel' ? 'step_gravel' : terrain === 'path' ? 'step_shed' : 'step_grass');
      }
      expect(steps.some(cue => cue.sound === 'step_gravel')).toBe(true);
      expect(catWakeTime(shot) + CAT_LANDS_AT).toBeLessThan(shot.duration + 1.25);
    }
  });

  it('lands continuously on the bonnet and on the ground, then sits clear of the moving wagon', () => {
    for (const t of [CAT_BONNET_AT, CAT_LANDS_AT, CAT_SETTLES_AT]) {
      const before = sampleYardCat(t - .00001), landed = sampleYardCat(t);
      for (const axis of ['x','y','lift'] as const) expect(before[axis]).toBeCloseTo(landed[axis], 2);
      expect(landed.shadow.lift).toBe(landed.lift);
    }
    const cat = sampleYardCat(CAT_SETTLES_AT);
    expect(cat.cel).toBe(7);
    for (let t = 0; t < 6; t += .1) {
      const { position } = carManeuver(t);
      expect(Math.hypot(position.x - cat.x, position.y - cat.y)).toBeGreaterThan(3);
    }
  });
});

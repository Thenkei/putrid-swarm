import { describe, expect, it } from 'vitest';
import { COAST_RUT, CoastDrive } from '../src/core/coast-home';

describe('feathering the brake on the drive', () => {
  it.each([30, 60, 120])('gives the driver time to lift off before a dead stop at %i Hz', hz => {
    const d = new CoastDrive();
    d.ignition();
    d.lane = .85;
    for (let frame = 0; frame < hz * 2 && !d.losingMomentum; frame++) d.update(1 / hz, 0, true);
    expect(d.losingMomentum).toBe(true);
    for (let frame = 0; frame < hz * .6; frame++) d.update(1 / hz, 0, true);
    for (let frame = 0; frame < hz * 2; frame++) d.update(1 / hz, 0, false);
    expect(d.phase).toBe('rolling');
    expect(d.losingMomentum).toBe(false);
    expect(d.heard).toBe(false);
  });

  it('lets an already suspicious walker hear the jars, or miss a careful crossing', () => {
    function cross(speed: number, lane: number) {
      const d = new CoastDrive();
      d.ignition();
      d.metres = COAST_RUT - .001;
      d.noise = .43;
      d.speed = speed;
      d.lane = lane;
      d.update(1 / 60, 0, false);
      return d;
    }
    const hit = cross(.96, .90);
    expect(hit.rootCrossing).toBe('hit');
    expect(hit.heard).toBe(true);
    expect(hit.listening).toBe(false);
    expect(hit.jarRattle).toBeGreaterThan(.8);
    hit.phase = 'stopped';
    hit.update(.6, 0, false);
    expect(hit.jarRattle).toBeLessThan(.05);
    const careful = cross(.71, .90);
    expect(careful.rootCrossing).toBe('quiet');
    expect(careful.heard).toBe(false);
    expect(careful.jarRattle).toBe(0);
    expect(cross(.96, 0).rootCrossing).toBeNull();
  });

  it('holds the listening pose until enough quiet ground has passed', () => {
    const d = new CoastDrive();
    d.ignition();
    d.metres = 2;
    d.noise = .519;
    d.update(1 / 60, 0, false);
    expect(d.listening).toBe(true);
    const planted = d.walkerTravel;
    d.lane = .95;
    d.update(1 / 60, 0, false);
    expect(d.noise).toBeLessThan(.52);
    expect(d.listening).toBe(true);
    expect(d.walkerTravel).toBe(planted);
    for (let frame = 0; frame < 60; frame++) d.update(1 / 60, 0, false);
    expect(d.listening).toBe(false);
    expect(d.walkerTravel).toBeGreaterThan(planted);
    expect(d.heard).toBe(false);
  });
});

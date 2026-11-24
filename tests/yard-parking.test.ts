import { describe, expect, it } from 'vitest';
import { PARKED } from '../src/core/car-path';
import { terrainAt } from '../src/core/map';
import { YardParking } from '../src/core/yard-parking';

describe('steering into the refuge', () => {
  it.each([15, 30, 60, 120])('arrives on the marked gravel at %i Hz with an early or late turn', hz => {
    for (const turnX of [22, 18, 16, 15.6]) {
      const car = new YardParking();
      for (let frame = 0; frame < 12 * hz && car.phase !== 'parked'; frame++) {
        car.update(1 / hz, 1, car.x < turnX ? 1 : 0);
        expect(terrainAt(Math.floor(car.x), Math.floor(car.y))).toBe('gravel');
      }
      expect([car.phase, car.x, car.y, car.heading]).toEqual(['parked', PARKED.x, PARKED.y, Math.PI / 2]);
      car.update(.1, -1, -1);
      expect([car.x, car.y]).toEqual([PARKED.x, PARKED.y]);
    }
  });

  it('waits for throttle, lets the driver stop, reverse and recover after overshooting the turn', () => {
    const car = new YardParking();
    const tick = (seconds: number, throttle: number, steer: number) => {
      for (let frame = 0; frame < seconds * 60; frame++) car.update(1 / 60, throttle, steer);
    };
    const start = car.x;
    tick(5, 0, 1);
    expect(car.x).toBe(start);
    tick(5, 1, 0);
    expect(car.phase).toBe('driving');
    tick(.4, 0, 0);
    expect(car.speed).toBe(0);
    const endOfLane = car.x;
    tick(.7, -1, 0);
    expect(car.x).toBeGreaterThan(endOfLane);
    tick(7, 1, 1);
    expect(car.phase).toBe('parked');
  });
});

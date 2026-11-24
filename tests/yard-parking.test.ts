import { describe, expect, it } from 'vitest';
import { PARKED } from '../src/core/car-path';
import { YardParking } from '../src/core/yard-parking';

function tick(car: YardParking, seconds: number, throttle: number, steering = 0, brake = false, hz = 60) {
  for (let i = 0; i < Math.ceil(seconds * hz); i++) car.update(1 / hz, throttle, steering, brake);
}

describe('steering into the refuge', () => {
  it.each([.64, 1])('calls for braking at throttle %s in time to stop in the marks', throttle => {
    for (const hz of [15, 60, 120]) {
      for (const response of [0, .16, .30]) {
        for (const steeringWhileBraking of [0, 1]) {
          const car = new YardParking();
          for (let frame = 0; frame < 9 * hz && !car.brakeForBay; frame++) {
            car.update(1 / hz, throttle, car.atTurn ? 1 : 0);
          }
          expect(car.brakeForBay).toBe(true);
          expect(car.inBay).toBe(false);
          expect(car.speed).toBeGreaterThan(throttle * 2.7);
          tick(car, response, throttle, 1, false, hz);
          tick(car, 1.4, 0, steeringWhileBraking, true, hz);
          expect(car.phase).toBe('parked');
          expect(car.inBay).toBe(true);
        }
      }
    }
  });

  it.each([15, 30, 60, 120])('brakes in the bay at %i Hz and keeps the actual tyre position', hz => {
    const car = new YardParking();
    for (let frame = 0; frame < hz * 10 && !car.inBay; frame++) {
      car.update(1 / hz, 1, car.atTurn && car.heading < 1.23 ? 1 : 0);
    }
    expect(car.inBay).toBe(true);
    expect(car.phase).toBe('driving');
    tick(car, 1.5, 0, 0, true, hz);
    expect(car.phase).toBe('parked');
    expect(Math.hypot(car.x - PARKED.x, car.y - PARKED.y)).toBeLessThan(.9);
    const stopped = [car.x, car.y, car.heading];
    tick(car, 1, -1, 1, false, hz);
    expect([car.x, car.y, car.heading]).toEqual(stopped);
  });

  it('keeps roll and wheel lock through the cut, and lets a player countersteer in reverse', () => {
    const car = new YardParking({ speed: 2.6, heading: -.16, offset: .10, wheel: -.35, powered: false });
    expect(car.speed).toBeCloseTo(2.6 / 1.55);
    expect(car.heading).toBeCloseTo(.16);
    expect(car.y).toBeCloseTo(12 - .10 / 1.55);
    expect(car.wheel).toBeCloseTo(.35);
    const startX = car.x;
    tick(car, .3, 0);
    expect(car.x).toBeLessThan(startX - .3);
    expect(car.speed).toBeGreaterThan(0);
    tick(car, 1.1, 0, 0, true);
    const brakedAt = car.x, heading = car.heading;
    tick(car, .8, -1, 1);
    expect(car.x).toBeGreaterThan(brakedAt);
    expect(car.heading).toBeLessThan(heading);
  });

  it('keeps solid scenery out of the wheelbase and can back off the wall', () => {
    const car = new YardParking();
    tick(car, 9, 1);
    expect(car.x).toBeGreaterThan(14);
    expect(car.x).toBeLessThan(15);
    expect(car.speed).toBe(0);
    expect(car.bayBehind).toBe(true);
    const stopped = car.x;
    tick(car, 1.3, -1);
    expect(car.x).toBeGreaterThan(stopped + .8);
    expect(car.phase).toBe('driving');
  });

  it.each([-1, 1])('recovers from the woodland entrance at steering extreme %i', side => {
    const car = new YardParking({ speed: 2.2, heading: side * .55, offset: side * 1.3, wheel: side, powered: false });
    const x = car.x;
    tick(car, .6, 1, side);
    expect(car.x).toBeLessThan(x - .3);
    tick(car, .7, 0, 0, true);
    const stopped = car.x;
    tick(car, .8, -1);
    expect(car.x).toBeGreaterThan(stopped);
  });
});

import { describe, expect, it } from 'vitest';
import { COAST_METRES, COAST_RUT, CoastDrive } from '../src/core/coast-home';

describe('steering the loaded wagon', () => {
  it('winds on steering before the car turns and holds its course when the wheel centres', () => {
    const car = new CoastDrive();
    car.ignition();
    car.update(1 / 60, 1, false);
    expect(car.wheel).toBeGreaterThan(0);
    expect(car.wheel).toBeLessThan(.1);
    expect(car.worldX).toBeLessThan(.001);
    for (let i = 0; i < 25; i++) car.update(1 / 60, 1, false);
    const beforeRelease = car.heading;
    for (let i = 0; i < 22; i++) car.update(1 / 60, 0, false);
    expect(car.wheel).toBe(0);
    expect(car.heading).toBeGreaterThan(beforeRelease);
    const course = car.heading;
    const x = car.worldX;
    for (let i = 0; i < 20; i++) car.update(1 / 60, 0, false);
    expect(car.heading).toBe(course);
    expect(car.worldX).toBeGreaterThan(x);
  });

  it.each([30, 60, 120])('carries a hand-steered, quiet run through the cut at %i Hz', hz => {
    const car = new CoastDrive();
    car.ignition();
    let contact = 0;
    for (let i = 0; i < hz * 20 && car.phase !== 'arrived'; i++) {
      const z = car.metres;
      const right = z < 1.25 || (z >= 5.99 && z < 8.40);
      const left = (z >= 1.48 && z < 4.53) || (z >= 10.75 && z < 12.04);
      car.update(1 / hz, Number(right) - Number(left), z >= 6.91 && z < 7.46);
      contact = Math.max(contact, car.edgeContact);
    }
    expect(car.metres).toBe(COAST_METRES);
    expect(car.rootCrossing).toBe('quiet');
    expect(car.heard).toBe(false);
    expect(contact).toBe(0);
    expect(car.arrival.powered).toBe(false);
    expect(car.arrival.speed).toBeGreaterThan(1);
    expect(Math.abs(car.arrival.offset)).toBeLessThan(.7);
  });

  it('builds speed downhill in freewheel and loses it when the brake loads up', () => {
    const car = new CoastDrive();
    car.ignition();
    for (let frame = 0; frame < 60; frame++) car.update(1 / 60, 0, false, true);
    const fast = car.speed;
    expect(fast).toBeGreaterThan(2.2);
    expect(car.acceleration).toBeGreaterThan(0);
    for (let frame = 0; frame < 20; frame++) car.update(1 / 60, 0, true, true);
    expect(car.brakePressure).toBeGreaterThan(.9);
    expect(car.speed).toBeLessThan(fast - .40);
  });
});

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
    d.speed = 1.36;
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

import { describe, expect, it } from 'vitest';
import { COAST_METRES, CoastDrive, coastForNight, finishCoastHome, finishCoastParking, shouldCoastHome } from '../src/core/coast-home';
import { arriveHome, leaveLocation, newGame, travelTo } from '../src/core/game';
import { alleyPosition, coastCamera, coastGatePosts, GATE_AT, roadPoint } from '../src/render/coast-road';
import { PARKED } from '../src/core/car-path';
import { GRID_W, HOUSE_CENTER, roadCentre } from '../src/core/map';
import { NightSim } from '../src/core/night';
import { deserialize, serialize } from '../src/core/save';
import type { Result } from '../src/core/types';

function ok<T>(r: Result<T, unknown>): T {
  if (!r.ok) throw Error('trip setup failed');
  return r.value;
}

function road() {
  const garage = ok(travelTo({ ...newGame(12), day: 2 }, 'garage')).state;
  return ok(leaveLocation({ ...garage, hoursLeft: 2.5 })).state;
}

describe('the last fifteen metres', () => {
  it('waits for the first late return after day one and for pending encounters', () => {
    const s = road();
    expect(shouldCoastHome(s)).toBe(true);
    expect(shouldCoastHome({ ...s, day: 1 })).toBe(false);
    expect(shouldCoastHome({ ...s, hoursLeft: 2.01 })).toBe(false);
    expect(shouldCoastHome({ ...s, where: 'garage' })).toBe(false);
    expect(shouldCoastHome({ ...s, outing: { ...s.outing!, crossbowStop: true } })).toBe(false);
    expect(shouldCoastHome(deserialize(serialize(s))!)).toBe(true);
  });

  it.each([[0, true], [1, false]] as const)('drives the whole approach with steering %i', (steer, heard) => {
    for (const hz of [30, 60, 120]) {
      const d = new CoastDrive();
      d.ignition();
      let frames = 0;
      while (frames++ < 22 * hz && d.phase !== 'arrived') d.update(1 / hz, steer, false);
      expect(d.phase).toBe('arrived');
      expect(d.heard).toBe(heard);
      expect(frames / hz).toBeGreaterThan(10);
    }
  });

  it('can creep over the gravel, or stop completely and wake both figures with the starter', () => {
    const slow = new CoastDrive();
    slow.ignition();
    for (let i = 0; i < 1800; i++) slow.update(1 / 60, 0, slow.speed > .73);
    expect(slow.phase).toBe('arrived');
    expect(slow.heard).toBe(false);
    const d = new CoastDrive();
    d.ignition();
    for (let i = 0; i < 180; i++) d.update(1 / 60, 1, true);
    expect(d.phase).toBe('stopped');
    expect(d.heard).toBe(false);
    d.ignition();
    for (let i = 0; i < 1200; i++) d.update(1 / 60, 0, true);
    expect(d.phase).toBe('arrived');
    expect(d.heard).toBe(true);
  });

  it('moves the gateposts past opposite windows while distant sightlines stay steady', () => {
    const d = new CoastDrive();
    const outset = coastCamera(d, false);
    const [left, right] = coastGatePosts;
    const gate = roadPoint(outset, right!.x, GATE_AT);
    const house = roadPoint(outset, 12, 110);
    d.metres = GATE_AT - 1;
    d.lane = .3;
    const approach = coastCamera(d, false);
    expect(roadPoint(approach, right!.x, GATE_AT).x).toBeGreaterThan(640);
    expect(roadPoint(approach, left!.x, GATE_AT).x).toBeLessThan(0);
    expect(gate.x).toBeLessThan(640);
    expect(roadPoint(outset, left!.x, GATE_AT).x).toBeGreaterThan(0);
    expect(Math.abs(roadPoint(approach, 12, 110).scale / house.scale - 1)).toBeLessThan(.04);
    d.jolt = .5;
    expect(coastCamera(d, true).horizon).toBe(outset.horizon);
  });

  it('follows the barn drive through the tree line to the mouth of the existing parking bay', () => {
    const entrance = alleyPosition(GRID_W, roadCentre('barn', GRID_W));
    const aisle = alleyPosition(PARKED.x, roadCentre('barn', PARKED.x));
    const bay = alleyPosition(PARKED.x, PARKED.y);
    const house = alleyPosition(HOUSE_CENTER.x, HOUSE_CENTER.y);
    expect(entrance).toEqual({ x: 0, z: COAST_METRES });
    expect(GATE_AT).toBeLessThan(entrance.z);
    expect(aisle.x).toBe(0);
    expect(aisle.z).toBeGreaterThan(entrance.z);
    expect(bay.x).toBeLessThan(aisle.x);
    expect(house.x).toBeGreaterThan(aisle.x);
    expect(house.z).toBeGreaterThan(bay.z);
  });

  it('rattles the jars once on the exposed root and lets the driver ease across it', () => {
    for (const speed of [.70, .99]) {
      const d = new CoastDrive();
      d.ignition();
      d.lane = .8; d.speed = speed; d.metres = 7.39;
      d.update(1 / 30, 0, false);
      expect(d.bumped).toBe(speed > .8);
      expect(d.jolt).toBe(speed > .8 ? 1 : 0);
      const first = d.jolt;
      d.update(1 / 30, 0, false);
      expect(d.jolt).toBeLessThanOrEqual(first);
    }
  });

  it('keeps the load for normal arrival and remembers the pair only on their own night', () => {
    const s = road();
    const loaded = { ...s, outing: { ...s.outing!, trunk: { ...s.outing!.trunk, wire: 2 } } };
    const parking = deserialize(serialize(finishCoastHome(loaded, 'followed')))!;
    expect(parking.outing?.coastParking).toBe(true);
    expect(parking.outing?.coastParked).toBeUndefined();
    expect(arriveHome(parking).ok).toBe(false);
    expect(shouldCoastHome(parking)).toBe(false);
    const done = deserialize(serialize(finishCoastParking(parking)))!;
    expect(done.outing?.coastParking).toBeUndefined();
    expect(finishCoastParking(done)).toBe(done);
    expect(coastForNight(done)).toBe('followed');
    expect(done.outing?.coastParked).toBe(true);
    expect(finishCoastHome(done, 'quiet')).toBe(done);
    const home = ok(arriveHome(done)).state;
    expect(home.inventory.wire).toBe(s.inventory.wire + 2);
    expect(arriveHome(home).ok).toBe(false);
    expect(coastForNight({ ...home, day: 3 })).toBeNull();
    expect(shouldCoastHome({ ...done, day: 3 })).toBe(false);
  });

  it.each([2, 3, 4, 5, 6, 7])('reuses two existing first-wave shamblers on night %i', day => {
    const yard = newGame(3).yard;
    const build = (outcome: 'quiet' | 'followed' | null) => new NightSim(day, yard, 3, null, null, null, null, null, outcome);
    const baseline = build(null), quiet = build('quiet'), followed = build('followed');
    const total = baseline.remainingSpawns();
    for (const sim of [quiet, followed]) expect(sim.remainingSpawns()).toBe(total);
    for (let i = 0; i < 375; i++) {
      quiet.step(1 / 60); followed.step(1 / 60);
    }
    expect(followed.enemies.filter(e => e.target === 'portail' && e.type === 'shambler').length).toBeGreaterThanOrEqual(2);
    expect(followed.enemies.filter(e => e.type === 'shambler').length - quiet.enemies.filter(e => e.type === 'shambler').length).toBe(2);
    for (const sim of [quiet, followed]) expect(sim.remainingSpawns() + sim.enemies.length).toBe(total);
  });
});

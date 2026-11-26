import { describe, expect, it } from 'vitest';
import { departurePlan, drivewayImpacts, driveThroughYard, onDriveway } from '../src/core/driveway';
import { carManeuver, departureTiming, type DepartureRoute } from '../src/core/car-path';
import { chooseCrossing } from '../src/core/crossing';
import { arriveHome, newGame, travelTo } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save';
import type { DeviceTypeId, GameState, Result } from '../src/core/types';
import { build, repairDevice } from '../src/core/yard';

function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw Error(JSON.stringify(result.error));
  return result.value;
}

function place(state: GameState, type: DeviceTypeId, x: number, y: number) {
  return unwrap(build(state, type, x, y));
}

describe('the wagon crossing the prepared yard', () => {
  const base = newGame(94);
  const open = { ...base, day: 2, inventory: { wood: 50, scrap: 50, wire: 50, springs: 50, battery: 50 } };
  const stocked = place(open, 'spikes', 17, 15); // No clear nose-first exit in the collision fixtures.
  const log = place(stocked, 'log', 15, 11); // swept while backing out
  const withHorn = place(log, 'horn', 18, 12);
  const withStakes = place(withHorn, 'spikes', 19, 11);
  const home = place(withStakes, 'log', 18, 10); // just off the road

  it.each(['barrier','fence','log','net','horn','spikes','floodlight'] as const)('spots a rear %s and takes the clear front exit', type => {
    const yard = place(open, type, 15, 11).yard;
    const warning = type === 'barrier' || type === 'fence' ? 'vo_car_watch_barriers' : 'vo_car_watch_traps';
    expect(departurePlan(yard)).toEqual({ route: 'forward', warning });
    expect(drivewayImpacts(yard)).toEqual([]);
    expect(unwrap(travelTo({ ...open, yard }, 'garage')).state.yard).toEqual(yard);
    expect(departurePlan(place(stocked, type, 15, 11).yard)).toEqual({ route: 'carefulReverse', warning });
  });

  it('alternates in a clear yard and ignores wrecked gear and equipment on the shoulder', () => {
    const built = place(open, 'barrier', 15, 11).yard;
    const wreck = { ...built, devices: built.devices.map(d => d.type === 'barrier' ? { ...d, hp: 0, broken: true } : d) };
    for (const yard of [open.yard, wreck, place(open, 'net', 18, 10).yard]) {
      expect(departurePlan(yard, 0)).toEqual({ route: 'reverse', warning: null });
      expect(departurePlan(yard, 1)).toEqual({ route: 'forward', warning: null });
    }
  });

  it.each(['reverse','carefulReverse','forward'] as const)('rolls with signed ground travel on the %s route', (route: DepartureRoute) => {
    const timing = departureTiming(route);
    let previous = carManeuver(0, route);
    for (let tick = 1; tick <= Math.ceil(timing.duration * 120); tick++) {
      const t = tick / 120;
      const sample = carManeuver(t, route);
      const delta = sample.distance - previous.distance;
      const travel = Math.hypot(sample.position.x - previous.position.x, sample.position.y - previous.position.y);
      expect(Math.abs(delta)).toBeCloseTo(travel, 4);
      if (t < timing.reverseEnd) expect(delta).toBeLessThanOrEqual(0);
      else if (t > timing.reverseEnd + 1/120 && t < timing.forwardAt) expect(delta).toBe(0);
      else if (t > timing.forwardAt) expect(delta).toBeGreaterThanOrEqual(0);
      previous = sample;
    }
  });

  it.each(['floodlight', 'net', 'barrier', 'fence', 'log'] as const)('breaks a %s under the wheels and leaves one on the shoulder intact', type => {
    const prepared = place(place(stocked, type, 15, 11), type, 18, 10);
    const [inPath, onShoulder] = prepared.yard.devices.slice(-2);
    const crushed = { ...inPath, hp: 0, broken: true };
    const hits = drivewayImpacts(prepared.yard);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ before: inPath, after: crushed });
    const away = unwrap(travelTo(prepared, 'garage')).state;
    expect(away.yard.devices.slice(-2)).toEqual([crushed, onShoulder]);
    expect(deserialize(serialize(away))?.yard).toEqual(away.yard);
    expect(drivewayImpacts(away.yard)).toEqual([]);
  });

  it('breaks only the log it hits and moves the horn intact, including on a skipped trip or reload', () => {
    const hits = drivewayImpacts(home.yard);
    expect(hits.map(hit => hit.before.type)).toEqual(['log', 'horn']);
    expect(hits[0]!.at).toBeLessThan(hits[1]!.at);
    const away = unwrap(travelTo(home, 'garage')).state;
    const [beforeLog, beforeHorn, stakes, offRoad] = home.yard.devices.slice(-4);
    const [broken, moved, crossed, missed] = away.yard.devices.slice(-4);
    expect(broken).toEqual({ ...beforeLog, hp: 0, broken: true });
    expect(moved).toEqual({ ...beforeHorn, x: 18, y: 13 });
    expect([crossed, missed]).toEqual([stakes, offRoad]);
    expect(home.yard.devices.at(-4)?.broken).toBe(false);
    expect(deserialize(serialize(away))?.yard).toEqual(away.yard);
    expect(driveThroughYard(away.yard)).toBe(away.yard);
    const returned = unwrap(arriveHome({ ...away, where: 'road' })).state;
    expect(returned.yard).toEqual(away.yard);
    const repaired = unwrap(repairDevice(returned, broken!.id));
    expect(unwrap(travelTo(repaired, 'garage')).state.yard.devices.at(-4)?.broken).toBe(true);
  });

  it('keeps the same consequences for the herd detour and a legacy save already driving home', () => {
    const away = unwrap(travelTo(home, 'garage')).state;
    expect(chooseCrossing(home, 'grocery', 'garage')?.state.yard).toEqual(away.yard);
    expect(unwrap(arriveHome({ ...away, where: 'road', yard: home.yard })).state.yard).toEqual(away.yard);
    expect(travelTo({ ...home, hoursLeft: 0 }, 'garage').ok).toBe(false);
    expect(home.yard.devices.at(-4)?.broken).toBe(false);
  });

  it('never pushes onto scenery, another device or back into the lane', () => {
    let yard = place(stocked, 'horn', 18, 12);
    for (const x of [17, 18, 19]) yard = place(yard, 'spikes', x, 13);
    const blockedHorn = yard.yard.devices.find(d => d.type === 'horn')!;
    const hits = drivewayImpacts(yard.yard);
    expect(hits.map(hit => hit.after)).toEqual([{ ...blockedHorn, broken: true, hp: 0 }]);
    expect(drivewayImpacts(driveThroughYard(yard.yard))).toEqual([]);
    const adjacent = place(place(stocked, 'horn', 15, 12), 'horn', 16, 12);
    const moved = drivewayImpacts(adjacent.yard);
    expect(moved).toHaveLength(2);
    expect(new Set(moved.map(hit => [hit.after.x, hit.after.y].join(','))).size).toBe(2);
    expect(moved.every(hit => !onDriveway(hit.after.x, hit.after.y))).toBe(true);
  });
});

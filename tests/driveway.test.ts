import { describe, expect, it } from 'vitest';
import { drivewayImpacts, driveThroughYard, onDriveway } from '../src/core/driveway';
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
  const stocked = { ...base, day: 2, inventory: { wood: 50, scrap: 50, wire: 50, springs: 50, battery: 50 } };
  const log = place(stocked, 'log', 15, 11); // swept while backing out
  const withHorn = place(log, 'horn', 18, 12);
  const withStakes = place(withHorn, 'spikes', 19, 11);
  const home = place(withStakes, 'log', 18, 10); // just off the road

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
    expect(driveThroughYard(yard.yard)).toBe(yard.yard);
    const adjacent = place(place(stocked, 'horn', 15, 12), 'horn', 16, 12);
    const moved = drivewayImpacts(adjacent.yard);
    expect(moved).toHaveLength(2);
    expect(new Set(moved.map(hit => [hit.after.x, hit.after.y].join(','))).size).toBe(2);
    expect(moved.every(hit => !onDriveway(hit.after.x, hit.after.y))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { catchesIgnition, finishCrossbowStop, IGNITION_SECONDS, ROAD_DUSK_HOURS } from '../src/core/crossbow-road';
import { LOCATIONS } from '../src/core/data/locations';
import { ENCOUNTER } from '../src/core/data/rivals';
import { act, units } from '../src/core/encounters';
import { arriveHome, leaveLocation, newGame, searchSpot, travelTo } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save';
import type { Result } from '../src/core/types';

function unwrap<T>(result: Result<T, unknown>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function garageTrip(withCrossbow = true) {
  const visit = unwrap(travelTo(newGame(12), 'garage')).state;
  const index = LOCATIONS.garage.spots.findIndex(spot => spot.key === 'crossbow');
  return withCrossbow ? unwrap(searchSpot(visit, index)).state : visit;
}

describe('Last Light', () => {
  it('triggers on reaching dusk with the crossbow and survives a reload before unloading', () => {
    const cutoff = ROAD_DUSK_HOURS + LOCATIONS.garage.travelHours;
    const garage = garageTrip();
    const early = unwrap(leaveLocation({ ...garage, hoursLeft: cutoff + 0.25 })).state;
    expect(arriveHome(early).ok).toBe(true);
    const unarmed = unwrap(leaveLocation({ ...garageTrip(false), hoursLeft: cutoff })).state;
    expect(arriveHome(unarmed).ok).toBe(true);
    const dusk = unwrap(leaveLocation({ ...garage, hoursLeft: cutoff })).state;
    const reloaded = deserialize(serialize(dusk))!;
    expect(reloaded.outing?.crossbowStop).toBe(true);
    expect(arriveHome(reloaded)).toMatchObject({ ok: false, error: { code: 'encounter_pending' } });
    expect(reloaded.inventory).toEqual(garage.inventory);
  });

  it('settles casualties, missed cargo and the stall once before allowing arrival', () => {
    const garage = garageTrip();
    const loaded = unwrap(searchSpot(garage, 0)).state;
    const dusk = unwrap(leaveLocation({ ...loaded, hoursLeft: 2.5 })).state;
    const result = finishCrossbowStop(dusk, true, 1)!;
    expect(result.state.totals.kills).toBe(dusk.totals.kills + 1);
    expect(units(result.lost)).toBe(2);
    expect(result.state.outing?.parted).toMatchObject(result.lost);
    expect(result.state.hoursLeft).toBe(dusk.hoursLeft - 0.25);
    expect(result.state.inventory).toEqual(dusk.inventory);
    const reloaded = deserialize(serialize(result.state))!;
    expect(finishCrossbowStop(reloaded, true, 1)).toBeNull();
    const arrival = unwrap(arriveHome(reloaded));
    expect(units(arrival.brought)).toBe(units(dusk.outing!.trunk) - 2);
    const again = unwrap(travelTo(arrival.state, 'garage')).state;
    expect(unwrap(leaveLocation(again)).state.outing?.crossbowStop).toBeUndefined();
  });

  it('leaves the existing human ambush first in line', () => {
    const garage = garageTrip();
    const loaded = { ...garage.outing!, trunk: { wood: ENCOUNTER.ambushMinLoad, scrap: 0, springs: 0, wire: 0, battery: 0 } };
    const road = unwrap(leaveLocation({ ...garage, day: ENCOUNTER.ambushFromDay, hoursLeft: 2.5, outing: loaded })).state;
    expect(road.encounter?.kind).toBe('ambush');
    expect(finishCrossbowStop(road, false, 3)).toBeNull();
    const ambush = road.encounter!;
    if (ambush.kind !== 'ambush') throw new Error('expected a roadblock');
    const after = unwrap(act(road, { type: 'pay', payment: { wood: ambush.toll } })).state;
    expect(after.outing?.crossbowStop).toBe(true);
    const clear = finishCrossbowStop(after, false, 3)!.state;
    expect(unwrap(arriveHome(clear)).brought.wood).toBe(ENCOUNTER.ambushMinLoad - ambush.toll);
  });

  it('only catches the ignition within the marked part of the two passes', () => {
    expect(catchesIgnition(0)).toBe(false);
    expect(catchesIgnition(0.95)).toBe(true);
    expect(catchesIgnition(1.25)).toBe(false);
    expect(catchesIgnition(3.45)).toBe(true);
    expect(catchesIgnition(IGNITION_SECONDS + 0.95)).toBe(false);
  });
});

import { expect, it } from 'vitest';
import { arriveHome, leaveLocation, newGame, searchSpot, travelTo } from '../src/core/game';
import { mechanicInvoice } from '../src/core/mechanic-invoice';
import { deserialize, serialize } from '../src/core/save';
import type { Result } from '../src/core/types';

function unwrap<T>(result: Result<T, unknown>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

it.each([[1, 0, 2], [7, 1, 0]])('bills only the actual handover for seed %i', (seed, springs, scrap) => {
  const visit = unwrap(travelTo(newGame(seed), 'garage'));
  expect(visit.meeting?.gift).toEqual(springs ? { springs } : { scrap });
  expect(visit.state.outing?.trunk).toMatchObject({ springs, scrap });
  const searched = unwrap(searchSpot(visit.state, 0)).state;
  expect(searched.outing!.trunk.springs).toBeGreaterThan(springs);
  const loaded = deserialize(serialize(searched))!;
  const home = unwrap(arriveHome(unwrap(leaveLocation(loaded)).state)).state;
  const repeat = unwrap(travelTo(home, 'garage'));
  expect(repeat.meeting?.gift).toEqual({});
  expect(mechanicInvoice(repeat.state)).toEqual({ springs, scrap, unitemized: 0 });
});

it('retains unknown older invoices alongside new known parts', () => {
  const base = newGame(7);
  const legacy = deserialize(serialize({ ...base, day: 3, flags: { bills: 2 } }))!;
  expect(mechanicInvoice(legacy)).toEqual({ springs: 0, scrap: 0, unitemized: 2 });
  const current = unwrap(travelTo(legacy, 'garage')).state;
  expect(mechanicInvoice(current)).toEqual({ springs: 1, scrap: 0, unitemized: 2 });
  const empty = unwrap(travelTo({ ...base, day: 5 }, 'garage'));
  expect(empty.meeting).toBeNull();
  expect(mechanicInvoice(empty.state)).toEqual({ springs: 0, scrap: 0, unitemized: 0 });
});

import { expect, it } from 'vitest';
import { LOCATIONS } from '../src/core/data/locations';
import { arriveHome, leaveLocation, newGame, prepareSearch, remainingSearches, searchSpot, travelTo } from '../src/core/game';
import { hasUnclaimedPlanque } from '../src/core/planque';
import { deserialize, serialize } from '../src/core/save';
import type { Result } from '../src/core/types';

function unwrap<T>(result: Result<T, unknown>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

it('reveals the parcel only after the directory match, persists it and awards it once', () => {
  const home = { ...newGame(42), day: 2 };
  const shed = LOCATIONS.shed;
  const cache = shed.spots.findIndex(spot => spot.key === 'parcel-cache');
  const before = unwrap(travelTo(home, 'shed')).state;
  expect(prepareSearch(before, cache)).toMatchObject({ ok: false, error: { code: 'unknown_spot' } });
  expect(remainingSearches(home, shed)).toBe(shed.spots.length - 1);

  const post = unwrap(travelTo(home, 'post')).state;
  const minitel = LOCATIONS.post.spots.findIndex(spot => spot.key === 'minitel');
  const attempt = unwrap(prepareSearch(post, minitel));
  expect(hasUnclaimedPlanque(attempt.failure)).toBe(false);
  expect(hasUnclaimedPlanque(attempt.success.state)).toBe(true);
  const loaded = deserialize(serialize(attempt.success.state))!;
  const back = unwrap(arriveHome(unwrap(leaveLocation(loaded)).state)).state;
  expect(remainingSearches(back, shed)).toBe(shed.spots.length);

  const there = unwrap(travelTo(back, 'shed')).state;
  const result = unwrap(searchSpot(there, cache));
  expect(result.loot).toEqual({ battery: 2, springs: 2 });
  expect(hasUnclaimedPlanque(result.state)).toBe(false);
  expect(searchSpot(result.state, cache)).toMatchObject({ ok: false, error: { code: 'already_searched' } });
});

import { expect, it } from 'vitest';
import { chooseCrossing, HERD_WAIT_HOURS, shouldPlayCrossing } from '../src/core/crossing';
import { LOCATIONS } from '../src/core/data/locations';
import { arriveHome, leaveLocation, newGame } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save';
import type { Result } from '../src/core/types';

function unwrap<T>(result: Result<T, unknown>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

it('only interrupts an eligible day-two or later outbound trip with daylight for either route', () => {
  const start = newGame(12);
  expect(shouldPlayCrossing(start, 'hardware')).toBe(false);
  const dayTwo = { ...start, day: 2 };
  expect(shouldPlayCrossing(dayTwo, 'police')).toBe(false);
  expect(shouldPlayCrossing(dayTwo, 'garage')).toBe(false);
  expect(shouldPlayCrossing({ ...dayTwo, hoursLeft: 1.75 }, 'grocery')).toBe(false);
  expect(shouldPlayCrossing({ ...dayTwo, hoursLeft: 2 }, 'grocery')).toBe(true);
});

it('commits the selected route once and keeps its result on reload', () => {
  const start = { ...newGame(12), day: 2 };
  const wait = chooseCrossing(start, 'grocery', 'wait')!;
  expect(wait.state.where).toBe('grocery');
  expect(wait.state.hoursLeft).toBe(start.hoursLeft - HERD_WAIT_HOURS - LOCATIONS.grocery.travelHours);
  const detour = chooseCrossing(start, 'grocery', 'garage')!;
  expect(detour.state.where).toBe('garage');
  expect(detour.state.hoursLeft).toBe(start.hoursLeft - LOCATIONS.garage.travelHours);
  expect(detour.state.locations.grocery.visits).toBe(0);
  const reloaded = deserialize(serialize(detour.state))!;
  const home = unwrap(arriveHome(unwrap(leaveLocation(reloaded)).state)).state;
  expect(shouldPlayCrossing(home, 'grocery')).toBe(false);
  expect(chooseCrossing(home, 'grocery', 'wait')).toBeNull();
});

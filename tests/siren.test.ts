import { expect, it } from 'vitest';
import { LOCATIONS } from '../src/core/data/locations';
import { planForNight, SIREN_SECTORS, sirenPackFor } from '../src/core/data/waves';
import { arriveHome, leaveLocation, newGame, searchSpot, travelTo } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { deserialize, serialize } from '../src/core/save';
import { canPlanSiren, scheduleSiren, sirenForNight } from '../src/core/siren';
import type { Result } from '../src/core/types';

function unwrap<T>(result: Result<T, unknown>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

it('can recover the controller and spends exactly one battery once for the chosen night', () => {
  const start = { ...newGame(12), day: 4 };
  expect(canPlanSiren(start)).toBe(false);
  const there = unwrap(travelTo(start, 'townhall')).state;
  const spot = LOCATIONS.townhall.spots.findIndex(spot => spot.key === 'siren');
  const got = unwrap(searchSpot(there, spot)).state;
  expect(scheduleSiren(got, 'verger')).toBeNull();
  const home = unwrap(arriveHome(unwrap(leaveLocation(got)).state)).state;
  expect(scheduleSiren({ ...home, inventory: { ...home.inventory, battery: 0 } }, 'verger')).toBeNull();
  const armed = scheduleSiren(home, 'verger')!;
  expect(armed.inventory.battery).toBe(home.inventory.battery - 1);
  const loaded = deserialize(serialize(armed))!;
  expect(sirenForNight(loaded)).toBe('verger');
  expect(scheduleSiren(loaded, 'portail')).toBeNull();
  expect(sirenForNight({ ...loaded, day: 5 })).toBeNull();
});

it('moves the forecasted pack only and feeds the selected side to the night simulation', () => {
  for (const day of [4, 5, 6, 7]) {
    const original = planForNight(day);
    const moved = sirenPackFor(day)!;
    for (const side of SIREN_SECTORS) {
      const diverted = planForNight(day, side);
      expect(diverted.waves.map(wave => wave.groups.map(group => group.count))).toEqual(original.waves.map(wave => wave.groups.map(group => group.count)));
      for (const [w, wave] of diverted.waves.entries()) {
        wave.groups.forEach((group, g) => {
          expect(group).toEqual(w + 1 === moved.wave && g === moved.group ? { ...moved.pack, sector: side } : original.waves[w]!.groups[g]);
        });
      }
    }
  }

  const { yard, seed } = newGame(12);
  const sim = new NightSim(4, yard, seed, null, null, null, 'verger');
  for (let i = 0; i < 360; i++) sim.step(1 / 60);
  expect(sim.drainEvents().find(event => event.type === 'spawn')).toEqual({ type: 'spawn', enemy: 'shambler', sector: 'verger' });
});

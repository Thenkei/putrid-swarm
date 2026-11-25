import { describe, expect, it } from 'vitest';
import { LOCATIONS } from '../src/core/data/locations';
import { gradeFinish, lootFor, type Finish } from '../src/core/finish';
import { arriveHome, leaveLocation, newGame, prepareSearch, searchSpot, travelTo } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save';
import type { Puzzle } from '../src/core/scavenge';
import type { GameState, LocationId, Result } from '../src/core/types';
import { LOCATION_IDS } from '../src/core/types';
import { scavengeFr } from '../src/i18n/scavenge-fr';

function unwrap<T>(result: Result<T, unknown>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const visit = (state: GameState, id: LocationId): GameState => unwrap(travelTo(state, id)).state;
const FINISHES: readonly Finish[] = ['clean', 'plain', 'rough'];

describe('puzzle finish', () => {
  const graded: Puzzle['kind'][] = ['scale', 'circuit', 'timing', 'padlock', 'rummage'];
  const ungraded: Puzzle['kind'][] = ['records', 'directory', 'vachette'];

  it('covers every kind of puzzle the town deals', () => {
    const dealt = new Set(LOCATION_IDS.flatMap(id => Object.values<Puzzle>(scavengeFr.spots[id]).map(puzzle => puzzle.kind)));
    expect([...dealt].sort()).toEqual([...graded, ...ungraded].sort());
  });

  it.each(graded)('grades a %s: clean at the first unheard attempt, rough after a failed one', kind => {
    expect(gradeFinish(kind, { slipped: false, heard: 0 })).toBe('clean');
    expect(gradeFinish(kind, { slipped: true, heard: 0 })).toBe('rough');
    // A heard success is neither: the street already charges for it.
    expect(gradeFinish(kind, { slipped: false, heard: 1 })).toBe('plain');
    expect(gradeFinish(kind, { slipped: true, heard: 1 })).toBe('rough');
  });

  it.each(ungraded)('always rolls a %s, which cannot be done well or badly', kind => {
    for (const slipped of [false, true]) for (const heard of [0, 1]) expect(gradeFinish(kind, { slipped, heard })).toBe('plain');
  });

  it('pays the top of the range for a clean finish, the bottom for a rough one and the roll otherwise', () => {
    expect(lootFor('clean', [3, 5], 4)).toBe(5);
    expect(lootFor('rough', [3, 5], 4)).toBe(3);
    expect(lootFor('plain', [3, 5], 4)).toBe(4);
  });
});

describe('graded searches', () => {
  const garage = visit(newGame(21), 'garage');
  const locker = LOCATIONS.garage.spots.findIndex(spot => spot.key === 'locker');
  const range = LOCATIONS.garage.spots[locker]!.loot;

  it('loads the ends of each range into the boot and moves the campaign RNG the same way', () => {
    const attempt = unwrap(prepareSearch(garage, locker));
    const top = attempt.graded('clean');
    const bottom = attempt.graded('rough');
    expect(top.loot).toEqual({ scrap: range.scrap![1], wire: range.wire![1] });
    expect(bottom.loot).toEqual({ scrap: range.scrap![0], wire: range.wire![0] });
    expect(top.state.outing!.trunk.scrap).toBe(garage.outing!.trunk.scrap + range.scrap![1]);
    expect(bottom.state.outing!.trunk.wire).toBe(garage.outing!.trunk.wire + range.wire![0]);
    for (const finish of FINISHES) expect(attempt.graded(finish).state.rng).toBe(attempt.success.state.rng);
  });

  it('leaves headless searches on the plain roll', () => {
    const attempt = unwrap(prepareSearch(garage, locker));
    expect(attempt.graded('plain')).toEqual(attempt.success);
    expect(unwrap(searchSpot(garage, locker))).toEqual(attempt.success);
    for (const [id, [min, max]] of Object.entries(range)) {
      const found = attempt.success.loot[id as keyof typeof range]!;
      expect(found).toBeGreaterThanOrEqual(min);
      expect(found).toBeLessThanOrEqual(max);
    }
  });

  it('remembers a failed attempt at the spot for the rest of the visit, across a reload', () => {
    const first = unwrap(prepareSearch(garage, locker));
    expect(first.slipped).toBe(false);
    const missed = deserialize(serialize(first.failure))!;
    expect(unwrap(prepareSearch(missed, locker)).slipped).toBe(true);
    const other = LOCATIONS.garage.spots.findIndex(spot => spot.key === 'storeroom');
    expect(unwrap(prepareSearch(missed, other)).slipped).toBe(false);
    // A success never marks the spot, so the next lot starts clean too.
    expect(unwrap(prepareSearch(first.graded('clean').state, other)).slipped).toBe(false);
  });

  it('starts the next visit clean', () => {
    const missed = unwrap(prepareSearch(garage, locker)).failure;
    const home = unwrap(arriveHome(unwrap(leaveLocation(missed)).state)).state;
    const back = visit({ ...home, hoursLeft: garage.hoursLeft }, 'garage');
    expect(unwrap(prepareSearch(back, locker)).slipped).toBe(false);
  });
});

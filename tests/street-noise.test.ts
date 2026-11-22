import { describe, expect, it } from 'vitest';
import { LOCATIONS } from '../src/core/data/locations';
import { arriveHome, leaveLocation, newGame, planVisit, prepareSearch, remainingSearches, searchSpot, searchStop, travelTo, visitSearchesLeft } from '../src/core/game';
import { RUMMAGE } from '../src/core/rummage';
import { deserialize, serialize } from '../src/core/save';
import { FAILED_ATTEMPT_NOISE, makeNoise, NOISE_PER_LOST_SEARCH, RECORD_DECOY_NOISE, rummageNoise, searchesLostToNoise, streetNoise } from '../src/core/street-noise';
import type { GameState, LocationId, Result } from '../src/core/types';

function unwrap<T>(result: Result<T, unknown>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const visit = (state: GameState, id: LocationId): GameState => unwrap(travelTo(state, id)).state;
const goHome = (state: GameState): GameState => unwrap(arriveHome(unwrap(leaveLocation(state)).state)).state;
/** The first lot of the current location that can still be searched. */
const openSpot = (state: GameState): number => {
  if (state.where === 'home' || state.where === 'road') throw new Error('Not at a location');
  const { searched } = state.locations[state.where];
  return LOCATIONS[state.where].spots.findIndex((_, index) => !searched.includes(index) && prepareSearch(state, index).ok);
};

describe('street noise', () => {
  const hardware = LOCATIONS.hardware;
  const town = visit(newGame(7), 'hardware');

  it('accumulates over the visit and is never heard at home', () => {
    expect(streetNoise(town)).toBe(0);
    const louder = makeNoise(makeNoise(town, 2), 1);
    expect(streetNoise(louder)).toBe(3);
    expect(makeNoise(town, 0)).toBe(town);
    const home = newGame(7);
    expect(makeNoise(home, 2)).toBe(home);
    expect(streetNoise(home)).toBe(0);
  });

  it('makes every failed attempt heard, but not a paid or a successful one', () => {
    const attempt = unwrap(prepareSearch(town, openSpot(town)));
    expect(streetNoise(attempt.paid)).toBe(0);
    expect(streetNoise(attempt.success.state)).toBe(0);
    expect(streetNoise(attempt.failure)).toBe(FAILED_ATTEMPT_NOISE);
  });

  it('prices the loud puzzle outcomes', () => {
    expect(RECORD_DECOY_NOISE).toEqual([0, 2]);
    expect(rummageNoise(RUMMAGE.noise - 2)).toBe(0);
    expect(rummageNoise(RUMMAGE.noise - 1)).toBe(1);
    expect(rummageNoise(RUMMAGE.noise)).toBe(1);
  });

  it('takes one search off the visit for every threshold crossed', () => {
    const lots = remainingSearches(town, hardware);
    expect(visitSearchesLeft(town, hardware)).toBe(lots);
    expect(visitSearchesLeft(makeNoise(town, NOISE_PER_LOST_SEARCH - 1), hardware)).toBe(lots);
    const loud = makeNoise(town, NOISE_PER_LOST_SEARCH);
    expect(searchesLostToNoise(loud, 'hardware')).toBe(1);
    expect(visitSearchesLeft(loud, hardware)).toBe(lots - 1);
    expect(visitSearchesLeft(makeNoise(town, 2 * NOISE_PER_LOST_SEARCH), hardware)).toBe(lots - 2);
    expect(searchStop(loud, hardware)).toBeNull();

    // Searching on spends what is left; the last lot then waits for a quieter visit.
    let state = loud;
    for (let n = lots - 1; n > 0; n--) state = unwrap(searchSpot(state, openSpot(state))).state;
    expect(remainingSearches(state, hardware)).toBe(1);
    expect(visitSearchesLeft(state, hardware)).toBe(0);
    expect(searchStop(state, hardware)).toBe('noise');
    const last = hardware.spots.findIndex((_, index) => !state.locations.hardware.searched.includes(index));
    expect(prepareSearch(state, last)).toMatchObject({ ok: false, error: { code: 'escorted_out' } });
  });

  it('lowers the chief’s allowance too, and still names him once he has walked the player out', () => {
    const station = LOCATIONS.police;
    const police = visit({ ...newGame(5), day: 3 }, 'police');
    expect(visitSearchesLeft(police, station)).toBe(2);
    const loud = makeNoise(police, NOISE_PER_LOST_SEARCH);
    expect(visitSearchesLeft(loud, station)).toBe(1);
    const searched = unwrap(searchSpot(loud, openSpot(loud))).state;
    expect(searchStop(searched, station)).toBe('noise');
    const once = unwrap(searchSpot(police, openSpot(police))).state;
    const twice = unwrap(searchSpot(once, openSpot(once))).state;
    expect(searchStop(twice, station)).toBe('escorted');
  });

  it('starts every visit quiet and leaves the next trip’s plan alone', () => {
    const loud = makeNoise(town, 2 * NOISE_PER_LOST_SEARCH);
    const home = goHome(loud);
    expect(planVisit(home, hardware)).toEqual(planVisit(goHome(town), hardware));
    const again = visit(home, 'hardware');
    expect(streetNoise(again)).toBe(0);
    expect(visitSearchesLeft(again, hardware)).toBe(remainingSearches(again, hardware));
  });

  it('survives a save and reload mid-visit', () => {
    const loud = makeNoise(town, NOISE_PER_LOST_SEARCH + 1);
    const loaded = deserialize(serialize(loud))!;
    expect(streetNoise(loaded)).toBe(NOISE_PER_LOST_SEARCH + 1);
    expect(visitSearchesLeft(loaded, hardware)).toBe(visitSearchesLeft(loud, hardware));
  });
});

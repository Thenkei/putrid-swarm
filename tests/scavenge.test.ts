import { describe, expect, it } from 'vitest';
import { GATE_HALF_ANGLE, Padlock } from '../src/core/padlock';
import { createRng } from '../src/core/rng';
import { circuitTiles, traceCircuit } from '../src/core/scavenge';
import { hasCrossbow } from '../src/core/crossbow';
import { LOCATIONS, SEARCH_HOURS } from '../src/core/data/locations';
import { GATE_WINDOW, gateResult } from '../src/core/fairground';
import { newGame, prepareSearch, travelTo } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save';

it('grants the garage crossbow once, only on a successful search, and keeps it across a reload', () => {
  const visit = travelTo(newGame(12), 'garage');
  if (!visit.ok) throw new Error('Garage is reachable on day one');
  const garage = visit.value.state;
  const index = LOCATIONS.garage.spots.findIndex(spot => spot.key === 'crossbow');
  const attempt = prepareSearch(garage, index);
  if (!attempt.ok) throw new Error('The canvas case is searchable');
  expect(hasCrossbow(garage)).toBe(false);
  expect(hasCrossbow(attempt.value.failure)).toBe(false);
  expect(attempt.value.success.loot).toEqual({});
  const loaded = deserialize(serialize(attempt.value.success.state))!;
  expect(hasCrossbow(loaded)).toBe(true);
  expect(prepareSearch(loaded, index)).toMatchObject({ ok: false, error: { code: 'already_searched' } });
});

describe('salvage circuits', () => {
  it('only powers pieces joined to the inlet and stops at a broken connection', () => {
    const board = [3, 6, 3, 10, 10, 10, 5, 3, 6];
    expect(traceCircuit(board)).toEqual({ lit: new Set([3, 4, 5]), complete: true });
    board[4] = 5;
    expect(traceCircuit(board)).toEqual({ lit: new Set([3]), complete: false });
  });

  it('gives the player an unfinished board with a rotatable path to the outlet', () => {
    for (let seed = 0; seed < 300; seed++) {
      const tiles = circuitTiles(createRng(seed));
      expect(traceCircuit(tiles).complete).toBe(false);
      // Walk all simple paths independently of the generator. A straight can only
      // continue along its inlet axis, an elbow can only turn onto the other axis.
      function canConnect(cell: number, from: number, visited: number): boolean {
        if (visited & (1 << cell)) return false;
        const straight = tiles[cell] === 5 || tiles[cell] === 10;
        const exits = straight ? [(from + 2) % 4] : [(from + 1) % 4, (from + 3) % 4];
        return exits.some(direction => {
          if (cell === 5 && direction === 1) return true;
          const x = cell % 3 + [0, 1, 0, -1][direction]!;
          const y = Math.floor(cell / 3) + [-1, 0, 1, 0][direction]!;
          return x >= 0 && x < 3 && y >= 0 && y < 3 && canConnect(y * 3 + x, (direction + 2) % 4, visited | (1 << cell));
        });
      }
      expect(canConnect(3, 3, 0)).toBe(true);
    }
  });
});

describe('padlock rings', () => {
  it('accepts either edge of twelve o’clock and keeps earlier catches through a miss', () => {
    const lock = new Padlock(createRng(12));
    expect(lock.catchRing()).toBe(false);
    lock.advance((360 - GATE_HALF_ANGLE - lock.angles[0]!) / 94);
    expect(lock.catchRing()).toBe(true);
    expect(lock.catchRing()).toBe(false);
    lock.advance((lock.angles[1]! - GATE_HALF_ANGLE) / 116);
    expect(lock.catchRing()).toBe(true);
    lock.advance((360 - lock.angles[2]!) / 142);
    expect(lock.catchRing()).toBe(true);
    lock.advance(100);
    expect(lock.open).toBe(true);
    expect(lock.angles).toEqual([0, 0, 0]);
    expect(lock.catchRing()).toBe(false);
  });
});

describe('the fairground', () => {
  it('accepts both edges of a gate and distinguishes early and late closures', () => {
    expect(gateResult(GATE_WINDOW.opens - 0.001)).toBe('early');
    expect(gateResult(GATE_WINDOW.opens)).toBe('caught');
    expect(gateResult(GATE_WINDOW.closes)).toBe('caught');
    expect(gateResult(GATE_WINDOW.closes + 0.001)).toBe('late');
  });

  it('charges for a failed attempt, then lets the player retry and loot the prize stall once', () => {
    const visit = travelTo({ ...newGame(12), day: 2 }, 'grocery');
    if (!visit.ok) throw new Error('The grocery is reachable on day two');
    const grocery = visit.value.state;
    const index = LOCATIONS.grocery.spots.findIndex(spot => spot.key === 'vachette');
    const attempt = prepareSearch(grocery, index);
    if (!attempt.ok) throw new Error('The fairground entrance is searchable');
    const missed = attempt.value.failure;
    expect(missed.phase).toBe('day');
    expect(missed.hoursLeft).toBe(grocery.hoursLeft - SEARCH_HOURS);
    expect(missed.outing?.trunk).toEqual(grocery.outing?.trunk);
    const retry = prepareSearch(missed, index);
    if (!retry.ok) throw new Error('A missed gate can be retried');
    const { state, loot } = retry.value.success;
    expect(state.hoursLeft).toBe(grocery.hoursLeft - 2 * SEARCH_HOURS);
    expect(loot).toEqual({ wire: 2, battery: 2 });
    expect(prepareSearch(deserialize(serialize(state))!, index)).toMatchObject({ ok: false, error: { code: 'already_searched' } });
  });
});

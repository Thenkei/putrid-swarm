import { describe, expect, it } from 'vitest';
import { GATE_HALF_ANGLE, Padlock } from '../src/core/padlock';
import { createRng } from '../src/core/rng';
import { catchBands, CATCH_WIDTH } from '../src/core/catch';
import { probeCost, Rummage, RUMMAGE, type TakeResult } from '../src/core/rummage';
import { circuitTiles, spotRng, traceCircuit } from '../src/core/scavenge';
import { hasCrossbow } from '../src/core/crossbow';
import { LOCATIONS, SEARCH_HOURS } from '../src/core/data/locations';
import { GATE_WINDOW, gateResult } from '../src/core/fairground';
import { newGame, prepareSearch, searchAttemptKey, travelTo } from '../src/core/game';
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
    const board = { tiles: [3, 6, 3, 10, 10, 10, 5, 3, 6], inlet: 1, outlet: 1 };
    expect(traceCircuit(board)).toEqual({ lit: new Set([3, 4, 5]), complete: true });
    board.tiles[4] = 5;
    expect(traceCircuit(board)).toEqual({ lit: new Set([3]), complete: false });
  });

  it('follows a route that doubles back between terminals on different rows', () => {
    // Top-left in, down the left column, along the bottom, then back up into the middle-right outlet.
    const board = { tiles: [12, 3, 3, 5, 3, 6, 3, 10, 9], inlet: 0, outlet: 1 };
    expect(traceCircuit(board)).toEqual({ lit: new Set([0, 3, 6, 7, 8, 5]), complete: true });
    board.tiles[5] = 3;
    expect(traceCircuit(board)).toEqual({ lit: new Set([0, 3, 6, 7, 8]), complete: false });
  });

  it('gives the player an unfinished board with a rotatable path to the outlet', () => {
    for (let seed = 0; seed < 300; seed++) {
      const board = circuitTiles(createRng(seed));
      expect(traceCircuit(board).complete).toBe(false);
      // `solve` walks the rotations independently of the generator.
      expect(solve(board).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('varies the terminals and the solution route from one board to the next', () => {
    const terminals = new Set<string>();
    const routes = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const board = circuitTiles(createRng(seed));
      terminals.add(`${board.inlet}>${board.outlet}`);
      routes.add(solve(board).join('>'));
    }
    expect(terminals.size).toBe(9);
    expect(routes.size).toBeGreaterThan(40);
  });

  it('deals a new board for a retry, but not for reopening the same attempt', () => {
    const visit = travelTo(newGame(7), 'hardware');
    if (!visit.ok) throw new Error('The hardware store is reachable on day one');
    const town = visit.value.state;
    const index = LOCATIONS.hardware.spots.findIndex(spot => spot.key === 'meshrolls');
    const attempt = prepareSearch(town, index);
    if (!attempt.ok) throw new Error('The mesh rolls are searchable');
    const deal = (state: typeof town) => circuitTiles(spotRng(state.seed, 'hardware', 'meshrolls', searchAttemptKey(state)));
    expect(deal(town)).toEqual(deal(town));
    expect(deal(attempt.value.failure)).not.toEqual(deal(town));
  });
});

/** First rotatable route from inlet to outlet, as the ordered cells it lights. */
function solve({ tiles, inlet, outlet }: { tiles: number[]; inlet: number; outlet: number }): number[] {
  const walk = (cell: number, from: number, path: number[]): number[] | null => {
    if (path.includes(cell)) return null;
    const straight = tiles[cell] === 5 || tiles[cell] === 10;
    for (const direction of straight ? [(from + 2) % 4] : [(from + 1) % 4, (from + 3) % 4]) {
      if (cell === outlet * 3 + 2 && direction === 1) return [...path, cell];
      const x = cell % 3 + [0, 1, 0, -1][direction]!;
      const y = Math.floor(cell / 3) + [-1, 0, 1, 0][direction]!;
      const found = x >= 0 && x < 3 && y >= 0 && y < 3 ? walk(y * 3 + x, (direction + 2) % 4, [...path, cell]) : null;
      if (found) return found;
    }
    return null;
  };
  const route = walk(inlet * 3, 3, []);
  if (!route) throw new Error('Unsolvable board');
  return route;
}

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

describe('timing bands', () => {
  it('keeps both bands on the track, apart, and moves the second one between attempts', () => {
    const seconds = new Set<number>();
    for (let seed = 0; seed < 300; seed++) {
      const [first, second] = catchBands(createRng(seed));
      for (const start of [first, second]) {
        expect(start).toBeGreaterThanOrEqual(0.05 - 1e-9);
        expect(start + CATCH_WIDTH).toBeLessThanOrEqual(0.95 + 1e-9);
      }
      expect(Math.abs(second - first)).toBeGreaterThanOrEqual(CATCH_WIDTH + 0.08 - 1e-9);
      seconds.add(second);
    }
    expect(seconds.size).toBeGreaterThan(20);
  });
});

describe('rummage', () => {
  /** Tests in `plan` order while noise lasts, then grabs what the results prove; null when it must guess. */
  function play(seed: number, plan: (pile: Rummage) => number[]): TakeResult[] | null {
    const pile = new Rummage(createRng(seed));
    const good: number[] = [];
    for (const item of plan(pile)) {
      if (good.length === RUMMAGE.wanted) break;
      const result = pile.probe(item);
      if (result?.good) good.push(item);
    }
    const unknown = pile.order.filter(item => !pile.isProbed(item));
    const missing = RUMMAGE.wanted - good.length;
    if (missing > 0 && unknown.length !== missing) return null;
    return [...good, ...(missing > 0 ? unknown : [])].map(item => pile.take(item));
  }

  it('always lets a player who tests the quiet containers first find both good ones', () => {
    const quietFirst = (pile: Rummage) => [...pile.order].sort((a, b) => probeCost(a) - probeCost(b));
    for (let seed = 0; seed < 300; seed++) expect(play(seed, quietFirst)).toEqual(['kept', 'done']);
  });

  it('can leave a guess to a player who tests the noisy containers first', () => {
    const loudFirst = (pile: Rummage) => [...pile.order].sort((a, b) => probeCost(b) - probeCost(a));
    const guesses = Array.from({ length: 300 }, (_, seed) => play(seed, loudFirst)).filter(result => result === null);
    expect(guesses.length).toBeGreaterThan(30);
  });

  it('refuses a test the noise cannot cover and ends the attempt on a wrong grab', () => {
    const pile = new Rummage(createRng(5));
    for (const item of [0, 1, 2]) expect(pile.probe(item)).not.toBeNull();
    expect(pile.noiseLeft).toBe(1);
    expect(pile.canProbe(3)).toBe(true);
    pile.probe(3);
    expect(pile.probe(4)).toBeNull();
    expect(pile.probe(0)).toEqual(pile.reveal(0));
    const junk = pile.order.find(item => !pile.reveal(item).good)!;
    expect(pile.take(junk)).toBe('wrong');
  });
});

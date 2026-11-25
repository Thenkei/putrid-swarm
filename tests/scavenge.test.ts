import { describe, expect, it } from 'vitest';
import { GATE_HALF_ANGLE, Padlock } from '../src/core/padlock';
import { createRng } from '../src/core/rng';
import { catchBands, inBand, NEEDLE_PACE, needleAt } from '../src/core/catch';
import { PUZZLE_CURVE, PUZZLE_LEVELS, puzzleLevel, type PuzzleLevel } from '../src/core/difficulty';
import { probeCost, Rummage, RUMMAGE, type LoudCost, type RummageShape, type TakeResult } from '../src/core/rummage';
import { circuitTiles, scaleWeights, spotRng, traceCircuit, type CatchMotion, type CircuitBoard } from '../src/core/scavenge';
import { LAST_NIGHT } from '../src/core/data/waves';
import { hasCrossbow } from '../src/core/crossbow';
import { LOCATIONS, SEARCH_HOURS } from '../src/core/data/locations';
import { GATE_WINDOW, gateResult } from '../src/core/fairground';
import { newGame, prepareSearch, searchAttemptKey, travelTo } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save';
import { scavengeEn } from '../src/i18n/scavenge-en';
import { scavengeFr } from '../src/i18n/scavenge-fr';

/** The app never advances a frame by more than this (`MAX_FRAME` in engine/app.ts). */
const SLOWEST_FRAME = 0.1;
/** The shortest window a timed press may get, in seconds: a deliberate press, never a lucky one. */
const FAIR_WINDOW = 0.16;

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
    const board: CircuitBoard = { side: 3, tiles: [3, 6, 3, 10, 10, 10, 5, 3, 6], inlet: 1, outlet: 1 };
    expect(traceCircuit(board)).toEqual({ lit: new Set([3, 4, 5]), complete: true });
    board.tiles[4] = 5;
    expect(traceCircuit(board)).toEqual({ lit: new Set([3]), complete: false });
  });

  it('follows a route that doubles back between terminals on different rows', () => {
    // Top-left in, down the left column, along the bottom, then back up into the middle-right outlet.
    const board: CircuitBoard = { side: 3, tiles: [12, 3, 3, 5, 3, 6, 3, 10, 9], inlet: 0, outlet: 1 };
    expect(traceCircuit(board)).toEqual({ lit: new Set([0, 3, 6, 7, 8, 5]), complete: true });
    board.tiles[5] = 3;
    expect(traceCircuit(board)).toEqual({ lit: new Set([0, 3, 6, 7, 8]), complete: false });
  });

  it('reaches the outlet column on a four-by-four board', () => {
    const board: CircuitBoard = { side: 4, tiles: [5, 5, 5, 5, 10, 10, 10, 10, 5, 5, 5, 5, 5, 5, 5, 5], inlet: 1, outlet: 1 };
    expect(traceCircuit(board)).toEqual({ lit: new Set([4, 5, 6, 7]), complete: true });
    expect(traceCircuit({ ...board, outlet: 2 }).complete).toBe(false);
  });

  it.each(PUZZLE_LEVELS)('gives the player an unfinished board with a rotatable path to the outlet at level %i', level => {
    const shape = PUZZLE_CURVE[level].circuit;
    for (let seed = 0; seed < 300; seed++) {
      const board = circuitTiles(createRng(seed), shape);
      expect(board.tiles).toHaveLength(shape.side * shape.side);
      expect(traceCircuit(board).complete).toBe(false);
      // `solve` walks the rotations independently of the generator; no board is a straight dash.
      expect(solve(board).length).toBeGreaterThanOrEqual(shape.side + 2);
    }
  });

  it.each([[0, 40], [1, 25], [2, 150]] as const)('varies the terminals and the solution route from one board to the next at level %i', (level, variety) => {
    const shape = PUZZLE_CURVE[level].circuit;
    const terminals = new Set<string>();
    const routes = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const board = circuitTiles(createRng(seed), shape);
      terminals.add(`${board.inlet}>${board.outlet}`);
      routes.add(solve(board).join('>'));
    }
    expect(terminals.size).toBe(shape.side * shape.side);
    expect(routes.size).toBeGreaterThan(variety);
  });

  it('deals a new board for a retry, but not for reopening the same attempt', () => {
    const visit = travelTo(newGame(7), 'hardware');
    if (!visit.ok) throw new Error('The hardware store is reachable on day one');
    const town = visit.value.state;
    const index = LOCATIONS.hardware.spots.findIndex(spot => spot.key === 'meshrolls');
    const attempt = prepareSearch(town, index);
    if (!attempt.ok) throw new Error('The mesh rolls are searchable');
    const deal = (state: typeof town) => circuitTiles(spotRng(state.seed, 'hardware', 'meshrolls', searchAttemptKey(state)), PUZZLE_CURVE[puzzleLevel(state)].circuit);
    expect(deal(town)).toEqual(deal(town));
    expect(deal(attempt.value.failure)).not.toEqual(deal(town));
  });
});

/** First rotatable route from inlet to outlet, as the ordered cells it lights. */
function solve({ side, tiles, inlet, outlet }: CircuitBoard): number[] {
  const walk = (cell: number, from: number, path: number[]): number[] | null => {
    if (path.includes(cell)) return null;
    const straight = tiles[cell] === 5 || tiles[cell] === 10;
    for (const direction of straight ? [(from + 2) % 4] : [(from + 1) % 4, (from + 3) % 4]) {
      if (cell === outlet * side + side - 1 && direction === 1) return [...path, cell];
      const x = cell % side + [0, 1, 0, -1][direction]!;
      const y = Math.floor(cell / side) + [-1, 0, 1, 0][direction]!;
      const found = x >= 0 && x < side && y >= 0 && y < side ? walk(y * side + x, (direction + 2) % 4, [...path, cell]) : null;
      if (found) return found;
    }
    return null;
  };
  const route = walk(inlet * side, 3, []);
  if (!route) throw new Error('Unsolvable board');
  return route;
}

describe('padlock rings', () => {
  it('accepts either edge of twelve o’clock and keeps earlier catches through a miss', () => {
    const lock = new Padlock(createRng(12), 1);
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

  it.each(PUZZLE_LEVELS)('keeps every gate open long enough, and opens for a player on the slowest frames, at level %i', level => {
    const pace = PUZZLE_CURVE[level].ringPace;
    for (const speed of new Padlock(createRng(0), pace).speeds) expect((2 * GATE_HALF_ANGLE) / Math.abs(speed)).toBeGreaterThanOrEqual(FAIR_WINDOW);
    for (let seed = 0; seed < 300; seed++) {
      const lock = new Padlock(createRng(seed), pace);
      // Presses on the first frame the notch shows inside the guide: no ring can jump the gate between two frames.
      for (let frame = 0; frame < 100 && !lock.open; frame++) {
        lock.advance(SLOWEST_FRAME);
        if (lock.aligned) expect(lock.catchRing()).toBe(true);
      }
      expect(lock.open).toBe(true);
    }
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
  it.each(PUZZLE_LEVELS)('keeps both bands on the track, apart, and moves the second one between attempts at level %i', level => {
    const width = PUZZLE_CURVE[level].catchWidth;
    const seconds = new Set<number>();
    for (let seed = 0; seed < 300; seed++) {
      const [first, second] = catchBands(createRng(seed), width);
      for (const start of [first, second]) {
        expect(start).toBeGreaterThanOrEqual(0.05 - 1e-9);
        expect(start + width).toBeLessThanOrEqual(0.95 + 1e-9);
      }
      expect(Math.abs(second - first)).toBeGreaterThanOrEqual(width + 0.08 - 1e-9);
      seconds.add(second);
    }
    expect(seconds.size).toBeGreaterThan(20);
  });

  it.each(PUZZLE_LEVELS)('holds the needle in any band long enough, and never lets it skip one, at level %i', level => {
    const width = PUZZLE_CURVE[level].catchWidth;
    const starts = new Set<number>();
    for (let seed = 0; seed < 300; seed++) for (const start of catchBands(createRng(seed), width)) starts.add(start);
    const motions: readonly CatchMotion[] = ['slide', 'swing', 'rise'];
    const samples = 4000;
    for (const motion of motions) {
      // The outward half-sweep, finely sampled; the way back mirrors it.
      const track = Array.from({ length: samples + 1 }, (_, i) => needleAt(i / samples, motion));
      for (const start of starts) {
        const dwell = track.filter(position => inBand(position, start, width)).length / samples / NEEDLE_PACE;
        expect(dwell).toBeGreaterThanOrEqual(FAIR_WINDOW);
      }
      const longestStep = Math.max(...track.map((position, i) => Math.abs(needleAt(i / samples + SLOWEST_FRAME * NEEDLE_PACE, motion) - position)));
      expect(longestStep).toBeLessThan(width);
    }
  });
});

/** Every container of a pile, by its index in the spot's list (the first `loud` are the loud ones). */
const PILE = Array.from({ length: RUMMAGE.items }, (_, i) => i);
const choose = (n: number, k: number): number => (k === 0 ? 1 : (choose(n - 1, k - 1) * n) / k);

/**
 * Whether some way of testing always names both good containers, whichever two they are: every untested
 * container is tried as the next test, against both of its answers, until the noise runs out.
 */
function alwaysFinds(shape: RummageShape, untested: readonly number[] = PILE, wanted: number = RUMMAGE.wanted, noise = shape.noise): boolean {
  if (wanted === 0 || untested.length === wanted) return true;
  return untested.some(item => {
    const cost = probeCost(item, shape);
    if (cost > noise) return false;
    const rest = untested.filter(other => other !== item);
    return alwaysFinds(shape, rest, wanted - 1, noise - cost) && alwaysFinds(shape, rest, wanted, noise - cost);
  });
}

/**
 * How often a careless player wins, over every deal: he tests any container the noise still covers, at
 * random, until the answers name both good ones or nothing more can be tested, then guesses the rest.
 */
function carelessOdds(shape: RummageShape): number {
  const memo = new Map<string, number>();
  const odds = (untested: readonly number[], wanted: number, noise: number): number => {
    if (wanted === 0 || untested.length === wanted) return 1;
    const key = `${untested.join()}|${wanted}|${noise}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const affordable = untested.filter(item => probeCost(item, shape) <= noise);
    const good = wanted / untested.length;
    const result = affordable.length === 0
      ? 1 / choose(untested.length, wanted)
      : affordable.reduce((sum, item) => {
        const rest = untested.filter(other => other !== item);
        const left = noise - probeCost(item, shape);
        return sum + (good * odds(rest, wanted - 1, left) + (1 - good) * odds(rest, wanted, left)) / affordable.length;
      }, 0);
    memo.set(key, result);
    return result;
  };
  return odds(PILE, RUMMAGE.wanted, shape.noise);
}

/** Fair: skill always finds both good containers, and carelessness can be left with a guess. */
const isFair = (shape: RummageShape): boolean => alwaysFinds(shape) && carelessOdds(shape) < 1;

describe('rummage', () => {
  /** Tests in `plan` order while noise lasts, then grabs what the results prove; null when it must guess. */
  function play(pile: Rummage, plan: (pile: Rummage) => number[]): TakeResult[] | null {
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
  const quietFirst = (pile: Rummage) => [...pile.order].sort((a, b) => pile.cost(a) - pile.cost(b));
  const loudFirst = (pile: Rummage) => [...pile.order].sort((a, b) => pile.cost(b) - pile.cost(a));

  it.each(PUZZLE_LEVELS)('has a way of testing that names both good containers in every deal, with not one noise to spare, at level %i', level => {
    const shape = PUZZLE_CURVE[level].rummage;
    expect(alwaysFinds(shape)).toBe(true);
    expect(alwaysFinds({ ...shape, noise: shape.noise - 1 })).toBe(false);
  });

  it.each(PUZZLE_LEVELS)('always lets a player who tests the quiet containers first find both good ones at level %i', level => {
    const shape = PUZZLE_CURVE[level].rummage;
    const dealt = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const pile = new Rummage(createRng(seed), shape);
      dealt.add(PILE.filter(item => pile.reveal(item).good).join('+'));
      expect(play(pile, quietFirst)).toEqual(['kept', 'done']);
    }
    // Every pair of good containers the pile can hide comes up.
    expect(dealt.size).toBe(choose(RUMMAGE.items, RUMMAGE.wanted));
  });

  it.each(PUZZLE_LEVELS)('can leave a guess to a player who tests the noisy containers first at level %i', level => {
    const shape = PUZZLE_CURVE[level].rummage;
    expect(carelessOdds(shape)).toBeLessThan(1);
    const guesses = Array.from({ length: 300 }, (_, seed) => play(new Rummage(createRng(seed), shape), loudFirst)).filter(result => result === null);
    expect(guesses.length).toBeGreaterThan(30);
  });

  it('refuses a test the noise cannot cover and ends the attempt on a wrong grab', () => {
    const pile = new Rummage(createRng(5), PUZZLE_CURVE[0].rummage);
    for (const item of [0, 1, 2]) expect(pile.probe(item)).not.toBeNull();
    expect(pile.noiseLeft).toBe(1);
    expect(pile.canProbe(3)).toBe(true);
    pile.probe(3);
    expect(pile.probe(4)).toBeNull();
    expect(pile.probe(0)).toEqual(pile.reveal(0));
    const junk = pile.order.find(item => !pile.reveal(item).good)!;
    expect(pile.take(junk)).toBe('wrong');
  });

  it('sounds the same in both languages, with several recordings of every gesture', () => {
    const recorded = Object.keys(Object.values(import.meta.glob<Record<string, unknown>>('../public/assets/audio/manifest.json', { eager: true, import: 'default' }))[0] ?? {});
    const sounds = (book: typeof scavengeFr) =>
      Object.values(book.spots).flatMap(spots => Object.entries(spots).flatMap(([key, puzzle]) => (puzzle.kind === 'rummage' ? [`${key}:${puzzle.sound}`] : [])));
    expect(sounds(scavengeEn)).toEqual(sounds(scavengeFr));
    expect(sounds(scavengeFr)).toHaveLength(5);
    for (const sound of new Set(sounds(scavengeFr).map(entry => entry.split(':')[1]))) {
      expect(recorded.filter(id => id.startsWith(`probe_${sound}_`)).length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('scale tags', () => {
  it.each(PUZZLE_LEVELS)('shows distinct tags, two of which always make up the target, at level %i', level => {
    const shape = PUZZLE_CURVE[level].scale;
    for (let seed = 0; seed < 300; seed++) {
      const { weights, target } = scaleWeights(createRng(seed), shape);
      expect(weights).toHaveLength(shape.tags);
      expect(new Set(weights).size).toBe(shape.tags);
      expect(Math.min(...weights)).toBeGreaterThanOrEqual(1);
      expect(Math.max(...weights)).toBeLessThanOrEqual(shape.heaviest);
      expect(weights.some((a, i) => weights.some((b, j) => i < j && a + b === target))).toBe(true);
    }
  });
});

describe('the puzzle difficulty curve', () => {
  it('keeps the opening days at the first level and reaches the last on the final day', () => {
    const levels = Array.from({ length: LAST_NIGHT }, (_, i) => puzzleLevel({ day: i + 1 }));
    expect(levels).toEqual([0, 0, 0, 1, 1, 2, 2]);
    expect(levels[LAST_NIGHT - 1]).toBe(PUZZLE_LEVELS[PUZZLE_LEVELS.length - 1]);
  });

  it('never makes a later level easier than an earlier one', () => {
    for (const level of PUZZLE_LEVELS.slice(1)) {
      const now = PUZZLE_CURVE[level];
      const before = PUZZLE_CURVE[(level - 1) as PuzzleLevel];
      expect(now.catchWidth).toBeLessThan(before.catchWidth);
      expect(now.ringPace).toBeGreaterThan(before.ringPace);
      expect(now.circuit.side).toBeGreaterThanOrEqual(before.circuit.side);
      expect(now.circuit.minRoute).toBeGreaterThanOrEqual(before.circuit.minRoute);
      expect(now.scale.tags).toBeGreaterThan(before.scale.tags);
      expect(now.scale.heaviest).toBeGreaterThan(before.scale.heaviest);
      expect(now.rummage.noise).toBeLessThanOrEqual(before.rummage.noise);
      expect(now.rummage.loudCost).toBeGreaterThanOrEqual(before.rummage.loudCost);
      expect(carelessOdds(now.rummage)).toBeLessThan(carelessOdds(before.rummage));
    }
  });

  it('ends on the harshest rummage that stays fair', () => {
    // Every pile of one to five loud containers at double or triple cost, with any noise that keeps it fair.
    const costs: readonly LoudCost[] = [2, 3];
    const fair = PILE.slice(1).flatMap(loud => costs.flatMap(loudCost =>
      Array.from({ length: 16 }, (_, noise) => ({ loud, loudCost, noise })).filter(isFair)));
    const last = PUZZLE_CURVE[PUZZLE_LEVELS[PUZZLE_LEVELS.length - 1]!].rummage;
    expect(Math.min(...fair.map(carelessOdds))).toBeCloseTo(carelessOdds(last), 9);
    // The least fair noise is the whole pile's cost but one loud container's, and every level uses it.
    const leastNoise = (shape: RummageShape) => PILE.reduce((sum, item) => sum + probeCost(item, shape), 0) - shape.loudCost;
    for (const shape of fair) expect(shape.noise).toBeGreaterThanOrEqual(leastNoise(shape));
    for (const level of PUZZLE_LEVELS) expect(PUZZLE_CURVE[level].rummage.noise).toBe(leastNoise(PUZZLE_CURVE[level].rummage));
  });

  it('deals the opening days exactly the boards they had before the curve', () => {
    // Recorded from the generators before they took a difficulty.
    const opening = PUZZLE_CURVE[0];
    expect(circuitTiles(createRng(1), opening.circuit)).toEqual({ side: 3, tiles: [5, 9, 5, 6, 10, 10, 3, 3, 3], inlet: 1, outlet: 0 });
    expect(circuitTiles(createRng(2), opening.circuit)).toEqual({ side: 3, tiles: [10, 3, 10, 3, 9, 10, 12, 5, 3], inlet: 2, outlet: 0 });
    expect(catchBands(createRng(1), opening.catchWidth)).toEqual([0.28, 0.59]);
    expect(new Padlock(createRng(1), opening.ringPace)).toMatchObject({ angles: [209, 65, 186], speeds: [94, -116, 142] });
    expect(scaleWeights(createRng(1), opening.scale)).toEqual({ weights: [5, 3, 7, 2, 8], target: 5 });
    expect(scaleWeights(createRng(2), opening.scale)).toEqual({ weights: [8, 7, 5, 4, 1], target: 6 });
    const pile = (seed: number) => {
      const dealt = new Rummage(createRng(seed), opening.rummage);
      return { order: dealt.order, good: PILE.filter(item => dealt.reveal(item).good), costs: PILE.map(item => dealt.cost(item)), noise: dealt.noiseLeft };
    };
    expect(pile(1)).toEqual({ order: [4, 1, 5, 2, 0, 3], good: [0, 4], costs: [2, 2, 1, 1, 1, 1], noise: 6 });
    expect(pile(2)).toEqual({ order: [0, 2, 3, 5, 1, 4], good: [0, 5], costs: [2, 2, 1, 1, 1, 1], noise: 6 });
  });
});

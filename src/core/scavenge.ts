// A hotspot's setup comes from its own seed. Looking inside never consumes the campaign's loot RNG.
import type { SpotKey } from './data/locations';
import { createRng, type Rng } from './rng';
import type { LocationId } from './types';

type Three = readonly [string, string, string];
type Six = readonly [string, string, string, string, string, string];

/** `gauge` names the number the two tags must make up: a gap, a height, an overload. */
export const scale = (title: string, clue: string, unit: string, gauge: string) => ({ kind: 'scale' as const, title, clue, unit, gauge });
export const circuit = (title: string, clue: string) => ({ kind: 'circuit' as const, title, clue });
/** `slide` runs along a bench, `swing` hangs from a pivot, `rise` lifts and drops. */
export type CatchMotion = 'slide' | 'swing' | 'rise';
export const timing = (title: string, clue: string, action: string, motion: CatchMotion = 'slide') => ({ kind: 'timing' as const, title, clue, action, motion });
/** What a rummage test sounds like: a container rattled, lifted and set down, or plastic felt through. */
export type ProbeSound = 'shake' | 'weigh' | 'feel';
/**
 * Six containers to probe with `probe` (shake, weigh, feel), heard as `sound`. The loot sounds like
 * `good`; the rest like one of `junk`. See `Rummage` for the rules.
 */
export const rummage = (title: string, clue: string, probe: string, items: Six, good: string, junk: readonly [string, string], sound: ProbeSound) =>
  ({ kind: 'rummage' as const, title, clue, probe, items, good, junk, sound });
export const padlock = (title: string, clue: string) => ({ kind: 'padlock' as const, title, clue });
/** The distraction lands at a safe target, or at one of two targets with distinct consequences. */
export const records = (title: string, clue: string, albums: Three, target: string, decoys: readonly [readonly [string, string], readonly [string, string]]) =>
  ({ kind: 'records' as const, title, clue, albums, target, decoys });
export const directory = (title: string, clue: string, entries: Three) => ({ kind: 'directory' as const, title, clue, entries });
export const vachette = (title: string, clue: string) => ({ kind: 'vachette' as const, title, clue });
export type Puzzle = ReturnType<typeof scale | typeof circuit | typeof timing | typeof rummage | typeof padlock | typeof records | typeof directory | typeof vachette>;
export type PuzzleBook = { readonly [L in LocationId]: Record<SpotKey<L>, Puzzle> };

/**
 * `attempt` separates paid attempts: a retry, or a return on another visit, deals a fresh board.
 * Closing the panel before the first move keeps the same attempt, so peeking cannot reroll it.
 */
export function spotRng(seed: number, location: LocationId, key: string, attempt = ''): Rng {
  let hash = seed;
  for (const char of location + '/' + key + '#' + attempt) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return createRng(hash);
}

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

// Ports are clockwise, starting at north. Every tile has exactly two ends.
export const PORTS = [1, 2, 4, 8] as const;
export const turnTile = (ports: number): number => ((ports << 1) & 15) | (ports >> 3);

/** Pieces per side of a circuit board: 3×3 for most of the run, 4×4 at the end. */
export type CircuitSide = 3 | 4;
/** `minRoute` is the shortest solution route preferred when the terminals allow one that long. */
export interface CircuitShape {
  readonly side: CircuitSide;
  readonly minRoute: number;
}

const WEST = 8;
const EAST = 2;
const opposite = (port: number): number => ((port << 2) | (port >> 2)) & 15;
const step = (cell: number, port: number, side: number): number | null => {
  const row = Math.floor(cell / side);
  const col = cell % side;
  if (port === 1) return row > 0 ? cell - side : null;
  if (port === 4) return row < side - 1 ? cell + side : null;
  if (port === 2) return col < side - 1 ? cell + 1 : null;
  return col > 0 ? cell - 1 : null;
};

/** The feed enters the left column and must leave the right column, each on its own row. */
export interface CircuitBoard {
  readonly side: CircuitSide;
  readonly tiles: number[];
  readonly inlet: number;
  readonly outlet: number;
}

export function traceCircuit({ side, tiles, inlet, outlet }: CircuitBoard): { lit: Set<number>; complete: boolean } {
  const lit = new Set<number>();
  let cell: number | null = inlet * side;
  let entry = WEST;
  while (cell !== null && !lit.has(cell) && (tiles[cell]! & entry)) {
    lit.add(cell);
    const exit: number = tiles[cell]! ^ entry;
    if (exit === EAST && cell === outlet * side + side - 1) return { lit, complete: true };
    cell = step(cell, exit, side);
    entry = opposite(exit);
  }
  return { lit, complete: false };
}

/** Every self-avoiding walk from the inlet cell to the outlet cell, as ordered cell lists. */
function routes(side: number, inlet: number, outlet: number): number[][] {
  const goal = outlet * side + side - 1;
  const found: number[][] = [];
  const walk = (path: number[]): void => {
    const cell = path[path.length - 1]!;
    if (cell === goal) {
      found.push(path);
      return;
    }
    for (const port of PORTS) {
      const next = step(cell, port, side);
      if (next !== null && !path.includes(next)) walk([...path, next]);
    }
  };
  walk([inlet * side]);
  return found;
}

const MIN_SCRAMBLED = 3;

export function circuitTiles(rng: Rng, { side, minRoute }: CircuitShape): CircuitBoard {
  // Terminals move between boards so the solution is never the same shape twice in a row.
  const inlet = rng.int(0, side - 1);
  const outlet = rng.int(0, side - 1);
  const candidates = routes(side, inlet, outlet);
  // Prefer winding routes; a straight dash across the board reads as no puzzle at all.
  const winding = candidates.filter(route => route.length >= minRoute);
  const route = rng.pick(winding.length > 0 ? winding : candidates);

  const solved = Array<number>(side * side).fill(0);
  route.forEach((cell, i) => {
    const from = i === 0 ? WEST : PORTS.find(port => step(cell, port, side) === route[i - 1])!;
    const to = i === route.length - 1 ? EAST : PORTS.find(port => step(cell, port, side) === route[i + 1])!;
    solved[cell] = from | to;
  });
  // Off-route cells hold spare pieces that look just as plausible as the real ones.
  for (let cell = 0; cell < solved.length; cell++) if (!solved[cell]) solved[cell] = rng.pick([3, 5]);

  for (;;) {
    const tiles = solved.map(tile => {
      let turned = tile;
      for (let n = rng.int(0, 3); n > 0; n--) turned = turnTile(turned);
      return turned;
    });
    const scrambled = route.filter(cell => tiles[cell] !== solved[cell]).length;
    const board = { side, tiles, inlet, outlet };
    if (scrambled >= Math.min(MIN_SCRAMBLED, route.length) && !traceCircuit(board).complete) return board;
  }
}

/** The scale shows `tags` distinct weights drawn from 1 to `heaviest`. */
export interface ScaleShape {
  readonly tags: number;
  readonly heaviest: number;
}

/** Weights in display order, and a target that two of them always make up. Any pair that does is accepted. */
export function scaleWeights(rng: Rng, { tags, heaviest }: ScaleShape): { weights: number[]; target: number } {
  const drawn = shuffled(Array.from({ length: heaviest }, (_, i) => i + 1), rng).slice(0, tags);
  return { weights: shuffled(drawn, rng), target: drawn[0]! + drawn[1]! };
}

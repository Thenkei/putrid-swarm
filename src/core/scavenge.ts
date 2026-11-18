// A hotspot's setup comes from its own seed. Looking inside never consumes the campaign's loot RNG.
import type { SpotKey } from './data/locations';
import { createRng, type Rng } from './rng';
import type { LocationId } from './types';

type Three = readonly [string, string, string];

export const scale = (title: string, clue: string, unit: string) => ({ kind: 'scale' as const, title, clue, unit });
export const pairs = (title: string, clue: string, faces: Three) => ({ kind: 'pairs' as const, title, clue, faces });
export const circuit = (title: string, clue: string) => ({ kind: 'circuit' as const, title, clue });
export const timing = (title: string, clue: string, action: string) => ({ kind: 'timing' as const, title, clue, action });
export const padlock = (title: string, clue: string) => ({ kind: 'padlock' as const, title, clue });
// The first answer solves the clue. Its position on screen is shuffled.
export const riddle = (title: string, clue: string, answers: Three, hint: string) => ({ kind: 'riddle' as const, title, clue, answers, hint });
export type Puzzle = ReturnType<typeof scale | typeof pairs | typeof circuit | typeof timing | typeof padlock | typeof riddle>;
export type PuzzleBook = { readonly [L in LocationId]: Record<SpotKey<L>, Puzzle> };

export function spotRng(seed: number, location: LocationId, key: string): Rng {
  let hash = seed;
  for (const char of location + '/' + key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
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

export function traceCircuit(tiles: readonly number[]): { lit: Set<number>; complete: boolean } {
  const lit = new Set<number>();
  let cell = 3;
  let inlet = 8;
  while (!lit.has(cell) && (tiles[cell]! & inlet)) {
    lit.add(cell);
    const outlet = tiles[cell]! ^ inlet;
    if (outlet === 2 && cell === 5) return { lit, complete: true };
    if ((outlet === 8 && cell % 3 === 0) || (outlet === 2 && cell % 3 === 2)) break;
    cell += outlet === 1 ? -3 : outlet === 2 ? 1 : outlet === 4 ? 3 : -1;
    if (cell < 0 || cell > 8) break;
    inlet = ((outlet << 2) | (outlet >> 2)) & 15;
  }
  return { lit, complete: false };
}

export function circuitTiles(rng: Rng): number[] {
  // Cross the first seam above or below the terminals and the second at a different height.
  const first = rng.pick([0, 2]);
  const rows = [1, first, rng.pick([1, 2 - first]), 1];
  const tiles = Array<number>(9).fill(0);
  for (let col = 0; col < 3; col++) {
    let row = rows[col]!;
    const end = rows[col + 1]!;
    let inlet = 8;
    while (row !== end) {
      const down = row < end;
      tiles[row * 3 + col] = inlet | (down ? 4 : 1);
      inlet = down ? 1 : 4;
      row += down ? 1 : -1;
    }
    tiles[end * 3 + col] = inlet | 2;
  }
  for (let i = 0; i < tiles.length; i++) {
    let tile = tiles[i] || rng.pick([3, 5]);
    const turns = rng.int(0, 3);
    for (let n = 0; n < turns; n++) tile = turnTile(tile);
    tiles[i] = tile;
  }
  if (traceCircuit(tiles).complete) {
    while (tiles[3]! & 8) tiles[3] = turnTile(tiles[3]!);
  }
  return tiles;
}

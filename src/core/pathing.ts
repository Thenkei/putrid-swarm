// Distance fields over the lot grid. Every infected follows the gradient of one of these fields,
// so "where will they walk?" has a single answer shared by the simulation and the route preview.

import { GRID_H, GRID_W, SPAWN_CELLS, idx, inGrid, isStaticBlocked } from './map';
import type { Cell, SectorId } from './types';
import { SECTOR_IDS } from './types';

export type Field = Float32Array;

const SQRT2 = Math.SQRT2;
const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

export interface FieldOptions {
  /** Cells that block this kind of walker, on top of walls and scenery. */
  readonly blocked?: ReadonlySet<number>;
  /** Cells that can be crossed at a price (a palisade to smash through, for breakers). */
  readonly costly?: ReadonlySet<number>;
  readonly costlyPenalty?: number;
}

/**
 * Dijkstra from `target` outward. `field[i]` is the walking distance from cell i to the target,
 * or Infinity when unreachable. Diagonal steps never cut the corner of a blocked cell.
 */
export function computeField(target: Cell, options: FieldOptions = {}): Field {
  const field = new Float32Array(GRID_W * GRID_H).fill(Infinity);
  const blocked = options.blocked;
  const costly = options.costly;
  const penalty = options.costlyPenalty ?? 0;
  const solid = (x: number, y: number): boolean => isStaticBlocked(x, y) || (blocked?.has(idx(x, y)) ?? false);

  // The grid is 22x22: a simple array-backed frontier is faster than a heap here.
  const open: number[] = [idx(target.x, target.y)];
  field[idx(target.x, target.y)] = 0;
  const queued = new Uint8Array(GRID_W * GRID_H);

  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if ((field[open[i] as number] as number) < (field[open[best] as number] as number)) best = i;
    const current = open.splice(best, 1)[0] as number;
    queued[current] = 0;
    const cx = current % GRID_W;
    const cy = Math.floor(current / GRID_W);
    const base = field[current] as number;

    for (const [dx, dy, step] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inGrid(nx, ny) || solid(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (solid(cx + dx, cy) || solid(cx, cy + dy))) continue;
      const ni = idx(nx, ny);
      const cost = base + step + (costly?.has(ni) ? penalty : 0);
      if (cost < (field[ni] as number)) {
        field[ni] = cost;
        if (!queued[ni]) {
          queued[ni] = 1;
          open.push(ni);
        }
      }
    }
  }
  return field;
}

/**
 * The neighbouring cell to step into from (x, y) when descending `field`, or null when already
 * at the target / nowhere to go. `blocked` must be the set the field was built with.
 */
export function nextStep(field: Field, x: number, y: number, blocked?: ReadonlySet<number>): Cell | null {
  const solid = (sx: number, sy: number): boolean => isStaticBlocked(sx, sy) || (blocked?.has(idx(sx, sy)) ?? false);
  let bestValue = field[idx(x, y)] ?? Infinity;
  let best: Cell | null = null;
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inGrid(nx, ny) || solid(nx, ny)) continue;
    if (dx !== 0 && dy !== 0 && (solid(x + dx, y) || solid(x, y + dy))) continue;
    const value = field[idx(nx, ny)] as number;
    if (value < bestValue) {
      bestValue = value;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

/** Full walking route from a cell to the field's target (used for the preparation preview). */
export function traceRoute(field: Field, from: Cell, blocked?: ReadonlySet<number>): Cell[] {
  const route: Cell[] = [from];
  let current = from;
  for (let guard = 0; guard < GRID_W * GRID_H; guard++) {
    const step = nextStep(field, current.x, current.y, blocked);
    if (!step) break;
    route.push(step);
    current = step;
  }
  return route;
}

export interface RouteAudit {
  /** Sectors whose tree line can no longer reach any door on foot. */
  readonly sealed: readonly SectorId[];
}

/**
 * The placement rule: from every stretch of tree line, a walking villager must still be able to
 * reach at least one door. `fences` is the full set of blocking cells being tested.
 */
export function auditRoutes(fences: ReadonlySet<number>, entries: Readonly<Record<SectorId, Cell>>): RouteAudit {
  const fields = SECTOR_IDS.map((sector) => computeField(entries[sector], { blocked: fences }));
  const sealed = SECTOR_IDS.filter((sector) =>
    SPAWN_CELLS[sector].some((cell) => fields.every((field) => !Number.isFinite(field[idx(cell.x, cell.y)]))),
  );
  return { sealed };
}

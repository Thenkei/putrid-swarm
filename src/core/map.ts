// The homestead lot: one authoritative grid shared by preparation, simulation and every camera.
//
// Axes: +y runs toward the gate ("portail"), +x toward the barn ("grange"),
// -y toward the back garden ("arrière"), -x toward the orchard ("verger").

import { smoothstep } from './math';
import type { Cell, SectorId } from './types';

export const GRID_W = 22;
export const GRID_H = 22;

/** The two ways out of the lot run on past the tree line: the drive to the gate and the track to the barn road. */
export const TRACKS = {
  /** The allée: cells x 10..11, leaving through the gate side (+y). */
  gate: { x0: 10, x1: 12 },
  /** The gravel track: cells y 11..12, leaving on the barn side (+x). */
  barn: { y0: 11, y1: 13 },
} as const;

/** The gateways stay straight across the lot; deeper in the woods their tracks find a way between stands. */
export function roadCentre(road: keyof typeof TRACKS, along: number): number {
  const gate = road === 'gate';
  const distance = Math.max(0, along - (gate ? GRID_H : GRID_W) - 1.8);
  const turn = smoothstep(0, 7, distance);
  const bend = gate ? 2.3 * Math.sin(distance * 0.23) + 1.2 * Math.sin(distance * 0.11) :
    -2.0 * Math.sin(distance * 0.26) - 1.65 * Math.sin(distance * 0.08);
  return (gate ? (TRACKS.gate.x0 + TRACKS.gate.x1) : (TRACKS.barn.y0 + TRACKS.barn.y1)) / 2 + turn * bend;
}

export const HOUSE = { x0: 9, y0: 9, x1: 12, y1: 12 } as const;
export const HOUSE_CENTER = { x: 11, y: 11 } as const;

export type Terrain = 'grass' | 'path' | 'gravel' | 'forest' | 'house';

export const idx = (x: number, y: number): number => y * GRID_W + x;
export const inGrid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
export const cellOf = (i: number): Cell => ({ x: i % GRID_W, y: Math.floor(i / GRID_W) });

/** The cell in front of each door; infected gather here to attack the barricade. */
export const ENTRIES: Readonly<Record<SectorId, Cell>> = {
  portail: { x: 10, y: 13 },
  grange: { x: 13, y: 11 },
  arriere: { x: 11, y: 8 },
  verger: { x: 8, y: 10 },
};

export type PropKind = 'car' | 'well' | 'woodpile' | 'veg' | 'apple' | 'oak' | 'rock' | 'barrel' | 'mailbox' | 'bush';

export interface Prop {
  readonly kind: PropKind;
  readonly x: number;
  readonly y: number;
  /** Footprint in cells (blocking). */
  readonly w: number;
  readonly h: number;
}

export const PARKED_CAR = { kind: 'car', x: 15, y: 13, w: 2, h: 3 } as const satisfies Prop;

export const MAILBOX = { kind: 'mailbox', x: 12, y: 19, w: 1, h: 1 } as const satisfies Prop;

/** Fixed scenery. Every prop blocks movement and building on its footprint. */
export const PROPS: readonly Prop[] = [
  PARKED_CAR,
  { kind: 'woodpile', x: 14, y: 8, w: 1, h: 1 },
  { kind: 'barrel', x: 13, y: 13, w: 1, h: 1 },
  { kind: 'veg', x: 8, y: 4, w: 2, h: 1 },
  { kind: 'veg', x: 13, y: 5, w: 2, h: 1 },
  { kind: 'well', x: 15, y: 6, w: 1, h: 1 },
  { kind: 'apple', x: 4, y: 8, w: 1, h: 1 },
  { kind: 'apple', x: 5, y: 12, w: 1, h: 1 },
  { kind: 'apple', x: 3, y: 14, w: 1, h: 1 },
  { kind: 'oak', x: 5, y: 4, w: 1, h: 1 },
  { kind: 'rock', x: 17, y: 17, w: 1, h: 1 },
  MAILBOX,
  { kind: 'bush', x: 6, y: 17, w: 1, h: 1 },
  { kind: 'bush', x: 17, y: 4, w: 1, h: 1 },
];

const terrain = new Array<Terrain>(GRID_W * GRID_H).fill('grass');
const staticBlocked = new Uint8Array(GRID_W * GRID_H);

for (let y = 0; y < GRID_H; y++) {
  for (let x = 0; x < GRID_W; x++) {
    const i = idx(x, y);
    if (x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1) terrain[i] = 'forest';
    // Grande allée: from the gate to the porch.
    if ((x === 10 || x === 11) && y >= 13) terrain[i] = 'path';
    // Track to the barn and the patch where the break is parked.
    if (y >= 11 && y <= 12 && x >= 13) terrain[i] = 'gravel';
    if (x >= 14 && x <= 17 && y >= 13 && y <= 16) terrain[i] = 'gravel';
    // Worn earth behind the kitchen door and toward the orchard.
    if (x === 11 && y <= 8 && y >= 6) terrain[i] = 'path';
    if (y === 10 && x <= 8 && x >= 7) terrain[i] = 'path';
    if (x >= HOUSE.x0 && x <= HOUSE.x1 && y >= HOUSE.y0 && y <= HOUSE.y1) {
      terrain[i] = 'house';
      staticBlocked[i] = 1;
    }
  }
}
for (const prop of PROPS) {
  for (let dy = 0; dy < prop.h; dy++) for (let dx = 0; dx < prop.w; dx++) staticBlocked[idx(prop.x + dx, prop.y + dy)] = 1;
}

export const terrainAt = (x: number, y: number): Terrain => terrain[idx(x, y)] ?? 'forest';
/** House walls and scenery: never walkable, never buildable. */
export const isStaticBlocked = (x: number, y: number): boolean => !inGrid(x, y) || staticBlocked[idx(x, y)] === 1;

const entryCells = new Set(Object.values(ENTRIES).map((c) => idx(c.x, c.y)));
export const isEntryCell = (x: number, y: number): boolean => entryCells.has(idx(x, y));

/**
 * Buildable = inside the lot (two cells clear of the tree line so spawns can never be boxed in),
 * not scenery, and not the doorstep itself.
 */
export function isBuildable(x: number, y: number): boolean {
  if (x < 2 || y < 2 || x > GRID_W - 3 || y > GRID_H - 3) return false;
  if (isStaticBlocked(x, y)) return false;
  if (isEntryCell(x, y)) return false;
  return true;
}

/** Which camera watches a cell. The lot is split along the diagonals through the house. */
export function sectorOf(x: number, y: number): SectorId {
  const dx = x + 0.5 - HOUSE_CENTER.x;
  const dy = y + 0.5 - HOUSE_CENTER.y;
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? 'portail' : 'arriere';
  return dx >= 0 ? 'grange' : 'verger';
}

/** Tree-line cells where the infected walk out of the forest, per sector. */
export const SPAWN_CELLS: Readonly<Record<SectorId, readonly Cell[]>> = {
  portail: range(4, 17).map((x) => ({ x, y: GRID_H - 1 })),
  arriere: range(4, 17).map((x) => ({ x, y: 0 })),
  grange: range(4, 17).map((y) => ({ x: GRID_W - 1, y })),
  verger: range(4, 17).map((y) => ({ x: 0, y })),
};

/** The straight line a charging mower follows toward each door, from the tree line inward. */
export const LANES: Readonly<Record<SectorId, readonly Cell[]>> = {
  portail: range(ENTRIES.portail.y, GRID_H - 1)
    .reverse()
    .map((y) => ({ x: ENTRIES.portail.x, y })),
  arriere: range(0, ENTRIES.arriere.y).map((y) => ({ x: ENTRIES.arriere.x, y })),
  grange: range(ENTRIES.grange.x, GRID_W - 1)
    .reverse()
    .map((x) => ({ x, y: ENTRIES.grange.y })),
  verger: range(0, ENTRIES.verger.x).map((x) => ({ x, y: ENTRIES.verger.y })),
};

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v++) out.push(v);
  return out;
}

/** The piece of scenery of one of `kinds` whose footprint holds that point of the grid, if any. */
export const propAt = (gx: number, gy: number, kinds: readonly PropKind[]): PropKind | null =>
  PROPS.find((p) => kinds.includes(p.kind) && gx >= p.x && gx < p.x + p.w && gy >= p.y && gy < p.y + p.h)?.kind ?? null;

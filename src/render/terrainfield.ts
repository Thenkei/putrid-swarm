// How much of each kind of ground there is at every point of the lot, in grid space.
//
// The map says which terrain a cell has; drawn as is, that gives ruler-straight borders. Here the
// borders are bent by low-frequency noise and frayed by a finer one, then resolved into blend
// weights that always add up to one, so no seam of bare canvas can open between two terrains.
// Everything is computed in grid coordinates and without a canvas: both sides of the house and all
// four cameras paint from the same field, and it can be checked without a browser.

import { GRID_H, GRID_W, inGrid, terrainAt, type Terrain } from '../core/map';
import { clamp01, fbm, smoothstep } from './noise';

export type GroundTerrain = Exclude<Terrain, 'house'>;

/** Paint order, bottom to top: the forest floor is everywhere, turf lies over whatever it meets. */
export const GROUND_TERRAINS = ['forest', 'path', 'gravel', 'grass'] as const satisfies readonly GroundTerrain[];

/** Cells of forest floor kept around the lot. */
export const FIELD_MARGIN = 6;

export interface TerrainField {
  /** Samples per cell. */
  readonly pxPerCell: number;
  /** Samples per side. */
  readonly size: number;
  /** Grid coordinate of the field's first corner (the same on both axes). */
  readonly origin: number;
  /** Cells covered per side. */
  readonly extent: number;
  /** Per terrain, the share of it at each sample; the four shares add up to one. */
  readonly weights: Readonly<Record<GroundTerrain, Float32Array>>;
  /** -1..1: slow drift of light and colour over the lot, so a tiled swatch never reads as tiles. */
  readonly tone: Float32Array;
  /** 0..1: where a second, turned copy of each swatch shows through the first. */
  readonly blend: Float32Array;
}

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

/** True on a way out beyond the lot, or within `clearance` cells of one: nothing grows there. */
export function onTrack(gx: number, gy: number, clearance = 0): boolean {
  if (gy >= GRID_H - 1) {
    const offset = gx - roadCentre('gate', gy);
    if (offset >= -1 - clearance && offset < 1 + clearance) return true;
  }
  if (gx >= GRID_W - 1) {
    const offset = gy - roadCentre('barn', gx);
    if (offset >= -1 - clearance && offset < 1 + clearance) return true;
  }
  return false;
}

/**
 * The terrain painted at a grid point. The house stands on packed earth; beyond the lot is forest,
 * except where the two ways out carry on through it.
 */
export function groundTerrainAt(gx: number, gy: number): GroundTerrain {
  const x = Math.floor(gx);
  const y = Math.floor(gy);
  if (!inGrid(x, y)) {
    if (!onTrack(gx, gy)) return 'forest';
    return gy >= GRID_H ? 'path' : 'gravel';
  }
  const terrain = terrainAt(x, y);
  if ((terrain === 'grass' || terrain === 'forest') && Math.min(gx, gy, GRID_W - gx, GRID_H - gy) < 3.5) {
    // Leaf litter drifts into the turf at the woodland edge and rounds off the corners of the clearing.
    const radius = 3.6;
    const dx = Math.abs(gx - GRID_W / 2) - (GRID_W / 2 - 1 - radius);
    const dy = Math.abs(gy - GRID_H / 2) - (GRID_H / 2 - 1 - radius);
    const distance = Math.hypot(Math.max(0, dx), Math.max(0, dy)) + Math.min(0, Math.max(dx, dy)) - radius;
    const margin = (fbm(gx * 0.23, gy * 0.23, 871, 2) - 0.5) * 3.2;
    return distance > margin ? 'forest' : 'grass';
  }
  return terrain === 'house' ? 'path' : terrain;
}

const SEED = 20261117;
/** How far a border wanders from the cell line, in cells. */
const WARP = 0.72;
const WARP_FREQUENCY = 0.5;
/** Half-width of the band over which two terrains meet, in cells. */
const SOFTEN = 0.41;
/** How ragged each terrain's edge is: turf frays, a dirt track does not. */
const FRAY: Readonly<Record<GroundTerrain, { readonly amount: number; readonly frequency: number }>> = {
  forest: { amount: 0.5, frequency: 1.7 },
  path: { amount: 0.3, frequency: 1.3 },
  gravel: { amount: 0.55, frequency: 3.1 },
  grass: { amount: 0.6, frequency: 2.4 },
};
/** Width of the transition once the winner is known, in height units: small is crisp. */
const CRISP = 0.28;

function boxBlur(source: Float32Array, size: number, radius: number): Float32Array {
  if (radius < 1) return source;
  const pass = (input: Float32Array, output: Float32Array, stride: number, lineStride: number): void => {
    const window = radius * 2 + 1;
    for (let line = 0; line < size; line++) {
      const base = line * lineStride;
      let sum = 0;
      // Edges repeat their last sample: the field ends in forest on every side.
      for (let k = -radius; k <= radius; k++) sum += input[base + Math.min(size - 1, Math.max(0, k)) * stride] as number;
      for (let i = 0; i < size; i++) {
        output[base + i * stride] = sum / window;
        const leaving = Math.max(0, i - radius);
        const entering = Math.min(size - 1, i + radius + 1);
        sum += (input[base + entering * stride] as number) - (input[base + leaving * stride] as number);
      }
    }
  };
  const horizontal = new Float32Array(source.length);
  const result = new Float32Array(source.length);
  pass(source, horizontal, 1, size);
  pass(horizontal, result, size, 1);
  return result;
}

let cached: TerrainField | null = null;

/** The field for the lot as mapped. Built once: the map never changes during a run. */
export function terrainField(pxPerCell = 20): TerrainField {
  if (cached && cached.pxPerCell === pxPerCell) return cached;
  cached = buildTerrainField(pxPerCell);
  return cached;
}

export function buildTerrainField(pxPerCell: number): TerrainField {
  const extent = Math.max(GRID_W, GRID_H) + 2 * FIELD_MARGIN;
  const size = extent * pxPerCell;
  const origin = -FIELD_MARGIN;
  const count = size * size;

  // 1. Which terrain each sample falls in, once the borders have been bent.
  const indicator: Record<GroundTerrain, Float32Array> = {
    forest: new Float32Array(count),
    path: new Float32Array(count),
    gravel: new Float32Array(count),
    grass: new Float32Array(count),
  };
  const tone = new Float32Array(count);
  const blend = new Float32Array(count);
  for (let py = 0; py < size; py++) {
    const gy = origin + (py + 0.5) / pxPerCell;
    for (let px = 0; px < size; px++) {
      const gx = origin + (px + 0.5) / pxPerCell;
      const i = py * size + px;
      const wx = (fbm(gx * WARP_FREQUENCY, gy * WARP_FREQUENCY, SEED, 2) - 0.5) * 2 * WARP;
      const wy = (fbm(gx * WARP_FREQUENCY + 31.7, gy * WARP_FREQUENCY - 12.3, SEED + 7, 2) - 0.5) * 2 * WARP;
      (indicator[groundTerrainAt(gx + wx, gy + wy)] as Float32Array)[i] = 1;
      tone[i] = (fbm(gx * 0.17, gy * 0.17, SEED + 21, 3) - 0.5) * 2.6 + (fbm(gx * 0.9, gy * 0.9, SEED + 22, 2) - 0.5) * 0.9;
      blend[i] = smoothstep(0.47, 0.55, fbm(gx * 0.55 + 9.1, gy * 0.55 + 4.3, SEED + 33, 3));
    }
  }

  // 2. Softened into gradients, then frayed: each terrain's share plus its own fine noise is its
  //    "height", and the tallest wins, with a narrow band where two of them are level.
  const radius = Math.max(1, Math.round(SOFTEN * pxPerCell));
  const soft = Object.fromEntries(GROUND_TERRAINS.map((terrain) => [terrain, boxBlur(boxBlur(indicator[terrain], size, radius), size, Math.max(1, radius >> 1))])) as Record<GroundTerrain, Float32Array>;
  const weights: Record<GroundTerrain, Float32Array> = {
    forest: new Float32Array(count),
    path: new Float32Array(count),
    gravel: new Float32Array(count),
    grass: new Float32Array(count),
  };
  const height = [0, 0, 0, 0];
  for (let py = 0; py < size; py++) {
    const gy = origin + (py + 0.5) / pxPerCell;
    for (let px = 0; px < size; px++) {
      const gx = origin + (px + 0.5) / pxPerCell;
      const i = py * size + px;
      let tallest = -Infinity;
      for (let k = 0; k < GROUND_TERRAINS.length; k++) {
        const terrain = GROUND_TERRAINS[k] as GroundTerrain;
        const share = soft[terrain][i] as number;
        // Deep inside one terrain nothing else has a share, and the noise is not even computed.
        const fray = share > 0.002 && share < 0.998 ? (fbm(gx * FRAY[terrain].frequency + k * 17.3, gy * FRAY[terrain].frequency - k * 9.1, SEED + 40 + k, 3) - 0.5) * FRAY[terrain].amount : 0;
        const h = share > 0.002 ? share + fray : -1;
        height[k] = h;
        if (h > tallest) tallest = h;
      }
      let total = 0;
      for (let k = 0; k < GROUND_TERRAINS.length; k++) {
        const w = clamp01(((height[k] as number) - (tallest - CRISP)) / CRISP);
        height[k] = w;
        total += w;
      }
      for (let k = 0; k < GROUND_TERRAINS.length; k++) (weights[GROUND_TERRAINS[k] as GroundTerrain] as Float32Array)[i] = (height[k] as number) / total;
    }
  }

  for (let i = 0; i < count; i++) tone[i] = Math.max(-1, Math.min(1, tone[i] as number));
  return { pxPerCell, size, origin, extent, weights, tone, blend };
}

/**
 * The opacity to paint a terrain with when the layers go down in `GROUND_TERRAINS` order, so that
 * the finished stack shows exactly each terrain's weight.
 */
export function layerAlpha(field: TerrainField, terrain: GroundTerrain): Float32Array {
  const index = GROUND_TERRAINS.indexOf(terrain);
  const own = field.weights[terrain];
  const alpha = new Float32Array(own.length);
  if (index === 0) return alpha.fill(1);
  const below = GROUND_TERRAINS.slice(0, index).map((under) => field.weights[under]);
  for (let i = 0; i < own.length; i++) {
    let beneath = 0;
    for (const layer of below) beneath += layer[i] as number;
    const total = beneath + (own[i] as number);
    alpha[i] = total > 1e-6 ? (own[i] as number) / total : 0;
  }
  return alpha;
}

/** The weight of a terrain at a grid point (nearest sample): for tests and for scatter that follows the ground. */
export function weightAt(field: TerrainField, terrain: GroundTerrain, gx: number, gy: number): number {
  const px = Math.min(field.size - 1, Math.max(0, Math.floor((gx - field.origin) * field.pxPerCell)));
  const py = Math.min(field.size - 1, Math.max(0, Math.floor((gy - field.origin) * field.pxPerCell)));
  return field.weights[terrain][py * field.size + px] as number;
}

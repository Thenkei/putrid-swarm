// Continuous woodland in grid space. Every stand is determined by its own lattice coordinates,
// so moving a camera, evicting a tile or drawing the opposite side yields the same wood.
import { GRID_H, GRID_W } from '../core/map';
import { hash2, valueNoise } from './noise';
import { onTrack } from './terrainfield';

type Species = 'fir' | 'firpair' | 'beech' | 'birch' | 'oak' | 'coppice';
export interface Tree {
  readonly gx: number;
  readonly gy: number;
  readonly key: `forest_stands_${Species}`;
  readonly h: number;
  readonly flip: boolean;
  /** Depth band from the clearing, independent of viewing direction. */
  readonly row: number;
  readonly trait: number;
}
export const TREE_ROWS = 4;
const SPACING = 1.75;
const HEIGHT: Record<Species, number> = { fir: 172, firpair: 177, beech: 148, birch: 149, oak: 154, coppice: 83 };
const conifers: readonly Species[] = ['fir', 'fir', 'firpair', 'fir', 'birch', 'beech'];
const broadleaf: readonly Species[] = ['oak', 'beech', 'birch', 'beech', 'oak', 'coppice', 'fir'];
const scrub: readonly Species[] = ['coppice', 'birch', 'coppice', 'beech', 'firpair'];

/** Include a halo when requesting stamps that may reach into the rectangle from outside. */
export function treesIn(x0: number, y0: number, x1: number, y1: number): Tree[] {
  const trees: Tree[] = [];
  for (let j = Math.floor(y0 / SPACING); j <= Math.floor(y1 / SPACING); j++) {
    for (let i = Math.floor(x0 / SPACING); i <= Math.floor(x1 / SPACING); i++) {
      const gx = (i + 0.08 + hash2(i, j, 24) * 0.84) * SPACING;
      const gy = (j + 0.08 + hash2(i, j, 25) * 0.84) * SPACING;
      if (gx < x0 || gx > x1 || gy < y0 || gy > y1) continue;
      const distance = Math.max(-gx, -gy, gx - GRID_W, gy - GRID_H);
      if (distance <= 0 || onTrack(gx, gy, 0.95)) continue;
      const grove = valueNoise(gx * 0.12, gy * 0.12, 317);
      const opening = valueNoise(gx * 0.26, gy * 0.26, 431);
      if (distance < 0.12 + opening * 1.60) continue;
      // Little glades separate groups of stems. The surrounding crowns still meet over them.
      if (opening > 0.69 && hash2(i, j, 28) < (opening - 0.69) * 2.9) continue;
      const palette = grove < 0.38 ? conifers : grove > 0.71 ? scrub : broadleaf;
      const kind = palette[Math.floor(hash2(i, j, 27) * palette.length)]!;
      const trait = hash2(i, j, 31);
      const mature = HEIGHT[kind] * (0.75 + 0.44 * hash2(i, j, 29)) * (0.9 + 0.16 * (1 - opening));
      // First come saplings along the clearing, then grown trees. A half-turn reveals
      // each tree's opposite face without changing its relationship to its neighbours.
      const edgeHeight = (34 + 12 * distance + 3.35 * distance * distance) * (0.75 + trait * 0.28);
      trees.push({
        gx, gy, key: `forest_stands_${kind}`, h: Math.min(mature, edgeHeight), flip: hash2(i, j, 30) < 0.5,
        row: Math.min(TREE_ROWS - 1, Math.floor(distance / 2.1)), trait,
      });
    }
  }
  return trees;
}

/** The collar is finite for the handful of wind-animated trees; the canopy beyond it is sampled on demand. */
export const TREES = treesIn(-8, -8, GRID_W + 8, GRID_H + 8);
export const WIND_TREES = TREES.filter(tree => tree.row === 0);

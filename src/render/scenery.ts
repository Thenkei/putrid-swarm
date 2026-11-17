// The forest around the lot: where every tree stands. Fixed once, in grid space, so both sides of
// the house and every camera agree on the tree line.

import { GRID_H, GRID_W } from '../core/map';
import { FIELD_MARGIN, onTrack } from './terrainfield';
import { seeded } from './noise';

export interface Tree {
  readonly gx: number;
  readonly gy: number;
  readonly key: 'obj_trees_pine' | 'obj_trees_oak';
  /** Drawn height, in stage units at zoom 1. */
  readonly h: number;
  readonly flip: boolean;
  /** 0 is the row that borders the lot; each further row stands deeper in the wood, and darker. */
  readonly row: number;
  /** 0..1, stable per tree: when it sways, which undergrowth stands in for it on the near side. */
  readonly trait: number;
}

export const TREE_ROWS = 4;

export const TREES: readonly Tree[] = (() => {
  const rand = seeded(1337);
  const trees: Tree[] = [];
  const add = (gx: number, gy: number, row: number): void => {
    const pine = rand() < 0.68;
    const size = 0.82 + rand() * 0.4;
    const flip = rand() < 0.5;
    const trait = rand();
    // Nothing grows on the two ways out, and nothing overhangs them.
    if (onTrack(gx, gy, 0.9)) return;
    trees.push({ gx, gy, key: pine ? 'obj_trees_pine' : 'obj_trees_oak', h: (pine ? 185 : 165) * size, flip, row, trait });
  };
  for (let row = 0; row < TREE_ROWS; row++) {
    const offset = 0.6 + row * 1.25;
    for (let t = -FIELD_MARGIN; t < GRID_W + FIELD_MARGIN; t += 1.15 + rand() * 0.5) {
      add(t + rand() * 0.6, -offset - rand() * 0.5, row);
      add(t + rand() * 0.6, GRID_H + offset + rand() * 0.5, row);
      add(-offset - rand() * 0.5, t + rand() * 0.6, row);
      add(GRID_W + offset + rand() * 0.5, t + rand() * 0.6, row);
    }
  }
  return trees;
})();

// The parts of the renderer that are plain arithmetic: the projection, the noise the scenery is
// made of, how the terrains share the ground, and where the trees stand. None of it needs a canvas.

import { describe, expect, it } from 'vitest';
import { GRID_H, GRID_W, HOUSE, PROPS, SPAWN_CELLS } from '../src/core/map';
import { DEVICE_TYPE_IDS, SECTOR_IDS } from '../src/core/types';
import { deviceArt } from '../src/render/defenses';
import { fbm, hash2, periodicFbm, seeded, smoothstep, valueNoise } from '../src/render/noise';
import { cameraView, depthOf, groundMatrix, project, unproject, viewBounds, type Rot, type View } from '../src/render/projection';
import { TREES, TREE_ROWS, treesIn } from '../src/render/scenery';
import { FIELD_MARGIN, GROUND_TERRAINS, buildTerrainField, groundTerrainAt, layerAlpha, onTrack, weightAt } from '../src/render/terrainfield';
import { propSpriteKey } from '../src/render/world';

const view = (rot: Rot, zoom = 1, cx = 11, cy = 11): View => ({ rot, zoom, cx, cy, x: 292, y: 56, w: 976, h: 652 });

describe('noise', () => {
  it('gives the same value for the same place, within 0..1', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37 - 20;
      const y = i * -0.91 + 7;
      for (const value of [hash2(i, -i * 3, 5), valueNoise(x, y, 5), fbm(x, y, 5, 4), periodicFbm(x, y, 4, 5, 4)]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(fbm(x, y, 5, 4)).toBe(fbm(x, y, 5, 4));
    }
  });

  it('differs between seeds and between neighbouring lattice points', () => {
    const values = new Set<number>();
    for (let i = 0; i < 64; i++) values.add(hash2(i % 8, Math.floor(i / 8), 1));
    expect(values.size).toBeGreaterThan(60);
    expect(hash2(3, 4, 1)).not.toBe(hash2(3, 4, 2));
  });

  it('is smooth: a small step changes it a little', () => {
    for (let i = 0; i < 100; i++) {
      const x = i * 0.73;
      const y = i * 0.41;
      expect(Math.abs(valueNoise(x + 0.01, y, 9) - valueNoise(x, y, 9))).toBeLessThan(0.04);
    }
  });

  it('wraps without a seam when asked to repeat', () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 0.137;
      const y = i * 0.291;
      expect(periodicFbm(x + 4, y, 4, 3, 4)).toBeCloseTo(periodicFbm(x, y, 4, 3, 4), 10);
      expect(periodicFbm(x, y - 4, 4, 3, 4)).toBeCloseTo(periodicFbm(x, y, 4, 3, 4), 10);
    }
  });

  it('has a seeded generator that replays', () => {
    const a = seeded(42);
    const b = seeded(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, -3)).toBe(0);
    expect(smoothstep(0, 1, 7)).toBe(1);
  });
});

describe('projection', () => {
  it('unprojects what it projects, on both sides of the house and at any zoom', () => {
    for (const rot of [0, 1] as const) {
      for (const zoom of [0.62, 1, 1.5]) {
        const v = view(rot, zoom, 7.3, 14.1);
        for (const [gx, gy] of [[0, 0], [11, 11], [21.5, 3.25], [-4, 26]] as const) {
          const p = project(v, gx, gy);
          const g = unproject(v, p.x, p.y);
          expect(g.gx).toBeCloseTo(gx, 9);
          expect(g.gy).toBeCloseTo(gy, 9);
        }
      }
    }
  });

  it('shows the centre of the view in the middle of its rectangle', () => {
    const v = view(1, 1.22, 6.5, 12);
    const p = project(v, v.cx, v.cy);
    expect(p.x).toBeCloseTo(v.x + v.w / 2, 9);
    expect(p.y).toBeCloseTo(v.y + v.h / 2, 9);
  });

  it('lays the ground with the same matrix it projects points with', () => {
    for (const rot of [0, 1] as const) {
      const v = view(rot, 0.8, 9, 13);
      const [a, b, c, d, e, f] = groundMatrix(v);
      for (const [gx, gy] of [[0, 0], [5, 17], [22, 22], [-3.5, 8.25]] as const) {
        const p = project(v, gx, gy);
        expect(a * gx + c * gy + e).toBeCloseTo(p.x, 8);
        expect(b * gx + d * gy + f).toBeCloseTo(p.y, 8);
      }
    }
  });

  it('sees the other side as the same lot turned half a circle', () => {
    const front = view(0);
    const back = view(1);
    const centre = project(front, 11, 11);
    for (const [gx, gy] of [[3, 8], [15.5, 20], [11, 2]] as const) {
      const a = project(front, gx, gy);
      const b = project(back, gx, gy);
      expect(b.x - centre.x).toBeCloseTo(-(a.x - centre.x), 8);
      expect(b.y - centre.y).toBeCloseTo(-(a.y - centre.y), 8);
    }
  });

  it('orders what is nearer the viewer after what is further, and lower on the screen', () => {
    for (const rot of [0, 1] as const) {
      const v = view(rot);
      const far = { x: 4, y: 6 };
      const near = rot === 0 ? { x: 9, y: 12 } : { x: 1, y: 2 };
      expect(depthOf(rot, near.x, near.y)).toBeGreaterThan(depthOf(rot, far.x, far.y));
      expect(project(v, near.x, near.y).y).toBeGreaterThan(project(v, far.x, far.y).y);
    }
  });

  it('bounds everything a view shows', () => {
    const v = view(1, 0.7, 4, 19);
    const bounds = viewBounds(v);
    for (const [sx, sy] of [[v.x, v.y], [v.x + v.w, v.y], [v.x, v.y + v.h], [v.x + v.w, v.y + v.h], [v.x + v.w / 2, v.y + v.h / 2]] as const) {
      const g = unproject(v, sx, sy);
      expect(g.gx).toBeGreaterThanOrEqual(bounds.x - 1e-9);
      expect(g.gx).toBeLessThanOrEqual(bounds.x + bounds.w + 1e-9);
      expect(g.gy).toBeGreaterThanOrEqual(bounds.y - 1e-9);
      expect(g.gy).toBeLessThanOrEqual(bounds.y + bounds.h + 1e-9);
    }
  });

  it('points each camera at its own door, from the side that door is on', () => {
    const rect = { x: 12, y: 54, w: 884, h: 497 };
    expect(cameraView('portail', rect, 1.22).rot).toBe(0);
    expect(cameraView('grange', rect, 1.22).rot).toBe(0);
    expect(cameraView('arriere', rect, 1.22).rot).toBe(1);
    expect(cameraView('verger', rect, 1.22).rot).toBe(1);
    // The house is in the upper part of every feed: the approach fills the rest.
    for (const sector of SECTOR_IDS) {
      const v = cameraView(sector, rect, 1.22);
      const house = project(v, 11, 11);
      expect(house.y).toBeLessThan(rect.y + rect.h / 2);
      expect(house.y).toBeGreaterThan(rect.y - rect.h / 2);
    }
  });

  it('has distinct, shipped front and rear artwork for each yard prop and defense pose', () => {
    const [manifest] = Object.values(import.meta.glob<Record<string, { file: string }>>('../public/assets/manifest.json', { eager: true, import: 'default' }));
    const checkPair = (front: string, rear: string) => {
      const frontFile = manifest?.[front]?.file;
      const rearFile = manifest?.[rear]?.file;
      expect(frontFile, front).toBeTruthy();
      expect(rearFile, rear).toBeTruthy();
      expect(rearFile).not.toBe(frontFile);
    };
    for (const { kind } of PROPS) checkPair(propSpriteKey(kind, 0), propSpriteKey(kind, 1));
    for (const type of DEVICE_TYPE_IDS) {
      const facings = type === 'fence' ? [0, 1, 2, 3] as const : [0, 1] as const;
      for (const facing of facings) {
        for (const pose of ['resting', 'armed', 'triggered', 'broken'] as const) {
          checkPair(deviceArt(type, facing, pose, 0).key, deviceArt(type, facing, pose, 1).key);
        }
      }
    }
  });
});

describe('terrain field', () => {
  // Coarser than the game's: the properties below do not depend on the resolution.
  const field = buildTerrainField(8);

  it('covers the lot and a margin of forest around it', () => {
    expect(field.origin).toBe(-FIELD_MARGIN);
    expect(field.extent).toBe(Math.max(GRID_W, GRID_H) + 2 * FIELD_MARGIN);
    expect(field.size).toBe(field.extent * 8);
  });

  it('shares every point between the terrains, with nothing missing and nothing over', () => {
    const count = field.size * field.size;
    for (let i = 0; i < count; i += 7) {
      let total = 0;
      for (const terrain of GROUND_TERRAINS) {
        const w = field.weights[terrain][i] as number;
        expect(Number.isFinite(w)).toBe(true);
        expect(w).toBeGreaterThanOrEqual(0);
        total += w;
      }
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it('is the mapped terrain away from any border', () => {
    // Middle of the lawn, deep in the wood, middle of the drive, middle of the track.
    expect(weightAt(field, 'grass', 4.5, 17.5)).toBeGreaterThan(0.99);
    expect(weightAt(field, 'forest', -4, -4)).toBeGreaterThan(0.99);
    expect(weightAt(field, 'path', 11, 17)).toBeGreaterThan(0.9);
    expect(weightAt(field, 'gravel', 17.5, 12)).toBeGreaterThan(0.9);
    // The house stands on packed earth, not on a lawn.
    expect(weightAt(field, 'path', (HOUSE.x0 + HOUSE.x1 + 1) / 2, (HOUSE.y0 + HOUSE.y1 + 1) / 2)).toBeGreaterThan(0.99);
  });

  it('carries the two ways out on through the wood', () => {
    expect(groundTerrainAt(11, GRID_H + 3)).toBe('path');
    expect(groundTerrainAt(GRID_W + 3, 12)).toBe('gravel');
    expect(groundTerrainAt(-3, 12)).toBe('forest');
    expect(groundTerrainAt(11, -3)).toBe('forest');
    expect(weightAt(field, 'path', 11, GRID_H + 3)).toBeGreaterThan(0.8);
    expect(weightAt(field, 'gravel', GRID_W + 3, 12)).toBeGreaterThan(0.8);
  });

  it('frays the borders: the lawn does not stop on a ruler line', () => {
    // Along the edge of the lawn on the orchard side, the share of grass at the mapped border varies.
    const shares: number[] = [];
    for (let gy = 3; gy < 19; gy += 0.25) shares.push(weightAt(field, 'grass', 1.0, gy));
    const mean = shares.reduce((sum, v) => sum + v, 0) / shares.length;
    const spread = Math.sqrt(shares.reduce((sum, v) => sum + (v - mean) ** 2, 0) / shares.length);
    expect(spread).toBeGreaterThan(0.15);
  });

  it('gives layer opacities that stack back into the shares', () => {
    const alphas = GROUND_TERRAINS.map((terrain) => layerAlpha(field, terrain));
    const count = field.size * field.size;
    for (let i = 0; i < count; i += 11) {
      // Painted bottom to top, each layer covers what is under it by its own opacity.
      const seen = GROUND_TERRAINS.map(() => 0);
      for (let k = 0; k < GROUND_TERRAINS.length; k++) {
        const a = (alphas[k] as Float32Array)[i] as number;
        for (let under = 0; under < k; under++) seen[under] = (seen[under] as number) * (1 - a);
        seen[k] = a;
      }
      GROUND_TERRAINS.forEach((terrain, k) => expect(seen[k]).toBeCloseTo(field.weights[terrain][i] as number, 4));
    }
  });

  it('keeps tone and blend in range, and is the same every time it is built', () => {
    for (let i = 0; i < field.tone.length; i += 13) {
      expect(field.tone[i]).toBeGreaterThanOrEqual(-1);
      expect(field.tone[i]).toBeLessThanOrEqual(1);
      expect(field.blend[i]).toBeGreaterThanOrEqual(0);
      expect(field.blend[i]).toBeLessThanOrEqual(1);
    }
    const again = buildTerrainField(8);
    for (const terrain of GROUND_TERRAINS) expect(Array.from(again.weights[terrain].subarray(0, 4000))).toEqual(Array.from(field.weights[terrain].subarray(0, 4000)));
  });
});

describe('tree line', () => {
  it('stands outside the lot, in every row, on all four sides', () => {
    expect(TREES.length).toBeGreaterThan(200);
    for (const tree of TREES) {
      const inside = tree.gx >= 0 && tree.gy >= 0 && tree.gx <= GRID_W && tree.gy <= GRID_H;
      expect(inside).toBe(false);
      expect(tree.row).toBeGreaterThanOrEqual(0);
      expect(tree.row).toBeLessThan(TREE_ROWS);
      expect(tree.trait).toBeGreaterThanOrEqual(0);
      expect(tree.trait).toBeLessThan(1);
    }
    for (let row = 0; row < TREE_ROWS; row++) expect(TREES.some((tree) => tree.row === row)).toBe(true);
    expect(TREES.some((tree) => tree.gy < 0)).toBe(true);
    expect(TREES.some((tree) => tree.gy > GRID_H)).toBe(true);
    expect(TREES.some((tree) => tree.gx < 0)).toBe(true);
    expect(TREES.some((tree) => tree.gx > GRID_W)).toBe(true);
  });

  it('continues beyond every edge and paints the same trees on overlapping tiles', () => {
    for (const [x, y] of [[-25, 5], [GRID_W + 12, 5], [5, -25], [5, GRID_H + 12]] as const) {
      const full = treesIn(x, y, x + 14, y + 14);
      const overlap = treesIn(x + 3, y + 3, x + 11, y + 11);
      expect(overlap.length).toBeGreaterThan(0);
      expect(overlap).toEqual(full.filter(tree =>
        tree.gx >= x + 3 && tree.gx <= x + 11 && tree.gy >= y + 3 && tree.gy <= y + 11,
      ));
    }
  });

  it('leaves the two ways out clear', () => {
    for (const tree of TREES) expect(onTrack(tree.gx, tree.gy, 0.9)).toBe(false);
    expect(onTrack(11, GRID_H + 2)).toBe(true);
    expect(onTrack(GRID_W + 2, 12)).toBe(true);
    expect(onTrack(5, GRID_H + 2)).toBe(false);
    // Nothing on the lot itself counts as a way out: the scenery and the spawn line are untouched.
    for (const prop of PROPS) expect(onTrack(prop.x + 0.5, prop.y + 0.5)).toBe(false);
    expect(SPAWN_CELLS.arriere.every((cell) => !onTrack(cell.x + 0.5, cell.y + 0.5))).toBe(true);
  });
});

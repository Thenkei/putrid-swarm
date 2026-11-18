import { ENTRIES, LANES, PROPS, inGrid, isStaticBlocked } from '../core/map';
import type { Sprite } from '../engine/assets';
import { hash2, seeded } from './noise';
import { depthOf, groundMatrix, project, world, type View } from './projection';
import { castShadow, contactShadow, groundPatch } from './shadows';
import { weightAt, type TerrainField } from './terrainfield';
import { windAt } from './wind';
import { vegetationView } from './vegetation';

type Plant = 'foxtail' | 'knapweed' | 'clover' | 'bramble' | 'hazel' | 'nettle' | 'cabbage' | 'leeks' | 'chicory';
type Habitat = 'meadow' | 'hedge' | 'verge';

// Width at native gameplay scale. The height cap keeps a foreground clump below the action.
const size: Record<Plant, readonly [width: number, maxHeight: number]> = {
  foxtail: [30, 26], knapweed: [29, 29], clover: [27, 14], bramble: [51, 33],
  hazel: [46, 39], nettle: [33, 29], cabbage: [27, 21], leeks: [24, 26], chicory: [27, 24],
};

// Each elongated patch has a dominant species, companions, and bare space between its neighbours.
// The hedge follows the boundary in discontinuous runs. The verges follow the two wheel tracks.
const patches: Record<Habitat, readonly (readonly [gx: number, gy: number, rx: number, ry: number, count: number, dominant: Plant])[]> = {
  hedge: [
    [3.5, 1.55, 2.8, 0.58, 9, 'hazel'], [16.5, 1.6, 3.2, 0.74, 10, 'bramble'],
    [1.5, 6.4, 0.7, 2.5, 8, 'nettle'], [1.6, 16.3, 0.65, 2.7, 9, 'bramble'],
    [20.5, 5.1, 0.55, 2.75, 9, 'hazel'], [20.4, 17.2, 0.6, 2.4, 8, 'bramble'],
    [4.7, 20.45, 2.8, 0.72, 9, 'bramble'], [17.9, 20.45, 2.1, 0.68, 8, 'nettle'],
    [5.2, -0.75, 2.5, 0.85, 10, 'nettle'], [17.1, -0.9, 2.0, 1.0, 8, 'bramble'],
    [-0.9, 5.95, 0.9, 2.25, 9, 'bramble'], [-0.65, 15.5, 0.9, 2.35, 9, 'nettle'],
    [22.5, 4.4, 0.85, 1.85, 9, 'bramble'], [22.65, 17.75, 0.82, 2.2, 9, 'nettle'],
    [4.55, 22.6, 2.4, 0.78, 10, 'nettle'], [16.6, 22.5, 2.3, 0.98, 10, 'bramble'],
  ],
  meadow: [
    [5.7, 17.65, 2.35, 0.95, 12, 'knapweed'], [15.9, 18.45, 2.55, 1.1, 15, 'foxtail'],
    [5.8, 6.3, 2.2, 0.76, 11, 'clover'], [17.7, 7.8, 1.8, 1.0, 11, 'foxtail'],
    [4.3, 13.2, 1.65, 0.8, 10, 'clover'], [13.0, 3.05, 1.9, 0.63, 10, 'knapweed'],
  ],
  verge: [
    [9.48, 16.4, 0.32, 2.1, 8, 'chicory'], [12.55, 18.75, 0.36, 2.1, 9, 'foxtail'],
    [17.8, 10.5, 2.45, 0.32, 9, 'chicory'], [19.55, 13.52, 1.55, 0.43, 6, 'clover'],
  ],
};
const companions: Record<Habitat, readonly Plant[]> = {
  meadow: ['foxtail', 'knapweed', 'clover'], hedge: ['bramble', 'hazel', 'nettle'], verge: ['chicory', 'clover', 'foxtail'],
};
const approaches = Object.values(LANES).flat();
const sills = Object.values(ENTRIES);

interface Planting { gx: number; gy: number; kind: Plant; scale: number; flip: boolean }

interface MovingPlant {
  art: Sprite;
  gx: number;
  gy: number;
  wx: number;
  wy: number;
  width: number;
  height: number;
  root: number;
  trait: number;
  compliance: number;
  flip: boolean;
}

const crowns: [MovingPlant[], MovingPlant[]] = [[], []];
const compliance: Record<Plant, number> = {
  foxtail: 0.24, knapweed: 0.18, clover: 0.08, bramble: 0.11, hazel: 0.14,
  nettle: 0.2, cabbage: 0.065, leeks: 0.22, chicory: 0.2,
};

function plantings(field: TerrainField): Planting[] {
  const rand = seeded(78431);
  const plants: Planting[] = [];
  function add(gx: number, gy: number, kind: Plant, scale: number): void {
    plants.push({ gx, gy, kind, scale, flip: rand() < 0.5 });
  }
  for (const habitat of ['hedge', 'meadow', 'verge'] as const) {
    const palette = companions[habitat];
    for (const [cx, cy, rx, ry, count, dominant] of patches[habitat]) {
      const start = plants.length;
      for (let i = 0; i < count * 3 && plants.length - start < count; i++) {
        const angle = rand() * Math.PI * 2;
        const r = Math.sqrt(rand());
        const gx = cx + Math.cos(angle) * rx * r;
        const gy = cy + Math.sin(angle) * ry * r;
        // Doorsteps, charge lanes and the road bed stay clear, even where they cross plain lawn.
        if (inGrid(gx, gy) && isStaticBlocked(Math.floor(gx), Math.floor(gy))) continue;
        if (sills.some(c => Math.hypot(gx - c.x - 0.5, gy - c.y - 0.5) < 1.45)) continue;
        if (approaches.some(c => Math.hypot(gx - c.x - 0.5, gy - c.y - 0.5) < 0.74)) continue;
        if (weightAt(field, 'path', gx, gy) + weightAt(field, 'gravel', gx, gy) > 0.58) continue;
        if (plants.slice(start).some(p => Math.hypot(p.gx - gx, p.gy - gy) < 0.39)) continue;
        const kind = rand() < 0.51 ? dominant : palette[Math.floor(rand() * palette.length)]!;
        add(gx, gy, kind, (0.96 - 0.20 * r) * (0.85 + 0.37 * rand()));
      }
    }
  }
  // Two deliberate short rows just outside each timber vegetable bed. Position the taller
  // leeks behind the brassicas in the world, so the beds also read as rows from the reverse side.
  for (const bed of PROPS.filter(p => p.kind === 'veg')) {
    for (let i = 0; i < 5; i++) {
      add(bed.x - 0.12 + i * 0.54, bed.y + 1.35 + rand() * 0.07, 'cabbage', 0.84 + 0.25 * rand());
      add(bed.x - 0.14 + i * 0.54, bed.y - 0.33 - rand() * 0.08, 'leeks', 0.85 + 0.22 * rand());
    }
  }
  return plants;
}

/** Depth-sort on each side before baking. All cameras share the same species at the same world positions. */
export function drawYardPlants(ctx: CanvasRenderingContext2D, view: View, field: TerrainField): void {
  const plants = plantings(field).sort((a, b) => depthOf(view.rot, a.gx, a.gy) - depthOf(view.rot, b.gx, b.gy));
  const moving = crowns[view.rot];
  moving.length = 0;
  // Leaf mould joins the bases of the hedge plants; the meadow remains broken turf.
  ctx.save();
  ctx.transform(...groundMatrix(view));
  for (const [cx, cy, rx, ry] of patches.hedge) {
    groundPatch(ctx, '43,44,24', cx, cy, rx * 1.19, ry * 1.40, 0.49);
  }
  ctx.restore();
  const stamps = plants.flatMap(plant => {
    const face = vegetationView('yard_flora', plant.kind, plant.flip, view.rot);
    if (!face) return [];
    const { art, key } = face;
    const [targetWidth, maxHeight] = size[plant.kind];
    const scale = plant.scale * view.zoom * Math.min(targetWidth / art.w, maxHeight / art.h);
    const p = project(view, plant.gx, plant.gy);
    const w = art.w * scale;
    const dx = (0.5 - face.foot) * w;
    return [{ plant, key, art, x: p.x + dx, y: p.y, dx, w, h: art.h * scale, flip: face.mirror }];
  });
  // First project every canopy onto the ground. Plant silhouettes are drawn on a separate
  // pass so a leaf cannot cast a flat ground shadow over its neighbour's crown.
  for (const { key, x, y, w, h, flip } of stamps) {
    contactShadow(ctx, x, y, w * 0.48, Math.max(2.7, w * 0.16), 0.62);
    if (h > 14 * view.zoom) castShadow(ctx, key, x, y + 0.05 * h, h, flip, 0.34, 0.9);
  }
  for (const { plant, art, x, y, dx, w, h, flip } of stamps) {
    const trait = hash2(Math.floor(plant.gx * 53), Math.floor(plant.gy * 71), 87);
    const plantedRow = plant.kind === 'leeks' || plant.kind === 'cabbage';
    // A representative set of stems catches the wind. Distant hedges stay in the terrain
    // bake behind the standing trees. Shadows and the foot of every plant stay there too.
    const live = plantedRow || (trait < 0.52 && inGrid(plant.gx, plant.gy));
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    if (live) {
      const root = Math.round(art.h * 0.84);
      const cut = h * root / art.h;
      ctx.drawImage(art.img, 0, root, art.w, art.h - root, -w / 2, cut - h * 0.88, w, h - cut);
      const stage = world(view.rot, plant.gx, plant.gy);
      moving.push({ art, gx: plant.gx, gy: plant.gy, wx: stage.x + dx / view.zoom, wy: stage.y, width: w / view.zoom, height: h / view.zoom, root, trait, compliance: compliance[plant.kind], flip });
    } else ctx.drawImage(art.img, -w / 2, -h * 0.88, w, h);
    ctx.restore();
  }
}

/** The cut at the root is fixed in screen space: only the stem and crown bend. The same
 * lightweight visible subset serves the large feed and the three camera thumbnails. */
export function drawWindPlants(ctx: CanvasRenderingContext2D, view: View, time: number): void {
  const centre = world(view.rot, view.cx, view.cy);
  const ox = view.x + view.w / 2 - centre.x * view.zoom;
  const oy = view.y + view.h / 2 - centre.y * view.zoom;
  for (const plant of crowns[view.rot]) {
    const x = ox + plant.wx * view.zoom;
    const y = oy + plant.wy * view.zoom;
    const w = plant.width * view.zoom;
    const h = plant.height * view.zoom;
    if (x < view.x - w || x > view.x + view.w + w || y < view.y - h || y > view.y + view.h + h) continue;
    const cap = h * plant.root / plant.art.h;
    const bend = plant.compliance * windAt(time, plant.gx, plant.gy, plant.trait, view.rot);
    ctx.save();
    ctx.transform(plant.flip ? -1 : 1, 0, -bend, 1, x, y - h * 0.88 + cap);
    ctx.drawImage(plant.art.img, 0, 0, plant.art.w, plant.root, -w / 2, -cap, w, cap);
    ctx.restore();
  }
}

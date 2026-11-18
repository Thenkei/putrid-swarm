import { GRID_H, GRID_W } from '../core/map';
import { sprite } from '../engine/assets';
import { depthOf, project, unproject, viewX, viewY, world, type Rot, type View } from './projection';
import { treesIn, type Tree } from './scenery';
import { castShadow, contactShadow } from './shadows';
import { windAt } from './wind';
import { vegetationView } from './vegetation';

const TILE = 384;
const PAD = 2;
// Includes the nearer foliage masks as well as the padded canopy pictures, across both sides.
const MAX_PIXELS = 7 * 1024 * 1024;
const tiles = new Map<string, ForestTile | null>();
let residentPixels = 0;
const shade: readonly number[] = [0, 0.08, 0.16, 0.26];
const tinted = new Map<string, HTMLCanvasElement>();

export interface Stand {
  key: string; image: CanvasImageSource; x: number; y: number; w: number; h: number; mirror: boolean;
}
interface Stamp { tree: Tree; s: Stand }
interface Crown extends Stamp { x: number; y: number; w: number; h: number; cover: HTMLCanvasElement | null }
interface ForestTile { picture: HTMLCanvasElement; crowns: Crown[]; pixels: number }
const movingCrown = (t: Tree): boolean => t.row > 0 && t.trait > 0.835;
const hinge = (s: Stand): number => s.y - s.h * 0.59;

/** On the close bank the understorey gives way gradually to full-height canopy farther out.
 * Even a wide crown then overlaps at most a narrow fringe of playable ground. */
export function projectStand(view: View, tree: Tree): Stand | undefined {
  const vx = viewX(view.rot, tree.gx);
  const vy = viewY(view.rot, tree.gy);
  const near = Math.max(vx - GRID_W, vy - GRID_H);
  const foreground = vx >= 0 && vy >= 0 && near > 0;
  const painted = vegetationView('forest_stands', tree.key.slice('forest_stands_'.length), tree.flip, view.rot);
  const key = painted?.key ?? (tree.key.includes('fir') ? 'obj_trees_pine' : 'obj_trees_oak');
  const art = painted?.art ?? sprite(key);
  if (!art) return;
  const cap = (31 + 12 * near + 3.35 * near * near) * (0.75 + tree.trait * 0.28);
  const h = (foreground ? Math.min(tree.h, cap) : tree.h) * view.zoom;
  const p = project(view, tree.gx, tree.gy);
  const layer = shade[tree.row] ?? 0;
  let image: CanvasImageSource = art.img;
  if (layer > 0) {
    const id = `${key}:${tree.row}`;
    let canvas = tinted.get(id);
    if (!canvas) {
      canvas = document.createElement('canvas');
      // The original art is taller than its largest on-screen stamp.
      canvas.height = Math.min(265, art.h); canvas.width = Math.round(canvas.height * art.w / art.h);
      const c = canvas.getContext('2d');
      if (c) {
        c.drawImage(art.img, 0, 0, canvas.width, canvas.height);
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = `rgba(20,29,27,${layer})`; c.fillRect(0, 0, canvas.width, canvas.height);
        tinted.set(id, canvas);
      }
    }
    if (tinted.has(id)) image = canvas;
  }
  const w = h * art.w / art.h;
  return { key, image, x: p.x + (0.5 - (painted?.foot ?? 0.5)) * w, y: p.y + 3 * view.zoom, w, h, mirror: painted?.mirror ?? (tree.flip !== (view.rot === 1)) };
}

export function drawStand(ctx: CanvasRenderingContext2D, stand: Stand, lean = 0, alpha = 1): void {
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.transform(stand.mirror ? -1 : 1, 0, -lean, 1, stand.x, stand.y);
  ctx.drawImage(stand.image, -stand.w / 2, -stand.h, stand.w, stand.h);
  ctx.restore();
}

function fixedStand(ctx: CanvasRenderingContext2D, {s, tree}: Stamp): void {
  if (tree.row === 0) return;
  if (!movingCrown(tree)) { drawStand(ctx, s); return; }
  ctx.save();
  ctx.beginPath(); ctx.rect(s.x - s.w / 2 - 1, hinge(s), s.w + 2, s.h); ctx.clip();
  drawStand(ctx, s); ctx.restore();
}

function bakeTile(rot: Rot, tx: number, ty: number): ForestTile | null {
  const v: View = { rot, cx: viewX(rot, 0), cy: viewY(rot, 0), x: -tx * TILE, y: -ty * TILE, w: 0, h: 0, zoom: 1 };
  // Include feet beyond the tile: a canopy, its cast shadow or both can cross a tile seam.
  const corners = [[-190,-90],[TILE+190,-90],[-190,TILE+234],[TILE+190,TILE+234]].map(([x,y]) => unproject(v, x!, y!));
  const trees = treesIn(Math.min(...corners.map(p => p.gx)), Math.min(...corners.map(p => p.gy)), Math.max(...corners.map(p => p.gx)), Math.max(...corners.map(p => p.gy)));
  const visible = trees.flatMap(tree => {
    const s = projectStand(v, tree);
    if (!s || s.x + s.w / 2 + s.h * 0.65 < -PAD - 8 || s.x - s.w / 2 > TILE + PAD + 8 || s.y < -16 || s.y - s.h > TILE + PAD) return [];
    return [{ tree, s }];
  });
  if (!visible.length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = TILE + 2 * PAD; canvas.height = TILE + 2 * PAD;
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.translate(PAD, PAD);
  for (const {tree, s} of visible) {
    contactShadow(c, s.x, s.y, s.w * 0.36, s.w * 0.14, 0.49);
    castShadow(c, s.key, s.x, s.y, s.h, s.mirror, tree.row < 2 ? 0.27 : 0.19, 0.8);
  }
  visible.sort((a,b) => depthOf(rot,a.tree.gx,a.tree.gy) - depthOf(rot,b.tree.gx,b.tree.gy));
  const crowns: Crown[] = [];
  let pixels = canvas.width * canvas.height;
  for (const [index, stamp] of visible.entries()) {
    fixedStand(c, stamp);
    if (!movingCrown(stamp.tree)) continue;
    const s = stamp.s;
    const x = Math.max(-PAD, Math.floor(s.x - s.w / 2 - 7));
    const y = Math.max(-PAD, Math.floor(s.y - s.h - 1));
    const w = Math.min(TILE + PAD, Math.ceil(s.x + s.w / 2 + 7)) - x;
    const h = Math.min(TILE + PAD, Math.ceil(hinge(s))) - y;
    if (w <= 0 || h <= 0) continue;
    // Keep any branches in front of this moving crown in their correct depth order.
    const nearer = visible.slice(index + 1).filter(({s:n, tree}) =>
      tree.row > 0 && n.x + n.w / 2 >= x && n.x - n.w / 2 < x+w && n.y >= y && n.y - n.h < y+h);
    let cover: HTMLCanvasElement | null = null;
    if (nearer.length) {
      cover = document.createElement('canvas'); cover.width = w; cover.height = h;
      const occlusion = cover.getContext('2d');
      if (occlusion) {
        occlusion.translate(-x,-y);
        for (const near of nearer) fixedStand(occlusion, near);
      }
      pixels += w * h;
    }
    crowns.push({ ...stamp, x, y, w, h, cover });
  }
  return { picture: canvas, crowns, pixels };
}

function tile(rot: Rot, tx: number, ty: number): ForestTile | null {
  const id = `${rot}/${tx}/${ty}`;
  let image = tiles.get(id);
  if (image !== undefined) tiles.delete(id);
  else {
    image = bakeTile(rot, tx, ty);
    while (tiles.size && (tiles.size >= 50 || residentPixels + (image?.pixels ?? 0) > MAX_PIXELS)) {
      const oldest = tiles.keys().next().value!;
      const evicted = tiles.get(oldest);
      if (evicted) {
        residentPixels -= evicted.pixels;
        evicted.picture.width = evicted.picture.height = 0;
        for (const c of evicted.crowns) if (c.cover) c.cover.width = c.cover.height = 0;
      }
      tiles.delete(oldest);
    }
    residentPixels += image?.pixels ?? 0;
  }
  tiles.set(id, image);
  return image;
}

function forestBounds(view: View) {
  const centre = world(view.rot, view.cx, view.cy);
  const left = centre.x - view.w / (2 * view.zoom);
  const top = centre.y - view.h / (2 * view.zoom);
  return {
    left, top, x0: Math.floor(left / TILE), y0: Math.floor(top / TILE),
    x1: Math.ceil((left + view.w / view.zoom) / TILE), y1: Math.ceil((top + view.h / view.zoom) / TILE),
  };
}

/** The scene calls this during its existing dark transition, before its first interactive frame. */
export function prepareForest(view: View): void {
  const bounds = forestBounds(view);
  for (let ty = bounds.y0; ty < bounds.y1; ty++) {
    for (let tx = bounds.x0; tx < bounds.x1; tx++) tile(view.rot, tx, ty);
  }
}

/** Transparent canopy tiles sit over the continuous forest floor, with identical border stamps. */
export function drawForest(ctx: CanvasRenderingContext2D, view: View, time = 0): void {
  const { left, top, x0, y0, x1, y1 } = forestBounds(view);
  const z = view.zoom;
  const transform = ctx.getTransform();
  const snapX = (x: number) => (Math.round(x * transform.a + transform.e) - transform.e) / transform.a;
  const snapY = (y: number) => (Math.round(y * transform.d + transform.f) - transform.f) / transform.d;
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const chunk = tile(view.rot, tx, ty);
      if (!chunk) continue;
      const x = view.x + (tx * TILE - left) * z;
      const y = view.y + (ty * TILE - top) * z;
      // Give adjoining tiles the same physical-pixel edge. Their gutters supply real
      // neighbouring pixels to the resampler at fractional stage scales.
      ctx.save(); ctx.beginPath();
      ctx.rect(snapX(x), snapY(y), snapX(x + TILE * z) - snapX(x), snapY(y + TILE * z) - snapY(y)); ctx.clip();
      ctx.translate(x, y); ctx.scale(z, z);
      ctx.drawImage(chunk.picture, -PAD, -PAD);
      for (const crown of chunk.crowns) {
        const {s, tree} = crown;
        const wind = windAt(time, tree.gx, tree.gy, tree.trait, view.rot);
        const shear = wind * (tree.key.includes('fir') ? 0.042 : 0.064);
        ctx.save(); ctx.beginPath(); ctx.rect(crown.x, crown.y, crown.w, Math.min(crown.h, hinge(s)-crown.y)); ctx.clip();
        ctx.transform(1,0,-shear,1,shear * hinge(s),0);
        drawStand(ctx, s); ctx.restore();
        if (crown.cover) ctx.drawImage(crown.cover, crown.x, crown.y);
      }
      ctx.restore();
    }
  }
}

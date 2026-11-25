import { beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import manifest from '../public/assets/manifest.json';
import { carManeuver } from '../src/core/car-path';
import { drawForest, drawStand, projectStand, type ForestDrawable } from '../src/render/forest';
import { depthOf, project, type Rot, type View } from '../src/render/projection';
import { DEPTH_SORTED_TREES, treesIn, type Tree } from '../src/render/scenery';

type Point = { x: number; y: number };
type Matrix = [number, number, number, number, number, number];
const id = (): Matrix => [1, 0, 0, 1, 0, 0];
function compose([a,b,c,d,e,f]: Matrix, [A,B,C,D,E,F]: Matrix): Matrix {
  return [a*A+c*B, b*A+d*B, a*C+c*D, b*C+d*D, a*E+c*F+e, b*E+d*F+f];
}
const map = ([a,b,c,d,e,f]: Matrix, x: number, y: number): Point => ({ x: a*x+c*y+e, y: b*x+d*y+f });

interface Image { key?: string; width: number; height: number; draws?: Draw[] }
interface Draw { image: Image; matrix: Matrix; op: string }
class Surface implements Image {
  width = 300; height = 150; draws: Draw[] = [];
  private m = id();
  private stack: [Matrix, string][] = [];
  globalCompositeOperation = 'source-over'; globalAlpha = 1;
  getContext() { return this; }
  getTransform() { return { a: this.m[0], d: this.m[3], e: this.m[4], f: this.m[5] }; }
  save() { this.stack.push([this.m, this.globalCompositeOperation]); }
  restore() { [this.m, this.globalCompositeOperation] = this.stack.pop()!; }
  transform(...m: Matrix) { this.m = compose(this.m, m); }
  setTransform(...m: Matrix) { this.m = m; }
  translate(x: number, y: number) { this.transform(1,0,0,1,x,y); }
  scale(x: number, y: number) { this.transform(x,0,0,y,0,0); }
  beginPath() {} rect() {} clip() {} fillRect() {}
  clearRect() { this.draws.length = 0; }
  drawImage(image: Image, ...args: number[]) {
    let sx = 0, sy = 0, sw = image.width, sh = image.height;
    if (args.length === 8) [sx, sy, sw, sh] = args.splice(0, 4) as [number, number, number, number];
    const [x, y, w = sw, h = sh] = args as [number, number, number?, number?];
    this.draws.push({ image, op: this.globalCompositeOperation, matrix: compose(this.m, [w/sw, 0, 0, h/sh, x-sx*w/sw, y-sy*h/sh]) });
  }
  get ctx() { return this as unknown as CanvasRenderingContext2D; }
}
const sprites = vi.hoisted(() => new Map<string, { w: number; h: number; footX?: number; footY?: number; img: Image }>());
const unavailable = vi.hoisted(() => ({ stands: false }));
vi.mock('../src/engine/assets', () => ({ sprite: (key: string) => unavailable.stands && key.startsWith('forest_stands') ? undefined : sprites.get(key) }));
vi.mock('../src/render/shadows', () => ({ castShadow() {}, contactShadow() {} }));
const pixels = new Map<string, Uint8Array>();
beforeAll(async () => {
  for (const [key, entry] of Object.entries(manifest).filter(([k]) => k.startsWith('forest_stands') || k.startsWith('obj_trees'))) {
    sprites.set(key, { ...entry, img: { key, width: entry.w, height: entry.h } });
    pixels.set(key, await sharp('public/assets/' + entry.file).ensureAlpha().raw().toBuffer());
  }
});

const views = [0, 1] as const;
const view = (rot: Rot, x: number, y: number): View => ({ rot, cx: x, cy: y, zoom: rot ? 1.72 : .83, x: 0, y: 0, w: 700, h: 380 });
const alpha = (key: string, x: number, y: number) => pixels.get(key)![(Math.floor(y) * sprites.get(key)!.w + Math.floor(x)) * 4 + 3] ?? 0;

describe('the woodland fringe', () => {
  it.each([
    ['fir', [150,411], [138,411]], ['firpair', [146,412], [152,411]],
    ['beech', [177,411], [193,411]], ['birch', [201,410], [201,411]],
    ['oak', [224,408], [247,409]], ['coppice', [213,368], [243,371]],
  ] as const)('keeps the %s root at its planting point through wind and brush', (species, front, back) => {
    for (const rot of views) for (const flip of [false, true]) for (const height of [45, 175]) {
      const tree: Tree = { gx: 2.8, gy: -1.6, key: `forest_stands_${species}`, h: height, row: 0, trait: .78, flip };
      const v = view(rot, 3.5, .8), root = project(v, tree.gx, tree.gy), stand = projectStand(v, tree)!;
      const [x, y] = flip !== (rot === 1) ? back : front;
      expect(alpha(stand.key, x, y)).toBeGreaterThan(150);
      expect(Math.abs((root.y - (stand.y - stand.h)) / v.zoom - height)).toBeLessThan(.01);
      for (const part of [0, rot ? -.23 : .23]) {
        const c = new Surface(); drawStand(c.ctx, stand, rot ? -.031 : .031, 1, part);
        const bark = map(c.draws[0]!.matrix, x + .5, y + .5);
        expect(Math.hypot(bark.x - root.x, bark.y - root.y) / v.zoom).toBeLessThan(1);
      }
    }
  });

  it('registers the optional oak and pine paintings to the bark when both stand faces are unavailable', () => {
    unavailable.stands = true;
    try {
      for (const [species, x, y] of [['fir',121,404], ['oak',212,398]] as const) for (const rot of views) {
        const tree: Tree = { gx: 3, gy: -1, key: `forest_stands_${species}`, h: 165, row: 0, trait: .42, flip: false };
        const v = view(rot, 3, -1), stand = projectStand(v, tree)!;
        expect(alpha(stand.key, x, y)).toBeGreaterThan(150);
        const c = new Surface(); drawStand(c.ctx, stand, rot ? -.03 : .03, 1, -.18);
        const p = map(c.draws[0]!.matrix, x, y);
        expect(Math.hypot(p.x - stand.rootX, p.y - stand.rootY) / v.zoom).toBeLessThan(1);
      }
    } finally { unavailable.stands = false; }
  });

  it.each([
    [0, 28.428, 12.904, 30.500, 14.251], [1, 26.640, 7.566, 26.097, 6.200],
  ] as const)('puts the road trees and wagon in the same depth order in view %s', (rot, gx, gy, nx, ny) => {
    vi.stubGlobal('document', { createElement: () => new Surface() });
    try {
      const fringe = DEPTH_SORTED_TREES.find(t => Math.hypot(t.gx - gx, t.gy - gy) < .01)!;
      const near = treesIn(nx - .01, ny - .01, nx + .01, ny + .01)[0]!;
      const v = view(rot, gx, gy), n = projectStand(v, near)!;
      const c = new Surface(), foreground: ForestDrawable[] = [];
      drawForest(c.ctx, v, .8, foreground);
      const depth = depthOf(rot, near.gx, near.gy);
      const draws = foreground.filter(d => d.depth === depth);
      expect(draws.length).toBeGreaterThan(0);
      expect(depth).toBeGreaterThan(depthOf(rot, fringe.gx, fringe.gy));
      // The ordinary boarding sequence starts rolling at 1.70s. This is where the
      // wagon first meets the foreground forest on the road at 4.70s.
      const wagon = carManeuver(4.70 - 1.70).position;
      if (rot === 0) expect(depth).toBeGreaterThan(depthOf(rot, wagon.x, wagon.y) + .4);
      c.draws.length = 0;
      for (const item of draws) item.draw();
      const faces: Matrix[] = [];
      function visit(image: Image, m: Matrix) {
        if (image.key === n.key) faces.push(m);
        for (const draw of image.draws ?? []) visit(draw.image, compose(m, draw.matrix));
      }
      visit(c, id());
      const art = sprites.get(n.key)!, bark = [art.w * n.foot[0], art.h * n.foot[1]] as const;
      expect(alpha(n.key, ...bark)).toBeGreaterThan(150);
      expect(faces.some(m => {
        const p = map(m, ...bark);
        return Math.hypot(p.x - n.rootX, p.y - n.rootY) < .01;
      })).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
});

import { beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import manifest from '../public/assets/manifest.json';
import { carDepartureShot, departingCar, drawDepartingCar } from '../src/render/car-departure';
import { FORWARD_START, REVERSE_SECONDS } from '../src/core/car-path';
import sweep from '../src/render/wagon-turn.json';
import { drawForest, drawStand, projectStand } from '../src/render/forest';
import { depthOf, project, type Rot, type View } from '../src/render/projection';
import { DEPTH_SORTED_TREES, treesIn, type Tree } from '../src/render/scenery';
import type { Drawable } from '../src/render/world';

type Point = { x: number; y: number };
type Matrix = [number, number, number, number, number, number];
const id = (): Matrix => [1, 0, 0, 1, 0, 0];
function compose([a,b,c,d,e,f]: Matrix, [A,B,C,D,E,F]: Matrix): Matrix {
  return [a*A+c*B, b*A+d*B, a*C+c*D, b*C+d*D, a*E+c*F+e, b*E+d*F+f];
}
const map = ([a,b,c,d,e,f]: Matrix, x: number, y: number): Point => ({ x: a*x+c*y+e, y: b*x+d*y+f });

interface Image { key?: string; width: number; height: number; draws?: Draw[] }
interface Draw { image: Image; matrix: Matrix; op: string; source: [number, number, number, number] }
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
  beginPath() {} arc() {} fill() {} rect() {} clip() {} fillRect() {}
  createRadialGradient() { return { addColorStop() {} }; }
  clearRect() { this.draws.length = 0; }
  drawImage(image: Image, ...args: number[]) {
    let sx = 0, sy = 0, sw = image.width, sh = image.height;
    if (args.length === 8) [sx, sy, sw, sh] = args.splice(0, 4) as [number, number, number, number];
    const [x, y, w = sw, h = sh] = args as [number, number, number?, number?];
    this.draws.push({ image, op: this.globalCompositeOperation, source: [sx, sy, sw, sh],
      matrix: compose(this.m, [w/sw, 0, 0, h/sh, x-sx*w/sw, y-sy*h/sh]) });
  }
  get ctx() { return this as unknown as CanvasRenderingContext2D; }
}
const sprites = vi.hoisted(() => new Map<string, { w: number; h: number; footX?: number; footY?: number; img: Image }>());
const unavailable = vi.hoisted(() => ({ stands: false }));
vi.mock('../src/engine/assets', () => ({ sprite: (key: string) => unavailable.stands && key.startsWith('forest_stands') ? undefined : sprites.get(key) }));
vi.mock('../src/render/shadows', () => ({ castShadow() {}, contactShadow() {} }));
const pixels = new Map<string, Uint8Array>();
beforeAll(async () => {
  for (const [key, entry] of Object.entries(manifest).filter(([k]) => k.startsWith('forest_stands') || k.startsWith('obj_trees') ||
    ['car_boarding', 'car_turn_sweep', 'car_tyre', 'car_wheel_faces'].includes(k))) {
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
  ] as const)('sorts the mature beech in front of its roadside neighbour in view %s', (rot, gx, gy, nx, ny) => {
    vi.stubGlobal('document', { createElement: () => new Surface() });
    try {
      const fringe = DEPTH_SORTED_TREES.find(t => Math.hypot(t.gx - gx, t.gy - gy) < .01)!;
      const near = treesIn(nx - .01, ny - .01, nx + .01, ny + .01)[0]!;
      const v = view(rot, gx, gy), n = projectStand(v, near)!;
      const c = new Surface(), foreground: Drawable[] = [];
      drawForest(c.ctx, v, .8, foreground);
      const depth = depthOf(rot, near.gx, near.gy);
      const draws = foreground.filter(d => d.depth === depth);
      expect(draws.length).toBeGreaterThan(0);
      expect(depth).toBeGreaterThan(depthOf(rot, fringe.gx, fringe.gy));
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

  it.each([0, 90, 125])('rotates the painted rims around both fixed hubs at %s degrees', angle => {
    const shot = carDepartureShot(false)!;
    const car = departingCar(shot, shot.rollAt, 0);
    if (car.kind !== 'driving') throw Error('Driver must be seated');
    const discs = (distance: number) => {
      const surface = new Surface();
      drawDepartingCar(surface.ctx, { ...car, steer: 0, distance, yaw: -angle * Math.PI / 180 }, { x: 0, y: 0 }, 112);
      return surface.draws.filter(draw => draw.image.key === 'car_wheel_faces' && draw.source[0] < 4*64)
        .sort((a, b) => a.source[0]-b.source[0]);
    };
    const rest = discs(0);
    expect(rest).toHaveLength(2);
    for (const direction of [-1, 1]) {
      const rolled = discs(direction * .30 * Math.PI / 2);
      for (const [axle, draw] of rolled.entries()) {
        const cell = (angle < 45 ? 0 : 2) + axle;
        const centre = (cell + .5) * 64;
        const hub = map(rest[axle]!.matrix, centre, 32), movingHub = map(draw.matrix, centre, 32);
        const mark = map(draw.matrix, centre, 64), quarterTurn = map(rest[axle]!.matrix, centre + direction * 32, 32);
        expect(movingHub.x).toBeCloseTo(hub.x, 8);
        expect(movingHub.y).toBeCloseTo(hub.y, 8);
        expect(mark.x).toBeCloseTo(quarterTurn.x, 8);
        expect(mark.y).toBeCloseTo(quarterTurn.y, 8);
      }
    }
  });

  it('keeps a broad rubber contact patch through the head-on view', () => {
    const { cell, columns } = sweep.tyre;
    for (let frame = 0; frame <= 3; frame++) {
      const left = frame % columns * cell, top = Math.floor(frame / columns) * cell;
      const rubberWidth = (y: number) => {
        let width = 0;
        for (let x = 0; x < cell; x++) if (alpha('car_tyre', left+x, top+y) > 128) width++;
        return width;
      };
      let bottom = cell - 1;
      while (bottom > cell/2 && !rubberWidth(bottom)) bottom--;
      expect(rubberWidth(bottom-2)).toBeGreaterThan(12);
    }
  });

  it('steers the front pair independently of the rear axle through the forward exit', () => {
    const shot = carDepartureShot(false, 'forward')!;
    const pose = (time: number) => {
      const car = departingCar(shot, shot.rollAt + time, 0);
      if (car.kind !== 'driving') throw Error('Driver must be seated');
      return car;
    };
    expect(pose(.8).steer).toBeGreaterThan(.3);
    expect(pose(2.9).steer).toBeLessThan(0);
    expect(pose(3.35).steer).toBeCloseTo(0, 6);
    const car = pose(.9);
    const wheels = (steer: number) => {
      const surface = new Surface();
      drawDepartingCar(surface.ctx, { ...car, steer, yaw: -Math.PI/4 }, { x: 0, y: 0 }, 112);
      return surface.draws.filter(draw => draw.image.key === 'car_tyre');
    };
    const straight = wheels(0), turning = wheels(car.steer);
    expect(turning).toHaveLength(4);
    for (const i of [0,2]) expect(turning[i]).toEqual(straight[i]);
    for (const i of [1,3]) expect(turning[i]).not.toEqual(straight[i]);
    const tile = ({ source: [x, y] }: Draw) => (x + y*sweep.tyre.columns)/sweep.tyre.cell;
    expect(tile(turning[1]!)).toBeGreaterThan(tile(turning[3]!));
    expect(tile(turning[3]!)).toBeGreaterThan(0);
  });

  it('turns the wagon about one ground mount at a constant scale, including while braking', () => {
    const shot = carDepartureShot(false)!, height = 112, root = { x: 371, y: 209 };
    const frames = new Set<number>();
    for (let tick = 0; tick <= (shot.duration - shot.rollAt) * 60; tick++) {
      const roll = tick / 60;
      const car = departingCar(shot, shot.rollAt + roll, 1);
      if (car.kind !== 'driving') throw Error('Driver must be seated');
      if (roll > REVERSE_SECONDS && roll < FORWARD_START) expect(car.brake).toBe(1);
      if (roll > FORWARD_START + .1 || roll < REVERSE_SECONDS - .33) expect(car.brake).toBe(0);
      const surface = new Surface();
      drawDepartingCar(surface.ctx, car, root, height);
      const m = surface.draws.find(draw => draw.image.key === 'car_turn_sweep')!.matrix;
      expect(m[0]).toBeCloseTo(m[3], 10);
      expect(m[1]).toBeCloseTo(-m[2], 10);
      expect(Math.hypot(m[0], m[1])).toBeCloseTo(height / sweep.unit, 10);
      const frame = Math.round(-car.yaw * 180 / Math.PI / sweep.stepDegrees);
      frames.add(frame);
      const mount = map(m, frame % sweep.columns * sweep.width + sweep.pivot[0]!,
        Math.floor(frame / sweep.columns) * sweep.height + sweep.pivot[1]!);
      expect(mount.x).toBeCloseTo(root.x, 8);
      expect(mount.y).toBeCloseTo(root.y, 8);
    }
    for (let f = 0; f <= 90 / sweep.stepDegrees; f++) expect(frames.has(f)).toBe(true);
  });

  it.each([
    [4.70, 28.294, 17.667, 11, 25],
    [5.40, 30.500, 14.251, 26, 22],
  ] as const)('keeps the departing wagon behind the foreground branches at %s seconds', (time, gx, gy, dx, dy) => {
    vi.stubGlobal('document', { createElement: () => new Surface() });
    try {
      const car = departingCar(carDepartureShot(false)!, time, .5), p = car.position;
      const v: View = { ...view(0, p.x, p.y), zoom: 1 }, root = project(v, p.x, p.y);
      const tree = treesIn(gx - .01, gy - .01, gx + .01, gy + .01)[0]!, stand = projectStand(v, tree)!;
      const c = new Surface(), foreground: Drawable[] = [];
      drawForest(c.ctx, v, time, foreground);
      const depth = depthOf(0, tree.gx, tree.gy);
      expect(foreground.some(item => item.depth === depth)).toBe(true);
      expect(depth).toBeGreaterThan(depthOf(0, p.x, p.y) + .4);
      c.draws.length = 0;
      drawDepartingCar(c.ctx, car, root, 112);
      let overlapping = 0;
      for (let x = root.x + dx - 1.5; x < root.x + dx + 2; x++) for (let y = root.y + dy - 1.5; y < root.y + dy + 2; y++) {
        const art = sprites.get(stand.key)!;
        const leafX = (x - stand.x + stand.w/2) * art.w / stand.w, leafY = (y - stand.y + stand.h) * art.h / stand.h;
        const wagonInk = c.draws.some(({ matrix: [a,b,k,d,e,f], source, image }) => {
          const u = ((x-e)*d - (y-f)*k) / (a*d-b*k), v = ((y-f)*a - (x-e)*b) / (a*d-b*k);
          const [sx, sy, sw, sh] = source;
          return u >= sx && u < sx+sw && v >= sy && v < sy+sh && alpha(image.key!, u, v) > 160;
        });
        if (wagonInk && alpha(stand.key, leafX, leafY) > 160) overlapping++;
      }
      expect(overlapping).toBeGreaterThan(0);
    } finally { vi.unstubAllGlobals(); }
  });
});

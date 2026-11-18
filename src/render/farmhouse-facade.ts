import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { farmSurface } from './farm-materials';
import { surfaceImage } from '../engine/material-images';
import { paintedFace } from './painted-surfaces';
import { seeded } from './noise';
import { plantImage } from './plant-images';

function makePalette() {
  return {
    render: farmSurface(surfaceImage('limewash') ? 'limewash' : 'plaster', 0.68),
    tile: farmSurface('roof', 0.76),
    rock: farmSurface('stone', 0.78, { color: 0xc2bbab }),
    oak: farmSurface('timber', 0.7, { color: 0xb6a58a }),
    shutter: farmSurface('timber', 0.74, { color: 0x849789 }),
    reveal: new MeshLambertMaterial({ color: 0x282a23 }),
    steel: farmSurface('iron', 0.56, { color: 0xa4a9a5, roughness: 0.78, metalness: 0.72 }),
    limestone: farmSurface('plaster', 0.34, { color: 0xe0d9c7 }),
    glass: new MeshStandardMaterial({
      color: 0xb2cacc,
      metalness: 0.14,
      roughness: 0.12,
      opacity: 0.36,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    }),
    unlit: new MeshStandardMaterial({ color: 0x363b35, roughness: 0.86, side: DoubleSide }),
    lit: new MeshStandardMaterial({ color: 0x9b795b, emissive: 0xffb969, emissiveIntensity: 0.55, roughness: 0.94, side: DoubleSide }),
    fabric: new MeshStandardMaterial({ color: 0xc0b69f, roughness: 1, side: DoubleSide }),
    warmFabric: new MeshStandardMaterial({ color: 0xc6a882, emissive: 0xffae62, emissiveIntensity: 0.22, roughness: 1, side: DoubleSide }),
  };
}
let shared: ReturnType<typeof makePalette>;
interface Aperture {
  x: number;
  bottom: number;
  w: number;
  h: number;
}

// UVs stay continuous across pieces of render. Timber uses fractional board widths
// from the scan so each stile or shutter slat has one length of grain.
function block(wall: Group, x: number, y: number, z: number, w: number, h: number, d: number, mat: Material, radius = 0): Mesh {
  const geo = radius ? new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 3, h / 3, d / 3)) : new BoxGeometry(w, h, d);
  const uv = geo.getAttribute('uv'),
    pos = geo.getAttribute('position'),
    normal = geo.getAttribute('normal');
  const timber = mat === shared.oak || mat === shared.shutter;
  for (let i = 0; i < uv.count; i++) {
    const px = pos.getX(i),
      py = pos.getY(i),
      pz = pos.getZ(i);
    const side = Math.abs(normal.getX(i)) > 0.62,
      top = Math.abs(normal.getY(i)) > 0.62;
    const s = side ? pz : px,
      t = top ? pz : py;
    if (timber) {
      const offset = ((Math.floor(Math.abs(x * 11 + y * 5)) % 9) + 0.32) * 0.098;
      uv.setXY(i, offset + (w > h ? t : s) * 0.22, (w > h ? s : t) * 0.56 + x * 0.37);
    } else if (mat === shared.tile) uv.setXY(i, (s + x) * 0.16 + 0.22, (t + y) * 0.25 + 0.41);
    else uv.setXY(i, (s + x) * 0.58, (t + y) * 0.58);
  }
  const mesh = new Mesh(geo, mat);
  mesh.position.set(x, y, z);
  wall.add(mesh);
  return mesh;
}

function panel(wall: Group, pts: readonly (readonly [number, number])[], mat: Material, z: number, side: number): void {
  const geo = new BufferGeometry();
  geo.setAttribute(
    'position',
    new Float32BufferAttribute(
      pts.flatMap(([x, y]) => [x, y, z]),
      3,
    ),
  );
  geo.setAttribute(
    'uv',
    new Float32BufferAttribute(
      pts.flatMap(([x, y]) =>
        surfaceImage('limewash') && mat === shared.render
          ? [0.5 + x * (side % 2 ? -0.241 : 0.241) + 0.009 * Math.sin(side), 0.018 + y * (side % 2 ? 0.332 : 0.243)]
          : [x * 0.59 + side * 0.477, y * 0.59 + 0.13],
      ),
      2,
    ),
  );
  geo.setIndex(pts.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  wall.add(new Mesh(geo, mat));
}

function wallSkin(wall: Group, holes: Aperture[], side: number): void {
  const cutsX = [...new Set([-2, 2, ...holes.flatMap((o) => [o.x - o.w / 2, o.x + o.w / 2])])].sort((a, b) => a - b);
  const cutsY = [...new Set([0, 0.29, 2.62, ...holes.flatMap((o) => [o.bottom, o.bottom + o.h])])].sort((a, b) => a - b);
  for (let i = 1; i < cutsX.length; i++)
    for (let j = 1; j < cutsY.length; j++) {
      const l = cutsX[i - 1]!,
        r = cutsX[i]!,
        b = cutsY[j - 1]!,
        t = cutsY[j]!;
      const x = (l + r) / 2,
        y = (b + t) / 2;
      if (holes.some((o) => Math.abs(x - o.x) < o.w / 2 && y > o.bottom && y < o.bottom + o.h)) continue;
      const footing = t <= 0.29;
      panel(
        wall,
        [
          [l, b],
          [r, b],
          [r, t],
          [l, t],
        ],
        footing && !surfaceImage('limewash') ? shared.rock : shared.render,
        footing ? 0.108 : 0.087,
        side,
      );
    }
  if (side % 2 === 0)
    panel(
      wall,
      [
        [-2, 2.62],
        [2, 2.62],
        [0, 3.97],
      ],
      shared.render,
      0.087,
      side,
    );
}

function curtains(wall: Group, x: number, y: number, w: number, h: number, night: boolean, seed: number): void {
  // Two actual folded curtains behind the glazing, open by different amounts.
  for (const side of [-1, 1]) {
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const f = i / 8,
        width = w * (0.13 + 0.1 * Math.abs(Math.sin(seed + side)));
      const px = x + side * (w / 2 - f * width),
        z = 0.042 + 0.012 * Math.cos(f * Math.PI * 4.5);
      pos.push(px, y + h / 2, z, px - side * 0.02 * f, y - h / 2 + 0.04 * f, z + 0.006);
      uv.push(f, 1, f, 0);
      if (i) {
        const k = 2 * i;
        idx.push(k - 2, k - 1, k, k, k - 1, k + 1);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    wall.add(new Mesh(geo, night ? shared.warmFabric : shared.fabric));
  }
}

function windowUnit(wall: Group, o: Aperture, night: boolean, seed: number, shutters = true): void {
  const x = o.x,
    y = o.bottom + o.h / 2,
    w = o.w,
    h = o.h;
  block(wall, x, y, 0.013, w, h, 0.023, night ? shared.lit : shared.unlit);
  // A furnished room sits behind the working lamp, folds and individual panes.
  // A single pane in the original farmhouse plate supplies the interior view.
  paintedFace(
    wall,
    'obj_house_front',
    [
      [x - w / 2, y + h / 2, 0.028],
      [x + w / 2, y + h / 2, 0.028],
      [x + w / 2, y - h / 2, 0.028],
      [x - w / 2, y - h / 2, 0.028],
    ],
    seed % 2
      ? [
          [158, 203],
          [170, 205],
          [170, 220],
          [158, 218],
        ]
      : [
          [175, 226],
          [189, 229],
          [189, 246],
          [175, 243],
        ],
    night,
  );
  curtains(wall, x, y, w - 0.075, h - 0.08, night, seed);
  const glass = new Mesh(new PlaneGeometry(w - 0.05, h - 0.06), shared.glass);
  glass.position.set(x, y, 0.064);
  wall.add(glass);
  for (const sign of [-1, 1]) {
    block(wall, x + sign * (w / 2 - 0.018), y, 0.086, 0.048, h, 0.102, shared.oak, 0.007);
    block(wall, x, y + sign * (h / 2 - 0.022), 0.085, w, 0.05, 0.106, shared.oak, 0.008);
  }
  block(wall, x + 0.013, y, 0.087, 0.026, h - 0.073, 0.046, shared.shutter, 0.004);
  for (const f of [-0.15, 0.18]) block(wall, x, y + h * f, 0.085, w - 0.055, 0.022, 0.045, shared.shutter, 0.003);
  block(wall, x, o.bottom - 0.031, 0.118, w + 0.16, 0.072, 0.26, shared.limestone, 0.02);
  block(wall, x, o.bottom + h + 0.065, 0.09, w + 0.2, 0.124, 0.18, shared.limestone, 0.019);
  if (!shutters) return;
  for (const s of [-1, 1]) {
    const width = w * 0.42,
      pivot = new Group();
    pivot.position.set(x + s * (w * 0.5 + 0.045), y, 0.12);
    pivot.rotation.y = -s * (0.08 + 0.2 * Math.abs(Math.sin(seed * 4 + s)));
    wall.add(pivot);
    for (let i = 0; i < 4; i++) block(pivot, (s * width * (i + 0.5)) / 4, 0, 0.012, width / 4 - 0.003, h - 0.015, 0.038, shared.shutter, 0.005);
    for (const dy of [-0.29, 0.28]) {
      block(pivot, s * width * 0.46, h * dy, 0.043, width * 0.86, 0.032, 0.018, shared.steel, 0.004);
      block(pivot, s * 0.012, h * dy, 0.057, 0.028, 0.065, 0.024, shared.steel, 0.008);
    }
  }
}

function plankDoor(wall: Group, o: Aperture): void {
  const y = o.bottom + o.h / 2,
    w = o.w,
    h = o.h;
  block(wall, o.x, y, 0.011, w, h, 0.032, shared.reveal);
  for (let i = 0; i < 6; i++) block(wall, o.x + w * ((i + 0.5) / 6 - 0.5), y, 0.042, w / 6 - 0.006, h - 0.038, 0.042, shared.oak, 0.007);
  for (const s of [-1, 1]) {
    block(wall, o.x + s * (w / 2 + 0.033), y, 0.102, 0.078, h + 0.06, 0.173, shared.limestone, 0.018);
    block(wall, o.x, y + s * h * 0.33, 0.076, w - 0.063, 0.077, 0.044, shared.oak, 0.007);
  }
  block(wall, o.x, o.bottom + h + 0.067, 0.108, w + 0.275, 0.15, 0.215, shared.limestone, 0.026);
  block(wall, o.x + w * 0.32, y - 0.08, 0.092, 0.07, 0.15, 0.025, shared.steel, 0.014);
  block(wall, o.x + w * 0.28, y - 0.042, 0.123, 0.116, 0.022, 0.066, shared.steel, 0.008);
  block(wall, o.x, 0.049, 0.225, w + 0.23, 0.098, 0.5, shared.rock, 0.024);
}

let leaf: MeshLambertMaterial | undefined;
function creeper(wall: Group, side: number): void {
  const foliage = plantImage('dead');
  if (!foliage) return;
  if (!leaf) {
    const texture = new CanvasTexture(foliage);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    leaf = new MeshLambertMaterial({ map: texture, color: 0xaa704b, side: DoubleSide, alphaTest: 0.42 });
  }
  const rand = seeded(313 + side),
    sign = side === 0 ? 1 : -1;
  for (let j = 0; j < 7; j++) {
    const h = 1.05 + rand() * 1.45,
      reach = (0.16 + rand() * 0.5) * (j % 3 === 0 ? -1 : 1);
    const path = new CatmullRomCurve3(
      Array.from({ length: 6 }, (_, i) => {
        const t = i / 5;
        return new Vector3(sign * (1.83 - reach * t + 0.076 * Math.sin(t * 9 + j)), h * t, 0.098 + 0.028 * t);
      }),
    );
    wall.add(new Mesh(new TubeGeometry(path, 10, 0.009 + rand() * 0.008, 4, false), shared.oak));
    for (let i = 1; i <= 16; i++) {
      const p = path.getPoint(i / 17),
        dir = i % 2 === 0 ? 1 : -1;
      const mesh = new Mesh(new PlaneGeometry(0.076 + rand() * 0.055, 0.11 + rand() * 0.082), leaf);
      mesh.position.copy(p);
      mesh.position.x += dir * (0.026 + rand() * 0.05);
      mesh.position.z += 0.012;
      mesh.rotation.set((rand() - 0.5) * 0.55, dir * rand() * 0.7, -dir * (0.47 + rand() * 0.94));
      wall.add(mesh);
    }
  }
}

export function scannedFacade(wall: Group, side: number, night: boolean): void {
  shared ??= makePalette();
  const door = { x: side % 2 === 0 ? -0.25 : 0.05, bottom: 0.05, w: 0.89, h: 1.44 };
  const windows: Aperture[] =
    side === 1
      ? [
          { x: 1.38, bottom: 0.88, w: 0.69, h: 0.92 },
          { x: -1.26, bottom: 1.1, w: 0.64, h: 0.72 },
        ]
      : [
          { x: -1.43, bottom: 1.02, w: 0.68, h: 0.89 },
          { x: 1.15, bottom: 0.96, w: 0.72, h: 1.0 },
        ];
  const attic = side % 2 === 0 ? { x: 0.012, bottom: 2.71, w: 0.56, h: 0.61 } : undefined;
  wallSkin(wall, [door, ...windows], side);
  plankDoor(wall, door);
  if (side % 2 === 0) {
    block(wall, 0, 2.594, 0.131, 3.96, 0.078, 0.082, shared.oak, 0.008);
    for (const sign of [-1, 1]) block(wall, sign * 0.985, 3.235, 0.125, 2.37, 0.084, 0.103, shared.oak, 0.009).rotation.z = -sign * 0.595;
    const porch = new Group();
    porch.position.set(door.x, 1.71, 0.37);
    porch.rotation.x = 0.21;
    wall.add(porch);
    block(porch, 0, 0.04, 0, 1.56, 0.088, 0.76, shared.tile, 0.014);
    // Each course sits over the one below it and curls over the eave.
    const pos: number[] = [],
      uv: number[] = [],
      idx: number[] = [];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 8; col++) {
        const start = pos.length / 3;
        for (let band = 0; band < 3; band++)
          for (let k = 0; k <= 6; k++) {
            const x = -0.79 + (col + k / 6) * 0.198,
              z = -0.38 + row * 0.243 + (band ? 0.279 : 0);
            const crown = 0.037 * Math.sin((Math.PI * k) / 6);
            pos.push(x, 0.071 + crown + (band === 1 ? 0.023 : 0) + row * 0.001, z);
            uv.push(0.13 + (x + 0.79) * 0.16, 0.42 + z * 0.25);
            if (band && k) {
              const i = start + band * 7 + k;
              idx.push(i - 8, i - 1, i - 7, i - 7, i - 1, i);
            }
          }
      }
    const surface = new BufferGeometry();
    surface.setAttribute('position', new Float32BufferAttribute(pos, 3));
    surface.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    surface.setIndex(idx);
    surface.computeVertexNormals();
    porch.add(new Mesh(surface, shared.tile));
    block(porch, 0, -0.035, 0.326, 1.61, 0.09, 0.077, shared.oak, 0.012);
    for (const s of [-1, 1]) {
      block(wall, door.x + s * 0.68, 0.84, 0.64, 0.073, 1.67, 0.083, shared.oak, 0.007);
      block(wall, door.x + s * 0.68, 0.14, 0.64, 0.13, 0.28, 0.15, shared.rock, 0.013);
      block(wall, door.x + s * 0.585, 1.47, 0.635, 0.056, 0.36, 0.061, shared.oak, 0.006).rotation.z = -s * 0.55;
    }
  }
  for (const [i, win] of windows.entries()) windowUnit(wall, win, night, i + side * 1.7, side !== 1 || i === 0);
  if (attic) {
    // The gable backing sits directly behind this little outward-set frame.
    const frame = new Group();
    frame.position.z = 0.084;
    wall.add(frame);
    windowUnit(frame, attic, night, side, false);
  }
  for (const sign of [-1, 1])
    for (let i = 0; i < 9; i++) {
      const width = (i + side) % 2 ? 0.18 : 0.285;
      block(wall, sign * (2 - width / 2), 0.31 + i * 0.257, 0.093, width, 0.202 + (i % 3) * 0.015, 0.087, shared.limestone, 0.024);
    }
  if (side === 0 || side === 3) creeper(wall, side);
}

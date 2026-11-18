// All dimensions are in yard cells. In model space X/Z are the two grid axes and Y is height.
import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  Shape,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
} from 'three';

import { finish, paintedFace } from './painted-surfaces';
import { sprite } from '../engine/assets';
import { claySlope, patchedRoof } from './clay-roof';
import { surfaceImage } from '../engine/material-images';
import { scannedFacade } from './farmhouse-facade';

const cube = new BoxGeometry();
const tapered = new CylinderGeometry(0.28, 0.5, 1, 7);
const cylinder = new CylinderGeometry(0.5, 0.5, 1, 16);
const materials = new Map<string, MeshLambertMaterial>();

// Hand-worn surfaces need detail at two scales: material colour from the yard view and
// chipped render, grain and tile lips when the night camera moves closer.
function surface(kind: 'tiles' | 'plaster' | 'wood' | 'stone'): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  let seed = 79;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = '#fff7de';
  ctx.fillRect(0, 0, 256, 256);
  if (kind === 'tiles') {
    // On the roof box's top UVs, U runs down the slope and V along the ridge.
    ctx.translate(256, 0);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#573e30';
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 10; row++) {
      for (let col = -1; col < 15; col++) {
        const x = col * 18 + (row % 2) * 9;
        const y = row * 26;
        const light = 33 + random() * 15;
        const wash = ctx.createLinearGradient(x, 0, x + 18, 0);
        wash.addColorStop(0, 'hsl(19 42% ' + (light - 14) + '%)');
        wash.addColorStop(0.42, 'hsl(19 54% ' + light + '%)');
        wash.addColorStop(0.73, 'hsl(24 55% ' + (light + 10) + '%)');
        wash.addColorStop(1, 'hsl(19 45% ' + (light - 3) + '%)');
        ctx.fillStyle = wash;
        ctx.fillRect(x, y, 17.5, 24 + random() * 2);
      }
    }
  } else if (kind === 'stone') {
    ctx.fillStyle = '#746957';
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 8; col++) {
        const x = col * 36 + (row % 2) * 17;
        ctx.fillStyle = 'hsl(35 18% ' + (54 + random() * 23) + '%)';
        ctx.beginPath();
        ctx.roundRect(x + 2, row * 64 + 3, 33, 58, 8);
        ctx.fill();
      }
    }
  } else if (kind === 'wood') {
    for (let i = 0; i < 85; i++) {
      const x = random() * 256;
      const y = random() * 256;
      ctx.strokeStyle = 'rgba(52,32,15,' + (0.08 + random() * 0.32) + ')';
      ctx.lineWidth = 0.8 + random() * 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x - 7, y + 22, x + 4, y + 35, x, y + 50 + random() * 80);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 280; i++) {
      const x = random() * 256;
      const y = random() * 256;
      const r = 2 + random() * 22;
      const patch = ctx.createRadialGradient(x, y, 0, x, y, r);
      patch.addColorStop(0, 'rgba(101,75,43,0.22)');
      patch.addColorStop(1, 'rgba(101,75,43,0)');
      ctx.fillStyle = patch;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }
  for (let i = 0; i < 4800; i++) {
    ctx.fillStyle = i % 3 ? 'rgba(49,38,24,0.11)' : 'rgba(255,235,181,0.2)';
    ctx.fillRect(random() * 256, random() * 256, 0.7 + random() * 2.3, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const surfaces = new Map<string, CanvasTexture>();

export function material(color: string): MeshLambertMaterial {
  let mat = materials.get(color);
  if (!mat) {
    mat = new MeshLambertMaterial({ color: color === 'tiles' ? '#ffffff' : color });
    const finish =
      color === 'tiles'
        ? color
        : color === masonry
          ? 'plaster'
          : color === '#827b65'
            ? 'stone'
            : timber.includes(color) || color === shutter
              ? 'wood'
              : null;
    if (finish) {
      let texture = surfaces.get(finish);
      if (!texture) {
        texture = surface(finish);
        surfaces.set(finish, texture);
      }
      mat.map = texture;
    }
    if (color === '#ffdf88' || color === '#fff2c4') mat.emissive = new Color(color).multiplyScalar(0.65);
    materials.set(color, mat);
  }
  return mat;
}

export function part(group: Group, x: number, y: number, z: number, w: number, h: number, d: number, color: string, round = false): Mesh {
  const mesh = new Mesh(round ? cylinder : cube, material(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

export function spar(g: Group, a: [number, number, number], b: [number, number, number], width: number, color: string, taper = false): Mesh {
  const delta = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const beam = part(g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, width, delta.length(), width, color, true);
  if (taper) beam.geometry = tapered;
  beam.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
  return taper ? finish(beam, 'bark') : beam;
}

const iron = '#434744';
const timber = ['#876347', '#9c7856', '#745941', '#a0835d'];
const shutter = '#486358';
const masonry = '#ceb58c';
const cream = '#e2ca9e';

function facade(wall: Group, night: boolean, doorX: number): void {
  // The door and the barricade drawn over it share the existing world-space anchor.
  part(wall, doorX, 0.74, 0.03, 0.91, 1.48, 0.12, '#5e4c3c');
  part(wall, doorX, 1.53, 0.08, 1.12, 0.14, 0.22, cream);
  // Salvaged timber canopy, a slightly crooked post and a yard lantern at each door.
  part(wall, doorX, 1.74, 0.3, 1.42, 0.11, 0.76, 'tiles').rotation.x = 0.23;
  part(wall, doorX, 1.61, 0.63, 1.47, 0.13, 0.09, timber[2]!);
  for (const dx of [-0.6, 0.6]) part(wall, doorX + dx, 0.81, 0.58, 0.09, 1.6, 0.1, timber[1]!);
  part(wall, doorX + 0.61, 1.4, 0.19, 0.13, 0.19, 0.14, '#ffdf88');
  for (const y of [1.29, 1.52]) part(wall, doorX + 0.61, y, 0.19, 0.2, 0.05, 0.22, iron);
  for (const dx of [-1.93, 1.93]) {
    for (let j = 0; j < 8; j++) {
      part(wall, dx, 0.47 + j * 0.285, 0.05, j % 2 ? 0.26 : 0.16, 0.24, 0.12, j % 3 ? '#ad9877' : '#c2af8c');
    }
  }
  for (const x of [-1.32, 1.3]) {
    part(wall, x, 1.68, 0.055, 0.73, 0.96, 0.13, '#4a443a');
    part(wall, x, 1.68, 0.13, 0.54, 0.73, 0.04, night ? '#ffdf88' : '#889786');
    part(wall, x, 1.68, 0.16, 0.055, 0.78, 0.06, cream);
    part(wall, x, 1.67, 0.16, 0.58, 0.052, 0.06, cream);
    part(wall, x, 1.16, 0.1, 0.9, 0.1, 0.3, cream);
    for (const sign of [-1, 1]) {
      const sx = x + sign * 0.5;
      part(wall, sx, 1.68, 0.06, 0.28, 0.96, 0.09, shutter);
      for (const y of [1.39, 1.82]) part(wall, sx, y, 0.12, 0.29, 0.065, 0.036, '#34473f');
    }
  }
}

function paintedFacade(wall: Group, side: number, night: boolean): void {
  const front = side < 2;
  const art = front ? 'obj_house_front' : 'obj_house_back';
  const z = 0.032;
  if (side % 2 === 0) {
    const left = front ? ([25, 230] as const) : ([41, 257] as const);
    const right = front ? ([298, 278] as const) : ([297, 316] as const);
    paintedFace(
      wall,
      art,
      [
        [-2, 2.62, z],
        [2, 2.62, z],
        [2, 0, z],
        [-2, 0, z],
      ],
      [left, right, front ? [297, 524] : [298, 526], front ? [25, 470] : [41, 449]],
      night,
    );
    paintedFace(
      wall,
      art,
      [
        [-2, 2.62, z],
        [0, 3.97, z],
        [2, 2.62, z],
      ],
      [left, front ? [159, 106] : [151, 124], right],
      night,
    );
    const door = -0.02;
    // Porch tiles stand away from the wall, with exposed end grain, knees and stone steps.
    const eave = new Group();
    eave.position.set(door, 1.79, 0.33);
    eave.rotation.x = 0.24;
    part(eave, 0, 0, 0, 1.68, 0.12, 0.77, timber[2]!);
    paintedFace(
      eave,
      'obj_house_front',
      [
        [-0.84, 0.07, -0.39],
        [0.84, 0.07, -0.39],
        [0.84, 0.07, 0.39],
        [-0.84, 0.07, 0.39],
      ],
      [
        [144, 296],
        [249, 311],
        [218, 350],
        [114, 334],
      ],
    );
    wall.add(eave);
    for (const sign of [-1, 1]) {
      part(wall, door + sign * 0.72, 0.85, 0.57, 0.095, 1.64, 0.11, timber[1]!);
      part(wall, door + sign * 0.72, 0.17, 0.57, 0.17, 0.31, 0.19, '#9b8771');
      part(wall, door + sign * 0.61, 1.53, 0.55, 0.08, 0.38, 0.1, timber[2]!).rotation.z = -sign * 0.64;
    }
    for (let i = 0; i < 2; i++) {
      finish(part(wall, door, 0.045 + i * 0.06, 0.57 - i * 0.17, 1.26 - i * 0.09, 0.09 + i * 0.12, 0.58, '#aa9274'), 'brick');
    }
  } else if (side === 1) {
    paintedFace(
      wall,
      art,
      [
        [-2, 2.62, z],
        [2, 2.62, z],
        [2, 1.65, z],
        [-2, 1.65, z],
      ],
      [
        [310, 251],
        [508, 183],
        [508, 268],
        [309, 324],
      ],
      night,
    );
    part(wall, 0, 0.8, 0.08, 3.99, 1.6, 0.14, timber[2]!);
    paintedFace(
      wall,
      art,
      [
        [-2, 1.64, 0.16],
        [2, 1.64, 0.16],
        [2, 0, 0.16],
        [-2, 0, 0.16],
      ],
      [
        [351, 374],
        [533, 328],
        [529, 467],
        [351, 522],
      ],
      night,
    );
    paintedFace(
      wall,
      art,
      [
        [-2, 1.89, 0.01],
        [2, 1.89, 0.01],
        [2, 1.64, 0.54],
        [-2, 1.64, 0.54],
      ],
      [
        [307, 324],
        [492, 271],
        [540, 313],
        [351, 366],
      ],
    );
    part(wall, 0, 1.6, 0.51, 4.06, 0.085, 0.11, timber[2]!);
    for (const x of [-1.88, 0, 1.88]) part(wall, x, 1.66, 0.22, 0.11, 0.12, 0.57, timber[2]!).rotation.x = 0.43;
  } else {
    paintedFace(
      wall,
      art,
      [
        [-2, 2.62, z],
        [2, 2.62, z],
        [2, 0, z],
        [-2, 0, z],
      ],
      [
        [312, 316],
        [510, 247],
        [513, 449],
        [310, 520],
      ],
      night,
    );
  }
}

function wallHardware(wall: Group, side: number, night: boolean): void {
  // Working hardware reads in silhouette, including from the opposite surveillance angle.
  const cx = side % 2 === 0 ? -1.59 : 1.55;
  const camera = new Group();
  camera.position.set(cx, 2.26, 0.16);
  camera.rotation.y = side % 2 === 0 ? -0.42 : 0.38;
  part(camera, 0, 0, -0.05, 0.13, 0.14, 0.29, iron);
  part(camera, 0, 0.055, 0.15, 0.28, 0.17, 0.38, '#b5ad96').rotation.x = 0.13;
  part(camera, 0, 0.152, 0.19, 0.32, 0.03, 0.48, '#817d72');
  paintedFace(
    camera,
    'obj_house_front',
    [
      [-0.161, 0.169, -0.05],
      [0.161, 0.169, -0.05],
      [0.161, 0.169, 0.43],
      [-0.161, 0.169, 0.43],
    ],
    [
      [458, 213],
      [477, 205],
      [500, 215],
      [484, 222],
    ],
  );
  for (const s of [-1, 1]) {
    paintedFace(
      camera,
      'obj_house_front',
      [
        [s * 0.142, 0.133, -0.025],
        [s * 0.142, 0.1, 0.337],
        [s * 0.142, -0.049, 0.337],
        [s * 0.142, -0.015, -0.025],
      ],
      [
        [460, 215],
        [483, 224],
        [484, 232],
        [460, 225],
      ],
    );
  }
  part(camera, 0, 0.023, 0.357, 0.21, 0.13, 0.036, '#30382e');
  part(camera, -0.031, 0.027, 0.382, 0.092, 0.021, 0.092, '#667b74', true).rotation.x = Math.PI / 2;
  part(camera, 0.056, 0.047, 0.37, 0.04, 0.04, 0.025, '#be4f3b');
  wall.add(camera);
  const lx = side === 1 ? -1.64 : 0.89;
  part(wall, lx, 1.41, 0.16, 0.18, 0.23, 0.15, night ? '#ffdf88' : '#ba9255', true);
  for (const y of [1.27, 1.55]) part(wall, lx, y, 0.16, 0.24, 0.06, 0.23, iron, true);
  for (const dx of [-0.069, 0.069]) {
    spar(wall, [lx + dx, 1.29, 0.215], [lx + dx, 1.52, 0.215], 0.017, '#615948');
  }
  tubing(
    wall,
    [
      [lx, 1.55, 0.16],
      [lx, 1.64, 0.15],
      [lx, 1.655, 0.061],
    ],
    0.02,
    iron,
  );
}

type XYZ = readonly [number, number, number];
type UVPoint = readonly [number, number];

function tubing(group: Group, points: readonly XYZ[], radius: number, color: string): void {
  const path = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
  const mesh = new Mesh(new TubeGeometry(path, points.length === 2 ? 1 : points.length * 3, radius, 8, false), material(color));
  group.add(mesh);
}

// Invert the two triangles used for the painted roof. Metal ridges, boards and nail heads
// then sit over their exact marks in the artwork from either side of the house.
function fromRoofArt([x, y]: UVPoint, lift: number): XYZ {
  const [a, b, c, d] = patchedRoof;
  const cross = (p: UVPoint, q: UVPoint) => (p[0] - a[0]) * (q[1] - a[1]) - (p[1] - a[1]) * (q[0] - a[0]);
  const point: UVPoint = [x, y];
  const first = cross(c, point) <= 0;
  const u = first ? (cross(point, c) + cross(b, point)) / cross(b, c) : cross(point, d) / cross(c, d);
  const v = first ? cross(b, point) / cross(b, c) : (cross(point, d) + cross(c, point)) / cross(c, d);
  return [2.22 * v + 0.562 * lift, 4.1 - 1.506 * v + 0.827 * lift, 2.235 - 4.47 * u];
}

const between = (a: UVPoint, b: UVPoint, t: number): UVPoint => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function corrugatedSheet(g: Group, locate: (u: number, v: number, ridge: number, pixel: UVPoint) => XYZ): void {
  const topLeft: UVPoint = [380, 146],
    topRight: UVPoint = [421, 133];
  const bottomLeft: UVPoint = [435, 201],
    bottomRight: UVPoint = [477, 184];
  for (let i = 0; i < 16; i++) {
    const a = i / 16,
      b = (i + 1) / 16;
    const corners = [
      [a, 0, i % 2],
      [b, 0, (i + 1) % 2],
      [b, 1, (i + 1) % 2],
      [a, 1, i % 2],
    ] as const;
    const pixels = corners.map(([u, v]) => (v === 0 ? between(topLeft, topRight, u) : between(bottomLeft, bottomRight, u)));
    paintedFace(
      g,
      'obj_house_back',
      corners.map(([u, v, rib], j) => locate(u, v, rib, pixels[j]!)),
      pixels,
    );
  }
}

function roofRepairs(g: Group): void {
  const art = 'obj_house_back';
  const exposed = [
    [242, 146],
    [303, 126],
    [360, 195],
    [298, 220],
  ] as const;
  paintedFace(
    g,
    art,
    exposed.map((p) => fromRoofArt(p, 0.073)),
    exposed,
  );
  corrugatedSheet(g, (_u, _v, rib, pixel) => fromRoofArt(pixel, 0.076 + rib * 0.05));
  for (const board of [
    [
      [249, 152],
      [322, 147],
      [329, 164],
      [252, 170],
    ],
    [
      [284, 218],
      [339, 172],
      [351, 183],
      [297, 232],
    ],
  ] as const) {
    const top = board.map((p) => fromRoofArt(p, 0.113));
    for (let i = 0; i < 4; i++) {
      const end = (i + 1) % 4;
      paintedFace(
        g,
        art,
        [top[i]!, top[end]!, fromRoofArt(board[end]!, 0), fromRoofArt(board[i]!, 0)],
        [board[i]!, board[end]!, between(board[end]!, board[(end + 2) % 4]!, 0.09), between(board[i]!, board[(i + 2) % 4]!, 0.09)],
      );
    }
    paintedFace(g, art, top, board);
    for (const index of [0, 2]) {
      const [x, y, z] = fromRoofArt(between(board[index]!, board[(index + 2) % 4]!, 0.14), 0.125);
      part(g, x, y, z, 0.045, 0.02, 0.045, iron, true).rotation.z = -0.596;
    }
  }
}

function atticWindow(g: Group, night: boolean): void {
  const dormer = new Group();
  dormer.position.set(-1.54, 3.43, 0.72);
  dormer.rotation.y = -Math.PI / 2;
  // The cheeks disappear below the main roof. A shallow pitched cap projects over the frame.
  finish(part(dormer, 0, 0, -0.45, 1.02, 0.67, 0.94, timber[2]!), 'hewn');
  part(dormer, 0, 0.015, 0.038, 0.85, 0.46, 0.055, iron);
  part(dormer, 0, 0.025, 0.077, 0.72, 0.35, 0.028, night ? '#ffdf88' : '#839790');
  paintedFace(
    dormer,
    'obj_house_front',
    [
      [-0.36, 0.2, 0.094],
      [0.36, 0.2, 0.094],
      [0.36, -0.15, 0.094],
      [-0.36, -0.15, 0.094],
    ],
    [
      [155, 198],
      [192, 203],
      [192, 252],
      [155, 247],
    ],
    night,
  );
  for (const x of [-0.36, 0, 0.36]) part(dormer, x, 0.025, 0.104, 0.047, 0.4, 0.045, shutter);
  part(dormer, 0, -0.005, 0.103, 0.77, 0.044, 0.044, shutter);
  part(dormer, 0, -0.21, 0.09, 1.07, 0.078, 0.19, '#938474');
  const gable = new Shape();
  gable.moveTo(-0.52, 0.32);
  gable.lineTo(0, 0.64);
  gable.lineTo(0.52, 0.32);
  gable.closePath();
  const face = new Mesh(new ExtrudeGeometry(gable, { depth: 1.17, bevelEnabled: false }), material(timber[1]!));
  face.position.z = -1.12;
  dormer.add(face);
  for (const side of [-1, 1]) {
    const half = new Group();
    half.position.set(side * 0.29, 0.5, -0.55);
    half.rotation.z = -side * 0.55;
    part(half, 0, 0, 0, 0.72, 0.075, 1.44, '#54675e');
    corrugatedSheet(half, (u, v, rib) => [side * (v - 0.5) * 0.72, 0.04 + rib * 0.032, (u - 0.5) * 1.44]);
    for (const z of [-0.52, 0, 0.52]) part(half, side * 0.25, 0.079, z, 0.044, 0.017, 0.044, '#82735a', true);
    part(half, 0, -0.03, 0.72, 0.74, 0.095, 0.04, '#b99b73');
    dormer.add(half);
  }
  for (const y of [0.39, 0.46]) part(dormer, 0, y, 0.065, 0.35 - (y - 0.39) * 1.2, 0.032, 0.025, iron);
  g.add(dormer);
}

function aerial(g: Group): void {
  const mast: XYZ = [-0.28, 4.0, -1.46];
  const [x, , z] = mast;
  tubing(g, [mast, [x, 5.06, z]], 0.034, '#797d71');
  for (const y of [4.18, 4.83]) part(g, x, y, z, 0.102, 0.055, 0.102, '#c4ad84', true);
  tubing(
    g,
    [
      [x - 0.27, 4.99, z - 0.78],
      [x + 0.28, 4.99, z + 0.82],
    ],
    0.024,
    '#a6aa99',
  );
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const px = x - 0.24 + 0.48 * t,
      pz = z - 0.7 + 1.43 * t;
    const span = 0.43 - 0.18 * t;
    tubing(
      g,
      [
        [px - span, 5.005, pz + span * 0.34],
        [px + span, 5.005, pz - span * 0.34],
      ],
      0.018,
      '#b9b8a4',
    );
  }
  tubing(
    g,
    [
      [x, 4.92, z],
      [x - 0.08, 4.77, z + 0.14],
      [x - 0.06, 4.22, z + 0.07],
      [-0.61, 3.78, -1.82],
      [-1.48, 3.17, -2.13],
      [-1.9, 2.72, -2.16],
      [-1.91, 2.29, -2.09],
    ],
    0.022,
    '#453e35',
  );
}

export function farmhouse(night: boolean): Group {
  const g = new Group();
  part(g, 0, 0.18, 0, 4.04, 0.36, 4.04, '#827b65');
  part(g, 0, 1.48, 0, 3.98, 2.28, 3.98, masonry);
  // The same floor is exposed when the roof cuts away for a placement or an approaching enemy.
  for (let row = 0; row < 12; row++) {
    const seam = Math.sin(row * 2.1) * 0.84;
    for (const [left, right] of [
      [-1.97, seam - 0.014],
      [seam + 0.006, 1.97],
    ] as const)
      finish(part(g, (left + right) / 2, 0.37, -1.81 + row * 0.33, right - left, 0.065, 0.316, timber[row % 4]!), 'log');
  }
  part(g, 0, 0.413, 0.19, 1.34, 0.019, 2.12, '#8b4e39');
  for (const side of [-1, 1]) part(g, side * 0.55, 0.427, 0.19, 0.05, 0.013, 1.98, '#bd9b67');
  for (const z of [-0.68, -0.54, 0.91, 1.05]) part(g, 0, 0.427, z, 1.24, 0.013, 0.044, '#aa8e62');
  // Triangular end walls, with the ridge running in the Z direction.
  const section = new Shape();
  section.moveTo(-1.99, 2.62);
  section.lineTo(0, 3.97);
  section.lineTo(1.99, 2.62);
  section.closePath();
  const gable = new Mesh(new ExtrudeGeometry(section, { depth: 3.98, bevelEnabled: false }), material(masonry));
  gable.position.z = -1.99;
  gable.castShadow = gable.receiveShadow = true;
  g.add(gable);
  for (let side = 0; side < 4; side++) {
    const wall = new Group();
    const yaw = (side * Math.PI) / 2;
    wall.position.set(Math.sin(yaw) * 2, 0, Math.cos(yaw) * 2);
    wall.rotation.y = yaw;
    const art = sprite(side < 2 ? 'obj_house_front' : 'obj_house_back');
    if (surfaceImage('plaster')) scannedFacade(wall, side, night);
    else if (art) paintedFacade(wall, side, night);
    else facade(wall, night, side % 2 === 0 ? -0.25 : 0.05);
    if (art || surfaceImage('plaster')) wallHardware(wall,side,night);
    if (!art && !surfaceImage('plaster') && side % 2 === 0) {
      for (const dx of [-0.94, 0.94]) {
        part(wall, dx, 2.63, 0.12, 1.92, 0.12, 0.12, timber[2]!);
        part(wall, dx, 3.15, 0.085, 2.25, 0.12, 0.14, timber[1]!).rotation.z = -Math.sign(dx) * 0.59;
      }
      part(wall, 0, 3.32, 0.1, 0.16, 1.18, 0.13, timber[2]!);
      part(wall, 0, 3.12, 0.04, 0.47, 0.52, 0.13, '#635545');
      part(wall, 0, 3.12, 0.12, 0.31, 0.37, 0.03, night ? '#ffdf88' : '#8a998a');
    }
    g.add(wall);
  }
  atticWindow(g, night);
  aerial(g);
  for (const sign of [-1, 1]) {
    const roof = part(g, sign * 1.1, 3.25, 0, 2.69, 0.15, 4.48, 'tiles');
    roof.rotation.z = -sign * Math.atan(1.35 / 1.99);
    const courses = claySlope(sign);
    if (courses) g.add(courses);
    for (let i = 0; i < 9; i++) part(g, sign * 2.03, 2.51, -1.96 + i * 0.49, 0.3, 0.11, 0.1, timber[2]!).rotation.z = -sign * 0.42;
    part(g, sign * 2.18, 2.46, 0, 0.12, 0.12, 4.5, '#55473c');
    // Rolled gutter edge, socket joints and swan neck down to the shoe at ground level.
    const z = -1.83 * sign;
    tubing(
      g,
      [
        [sign * 2.22, 2.51, -2.24],
        [sign * 2.22, 2.51, 2.24],
      ],
      0.082,
      '#5b655d',
    );
    tubing(
      g,
      [
        [sign * 2.26, 2.555, -2.24],
        [sign * 2.26, 2.555, 2.24],
      ],
      0.025,
      '#939786',
    );
    tubing(
      g,
      [
        [sign * 2.22, 2.51, z],
        [sign * 2.23, 2.27, z],
        [sign * 2.11, 2.13, z],
        [sign * 2.105, 1.93, z],
      ],
      0.072,
      '#58665f',
    );
    part(g, sign * 2.105, 1.05, z, 0.145, 1.81, 0.145, '#657269', true);
    tubing(
      g,
      [
        [sign * 2.105, 0.22, z],
        [sign * 2.11, 0.14, z],
        [sign * 2.23, 0.115, z],
      ],
      0.077,
      '#656e65',
    );
    for (const y of [0.38, 1.21, 1.97, 2.42]) part(g, sign * (y > 2.4 ? 2.22 : 2.105), y, z, 0.172, 0.068, 0.172, '#a19779', true);
    for (const dz of [-1.6, -0.54, 0.52, 1.58]) part(g, sign * 2.22, 2.5, dz, 0.18, 0.13, 0.058, '#8c8874');
  }
  for (let i = 0; i < 15; i++) {
    const z = -2.1 + i * 0.3;
    finish(part(g, 0, 4.061, z, 0.264, 0.32, 0.236, '#a65e3e', true), 'ridge').rotation.x = Math.PI / 2;
    part(g, 0, 4.04, z - 0.135, 0.277, 0.044, 0.238, '#b8774b', true).rotation.x = Math.PI / 2;
  }
  if (sprite('obj_house_back')) roofRepairs(g);
  else {
    const patch = new Group();
    patch.position.set(1.24, 3.24, -0.6);
    patch.rotation.z = -Math.atan(1.35 / 1.99);
    part(patch, 0, 0.08, 0, 0.86, 0.04, 0.75, '#797d70');
    for (let i = 0; i < 6; i++) part(patch, 0, 0.11, -0.32 + i * 0.13, 0.86, 0.028, 0.032, '#acaa95');
    g.add(patch);
  }
  part(g, 0.8, 3.96, -1.04, 0.42, 1.25, 0.47, '#a55f49');
  const chimney = 'obj_house_front';
  for (const sign of [-1, 1]) {
    paintedFace(
      g,
      chimney,
      [
        [0.583, 4.57, -1.04 + sign * 0.24],
        [1.017, 4.57, -1.04 + sign * 0.24],
        [1.017, 3.45, -1.04 + sign * 0.24],
        [0.583, 3.45, -1.04 + sign * 0.24],
      ],
      [
        [372, 33],
        [398, 43],
        [400, 104],
        [371, 91],
      ],
    );
    paintedFace(
      g,
      chimney,
      [
        [0.8 + sign * 0.215, 4.57, -0.8],
        [0.8 + sign * 0.215, 4.57, -1.28],
        [0.8 + sign * 0.215, 3.45, -1.28],
        [0.8 + sign * 0.215, 3.45, -0.8],
      ],
      [
        [404, 39],
        [432, 27],
        [433, 93],
        [405, 105],
      ],
    );
  }
  part(g, 0.8, 4.56, -1.04, 0.56, 0.13, 0.6, '#857057');
  // A recessed flue keeps the top of the brick stack open from the elevated camera.
  part(g, 0.8, 4.635, -1.04, 0.34, 0.024, 0.39, '#382e27');
  for (const sign of [-1, 1]) {
    part(g, 0.8 + sign * 0.23, 4.67, -1.04, 0.09, 0.09, 0.55, '#b79775');
    part(g, 0.8, 4.67, -1.04 + sign * 0.23, 0.39, 0.09, 0.09, '#bc9c78');
  }
  const cap = [
    [0.52, 4.72, -0.74],
    [1.08, 4.72, -0.74],
    [1.08, 4.72, -1.34],
    [0.52, 4.72, -1.34],
  ] as const;
  const lip = [
    [0.626, 4.72, -0.855],
    [0.974, 4.72, -0.855],
    [0.974, 4.72, -1.225],
    [0.626, 4.72, -1.225],
  ] as const;
  const edge = [
    [370, 13],
    [398, 24],
    [434, 11],
    [405, 3],
  ] as const;
  const opening = [
    [382, 13],
    [398, 18],
    [420, 11],
    [404, 7],
  ] as const;
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    paintedFace(g, chimney, [cap[i]!, cap[next]!, lip[next]!, lip[i]!], [edge[i]!, edge[next]!, opening[next]!, opening[i]!]);
  }
  return g;
}

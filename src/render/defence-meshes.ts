// Moving assemblies use local pivots. The same geometry can be posed for a single
// static batch or kept articulated for a trigger, repair cycle or collapse.
import {
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  TorusGeometry,
  Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { DeviceTypeId } from '../core/types';
import { material, part as cylinderPart } from './gate-models';
import { rivenBoard, roundTimber, strand, whittledStake, woodenSpar } from './defence-geometry';
import { weatherFittings } from './defence-materials';
import { paintedFace } from './painted-surfaces';
import { solid } from './yard-meshes';

type Point = [x: number, y: number, z: number];
type UV = [number, number];
export type Wear = 'whole' | 'battered' | 'wreck';
export interface DefenceParts {
  frame: Group;
  main: Group;
  secondary: Group;
  rigging: Group;
  signal: Group;
}
export function emptyParts(): DefenceParts {
  return { frame: new Group(), main: new Group(), secondary: new Group(), rigging: new Group(), signal: new Group() };
}

const oak = '#9b7148',
  tar = '#403f39',
  iron = '#515851',
  steel = '#97a4a0',
  rust = '#a95c38',
  straw = '#ccb17a',
  ropeShadow = '#977341';
const peg = new CylinderGeometry(0.5, 0.5, 1, 7);
// Small cast parts retain a light-catching lip even where the metal is very dark.
function part(g: Group, x: number, y: number, z: number, w: number, h: number, d: number, colour: string, round = false): Mesh {
  if (round) return cylinderPart(g, x, y, z, w, h, d, colour, true);
  const r = Math.min(0.029, Math.min(w, h, d) * 0.2);
  const m = new Mesh(new RoundedBoxGeometry(w, h, d, 1, r), material(colour));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function cord(g: Group, points: readonly Point[], width: number, colour: string): void {
  strand(g, points, width, colour, (colour === straw || colour === ropeShadow) && width >= 0.032);
}
function board(g: Group, x: number, y: number, z: number, w: number, h: number, d: number): Mesh {
  const seed = Math.round((x + 1) * 547 + (y + 1) * 281 + (z + 1) * 131 + w * 71 + h * 13 + d * 23);
  const alongX = w >= h && w >= d,
    alongZ = !alongX && d >= h;
  const geom = alongX ? rivenBoard(h, w, d, seed, false) : alongZ ? rivenBoard(w, d, h, seed, false) : rivenBoard(w, h, d, seed, false);
  if (alongX) geom.rotateZ(-Math.PI / 2);
  else if (alongZ) geom.rotateX(Math.PI / 2);
  const m = new Mesh(geom, material(oak));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
function bolt(g: Group, x: number, y: number, z: number, size = 0.048): void {
  const washer = new Mesh(peg, material(iron));
  washer.position.set(x, y, z);
  washer.scale.set(size * 1.34, 0.008, size * 1.34);
  washer.rotation.x = Math.PI / 2;
  g.add(washer);
  const head = new Mesh(peg, material('#646459'));
  head.position.set(x, y, z + Math.sign(z || 1) * 0.006);
  head.scale.set(size, 0.018, size);
  head.rotation.set(Math.PI / 2, 0, x * 29 + y * 26);
  g.add(head);
}
function bind(g: Group, x: number, y: number, z: number, radius: number, axis: 'x' | 'y' = 'y', turns = 3): void {
  const points: Point[] = [];
  const thickness = radius * 0.185 + 0.003;
  for (let i = 0; i <= turns * 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.71,
      along = (i / 12) * thickness * 0.93;
    const r = radius * (0.98 + 0.021 * Math.sin(a * 4 + 0.6));
    points.push(
      axis === 'y' ? [x + Math.cos(a) * r, y + along, z + Math.sin(a) * r] : [x + along, y + Math.cos(a) * r, z + Math.sin(a) * r],
    );
  }
  strand(g, points, thickness, straw, true);
  if (turns >= 3 && axis === 'y') {
    const stop = points[points.length - 1]!,
      tail: Point = [stop[0] + thickness * 0.66, stop[1] - thickness * 2.95, stop[2] + thickness * 0.57];
    strand(
      g,
      [
        stop,
        [stop[0] + thickness * 0.35, stop[1] + thickness * 0.31, stop[2] + thickness * 0.53],
        tail,
        [tail[0] + thickness * 0.58, tail[1] - thickness * 0.6, tail[2] + thickness * 0.13],
      ],
      thickness * 0.92,
      straw,
      true,
    );
  }
}
function paling(g: Group, x: number, y: number, z: number, w: number, h: number, d: number, cracked: boolean, seed: number): Group {
  const group = new Group(),
    m = new Mesh(rivenBoard(w, h, d, seed, cracked), material(oak));
  m.position.y = h / 2;
  group.add(m);
  group.position.set(x, y, z);
  g.add(group);
  return group;
}

function fence(p: DefenceParts, wide: boolean, wear: Wear): void {
  const w = wide ? Math.SQRT2 : 1,
    broken = wear === 'wreck',
    battered = wear === 'battered';
  for (const side of [-1, 1]) {
    const px = side * w * 0.492;
    const upright = paling(p.frame, px, 0, 0, 0.174, broken ? (side < 0 ? 0.39 : 0.255) : 0.99, 0.184, broken, side < 0 ? 2 : 1);
    upright.rotation.z = side * (broken ? 0.09 : 0.014);
    bind(p.frame, px, 0.17, 0, 0.115);
    if (!broken) bind(p.frame, px, 0.751, 0, 0.114);
    solid(p.frame, px + side * 0.042, 0.053, -0.085, 0.164, 0.12, 0.18, '#7f7965', 'rock');
  }
  for (const y of [0.19, 0.57]) {
    const rail = board(p.main, 0, y, -0.087, w * (broken ? 0.7 : 0.99), 0.095, 0.073);
    if (broken) rail.rotation.z = 0.11;
  }
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * w * 0.165,
      h = [0.78, 0.88, 0.815, 0.76, 0.865][i]!;
    const loose = i === 1 || i === 2;
    const group = loose ? p.secondary : p.main;
    const plank = paling(
      group,
      x,
      0.022,
      i % 2 ? 0.016 : 0.006,
      w * 0.157,
      broken ? h * 0.77 : battered && loose ? h * 0.69 : h,
      0.114,
      broken || (battered && loose),
      i,
    );
    plank.rotation.z = (i % 2 ? 0.027 : -0.017) + (broken ? 0.057 * i : 0);
    for (const h of [0.2, 0.56]) bolt(plank, 0, h, 0.071, 0.029);
  }
  if (broken) {
    cord(
      p.frame,
      [
        [-0.49 * w, 0.31, 0.04],
        [-0.47 * w, 0.13, 0.18],
        [-0.35 * w, 0.045, 0.24],
      ],
      0.031,
      straw,
    );
    const splinter = paling(p.frame, w * 0.22, 0.075, -0.18, 0.073, 0.32, 0.042, true, 4);
    splinter.rotation.x = -1.43;
  }
}

function spring(g: Group, x: number, y: number, z: number, length: number): void {
  const points: Point[] = [];
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI * 8;
    points.push([x + Math.cos(a) * 0.061, y + Math.sin(a) * 0.061, z + (length * i) / 26]);
  }
  cord(g, points, 0.026, steel);
}
function stakes(p: DefenceParts, broken: boolean): void {
  for (const x of [-0.486, 0.486]) {
    const runner = board(p.frame, x, 0.105, 0, 0.115, 0.21, 0.94);
    if (broken && x > 0) runner.rotation.y = -0.105;
    for (const z of [-0.38, 0.38]) part(p.frame, x, 0.104, z, 0.128, 0.223, 0.07, iron);
  }
  for (const z of [-0.405, 0.405]) board(p.frame, 0, 0.1, z, 1.01, 0.2, 0.085);
  part(p.frame, 0, 0.072, 0, 0.9, 0.105, 0.79, '#3a3831');
  spring(p.frame, broken ? -0.53 : -0.284, broken ? 0.09 : 0.14, broken ? 0.13 : -0.24, 0.33);
  spring(p.frame, 0.285, 0.14, -0.244, 0.33);

  for (let i = 0; i < (broken ? 3 : 5); i++) board(p.main, (i - (broken ? 1 : 2)) * 0.191, 0.018, 0.408, 0.186, 0.06, 0.79);
  // On the lid the separate split boards, their small height differences and the straps
  // remain exposed in both positions. There is open air between them.
  for (const x of [-0.319, 0.319]) {
    if (broken && x > 0) continue;
    for (const z of [0.26, 0.6]) {
      const head = new Mesh(peg, material(iron));
      head.scale.set(0.027, 0.008, 0.027);
      head.position.set(x, 0.052, z);
      p.main.add(head);
    }
  }
  for (const x of [-0.319, 0.319]) {
    if (broken && x > 0) continue;
    part(p.main, x, 0.057, 0.109, 0.093, 0.021, 0.184, iron);
    part(p.frame, x, 0.221, -0.374, 0.108, 0.135, 0.108, steel, true).rotation.z = Math.PI / 2;
  }
  for (let i = 0; i < 8; i++) {
    const x = ((i % 4) - 1.5) * 0.208,
      z = Math.floor(i / 4) * 0.282 - 0.106;
    if (broken && i === 4) continue;
    const upright = new Group();
    const h = broken ? [0.28, 0.21, 0.36][i % 3]! : 0.6 + (i % 3) * 0.045;
    upright.add(whittledStake(h, i, broken));
    upright.position.set(x, 0, z);
    upright.rotation.z = broken ? Math.sin(i * 3.6) * 0.94 : 0.04 * Math.sin(i);
    p.secondary.add(upright);
  }
  if (broken) {
    const flap = paling(p.rigging, 0, 0, 0, 0.31, 0.66, 0.06, true, 3);
    flap.rotation.z = -0.06;
    const splint = paling(p.frame, 0.54, 0.1, 0.19, 0.086, 0.35, 0.075, true, 2);
    splint.rotation.x = 1.38;
  }
}

function timberFrame(g: Group, net: boolean, broken: boolean): void {
  for (const s of [-1, 1]) {
    const x = s * 0.55,
      top = broken && s > 0 ? (net ? 0.56 : 0.54) : 1.54;
    if (net) {
      const post = paling(g, x, 0.02, 0, 0.127, top, 0.153, broken && s > 0, 2);
      post.rotation.z = broken ? s * (s > 0 ? 0.14 : -0.02) : s * 0.025;
      part(g, x, 0.035, 0, 0.238, 0.058, 0.259, iron);
      for (const side of [-1, 1]) {
        const cheek = part(g, x + side * 0.083, 0.146, 0, 0.019, 0.237, 0.165, iron);
        cheek.rotation.z = side * 0.042;
      }
      part(g, x, 0.135, -0.077, 0.171, 0.19, 0.026, iron);
      for (const z of [-0.094, 0.094]) part(g, x, 0.072, z, 0.172, 0.037, 0.017, '#b78f5f');
      bind(g, x, broken && s > 0 ? 0.35 : 1.15, 0, 0.093);
    } else {
      for (const end of [-1, 1]) {
        woodenSpar(g, [x, 0.085, end * 0.399], [x, top, end * 0.018], 0.071, (s + 1) * 7 + end + 4);
        part(g, x, 0.027, end * 0.399, 0.197, 0.043, 0.205, '#886747');
        for (const cheek of [-1, 1]) part(g, x + cheek * 0.066, 0.083, end * 0.399, 0.026, 0.136, 0.144, '#886747');
      }
      if (broken && s > 0) paling(g, x, 0.45, 0, 0.102, 0.17, 0.096, true, 1);
      board(g, x, 0.38, 0, 0.094, 0.105, 0.695);
    }
  }
}

function header(g: Group, net: boolean): void {
  board(g, 0, 0, 0, 1.437, 0.157, 0.162);
  for (const side of [-1, 1]) {
    part(g, side * 0.55, 0, 0, 0.115, 0.184, 0.184, '#76624e');
    bolt(g, side * 0.55, 0, 0.099);
    bind(g, side * 0.402, 0, 0, 0.097, 'x', 2);
  }
  if (net) {
    const points: Point[] = [
      [-0.125, 0.05, 0.091],
      [0.12, 0.06, 0.092],
      [0.07, -0.17, 0.106],
      [-0.013, -0.121, 0.128],
      [-0.072, -0.2, 0.115],
    ];
    const coords: UV[] = [
      [297, 93],
      [385, 78],
      [367, 150],
      [345, 131],
      [311, 156],
    ];
    for (let i = 1; i < 4; i++)
      paintedFace(g, 'dev_net_armed', [points[0]!, points[i]!, points[i + 1]!], [coords[0]!, coords[i]!, coords[i + 1]!]);
  }
}

function beam(g: Group, broken: boolean): void {
  const half = 0.546,
    r = 0.194;
  const trunk = new Mesh(roundTimber(r, half * 2, 27, broken), material(oak));
  trunk.rotation.z = -Math.PI / 2;
  g.add(trunk);
  woodenSpar(g, [-0.127, 0.119, -0.059], [-0.18, 0.204, -0.157], 0.061, 85);
  for (const s of [-1, 1]) {
    bind(g, s * 0.315 - 0.035, 0, 0, r + 0.006, 'x', 3);
    if (broken && s > 0)
      cord(
        g,
        [
          [0.3, 0.16, 0],
          [0.36, 0.27, 0.081],
          [0.46, 0.115, 0.263],
        ],
        0.041,
        straw,
      );
  }
}
function log(p: DefenceParts, broken: boolean): void {
  timberFrame(p.frame, false, broken);
  header(p.rigging, false);
  beam(p.main, broken);
  if (!broken) {
    for (const x of [-0.32, 0.32])
      cord(
        p.main,
        [
          [x, 0.16, 0],
          [x + 0.012, 0.54, 0.006],
          [x, 0.87, 0],
        ],
        0.043,
        straw,
      );
  }
  for (const [x, r] of [
    [-0.166, 0.144],
    [0.172, 0.144],
    [0, 0.091],
  ] as const) {
    part(p.secondary, x, 0, 0, r * 2, x ? 0.039 : 0.305, r * 2, iron, true).rotation.z = Math.PI / 2;
  }
  for (let i = 0; i < 6; i++) bind(p.secondary, -0.132 + i * 0.046, 0, 0, 0.103, 'x', 1);
  cord(
    p.secondary,
    [
      [0.166, 0, 0],
      [0.254, 0, 0],
      [0.26, 0.118, 0.074],
      [0.348, 0.118, 0.074],
    ],
    0.048,
    steel,
  );
  if (!broken)
    cord(
      p.frame,
      [
        [0.536, 0.558, 0.097],
        [0.552, 1.05, 0.125],
        [0.535, 1.494, 0.075],
      ],
      0.033,
      straw,
    );
}

function net(p: DefenceParts, broken: boolean): void {
  timberFrame(p.frame, true, broken);
  header(p.secondary, true);
  const n = 5;
  const at = (i: number, j: number): Point => {
    const u = i / n,
      v = j / n;
    const slack = (1 - u * u) * (1 - v * v);
    const depth = 0.105 * (1 - u * u) + 0.14 * (1 - v * v) + 0.205 * slack;
    return [
      0.507 * u * (1 - 0.073 * (1 - v * v)) + 0.021 * slack,
      -depth + 0.025 * Math.sin(i * 0.65 + j * 0.53) * slack + (broken ? 0.083 * Math.sin(i + j) : 0),
      0.44 * v * (1 - 0.13 * (1 - u * u)) + 0.019 * slack,
    ];
  };
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) {
      if ((i + j) % 2 || (broken && i >= 1 && j >= -1)) continue;
      const [x, y, z] = at(i, j);
      for (const next of [-1, 1]) {
        if (i === n || Math.abs(j + next) > n) continue;
        const end = at(i + 1, j + next),
          loose = broken && i === 0 && j >= -1;
        const target: Point = loose ? [x + (end[0] - x) * 0.65, y - 0.094, z + (end[2] - z) * 0.5] : end;
        strand(p.main, [[x, y, z], [(x + target[0]) * 0.5, (y + target[1]) * 0.5 - 0.007, (z + target[2]) * 0.5], target], 0.017, straw);
      }
      // A hitch loops around both crossing cords.
      if (Math.abs(i) < n && Math.abs(j) < n)
        strand(
          p.main,
          [
            [x - 0.018, y - 0.004, z - 0.014],
            [x - 0.01, y + 0.012, z + 0.003],
            [x + 0.01, y + 0.01, z + 0.015],
            [x + 0.015, y - 0.005, z - 0.002],
            [x + 0.008, y - 0.009, z - 0.017],
          ],
          0.013,
          ropeShadow,
        );
    }
  for (const s of [-1, 1]) {
    const edge = Array.from({ length: n * 2 + 1 }, (_, k) => at(s * n, k - n));
    cord(p.main, broken && s > 0 ? edge.slice(0, 4) : edge, 0.034, straw);
    const cross = Array.from({ length: n * 2 + 1 }, (_, k) => at(k - n, s * n));
    cord(p.main, broken && s > 0 ? cross.slice(0, 6) : cross, 0.034, straw);
    for (const z of [-1, 1]) {
      if (broken && s > 0) continue;
      cord(
        p.rigging,
        [
          [s * 0.48, 0, 0],
          [s * 0.494, -0.5, z * 0.188],
          [s * 0.507, -1, z * 0.44],
        ],
        0.035,
        straw,
      );
    }
  }
}

function stripedSlat(g: Group, y: number, width: number, row: number): void {
  const slat = board(g, 0, y, 0, width, 0.221, 0.102);
  // Hazard stripes run across the broad face. The rim and end cuts expose the timber.
  const geom = slat.geometry,
    uv = geom.getAttribute('uv'),
    norm = geom.getAttribute('normal'),
    pos = geom.getAttribute('position'),
    tag = geom.getAttribute('surface');
  for (let i = 0; i < uv.count; i++)
    if (Math.abs(norm.getZ(i)) > 0.8) {
      tag.setX(i, 4);
      uv.setXY(i, 0.025 + (pos.getX(i) / width + 0.5) * 0.89, (pos.getY(i) / 0.26 + 0.5) * 0.65 + 0.07 * row);
    }
  for (const sign of [-1, 1]) for (const x of [-1, 1]) bolt(g, x * (width / 2 - 0.075), y, sign * 0.058, 0.044);
}
function beacon(g: Group, x: number, y: number, z: number, on: boolean): void {
  part(g, x, y, z, 0.178, 0.041, 0.178, iron, true);
  const profile = [
    [0.071, 0],
    [0.078, 0.008],
    [0.079, 0.022],
    [0.074, 0.026],
    [0.077, 0.034],
    [0.074, 0.041],
    [0.074, 0.065],
    [0.066, 0.091],
    [0.055, 0.103],
    [0.028, 0.108],
    [0.001, 0.109],
  ];
  const lens = new Mesh(
    new LatheGeometry(
      profile.map(([r, h]) => new Vector2(r!, h!)),
      24,
    ),
    material(on ? '#ffdf88' : '#ce8137'),
  );
  lens.position.set(x, y + 0.022, z);
  g.add(lens);
}
function barrier(p: DefenceParts, broken: boolean): void {
  for (const x of [-0.485, 0.485]) {
    board(p.frame, x, 0.092, 0.085, 0.226, 0.184, 0.535);
    part(p.frame, x, 0.187, 0.018, 0.123, 0.245, 0.205, iron);
    part(p.frame, x, 0.232, 0.018, 0.132, 0.158, 0.132, '#ac8352', true).rotation.z = Math.PI / 2;
  }
  part(p.frame, 0, 0.228, 0.018, 0.106, 1.075, 0.106, steel, true).rotation.z = Math.PI / 2;
  for (const x of [-0.37, 0.37]) board(p.main, x, broken ? 0.363 : 0.481, -0.045, 0.106, broken ? 0.7 : 0.962, 0.106);
  stripedSlat(p.main, 0.214, 1.076, 2);
  if (!broken) stripedSlat(p.main, 0.484, 1.099, 1);
  const top = broken ? p.secondary : p.main;
  stripedSlat(top, broken ? 0.033 : 0.754, 1.127, 0);
  if (broken) beacon(top, 0.343, 0.175, 0, false);
  else beacon(p.secondary, 0, 0, 0, false);
  if (broken) {
    const half = board(p.main, -0.211, 0.527, -0.012, 0.57, 0.125, 0.128);
    half.rotation.z = -0.117;
    const shards = paling(p.frame, 0.373, 0.055, 0.23, 0.12, 0.33, 0.067, true, 2);
    shards.rotation.x = 1.32;
  } else beacon(p.signal, 0, 0.003, 0, true);
}

function battery(g: Group, x: number, z: number, turned = false): void {
  const box = new Group();
  box.position.set(x, 0, z);
  box.rotation.y = turned ? -0.31 : 0.05;
  g.add(box);
  part(box, 0, 0.177, 0, 0.328, 0.318, 0.239, '#637873');
  part(box, 0, 0.044, 0, 0.347, 0.085, 0.251, tar);
  part(box, 0, 0.335, 0, 0.346, 0.037, 0.253, tar);
  part(box, 0, 0.36, 0, 0.353, 0.032, 0.263, '#637873');
  for (const sign of [-1, 1]) {
    for (let rib = 0; rib < 4; rib++) part(box, -0.123 + rib * 0.082, 0.17, sign * 0.12, 0.012, 0.219, 0.012, '#637873');
    const postX = sign * 0.119;
    part(box, postX, 0.385, -0.046, 0.06, 0.042, 0.06, steel, true);
    const boot = part(box, postX + sign * 0.006, 0.404, -0.032, 0.057, 0.034, 0.078, sign > 0 ? '#a65b3d' : tar);
    boot.rotation.y = sign * 0.31;
  }
  for (let i = 0; i < 3; i++) {
    part(box, -0.078 + i * 0.078, 0.383, 0.055, 0.047, 0.012, 0.047, iron, true);
    part(box, -0.078 + i * 0.078, 0.39, 0.055, 0.024, 0.003, 0.005, tar);
  }
  cord(
    box,
    [
      [-0.078, 0.343, -0.095],
      [-0.087, 0.409, -0.088],
      [-0.056, 0.438, -0.083],
      [0.06, 0.438, -0.083],
      [0.084, 0.411, -0.087],
      [0.078, 0.343, -0.095],
    ],
    0.022,
    tar,
  );
}

function wheel(g: Group, x: number, y: number, z: number): void {
  const profile = [
    [0.048, -0.027],
    [0.072, -0.031],
    [0.094, -0.026],
    [0.102, -0.015],
    [0.105, -0.007],
    [0.105, 0.012],
    [0.101, 0.022],
    [0.089, 0.03],
    [0.066, 0.032],
    [0.048, 0.027],
  ];
  const tire = new Mesh(
    new LatheGeometry(
      profile.map(([r, h]) => new Vector2(r!, h!)),
      22,
    ),
    material('#49473e'),
  );
  tire.position.set(x, y, z);
  tire.rotation.z = Math.PI / 2;
  g.add(tire);
  part(g, x, y, z, 0.095, 0.047, 0.095, iron, true).rotation.z = Math.PI / 2;
  part(g, x, y, z, 0.041, 0.079, 0.041, steel, true).rotation.z = Math.PI / 2;
  for (const offset of [-0.039, 0.039]) {
    const fork = part(g, x + offset, y + 0.047, z + 0.008, 0.013, 0.105, 0.034, steel);
    fork.rotation.x = 0.16;
  }
}

function trumpet(g: Group, broken: boolean): void {
  // Both surfaces follow the flare back into the dark throat of the bell.
  const profile = [
    [0.029, 0],
    [0.061, 0.021],
    [0.058, 0.119],
    [0.094, 0.216],
    [0.144, 0.296],
    [0.236, 0.371],
    [0.248, 0.389],
    [0.244, 0.403],
    [0.22, 0.4],
    [0.132, 0.314],
    [0.077, 0.221],
    [0.039, 0.115],
    [0.021, 0.1],
  ];
  const geo = new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    36,
  );
  if (broken) {
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      if (y > 0.2 && z > 0.005 && x < 0.11) pos.setXYZ(i, x + 0.12 * (y - 0.2), y - (y - 0.2) * 0.52, z * 0.48);
    }
    geo.computeVertexNormals();
  }
  const metal = new Mesh(geo, material('#d39b3e'));
  metal.rotation.x = Math.PI / 2;
  g.add(metal);
  part(g, 0, 0, 0.116, 0.082, 0.018, 0.082, tar, true).rotation.x = Math.PI / 2;
  for (const z of [0.022, 0.081]) part(g, 0, 0, z, 0.127, 0.026, 0.127, '#9b7540', true).rotation.x = Math.PI / 2;
  const driver = part(g, 0, 0, -0.054, 0.142, 0.1, 0.142, iron, true);
  driver.rotation.x = Math.PI / 2;
  for (const z of [-0.092, -0.067, -0.042]) part(g, 0, 0, z, 0.16, 0.01, 0.16, '#77745c', true).rotation.x = Math.PI / 2;
  if (!broken) {
    const lip = new Mesh(new TorusGeometry(0.244, 0.007, 5, 36), material('#9b7540'));
    lip.position.z = 0.398;
    g.add(lip);
    const dustcap = new Mesh(
      new LatheGeometry(
        [
          [0.024, 0.1],
          [0.026, 0.146],
          [0.014, 0.164],
          [0.001, 0.17],
        ].map(([r, z]) => new Vector2(r!, z!)),
        18,
      ),
      material('#9b7540'),
    );
    dustcap.rotation.x = Math.PI / 2;
    g.add(dustcap);
  }
}

const soundInk = new MeshLambertMaterial({ color: '#edbc65', emissive: '#955922', transparent: true, opacity: 0.57, depthWrite: false });
function sound(g: Group): void {
  for (const distance of [0, 0.19]) {
    for (const side of [-1, 1]) {
      const arc = new Mesh(new TorusGeometry(0.295 + distance * 0.4, 0.015, 5, 15, 1.02), soundInk);
      arc.rotation.z = side > 0 ? -0.5 : Math.PI - 0.5;
      arc.position.z = distance;
      g.add(arc);
    }
  }
}

function horn(p: DefenceParts, broken: boolean): void {
  battery(p.frame, -0.415, 0.18, broken);
  const cart = p.main;
  for (const x of [-0.194, 0.194]) {
    for (const z of [-0.287, 0.277]) {
      wheel(cart, x, 0.111, z);
      cord(
        cart,
        [
          [x, 0.119, z],
          [x, 0.196, z + 0.024],
          [x, 0.224, z + 0.024],
        ],
        0.028,
        steel,
      );
    }
    cord(
      cart,
      [
        [x, 0.23, -0.33],
        [x, 0.245, 0.32],
        [x, 0.358, 0.259],
        [x, 0.409, -0.254],
        [x, 0.23, -0.33],
      ],
      0.045,
      '#b69468',
    );
    cord(
      cart,
      [
        [x, 0.366, -0.294],
        [x, 0.751, -0.349],
        [x, 0.902, -0.375],
        [x, 0.924, -0.475],
      ],
      0.048,
      '#ac7854',
    );
    cord(
      cart,
      [
        [x, 0.401, 0.242],
        [x, 0.756, 0.326],
      ],
      0.043,
      steel,
    );
  }
  for (const y of [0.401, 0.579, 0.75]) {
    const t = (y - 0.401) / 0.349,
      w = 0.191 + 0.018 * t,
      back = -0.292 - 0.056 * t,
      front = 0.231 + 0.094 * t;
    cord(
      cart,
      [
        [-w, y, back],
        [-w, y, front],
        [w, y, front],
        [w, y, back],
        [-w, y, back],
      ],
      y > 0.7 ? 0.04 : 0.024,
      '#977b5b',
    );
  }
  for (const side of [-1, 1])
    for (let i = 0; i < 5; i++) {
      const z = -0.244 + i * 0.105;
      cord(
        cart,
        [
          [side * 0.193, 0.408, z],
          [side * 0.208, 0.747, z * 1.27],
        ],
        0.019,
        steel,
      );
    }
  for (const z of [-1, 1]) {
    for (let i = -2; i <= 2; i++)
      cord(
        cart,
        [
          [i * 0.071, 0.407, z > 0 ? 0.239 : -0.296],
          [i * 0.079, 0.746, z > 0 ? 0.325 : -0.348],
        ],
        0.019,
        steel,
      );
  }
  cord(
    cart,
    [
      [-0.205, 0.923, -0.469],
      [0.207, 0.923, -0.469],
    ],
    0.064,
    '#a65b3d',
  );
  const housing = part(cart, 0, 0.587, 0.285, 0.314, 0.247, 0.061, iron);
  housing.rotation.x = 0.18;
  const grille = part(cart, 0, 0.589, 0.32, 0.268, 0.208, 0.014, '#747c7b');
  grille.rotation.x = 0.18;
  part(cart, 0, 0.576, -0.039, 0.271, 0.3, 0.32, '#77745c');
  for (let j = 0; j < 3; j++) part(cart, 0, 0.739, -0.112 + 0.084 * j, 0.272, 0.03, 0.042, iron);
  for (const sign of [-1, 1]) {
    bolt(cart, sign * 0.123, 0.684, 0.337, 0.024);
    bolt(cart, sign * 0.123, 0.491, 0.299, 0.024);
  }
  // The old handle still carries the knotted piece of hi-vis cloth from the painting.
  const rag: Point[] = [
    [-0.2, 0.934, -0.471],
    [-0.09, 0.933, -0.469],
    [-0.12, 0.808, -0.49],
    [-0.147, 0.834, -0.51],
    [-0.207, 0.746, -0.5],
  ];
  const ragUV: UV[] = [
    [71, 120],
    [113, 107],
    [100, 185],
    [89, 165],
    [67, 203],
  ];
  for (let i = 1; i <= 3; i++) paintedFace(cart, 'dev_horn_armed', [rag[0]!, rag[i]!, rag[i + 1]!], [ragUV[0]!, ragUV[i]!, ragUV[i + 1]!]);
  beacon(cart, -0.139, 0.804, -0.265, false);
  if (!broken) {
    // The bracket puts the bell above the larger front basket.
    part(cart, 0.041, 0.813, 0.052, 0.081, 0.128, 0.086, iron);
    cord(
      p.frame,
      [
        [-0.316, 0.392, 0.18],
        [-0.338, 0.049, 0.296],
        [-0.16, 0.035, 0.442],
        [0.094, 0.04, 0.412],
        [0.187, 0.377, 0.136],
      ],
      0.031,
      rust,
    );
    beacon(p.rigging, -0.139, 0.808, -0.265, true);
    sound(p.signal);
  } else
    cord(
      p.frame,
      [
        [-0.317, 0.391, 0.175],
        [-0.339, 0.047, 0.257],
        [-0.158, 0.031, 0.377],
        [-0.04, 0.032, 0.324],
      ],
      0.029,
      rust,
    );
  trumpet(p.secondary, broken);
}

const glazing = new MeshPhysicalMaterial({
  color: 0xc2d4ce,
  transparent: true,
  opacity: 0.13,
  metalness: 0.12,
  roughness: 0.16,
  clearcoat: 0.9,
  clearcoatRoughness: 0.11,
  depthWrite: false,
  side: DoubleSide,
});

function lightHead(g: Group, broken: boolean): void {
  // The reflector is hollow. A tapered aluminium shell, rubber gasket and clipped glass
  // retain distinct silhouettes on the reverse camera and when the head falls face-up.
  const corner = (w: number, h: number, rad: number, z: number): Point[] => {
    const points: Point[] = [];
    for (const [cx, cy, begin] of [
      [w - rad, h - rad, 0],
      [-w + rad, h - rad, Math.PI / 2],
      [-w + rad, -h + rad, Math.PI],
      [w - rad, -h + rad, Math.PI * 1.5],
    ] as const) {
      for (let i = 0; i <= 3; i++) {
        const angle = begin + (i * Math.PI) / 6;
        points.push([cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad, z]);
      }
    }
    return points;
  };
  const shell = (rings: Point[][], colour: string, inward = false): void => {
    const pos: number[] = [],
      uv: number[] = [];
    for (let j = 1; j < rings.length; j++)
      for (let i = 0; i < rings[j]!.length; i++) {
        const n = (i + 1) % rings[j]!.length;
        const ends = inward
          ? [
              [j - 1, n],
              [j - 1, i],
              [j, i],
              [j - 1, n],
              [j, i],
              [j, n],
            ]
          : [
              [j - 1, i],
              [j - 1, n],
              [j, n],
              [j - 1, i],
              [j, n],
              [j, i],
            ];
        for (const [row, k] of ends) {
          const v = rings[row!]![k!]!;
          pos.push(...v);
          uv.push(0.5 + v[0] / 0.61, 0.5 + v[1] / 0.44);
        }
      }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    g.add(new Mesh(geo, material(colour)));
  };
  const front = corner(0.258, 0.171, 0.031, 0.154),
    outside = corner(0.274, 0.188, 0.038, 0.149);
  shell(
    [corner(0.129, 0.087, 0.032, -0.233), corner(0.202, 0.132, 0.048, -0.165), corner(0.256, 0.171, 0.039, -0.055), outside, front],
    '#687b77',
  );
  part(g, 0, 0, -0.227, 0.25, 0.166, 0.034, iron);
  for (let i = -3; i <= 3; i++) {
    const fin = part(g, i * 0.052, 0, -0.179, 0.015, 0.213 - 0.009 * Math.abs(i), 0.104, iron);
    fin.rotation.y = i * 0.069;
  }
  shell([outside, corner(0.262, 0.179, 0.03, 0.167), corner(0.235, 0.151, 0.025, 0.167), corner(0.23, 0.146, 0.024, 0.143)], iron);
  shell(
    [
      corner(0.058, 0.038, 0.016, -0.026),
      corner(0.108, 0.067, 0.026, -0.006),
      corner(0.166, 0.111, 0.039, 0.056),
      corner(0.231, 0.147, 0.027, 0.144),
    ],
    '#c4cbcc',
    true,
  );
  part(g, 0, 0, -0.033, 0.106, 0.076, 0.016, '#c4cbcc');
  for (const side of [-1, 1]) {
    part(g, side * 0.129, 0, 0.072, 0.034, 0.042, 0.039, tar);
    if (!broken || side < 0) part(g, side * 0.098, 0, 0.074, 0.041, 0.019, 0.019, steel);
  }
  if (!broken) {
    const tube = part(g, 0, 0, 0.076, 0.025, 0.176, 0.025, '#e6d9bd', true);
    tube.rotation.z = Math.PI / 2;
    const lens = corner(0.232, 0.15, 0.022, 0.157),
      positions: number[] = [],
      uv: number[] = [];
    for (let i = 0; i < lens.length; i++) {
      for (const pt of [[0, 0, 0.157] as Point, lens[i]!, lens[(i + 1) % lens.length]!]) {
        positions.push(...pt);
        uv.push(0.5 + pt[0], 0.5 + pt[1]);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    g.add(new Mesh(geo, glazing));
  } else {
    for (const s of [-1, 1]) {
      const shards = [
        [-0.221 * s, 0.137, 0.157],
        [-0.18 * s, -0.021, 0.157],
        [-0.076 * s, 0.137, 0.157],
      ] as Point[];
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(shards.flat(), 3));
      geo.setAttribute('uv', new Float32BufferAttribute([0, 1, 0.5, 0, 1, 1], 2));
      geo.computeVertexNormals();
      g.add(new Mesh(geo, glazing));
    }
  }
  const hood = part(g, broken ? 0.037 : 0, 0.189, 0.055, 0.563, 0.019, 0.307, '#687b77');
  hood.rotation.x = -0.065;
  if (broken) hood.rotation.z = 0.15;
  for (const k of [-0.146, 0, 0.146]) {
    const path: Point[] = [
      [k, -0.153, 0.157],
      [k, -0.107, 0.184],
      [k, 0.101, 0.187],
      [k, 0.151, 0.16],
    ];
    if (broken && k >= 0) path.splice(0, 2, [k - 0.042, 0.034, 0.214]);
    cord(g, path, 0.012, steel);
  }
  for (const x of [-0.25, 0.25]) for (const y of [-0.155, 0.155]) bolt(g, x, y, 0.162, 0.023);
}
function beamOfLight(g: Group): void {
  const vertices: number[] = [],
    rgba: number[] = [];
  const rings = 4,
    sides = 22;
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < sides; j++) {
      for (const [row, col] of [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j],
        [i + 1, j + 1],
        [i, j + 1],
      ] as [number, number][]) {
        const t = [0, 0.16, 0.68, 1][row]!,
          a = (2 * Math.PI * col) / sides;
        vertices.push(Math.cos(a) * (0.162 + t * 0.377), Math.sin(a) * (0.105 + t * 0.253), 0.19 + t * 1.63);
        rgba.push(1, 0.89, 0.55, [0.125, 0.085, 0.034, 0][row]!);
      }
    }
  // The lit bowl follows the shallow reflector behind the guard. Its centre retains
  // the warm filament and its rim falls away instead of lighting as a flat rectangle.
  const ring = [
    [-1, -0.76],
    [-0.86, -1],
    [0.86, -1],
    [1, -0.76],
    [1, 0.76],
    [0.86, 1],
    [-0.86, 1],
    [-1, 0.76],
  ] as const;
  const fill = (side: number, center: boolean) => {
    const [x, y] = ring[side % ring.length]!;
    if (center) {
      vertices.push(0, 0, 0.109);
      rgba.push(1, 0.9, 0.64, 0.98);
    } else {
      vertices.push(x * 0.221, y * 0.139, 0.15);
      rgba.push(0.99, 0.68, 0.32, 0.63);
    }
  };
  for (let i = 0; i < ring.length; i++) {
    fill(i, true);
    fill(i, false);
    fill(i + 1, false);
  }
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geom.setAttribute('color', new Float32BufferAttribute(rgba, 4));
  geom.computeVertexNormals();
  const mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide });
  g.add(new Mesh(geom, mat));
  const lamp = part(g, 0, 0, 0.077, 0.019, 0.168, 0.019, '#fff2c4', true);
  lamp.rotation.z = Math.PI / 2;
}
function flood(p: DefenceParts, broken: boolean): void {
  battery(p.frame, 0.324, -0.039, broken);
  const h = broken ? 0.857 : 1.67;
  const post = paling(p.frame, -0.056, 0.012, -0.097, 0.156, h, 0.167, broken, 3);
  if (broken) post.rotation.z = -0.049;
  for (const y of broken ? [0.239, 0.635] : [0.239, 0.864, 1.411]) bind(p.frame, -0.055, y, -0.097, 0.109);
  for (const side of [-1, 1]) board(p.frame, -0.055 + side * 0.083, 0.093, -0.088, 0.069, 0.173, 0.278);
  cord(
    p.frame,
    [
      [0.232, 0.389, -0.033],
      [0.203, 0.117, 0.026],
      [0.072, 0.077, 0.048],
      [0.017, 0.364, -0.021],
      [0.04, broken ? 0.769 : 1.319, -0.029],
    ],
    0.034,
    rust,
  );
  if (!broken) {
    // A yoke and a loop of slack cable remain readable from the rear camera.
    cord(
      p.frame,
      [
        [-0.057, 1.414, -0.108],
        [-0.057, 1.397, 0.131],
        [-0.269, 1.405, 0.131],
        [-0.269, 1.601, 0.131],
      ],
      0.037,
      iron,
    );
    cord(
      p.frame,
      [
        [-0.057, 1.398, 0.132],
        [0.266, 1.411, 0.132],
        [0.266, 1.605, 0.132],
      ],
      0.037,
      iron,
    );
    cord(
      p.frame,
      [
        [0.041, 1.32, -0.029],
        [0.159, 1.262, 0.027],
        [0.183, 1.5, 0.071],
      ],
      0.026,
      tar,
    );
    beamOfLight(p.signal);
  } else {
    paling(p.secondary, 0, 0, 0, 0.131, 0.6, 0.134, true, 1);
    bind(p.secondary, 0, 0.391, 0, 0.092);
    for (let i = 0; i < 5; i++)
      solid(p.frame, Math.sin(i * 4.79) * 0.246, 0.022, 0.183 + Math.cos(i * 8.83) * 0.181, 0.078, 0.026, 0.054, '#bdd1c4', 'rock');
  }
  lightHead(p.main, broken);
}

export function buildDefence(type: DeviceTypeId, wide: boolean, wear: Wear): DefenceParts {
  const p = emptyParts(),
    broken = wear === 'wreck';
  switch (type) {
    case 'fence':
      fence(p, wide, wear);
      break;
    case 'spikes':
      stakes(p, broken);
      break;
    case 'log':
      log(p, broken);
      break;
    case 'net':
      net(p, broken);
      break;
    case 'barrier':
      barrier(p, broken);
      break;
    case 'horn':
      horn(p, broken);
      break;
    case 'floodlight':
      flood(p, broken);
      break;
  }
  for (const group of Object.values(p)) weatherFittings(group);
  return p;
}

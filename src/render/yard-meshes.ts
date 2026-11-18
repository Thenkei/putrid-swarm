// Assemble rigid pieces once. Baking their transforms and colours into geometry keeps the
// forest, vehicles and articulated figures cheap enough for multiple surveillance views.
import {
  BufferGeometry,
  ConeGeometry,
  LatheGeometry,
  Vector2,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sprite } from '../engine/assets';
import type { PropKind } from '../core/map';
import { stationWagon } from './station-wagon';
import { fruitingBranch } from './orchard-crown';
import { material, part, spar } from './gate-models';
import { canopy, finish, leafSpray, paintedFace } from './painted-surfaces';
import { seeded } from './noise';
import { forestTree } from './woodland';

const stone = new IcosahedronGeometry(0.5, 0);
const crown = new IcosahedronGeometry(0.5, 1);
const point = new ConeGeometry(0.5, 1, 7);
const coloured = new MeshLambertMaterial({ vertexColors: true });

export function batch(root: Object3D): Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<MeshLambertMaterial, BufferGeometry[]>();
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const source = obj.material as MeshLambertMaterial;
    // Keep the shared vertices of scanned surfaces when combining rigid parts.
    // Three requires every piece in one merge to use the same indexing convention.
    const geom: BufferGeometry = obj.geometry.clone();
    if (!geom.index) geom.setIndex(Array.from({length: geom.getAttribute('position').count}, (_, index) => index));
    geom.applyMatrix4(obj.matrixWorld);
    const mat = source instanceof MeshStandardMaterial || source.map || source.transparent || source.emissive.getHex() ? source : coloured;
    if (mat === coloured) {
      const rgb = new Float32Array(geom.getAttribute('position').count * 3);
      for (let i = 0; i < rgb.length; i += 3) source.color.toArray(rgb, i);
      geom.setAttribute('color', new Float32BufferAttribute(rgb, 3));
    }
    const bucket = buckets.get(mat);
    if (bucket) bucket.push(geom);
    else buckets.set(mat, [geom]);
  });
  const result = new Group();
  for (const [mat, pieces] of buckets) {
    const mesh = new Mesh(mergeGeometries(pieces)!, mat);
    mesh.castShadow = !mat.transparent;
    mesh.receiveShadow = true;
    result.add(mesh);
  }
  return result;
}

export function solid(
  g: Group,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: string,
  form: 'rock' | 'round' | 'cone' = 'round',
): Mesh {
  const mesh = new Mesh(form === 'rock' ? stone : form === 'cone' ? point : crown, material(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  g.add(mesh);
  return mesh;
}

export function tree(pine: boolean, seed: number, orchard = false): Group {
  if (!orchard) {
    const stand = forestTree(pine, seed);
    if (stand) return stand;
  }
  const g = new Group();
  const rand = seeded(seed);
  const bark = '#654d36';
  const tall = (pine ? 3.75 : 3.12) + rand() * 0.55;
  const bend = (rand() - 0.5) * 0.36;
  const angle = rand() * Math.PI * 2;
  // Buttress roots continue into the flared trunk, then divide into smaller, crooked limbs.
  for (let i = 0; i < 5; i++) {
    const a = angle + i * 1.257;
    spar(g, [0, 0.34, 0], [Math.sin(a) * 0.54, 0.035, Math.cos(a) * 0.49], 0.19, bark, true);
  }
  spar(g, [0, 0, 0], [bend, 1.17, -0.04], pine ? 0.34 : 0.45, bark, true);
  spar(g, [bend, 1.12, -0.04], [-bend, tall * (pine ? 1 : 0.8), 0.11], pine ? 0.24 : 0.32, bark, true);
  if (pine) {
    canopy(g, 'fir', -bend * 0.5, 0.7 + tall * 0.42, 0.03, angle, 2.64 + rand() * 0.34, tall * 0.86);
    for (let tier = 0; tier < 4; tier++) {
      const radius = 1.24 - tier * 0.2,
        y = 1.28 + tier * 0.62;
      for (let j = 0; j < 4; j++) {
        const a = angle + (j * Math.PI) / 2 + tier * 1.89;
        const x = Math.sin(a),
          z = Math.cos(a);
        spar(g, [0, y, 0], [x * radius * 0.77, y - 0.13, z * radius * 0.77], 0.06, bark, true);
        leafSpray(g, 'pine', x * radius * 0.59, y - 0.05, z * radius * 0.59, a, 0.46, radius * 0.51, radius * 0.53);
      }
    }
  } else {
    const kind = orchard ? 'apple' : rand() > 0.48 ? 'gold' : 'oak';
    for (let i = 0; i < 8; i++) {
      const upper = i >= 5;
      const a = angle + i * 2.4 + rand() * 0.36;
      const reach = (upper ? 0.53 : 1.09) * (0.81 + rand() * 0.35);
      const x = Math.sin(a) * reach,
        z = Math.cos(a) * reach;
      const y = tall - (upper ? 0.42 : 0.96) + rand() * 0.24;
      const elbow: [number, number, number] = [x * 0.64, y - 0.51, z * 0.64];
      spar(g, [bend, upper ? 1.63 : 1.13, 0], elbow, upper ? 0.15 : 0.22, bark, true);
      spar(g, elbow, [x, y + 0.09, z], 0.14, bark, true);
      const fork: [number, number, number] = [x + Math.sin(a + 0.85) * 0.45, y + 0.3, z + Math.cos(a + 0.85) * 0.45];
      spar(g, elbow, fork, upper ? 0.075 : 0.105, bark, true);
      if (orchard) {
        fruitingBranch(g, x, y + 0.09, z, a, seed * 31 + i);
        leafSpray(g, kind, fork[0], fork[1], fork[2], a + 0.85, -0.21, 0.45, 0.39);
      } else {
        canopy(g, kind, x, y + 0.45, z, a, 1.25 + rand() * 0.33, 0.96 + rand() * 0.26);
        leafSpray(g, kind, fork[0], fork[1], fork[2], a + 0.85, -0.38, 0.82, 0.75);
      }
      if (orchard && !upper) {
        for (const offset of [-0.1, 0.09]) {
          const fx = fork[0] + offset,
            fy = fork[1] - Math.abs(offset) * 1.6;
          spar(g, [fork[0], fork[1] + 0.06, fork[2]], [fx, fy, fork[2] + 0.08], 0.019, '#615434');
          solid(g, fx, fy - 0.069, fork[2] + 0.08, 0.19, 0.17, 0.19, offset > 0 ? '#a63e24' : '#c66127');
        }
      }
    }
  }
  return g;
}

const wood = '#946e47';
const metal = '#545950';
// Slabs expose a mossy bedding plane above angular fractured faces. Keep the top paint
// continuous across all triangles instead of wrapping a whole boulder around a sphere.
export function outcrop(g: Group, x: number, y: number, z: number, w: number, h: number, d: number, angle: number, seed: number): void {
  const chunk = new Group(),
    rand = seeded(seed);
  chunk.position.set(x, y, z);
  chunk.rotation.y = angle;
  chunk.scale.set(w, h, d);
  g.add(chunk);
  if (!sprite('obj_props2_rock')) {
    solid(chunk, 0, 0.37, 0, 1, 0.83, 1, '#887c63', 'rock');
    return;
  }
  type Point = [number, number, number];
  type UV = [number, number];
  const ring: Point[] = [],
    foot: Point[] = [];
  for (let j = 0; j < 8; j++) {
    const a = ((j + 0.3) * Math.PI) / 4,
      px = Math.cos(a) * (0.41 + rand() * 0.11),
      pz = Math.sin(a) * (0.41 + rand() * 0.11);
    ring.push([px, 0.64 - pz * 0.31 + px * 0.11 + rand() * 0.16, pz]);
    foot.push([px * (0.97 + rand() * 0.14), 0.008, pz * (1 + rand() * 0.13)]);
  }
  const top = (p: Point): UV => [235 + 137 * p[0] - 228 * p[2], 118 + 52 * p[0] + 124 * p[2]];
  const center: Point = [0, 0.85, 0];
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length,
      a = ring[i]!,
      b = ring[j]!;
    paintedFace(chunk, 'obj_props2_rock', [center, a, b], [top(center), top(a), top(b)]);
    const sx = 178 + (i % 3) * 56,
      sy = 225 - (i % 3) * 22;
    paintedFace(
      chunk,
      'obj_props2_rock',
      [a, b, foot[j]!, foot[i]!],
      [
        [sx, sy],
        [sx + 90, sy - 36],
        [sx + 86, sy + 61],
        [sx - 5, sy + 101],
      ],
    );
  }
}
export function scenery(kind: PropKind, seed: number): Group {
  const g = new Group();
  switch (kind) {
    case 'apple':
    case 'oak': {
      const t = tree(false, seed, kind === 'apple');
      if (kind === 'apple') {
        t.scale.setScalar(0.78);
      }
      return t;
    }
    case 'car':
      return stationWagon();
    case 'well': {
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 11; i++) {
          const a = ((i + (row % 2) * 0.5) * Math.PI * 2) / 11;
          const rim = row === 2;
          const block = part(g, Math.sin(a) * 0.53, row * 0.19 + 0.11, Math.cos(a) * 0.53, 0.316, 0.2, rim ? 0.26 : 0.22, '#a29478');
          block.rotation.y = a;
          finish(block, 'brick');
        }
      part(g, 0, 0.054, 0, 0.88, 0.016, 0.88, '#2d3530', true);
      for (const x of [-0.51, 0.51]) finish(part(g, x, 1.03, 0, 0.13, 1.53, 0.14, wood), 'hewn');
      for (const s of [-1, 1]) {
        const roof = part(g, 0, 1.79, s * 0.29, 1.5, 0.1, 0.76, 'tiles');
        roof.rotation.x = s * 0.47;
        paintedFace(
          g,
          'obj_props_well',
          [
            [-0.75, 2.008, 0],
            [0.75, 2.008, 0],
            [0.75, 1.68, s * 0.65],
            [-0.75, 1.68, s * 0.65],
          ],
          [
            [103, 32],
            [310, 82],
            [233, 192],
            [14, 134],
          ],
        );
      }
      spar(g, [-0.61, 1.19, 0], [0.67, 1.19, 0], 0.14, wood);
      for (let i = -3; i <= 3; i++) part(g, i * 0.045, 1.19, 0, 0.23, 0.039, 0.23, '#bda375', true).rotation.z = Math.PI / 2;
      spar(g, [0, 1.19, 0.08], [0, 0.24, 0.08], 0.027, '#ad9064');
      spar(g, [0.65, 1.19, 0], [0.65, 0.96, 0.12], 0.06, metal);
      spar(g, [0.61, 0.96, 0.12], [0.79, 0.96, 0.12], 0.08, wood);
      part(g, 0.56, 0.52, 0.4, 0.32, 0.33, 0.32, '#888575', true);
      part(g, 0.56, 0.695, 0.4, 0.28, 0.018, 0.28, '#393e36', true);
      for (const x of [0.42, 0.7]) spar(g, [x, 0.64, 0.4], [0.56, 0.91, 0.4], 0.022, metal);
      break;
    }
    case 'woodpile':
      for (let i = 0; i < 9; i++) {
        const row = i < 4 ? 0 : i < 7 ? 1 : 2;
        const x = (i - (row === 0 ? 1.5 : row === 1 ? 5 : 7.5)) * 0.29;
        const y = 0.17 + row * 0.24;
        const end = 0.59 + 0.03 * Math.sin(i * 3);
        finish(spar(g, [x, y, -0.59], [x, y, end], 0.3, wood), 'roundwood');
        for (const sign of [-1, 1])
          paintedFace(
            g,
            'dev_log_armed',
            [
              [x - 0.103, y + 0.112, sign * (end + 0.004)],
              [x + 0.103, y + 0.112, sign * (end + 0.004)],
              [x + 0.103, y - 0.112, sign * (end + 0.004)],
              [x - 0.103, y - 0.112, sign * (end + 0.004)],
            ],
            [
              [296, 214],
              [325, 222],
              [322, 266],
              [295, 275],
            ],
          );
      }
      for (const x of [-0.59, 0.59]) for (const z of [-0.54, 0.54]) finish(part(g, x, 0.48, z, 0.11, 0.98, 0.12, wood), 'hewn');
      for (let i = 0; i < 5; i++) finish(part(g, (i - 2) * 0.269, 0.98 + (i - 2) * 0.042, 0, 0.27, 0.075, 1.47, wood), 'hewn').rotation.z = 0.15;
      paintedFace(
        g,
        'obj_props_woodpile',
        [
          [-0.665, 0.916, -0.735],
          [0.665, 1.132, -0.735],
          [0.665, 1.132, 0.735],
          [-0.665, 0.916, 0.735],
        ],
        [
          [322, 27],
          [536, 12],
          [212, 195],
          [15, 198],
        ],
      );
      break;
    case 'barrel': {
      const profile = [
        [0.34, 0],
        [0.373, 0.1],
        [0.41, 0.3],
        [0.424, 0.49],
        [0.409, 0.68],
        [0.375, 0.84],
        [0.345, 0.91],
      ];
      const body = new Mesh(
        new LatheGeometry(
          profile.map(([r, y]) => new Vector2(r, y)),
          24,
        ),
        material(wood),
      );
      g.add(finish(body, 'staves'));
      for (const [y, r] of [
        [0.18, 0.396],
        [0.49, 0.428],
        [0.785, 0.391],
      ] as const)
        part(g, 0, y, 0, r * 2, 0.038, r * 2, '#625443', true);
      finish(part(g, 0, 0.914, 0, 0.68, 0.026, 0.68, wood, true), 'lid');
      break;
    }
    case 'mailbox':
      finish(part(g, 0, 0.49, 0, 0.14, 0.99, 0.15, wood), 'hewn');
      part(g, 0, 1.04, 0, 0.46, 0.46, 0.36, '#934625');
      part(g, 0, 1.29, 0.015, 0.53, 0.055, 0.45, '#b75a36').rotation.x = 0.1;
      paintedFace(
        g,
        'obj_props2_mailbox',
        [
          [-0.23, 1.265, 0.184],
          [0.23, 1.265, 0.184],
          [0.23, 0.81, 0.184],
          [-0.23, 0.81, 0.184],
        ],
        [
          [25, 127],
          [166, 155],
          [164, 286],
          [25, 259],
        ],
      );
      break;
    case 'veg':
      part(g, 0, 0.075, 0, 1.83, 0.13, 0.92, '#604331');
      for (const z of [-0.45, 0.45]) finish(part(g, 0, 0.12, z, 1.89, 0.21, 0.06, wood), 'hewn');
      for (const x of [-0.91, 0.91]) finish(part(g, x, 0.12, 0, 0.075, 0.21, 0.92, wood), 'hewn');
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.34;
        solid(g, x, 0.21, 0.17, 0.28, 0.24, 0.28, '#84904c');
        for (let j = 0; j < 11; j++) {
          const inner = j >= 6;
          leafSpray(g, 'cabbage', x, inner ? 0.27 : 0.21, 0.17, j * 2.4 + i, inner ? -1.04 : -0.45, inner ? 0.18 : 0.235, inner ? 0.19 : 0.24);
        }
        spar(g, [x, 0.15, -0.17], [x - 0.04, 0.79, -0.22], 0.028, '#58633b');
        for (let j = 0; j < 5; j++) leafSpray(g, 'cabbage', x, 0.35 + 0.079 * j, -0.19, j * 2.4, -0.23, 0.1, 0.19);
        for (let j = 0; j < 3; j++)
          solid(g, x + 0.08 * Math.cos(j * 2), 0.28 + j * 0.15, -0.19 + 0.07 * Math.sin(j * 2), 0.14, 0.145, 0.14, j % 2 ? '#ba522d' : '#ce6237');
      }
      for (const x of [-0.75, 0, 0.75]) spar(g, [x, 0.11, -0.22], [x + 0.04, 0.91, -0.22], 0.041, wood);
      for (const y of [0.45, 0.76]) spar(g, [-0.81, y, -0.23], [0.84, y, -0.23], 0.043, '#a18b58');
      break;
    case 'rock':
      outcrop(g, 0, 0, 0, 1.09, 0.83, 0.89, -0.16, 509 + seed);
      outcrop(g, 0.34, 0.02, 0.34, 0.72, 0.42, 0.55, -0.21, 71 + seed);
      outcrop(g, -0.34, 0.01, 0.39, 0.45, 0.27, 0.48, 0.26, 120 + seed);
      break;
    case 'bush':
      for (let i = 0; i < 12; i++) {
        const a = i * 2.4;
        const x = Math.sin(a) * 0.31,
          z = Math.cos(a) * 0.31;
        spar(g, [0, 0, 0], [x, 0.41, z], 0.046, wood);
        leafSpray(g, 'oak', x, 0.31 + (i % 3) * 0.11, z, a, -0.26 - (i % 3) * 0.29, 0.8, 0.52);
      }
      break;
  }
  return g;
}

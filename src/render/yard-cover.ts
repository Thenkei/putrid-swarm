// One instanced draw per plant silhouette. Roots stay fixed while blade tips and fern
// leaflets bend. Mown and occupied cells remove their clumps from every camera together.
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, MeshLambertMaterial, Object3D } from 'three';
import { GRID_W, GRID_H, inGrid, isStaticBlocked, idx } from '../core/map';
import type { WorldFrame } from './world';
import { fbm, seeded } from './noise';
import { groundTerrainAt } from './terrainfield';
import { bankHeight } from './yard-soil';
import { wind } from './painted-surfaces';
import { vergeMaterial, vergePlant } from './verge-plants';

type Plant = 'grass' | 'forb' | 'fern' | 'flower';
type Point = [number, number, number];

function foliage(kind: Plant, variant: number): BufferGeometry {
  const rand = seeded(7171 + variant * 503 + kind.length * 109);
  const vertices: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const color = new Color();
  function vertex(p: Point, tint: string, light: number): number {
    vertices.push(...p);
    color.set(tint).multiplyScalar(light);
    colors.push(color.r, color.g, color.b);
    uvs.push(0, Math.min(1, Math.max(0, p[1] * 1.8)));
    return vertices.length / 3 - 1;
  }
  // Fold the blade along its midrib. The lighter half catches sky light as the camera turns.
  function leaf(base: Point, tip: Point, width: number, tint: string, bow: number): void {
    const dx = tip[0] - base[0],
      dz = tip[2] - base[2],
      len = Math.hypot(dx, dz) || 1;
    const mid: Point = [base[0] + dx * 0.53, (base[1] + tip[1]) * 0.5 + bow, base[2] + dz * 0.53];
    const nx = (dz / len) * width,
      nz = (-dx / len) * width;
    const a = vertex(base, tint, 0.59);
    const b = vertex([mid[0] + nx, mid[1], mid[2] + nz], tint, 0.91);
    const c = vertex([mid[0], mid[1] + width * 0.33, mid[2]], tint, 1.12);
    const d = vertex([mid[0] - nx, mid[1], mid[2] - nz], tint, 0.81);
    const e = vertex(tip, tint, 1.15);
    indices.push(a, c, b, a, d, c, b, c, e, c, d, e);
  }
  if (kind === 'fern') {
    for (let j = 0; j < 7; j++) {
      const a = j * 2.4 + rand() * 0.6,
        reach = 0.36 + rand() * 0.25,
        high = 0.32 + rand() * 0.23;
      const at = (t: number): Point => [Math.sin(a) * reach * t, high * Math.sin(t * 2.35), Math.cos(a) * reach * t];
      for (let k = 1; k <= 7; k++) {
        const t = k / 8,
          p = at(t);
        leaf(at(t - 0.125), p, 0.01, '#89924a', 0);
        for (const side of [-1, 1]) {
          const spread = (1 - t * 0.78) * 0.2 * side;
          leaf(
            p,
            [p[0] + Math.cos(a) * spread + Math.sin(a) * 0.072, p[1] + 0.037, p[2] - Math.sin(a) * spread + Math.cos(a) * 0.072],
            0.029 * (1 - t * 0.55),
            k % 3 ? '#77914e' : '#9a9e56',
            0.018,
          );
        }
      }
      leaf(at(0.86), at(1), 0.022, '#9ca255', 0.018);
    }
  } else {
    const broad = kind === 'forb',
      seeding = kind === 'grass' && variant === 1,
      count = broad ? 13 : kind === 'grass' ? (seeding ? 18 : 28) : 14;
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2,
        r = rand() * 0.13,
        reach = (broad ? 0.36 : 0.19) * (0.35 + rand());
      const x = Math.sin(a),
        z = Math.cos(a);
      const length = (broad ? 0.22 : 0.47) * (0.3 + rand() * 0.77);
      leaf(
        [x * r, 0, z * r],
        [x * (r + reach), length, z * (r + reach)],
        broad ? 0.044 + rand() * 0.032 : 0.011 + rand() * 0.014,
        (broad ? ['#879c58', '#849343', '#acaf65'] : ['#858d3c', '#b8aa60', '#79883f', '#9a9e52'])[i % (broad ? 3 : 4)]!,
        0.04 + reach * 0.11,
      );
    }
    if (seeding) {
      // The tawny meadow grasses have loose panicles above the last green blades.
      // Each grain is a folded triangle so a stem stays legible on a night monitor.
      for (let n = 0; n < 4; n++) {
        const yaw = rand() * Math.PI * 2,
          dx = Math.sin(yaw),
          dz = Math.cos(yaw);
        const x = (rand() - 0.5) * 0.25,
          z = (rand() - 0.5) * 0.25,
          h = 0.61 + rand() * 0.23;
        const foot: Point = [x, 0, z],
          tip: Point = [x + dx * 0.19, h, z + dz * 0.19];
        leaf(foot, tip, 0.012, '#a39250', 0.034);
        for (let k = 0; k < 7; k++) {
          const t = k / 7,
            b = 0.74 + t * 0.25,
            side = k % 2 ? 1 : -1,
            reach = (1 - 0.53 * t) * 0.083 * side;
          const base: Point = [x + dx * 0.19 * b, h * b, z + dz * 0.19 * b];
          const colour = k % 3 ? '#c5ad68' : '#b6a15e';
          const a = vertex(base, colour, 0.83);
          const c = vertex([base[0] + dz * reach, base[1] + 0.045, base[2] - dx * reach], colour, 1.16);
          const e = vertex([base[0] + dz * reach * 1.31 + dx * 0.031, base[1] + 0.106, base[2] - dx * reach * 1.31 + dz * 0.031], colour, 1.29);
          indices.push(a, c, e);
        }
      }
    }
    if (kind === 'flower') {
      for (let i = 0; i < 5; i++) {
        const x = (rand() - 0.5) * 0.42,
          z = (rand() - 0.5) * 0.42,
          h = 0.37 + rand() * 0.28;
        leaf([x * 0.65, 0, z * 0.65], [x + 0.012, h, z], 0.011, '#92a067', 0);
        for (let j = 0; j < 6; j++) {
          const a = (j * Math.PI) / 3 + i;
          leaf([x, h, z], [x + Math.sin(a) * 0.065, h + 0.015, z + Math.cos(a) * 0.065], 0.022, i % 3 ? '#d8cc9a' : '#c6a760', 0.011);
        }
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

interface Clumps {
  mesh: InstancedMesh;
  roots: { cell: number; matrix: Matrix4 }[];
}
export class YardCover extends Group {
  private readonly groups: Clumps[] = [];
  private readonly cleared = new Uint8Array(GRID_W * GRID_H);
  private readonly next = this.cleared.slice();
  private readonly hidden = new Matrix4().makeScale(0, 0, 0);

  constructor() {
    super();
    const photographed = vergeMaterial();
    const rand = seeded(841),
      pose = new Object3D();
    const kinds: Plant[] = ['grass', 'forb', 'fern', 'flower'];
    const buckets = Array.from({ length: 8 }, () => [] as Clumps['roots']);
    for (let z = -5; z < GRID_H + 5; z++)
      for (let x = -5; x < GRID_W + 5; x++) {
        const inside = inGrid(x, z);
        if (inside && isStaticBlocked(x, z)) continue;
        const type = groundTerrainAt(x + 0.5, z + 0.5);
        if (type !== 'grass' && type !== 'forest') continue;
        const patch = fbm(x * 0.47, z * 0.47, 309, 2),
          wood = type === 'forest';
        const count = Math.max(0, Math.floor((patch - (wood ? 0.32 : 0.3)) * (photographed ? (wood ? 15 : 12) : wood ? 12 : 9)));
        for (let j = 0; j < count; j++) {
          const px = x + 0.08 + rand() * 0.84,
            pz = z + 0.08 + rand() * 0.84;
          const chance = rand();
          const kind = wood ? (chance < 0.3 ? 2 : chance < 0.79 ? 0 : 1) : chance < 0.65 ? 0 : chance < 0.87 ? 1 : 3;
          const scale = (wood ? 0.68 : 0.48) + rand() * (wood ? 0.61 : 0.48);
          pose.position.set(px, bankHeight(px, pz), pz);
          pose.rotation.y = rand() * 6.28;
          pose.scale.set(scale, scale * (0.81 + rand() * 0.28), scale);
          pose.updateMatrix();
          buckets[kind * 2 + (rand() > 0.5 ? 1 : 0)]!.push({ cell: inside ? idx(x, z) : -1, matrix: pose.matrix.clone() });
        }
      }
    const mat = photographed ?? new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
    if (!photographed) wind(mat);
    for (const [i, roots] of buckets.entries()) {
      const kind = kinds[Math.floor(i / 2)]!;
      const shape = photographed ? vergePlant(kind, i % 2) : foliage(kind, i % 2);
      const mesh = new InstancedMesh(shape, mat, roots.length);
      const tint = new Color();
      roots.forEach(({ matrix }, j) => {
        mesh.setMatrixAt(j, matrix);
        const x = matrix.elements[12]!,
          z = matrix.elements[14]!;
        const forest = groundTerrainAt(x, z) === 'forest';
        const variation = fbm(x * 0.58, z * 0.58, 307, 2);
        if (photographed) tint.setRGB(0.77 + variation * 0.3, 0.76 + variation * 0.34, 0.72 + variation * 0.28).multiplyScalar(forest ? 0.86 : 1);
        else tint.setRGB(0.48 + 0.43 * variation, 0.45 + 0.43 * variation, 0.39 + 0.42 * variation).multiplyScalar(forest ? 0.68 : 0.9);
        mesh.setColorAt(j, tint);
      });
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      this.add(mesh);
      this.groups.push({ mesh, roots });
    }
  }
  sync(frame: WorldFrame): void {
    const next = this.next;
    next.fill(0);
    for (const d of frame.devices) next[idx(d.x, d.y)] = 1;
    for (const d of frame.decals) if (d.kind === 'mown') next[idx(d.x, d.y)] = 1;
    if (frame.ghost && inGrid(frame.ghost.x, frame.ghost.y)) next[idx(frame.ghost.x, frame.ghost.y)] = 1;
    if (!next.some((value, i) => value !== this.cleared[i])) return;
    for (const { mesh, roots } of this.groups) {
      let changed = false;
      roots.forEach(({ cell, matrix }, i) => {
        if (cell < 0 || next[cell] === this.cleared[cell]) return;
        mesh.setMatrixAt(i, next[cell] ? this.hidden : matrix);
        changed = true;
      });
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    }
    this.cleared.set(next);
  }
}

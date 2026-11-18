import { BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Group, Mesh, SphereGeometry, Vector3 } from 'three';
import type { EnemyTypeId } from '../core/types';
import { animalFinish, furMaterial, muzzleMaterial, speciesFur } from './infected-surfaces';

export type Animal = Extract<EnemyTypeId, 'boar' | 'dog' | 'deer'>;
export type HideSection = readonly [axis: number, center: number, width: number, depth: number];
type Point = readonly [number, number, number];
const palette = { dog: ['#997856', '#b8a181', '#685d4c'], boar: ['#857869', '#b3a28c', '#534c43'], deer: ['#b6916a', '#d3bc96', '#97795b'] } as const;
const smooth = (x: number) => Math.min(1, Math.max(0, x));
const tau = Math.PI * 2;
const ball = new SphereGeometry(1, 15, 10);

function oval(g: Group, p: Point, r: Point, colour: string, roughness = 0.73): Mesh {
  const mesh = new Mesh(ball, animalFinish(colour, roughness));
  mesh.position.set(...p);
  mesh.scale.set(...r);
  g.add(mesh);
  return mesh;
}
function cubic(a: number, b: number, c: number, d: number, t: number): number {
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
}

// Side landmarks in the three 660-unit photographic strips. Keep the lower neck
// away from the light background and fit the eye ridge and muzzle at each cross-section.
const muzzleRows: Record<Animal, readonly (readonly [x: number, crown: number, jaw: number])[]> = {
  dog: [
    [410, 42, 187],
    [288, 13, 176],
    [227, 42, 170],
    [150, 83, 166],
    [96, 108, 137],
  ],
  boar: [
    [458, 245, 413],
    [350, 244, 420],
    [244, 282, 417],
    [144, 325, 403],
    [70, 357, 399],
  ],
  deer: [
    [441, 529, 639],
    [349, 519, 630],
    [261, 502, 631],
    [169, 551, 627],
    [95, 593, 623],
  ],
};
function sampledMuzzle(type: Animal, row: number, top: number): [number, number] {
  const j = Math.min(3, Math.floor(row / 4)),
    t = row / 4 - j,
    r = muzzleRows[type][j]!,
    b = muzzleRows[type][j + 1]!;
  const x = r[0] * (1 - t) + b[0] * t,
    crown = r[1] * (1 - t) + b[1] * t,
    jaw = r[2] * (1 - t) + b[2] * t;
  return [x / 660, 1 - (crown + (jaw - crown) * (0.5 - 0.5 * top) ** (type === 'boar' ? 2.0 : 1.7)) / 660];
}

export function furShell(g: Group, type: Animal, sections: readonly HideSection[], part: 'flank' | 'face' | 'leg' | 'tail'): void {
  const pos: number[] = [],
    uv: number[] = [],
    photo: number[] = [],
    rgb: number[] = [],
    tri: number[] = [];
  const ring = part === 'leg' ? 14 : 22,
    length = (sections.length - 1) * 4;
  const coat = new Color(palette[type][0]),
    belly = new Color(palette[type][1]),
    dark = new Color(palette[type][2]),
    colour = new Color();
  const vAt = (row: number, theta: number): Point => {
    const j = Math.min(sections.length - 2, Math.floor(row / 4)),
      t = row / 4 - j;
    const p = (i: number, k: number) => sections[Math.max(0, Math.min(sections.length - 1, i))]![k]!;
    const at = (k: number) => cubic(p(j - 1, k), p(j, k), p(j + 1, k), p(j + 2, k), t);
    const a = at(0),
      center = at(1),
      rad = at(2),
      depth = at(3);
    const side = Math.sin(theta),
      top = Math.cos(theta),
      along = row / length;
    if (part === 'leg') return [rad * side, a, center + depth * top];
    const haunch = part === 'flank' ? 1 + 0.075 * Math.cos(along * Math.PI * 4 - 0.59) * side ** 2 : 1;
    let orbital = 0;
    if (part === 'face') {
      const [u, v] = sampledMuzzle(type, row, top),
        ex = type === 'dog' ? 238 : type === 'boar' ? 257 : 263,
        ey = type === 'dog' ? 50 : type === 'boar' ? 288 : 531;
      const px = u * 660 - ex,
        py = (1 - v) * 660 - ey;
      const feature = (dy: number, w: number, h: number) => Math.exp(-((px / w) ** 2) - ((py - dy) / h) ** 2);
      orbital = -0.015 * feature(0, 27, 18) + 0.023 * feature(0, 9, 7) + 0.022 * feature(-11, 20, 7) + 0.014 * feature(18, 29, 11);
    }
    return [(rad * haunch + orbital) * side, center + depth * top, a];
  };
  for (let row = 0; row <= length; row++)
    for (let col = 0; col <= ring; col++) {
      const u = col / ring,
        v = row / length,
        theta = (u - 0.5) * tau,
        top = Math.cos(theta),
        p = vAt(row, theta),
        i = pos.length / 3;
      pos.push(...p);
      if (part === 'face') photo.push(...sampledMuzzle(type, row, top));
      // The strands run from brisket to tail on the back, and heel to fetlock on the lower legs.
      uv.push(
        u * (part === 'flank' ? 2.12 : part === 'leg' ? 1.19 : 1.55) + 0.086 * Math.sin(v * 4 + theta),
        part === 'leg' ? 1 - v * 1.2 : part === 'tail' ? v * 1.2 : v * 1.69 + 0.2 * top,
      );
      const lighter = part === 'leg' ? 0.17 + 0.21 * v : part === 'face' ? smooth(-top * 0.82 + v * 0.24) : smooth(-top * 0.97 - 0.08);
      colour.copy(coat).lerp(belly, lighter);
      if (part === 'face') colour.lerp(dark, smooth((v - 0.46) * 1.7) * (0.54 + 0.25 * top));
      if (type === 'boar' && part === 'flank') colour.lerp(dark, smooth(top * 0.75 + 0.15) * 0.61);
      if (type === 'dog' && part === 'flank') colour.lerp(dark, 0.7 * smooth(top + 0.11) * Math.sin(v * Math.PI));
      if (part === 'face') {
        const tint = 1 - 0.06 * (1 - top) * 0.5;
        rgb.push(tint * 0.99, tint * 0.975, tint * 0.95);
      } else {
        const shade = part === 'leg' ? 0.83 - 0.18 * v : 0.8 + 0.2 * lighter - 0.13 * smooth(top) * Math.sin(v * Math.PI);
        rgb.push(shade, shade * (1 + 0.035 * lighter), shade * (1 + 0.06 * lighter));
      }
      if (row && col) {
        const k = i - ring - 1;
        tri.push(k - 1, i - 1, k, k, i - 1, i);
      }
    }
  // Short opaque guard hairs follow the crest and shoulders. Keep most of the silhouette
  // continuous, with the longer, darker bristles restricted to the boar's mane.
  if (part === 'flank') {
    const count = type === 'boar' ? 160 : type === 'dog' ? 72 : 48;
    for (let k = 0; k < count; k++) {
      const angle = Math.sin(k * 8.347) * 2.3,
        row = 1 + (length - 2) * ((k * 0.618034 + 0.13) % 1);
      const a = vAt(row, angle),
        b = vAt(row + 0.39, angle + 0.072),
        c = vAt(row - 0.2, angle + 0.03);
      const stretch = type === 'boar' ? 0.036 : type === 'dog' ? 0.029 : 0.022;
      const out = stretch * (0.41 + 0.53 * ((k * 0.433) % 1));
      const tip: Point = [c[0] + Math.sin(angle) * out, c[1] + Math.cos(angle) * out, c[2] - stretch * (0.71 + 0.63 * ((k * 0.191) % 1))];
      const i = pos.length / 3;
      pos.push(...a, ...b, ...tip);
      uv.push(0.41, 0.22, 0.49, 0.22, 0.46, 0.55);
      const edge = 0.66 + 0.27 * ((k * 0.74) % 1);
      for (let j = 0; j < 3; j++) rgb.push(edge, edge, edge);
      tri.push(i, i + 1, i + 2);
    }
  }
  for (const [row, front] of [
    [0, false],
    [length, true],
  ] as const) {
    const base = row * (ring + 1),
      end = sections[front ? sections.length - 1 : 0]!,
      mid = pos.length / 3;
    if (part === 'leg') pos.push(0, end[0], end[1]);
    else pos.push(0, end[1], end[0]);
    uv.push(0.5, 0.5);
    if (part === 'face') photo.push(...sampledMuzzle(type, row, 0));
    rgb.push(rgb[base * 3]!, rgb[base * 3 + 1]!, rgb[base * 3 + 2]!);
    for (let c = 0; c < ring; c++) front ? tri.push(mid, base + c + 1, base + c) : tri.push(mid, base + c, base + c + 1);
  }
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new Float32BufferAttribute(part === 'face' ? photo : uv, 2));
  if (part === 'face') geom.setAttribute('uv1', new Float32BufferAttribute(uv, 2));
  geom.setAttribute('color', new Float32BufferAttribute(rgb, 3));
  geom.setIndex(tri);
  geom.computeVertexNormals();
  // Duplicate UVs on the underside without introducing a visible normal seam.
  const n = geom.getAttribute('normal');
  for (let row = 0; row <= length; row++) {
    const a = row * (ring + 1),
      b = a + ring;
    const x = n.getX(a) + n.getX(b),
      y = n.getY(a) + n.getY(b),
      z = n.getZ(a) + n.getZ(b),
      l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
  g.add(new Mesh(geom, part === 'face' ? muzzleMaterial() : speciesFur(type)));
}

function tapered(g: Group, points: readonly Point[], radii: readonly number[], colour: string, roughness = 0.64): void {
  const spline = new CatmullRomCurve3(points.map((p) => new Vector3(...p))),
    steps = (points.length - 1) * 4,
    segments = 9;
  const pos: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const frames = spline.computeFrenetFrames(steps, false);
  for (let j = 0; j <= steps; j++) {
    const v = j / steps,
      p = spline.getPointAt(v),
      sample = v * (radii.length - 1),
      k = Math.min(radii.length - 2, Math.floor(sample)),
      rad = radii[k]! + (radii[k + 1]! - radii[k]!) * (sample - k);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * tau;
      const ridge = rad * (1 + 0.063 * Math.sin(a * 5 + v * 2));
      const q = p
        .clone()
        .addScaledVector(frames.normals[j]!, Math.cos(a) * ridge)
        .addScaledVector(frames.binormals[j]!, Math.sin(a) * ridge);
      pos.push(...q.toArray());
      uv.push(i / segments, v);
      const b = pos.length / 3 - 1;
      if (j && i) {
        const k = b - segments - 1;
        indices.push(k - 1, k, b - 1, k, b, b - 1);
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  g.add(new Mesh(geo, animalFinish(colour, roughness)));
}
function pinna(head: Group, type: Animal, side: number): void {
  const foot: Point = type === 'deer' ? [side * 0.083, 1.558, 0.406] : type === 'dog' ? [side * 0.113, 0.847, 0.483] : [side * 0.15, 0.889, 0.491];
  const height = type === 'deer' ? 0.198 : type === 'boar' ? 0.173 : side < 0 ? -0.294 : -0.265;
  const width = type === 'deer' ? 0.214 : type === 'boar' ? 0.135 : 0.096;
  const points: number[] = [],
    colour: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const root = new Color(palette[type][0]),
    interior = new Color(type === 'deer' ? '#c1a78f' : type === 'boar' ? '#96736a' : '#94766e'),
    color = new Color();
  const ring = 18;
  for (let j = 0; j <= 5; j++) {
    const r = j / 5;
    for (let i = 0; i <= ring; i++) {
      const a = (i / ring) * tau;
      const tip = (1 + Math.cos(a)) * 0.5,
        arc = 0.2 + 0.8 * Math.sin(Math.PI * tip) ** 0.74;
      const radial = tip * r + (1 - r) * 0.46;
      const sweep = Math.sin(a) * arc * r * (type === 'deer' ? 0.093 : 0.077);
      const x = foot[0] + side * (radial * width + sweep * 0.55);
      const y = foot[1] + radial * height - sweep * 0.49;
      const z = foot[2] - 0.094 * radial + sweep * 0.71 - 0.047 * (1 - r * r) + 0.018 * Math.sin(r * Math.PI);
      points.push(x, y, z);
      if (type === 'dog') {
        uv.push((352 - 31 * radial + Math.sin(a) * arc * r * 36) / 660, 1 - (20 + radial * 163) / 660);
      } else uv.push(0.1 + 0.65 * radial, 0.07 + (1 - r) * 0.7);
      color.copy(interior).lerp(root, smooth((r - 0.49) * 2.25));
      if (type === 'dog') colour.push(0.97, 0.95, 0.91);
      else colour.push(color.r, color.g, color.b);
      const k = points.length / 3 - 1;
      if (j && i) {
        const b = k - ring - 1;
        indices.push(b - 1, b, k - 1, b, k, k - 1);
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(points, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new Float32BufferAttribute(colour, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  if (type === 'dog') geo.setAttribute('uv1', geo.getAttribute('uv').clone());
  head.add(new Mesh(geo, type === 'dog' ? muzzleMaterial() : furMaterial()));
}

export function animalFeatures(head: Group, type: Animal): void {
  for (const s of [-1, 1]) {
    pinna(head, type, s);
    if (type === 'deer') {
      const at = (x: number, y: number, z: number): Point => [s * x, y, z];
      tapered(
        head,
        [
          at(0.086, 1.592, 0.465),
          at(0.144, 1.69, 0.466),
          at(0.246, 1.813, 0.419),
          at(0.339, 1.94, 0.361),
          at(0.438, 2.073, 0.308),
          at(0.537, 2.191, 0.347),
        ],
        [0.043, 0.035, 0.032, 0.027, 0.016, 0.002],
        '#917b56',
      );
      tapered(head, [at(0.211, 1.775, 0.438), at(0.239, 1.813, 0.497), at(0.279, 1.908, 0.586)], [0.027, 0.018, 0.0015], '#ad9671');
      tapered(head, [at(0.331, 1.926, 0.369), at(0.294, 2.025, 0.43), at(0.286, 2.15, 0.49)], [0.025, 0.017, 0.0015], '#b8a886');
      tapered(head, [at(0.414, 2.043, 0.318), at(0.449, 2.134, 0.274), at(0.499, 2.211, 0.25)], [0.017, 0.011, 0.001], '#bbab8b');
    } else if (type === 'boar') {
      tapered(
        head,
        [
          [s * 0.102, 0.387, 0.808],
          [s * 0.161, 0.397, 0.859],
          [s * 0.205, 0.459, 0.886],
          [s * 0.215, 0.538, 0.875],
          [s * 0.206, 0.591, 0.856],
        ],
        [0.039, 0.033, 0.024, 0.013, 0.0013],
        '#c8b79c',
        0.37,
      );
      tapered(
        head,
        [
          [s * 0.124, 0.504, 0.831],
          [s * 0.155, 0.478, 0.869],
          [s * 0.163, 0.449, 0.879],
        ],
        [0.025, 0.017, 0.001],
        '#c4b39a',
        0.42,
      );
    }
  }
  const y = type === 'dog' ? 0.606 : type === 'deer' ? 1.405 : 0.469,
    z = type === 'dog' ? 0.907 : type === 'deer' ? 0.765 : 0.964;
  const w = type === 'boar' ? 0.087 : type === 'deer' ? 0.06 : 0.064;
  oval(head, [0, y, z], [w, w * (type === 'boar' ? 0.71 : 0.66), w * 0.44], type === 'boar' ? '#715a50' : '#45433b', 0.36);
  for (const s of [-1, 1]) {
    const n = oval(head, [s * w * 0.49, y + 0.006, z + w * 0.37], [w * 0.24, w * 0.16, w * 0.09], '#242421', 0.43);
    n.rotation.z = s * 0.22;
    if (type !== 'boar') {
      const dx = type === 'dog' ? 0.071 : 0.056;
      tapered(
        head,
        [
          [s * dx * 0.48, y - w * 0.42, z + 0.007],
          [s * dx, y - w * 0.43, z - 0.054],
          [s * (dx + 0.019), y - w * 0.41, z - 0.103],
        ],
        [0.006, 0.009, 0.003],
        '#4b413c',
        0.54,
      );
    }
  }
}

export function animalFoot(g: Group, type: Animal, length: number, z: number, w: number) {
  const canine = type === 'dog',
    y = -length + 0.047;
  const base = canine ? '#635748' : type === 'boar' ? '#5a5145' : '#4e4a41';
  oval(g, [0, y, z + 0.031], [w * 0.65, canine ? 0.045 : 0.047, canine ? 0.084 : 0.067], base, 0.6);
  const toes = canine ? 4 : 2;
  for (let i = 0; i < toes; i++) {
    const x = (i - (toes - 1) / 2) * w * (canine ? 0.28 : 0.49),
      tip = z + 0.07 + (canine ? 0.023 * (1 - Math.abs(i - 1.5) / 2) : 0.009);
    const toe = oval(g, [x, y - 0.012, tip], [w * (canine ? 0.24 : 0.32), canine ? 0.027 : 0.037, canine ? 0.048 : 0.065], base, 0.49);
    toe.rotation.y = (i - (toes - 1) / 2) * 0.13;
    if (canine) oval(g, [x, y - 0.02, tip + 0.045], [0.007, 0.008, 0.018], '#554a3e', 0.55);
  }
}

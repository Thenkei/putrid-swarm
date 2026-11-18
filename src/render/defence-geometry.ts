// Geometry in local yard cells. Each face carries its real material coordinates before the
// device atlas is packed. End cuts and bark loss follow the same contour as the surrounding wood.
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Vector3 } from 'three';
import { material } from './gate-models';
import { hash2 } from './noise';

export type Point = [number, number, number];
type UV = [number, number];
const p = (v: Vector3): Point => [v.x, v.y, v.z];
const TAU = 2 * Math.PI;

class Skin {
  readonly positions: number[] = [];
  readonly uv: number[] = [];
  readonly surfaces: number[] = [];
  face(points: readonly Point[], coords: readonly UV[], surface = 0): void {
    for (const i of points.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]) {
      this.positions.push(...points[i]!);
      this.uv.push(...coords[i]!);
      this.surfaces.push(surface);
    }
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('surface', new Float32BufferAttribute(this.surfaces, 1));
    g.computeVertexNormals();
    return g;
  }
}

// Faces meet at a real chamfer. A split is cut out of one face and its two splintered
// sides rise to different heights. Both still meet the end cap when the board bows.
export function rivenBoard(width: number, height: number, depth: number, seed: number, broken: boolean): BufferGeometry {
  const skin = new Skin(),
    change = (n: number) => hash2(seed, n, 169);
  const hw = width / 2,
    hd = depth / 2,
    bevel = Math.min(hw * 0.19, hd * 0.28);
  const slitX = hw * (change(0) - 0.5) * 0.9;
  const rim: [number, number][] = [
    [-hw + bevel, hd],
    [slitX - width * 0.052, hd],
    [slitX, hd],
    [slitX + width * 0.052, hd],
    [hw - bevel, hd],
    [hw, hd - bevel],
    [hw, -hd + bevel],
    [hw - bevel, -hd],
    [-hw + bevel, -hd],
    [-hw, -hd + bevel],
    [-hw, hd - bevel],
  ];
  const bow = (change(1) - 0.5) * Math.min(height * 0.08, width * 0.26);
  const lean = (change(2) - 0.5) * Math.min(height * 0.04, width * 0.12);
  const twist = (change(3) - 0.5) * 0.085;
  const nick = broken ? Math.min(height * 0.42, 0.21) : Math.min(height * 0.11, 0.066) * (0.55 + change(4));
  const levels = [0, 0.18, 0.54, 0.81, 1];
  function point(i: number, v: number): Point {
    const [x, z] = rim[i]!,
      t = v * v;
    const waviness = Math.sin(v * Math.PI) * bow + lean * v;
    const px = x * (1 + (0.028 - change(i + 10) * 0.05) * Math.sin(v * 3.8)) + waviness - z * twist * v;
    const face = z - (i === 2 ? depth * (broken ? 0.66 : 0.31) * t * t : 0) + x * twist * v;
    const crosscut = (change(40 + i) - 0.5) * Math.min(width, depth) * (broken ? 0.82 : 0.2) - (i === 2 ? nick : 0);
    return [px, (v - 0.5) * height + crosscut * t * t, face];
  }
  // A varying crop from one longitudinal timber sample keeps neighbouring boards from sharing knots.
  const offset = 0.012 + Math.floor(change(36) * 3) / 3 + 0.034 * change(9),
    breadth = Math.min(0.244, 0.124 + width * 0.65);
  const v0 = 0.035 + 0.09 * change(37),
    length = 0.76 + 0.18 * change(38);
  const capUV = (i: number): UV => [0.5 + (rim[i]![0] / width) * 0.93, 0.5 + (rim[i]![1] / depth) * 0.93];
  for (let i = 0; i < rim.length; i++) {
    const j = (i + 1) % rim.length,
      a = rim[i]!,
      b = rim[j]!;
    const axis = Math.abs(a[0] - b[0]) > Math.abs(a[1] - b[1]) ? 0 : 1;
    const coord = (k: number, v: number): UV => [offset + breadth * (0.5 + rim[k]![axis] / (axis === 0 ? width : depth)), v0 + v * length];
    for (let row = 1; row < levels.length; row++) {
      const lo = levels[row - 1]!,
        hi = levels[row]!;
      skin.face([point(i, lo), point(j, lo), point(j, hi), point(i, hi)], [coord(i, lo), coord(j, lo), coord(j, hi), coord(i, hi)]);
    }
    for (const v of [0, 1]) {
      const center: Point = [v ? lean : 0, (v - 0.5) * height, 0];
      const a = v ? i : j,
        b = v ? j : i;
      skin.face([center, point(a, v), point(b, v)], [[0.5, 0.5], capUV(a), capUV(b)], 1);
    }
  }
  return skin.geometry();
}

/** A length of unpeeled trunk with an elliptical cut, bark seams and patches of exposed sapwood. */
export function roundTimber(radius: number, length: number, seed: number, peeled = false): BufferGeometry {
  const skin = new Skin(),
    sides = 22;
  const ring = (j: number, t: number): Point => {
    const k = j % sides,
      a = (j * TAU) / sides;
    const rough = 0.89 + 0.14 * hash2(k, seed, 73) + 0.044 * Math.sin(t * 9 + k * 0.81);
    const r = radius * rough * (1.045 - t * 0.086);
    const unevenCut = (hash2(k, seed, 51) - 0.5) * radius * (peeled ? 0.53 : 0.14);
    return [
      Math.cos(a) * r + Math.sin(t * Math.PI) * radius * 0.18,
      (t - 0.5) * length + unevenCut * (t * t + (1 - t) ** 2),
      Math.sin(a) * r * 0.92,
    ];
  };
  const rings = [0, 0.1, 0.22, 0.36, 0.52, 0.63, 0.77, 0.9, 1];
  for (let j = 0; j < sides; j++) {
    for (let row = 1; row < rings.length; row++) {
      const lo = rings[row - 1]!,
        hi = rings[row]!;
      const t = (hi + lo) * 0.5;
      const peel = Math.abs(j - 4.6 - Math.sin(t * 8 + seed * 0.31) * 0.94) / (peeled ? 2.18 : 1.6) + Math.abs(t - 0.48) * 2.25;
      const shore = peel < 1;
      skin.face(
        [ring(j + 1, lo), ring(j, lo), ring(j, hi), ring(j + 1, hi)],
        [
          [(j + 1) / sides, lo],
          [j / sides, lo],
          [j / sides, hi],
          [(j + 1) / sides, hi],
        ],
        shore ? 3 : 2,
      );
    }
    for (const t of [0, 1]) {
      const left = ring(t ? j + 1 : j, t),
        right = ring(t ? j : j + 1, t);
      const uv = (v: Point): UV => [0.5 + v[0] / (radius * 2.35), 0.5 + v[2] / (radius * 2.35)];
      skin.face([[0, (t - 0.5) * length, 0], left, right], [[0.5, 0.5], uv(left), uv(right)], 1);
    }
  }
  return skin.geometry();
}

export function woodenSpar(g: Group, start: Point, end: Point, radius: number, seed: number): Mesh {
  const a = new Vector3(...start),
    b = new Vector3(...end),
    delta = b.clone().sub(a);
  const m = new Mesh(roundTimber(radius, delta.length(), seed), material('#9b7148'));
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
  g.add(m);
  return m;
}

// One mitered sweep, including its bends. The three lobes gradually rotate around laid
// hemp. A plain metal rod keeps one continuous cylindrical highlight across a bend.
export function strand(g: Group, points: readonly Point[], diameter: number, colour: string, laid = false): void {
  const centers: Vector3[] = [];
  const corners = points.map((v) => new Vector3(...v));
  corners.forEach((c, i) => {
    if (i === 0 || i === corners.length - 1) {
      centers.push(c);
      return;
    }
    const before = corners[i - 1]!,
      after = corners[i + 1]!;
    const incoming = c.clone().sub(before).normalize(),
      outgoing = after.clone().sub(c).normalize();
    if (diameter < 0.024 || incoming.dot(outgoing) > 0.83) {
      centers.push(c);
      return;
    }
    const r = Math.min(diameter * 1.45, before.distanceTo(c) * 0.22, after.distanceTo(c) * 0.22);
    if (!r) return;
    const a = c.clone().addScaledVector(before.clone().sub(c).normalize(), r),
      b = c.clone().addScaledVector(after.clone().sub(c).normalize(), r);
    centers.push(a, a.clone().addScaledVector(c, 2).add(b).multiplyScalar(0.25), b);
  });
  const rail: Vector3[] = [centers[0]!];
  for (let i = 1; i < centers.length; i++) {
    const a = centers[i - 1]!,
      b = centers[i]!,
      length = b.distanceTo(a);
    if (length < 0.00001) continue;
    const n = laid ? Math.max(1, Math.ceil(length / Math.max(0.025, diameter * 0.78))) : 1;
    for (let j = 1; j <= n; j++) rail.push(a.clone().lerp(b, j / n));
  }
  if (rail.length < 2) return;
  const sides = laid ? 9 : diameter < 0.025 ? 5 : 7,
    verts: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  let previous: Vector3 | undefined,
    distance = 0;
  for (let i = 0; i < rail.length; i++) {
    const center = rail[i]!,
      tangent = rail[Math.min(i + 1, rail.length - 1)]!.clone()
        .sub(rail[Math.max(0, i - 1)]!)
        .normalize();
    if (i) distance += rail[i - 1]!.distanceTo(center);
    const ref = previous ?? (Math.abs(tangent.y) < 0.82 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0));
    const across = ref.clone().addScaledVector(tangent, -ref.dot(tangent)).normalize(),
      up = tangent.clone().cross(across).normalize();
    previous = across;
    for (let s = 0; s <= sides; s++) {
      const a = (s * TAU) / sides;
      const warp = laid ? 0.88 + 0.115 * Math.cos(3 * a - (distance / diameter) * 3.3) : 1;
      const r = diameter * 0.5 * warp;
      const v = center
        .clone()
        .addScaledVector(across, Math.cos(a) * r)
        .addScaledVector(up, Math.sin(a) * r);
      verts.push(...p(v));
      uv.push(s / sides, distance);
      if (i && s < sides) {
        const a = (i - 1) * (sides + 1) + s,
          b = a + sides + 1;
        idx.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
  }
  const total = Math.max(distance, 0.001);
  for (let i = 1; i < uv.length; i += 2) uv[i] = uv[i]! / total;
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(verts, 3));
  geom.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  g.add(new Mesh(geom, material(colour)));
}

/** Broad knife facets meet the bark irregularly. A broken tip exposes an angled crosscut. */
export function whittledStake(height: number, seed: number, broken: boolean): Mesh {
  const skin = new Skin(),
    sides = 7,
    radius = 0.049;
  const at = (i: number, row: number): Point => {
    const a = ((i % sides) / sides) * TAU + seed * 0.71;
    const r = radius * (0.91 + 0.18 * hash2(i % sides, seed, 94)) * [0.95, 1, 0.88, broken ? 0.53 : 0.035][row]!;
    const y = [
      -0.05,
      height * 0.36,
      height * (0.57 + 0.16 * hash2(i % sides, seed, 81)),
      height * (broken ? 0.7 + 0.23 * hash2(i % sides, seed, 21) : 1),
    ][row]!;
    return [Math.cos(a) * r + row * 0.0028, y, Math.sin(a) * r - row * 0.001];
  };
  for (let j = 0; j < sides; j++) {
    for (let row = 0; row < 3; row++)
      skin.face(
        [at(j + 1, row), at(j, row), at(j, row + 1), at(j + 1, row + 1)],
        [
          [(j + 1) / sides, row / 3],
          [j / sides, row / 3],
          [j / sides, (row + 1) / 3],
          [(j + 1) / sides, (row + 1) / 3],
        ],
        row === 2 ? 3 : 2,
      );
    const a = at(j + 1, 3),
      b = at(j, 3);
    skin.face(
      [[0, height * (broken ? 0.79 : 1), 0], a, b],
      [
        [0.5, 0.5],
        [0.5 + a[0] * 7, 0.5 + a[2] * 7],
        [0.5 + b[0] * 7, 0.5 + b[2] * 7],
      ],
      1,
    );
  }
  return new Mesh(skin.geometry(), material('#e3c58a'));
}

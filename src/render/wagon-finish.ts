import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  Shape,
  TorusGeometry,
  Vector2,
  type Material,
} from 'three';
import { farmSurface, surfaceTexture } from './farm-materials';

export type CarPoint = [number, number, number];

function finishes() {
  const finish = surfaceTexture('coachwork', 'albedo'),
    chips = surfaceTexture('coachwork', 'surface');
  return {
    body: new MeshPhysicalMaterial({
      color: finish ? 0xffffff : 0xd0a053,
      map: finish,
      normalMap: surfaceTexture('coachwork', 'normal'),
      normalScale: new Vector2(0.54, 0.54),
      roughness: 0.94,
      roughnessMap: chips,
      metalness: 0.46,
      metalnessMap: chips,
      clearcoat: 0.42,
      clearcoatRoughness: 0.33,
      vertexColors: true,
      side: DoubleSide,
    }),
    trim: farmSurface('coachwork', 0.44, { color: finish ? 0xffffff : 0x9b8c6f, roughness: 0.85, metalness: 0.65, side: DoubleSide }),
    wood: farmSurface('timber', 0.78, { color: 0xe4ccac }),
    glass: new MeshPhysicalMaterial({
      map: finish,
      color: finish ? 0xeaf0eb : 0x9cafad,
      roughness: 0.56,
      roughnessMap: chips,
      metalness: 0.15,
      clearcoat: 0.72,
      clearcoatRoughness: 0.2,
      opacity: 0.58,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    }),
    tyre: new MeshStandardMaterial({ map: finish, color: finish ? 0xd7d3cd : 0x302d29, roughness: 0.91 }),
    wall: new MeshStandardMaterial({ color: 0x43413b, roughness: 0.86 }),
    steel: new MeshStandardMaterial({ color: 0xbab6a6, roughness: 0.43, metalness: 0.76 }),
    hub: new MeshStandardMaterial({ map: finish, color: finish ? 0xf0ede4 : 0x888477, roughness: 0.67, metalness: 0.41, side: DoubleSide }),
    dark: new MeshStandardMaterial({ color: 0x302d28, roughness: 0.78, metalness: 0.3 }),
    beam: new MeshPhysicalMaterial({
      color: 0xfff7e7,
      map: finish,
      normalMap: surfaceTexture('coachwork', 'normal'),
      roughness: 0.2,
      metalness: 0.17,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
      side: DoubleSide,
    }),
  };
}
let palette: ReturnType<typeof finishes>;
export function wagonFinish() {
  return (palette ??= finishes());
}

export type CarUV = [number, number];
const atlasSize = 1254;
function uvFromPixel(x: number, y: number): CarUV {
  return [x / atlasSize, 1 - y / atlasSize];
}
export function wagonPanel(g: Group, corners: CarPoint[], pixels: CarUV[], material: Material): void {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(corners.flat(), 3));
  geo.setAttribute(
    'uv',
    new Float32BufferAttribute(
      pixels.flatMap(([x, y]) => uvFromPixel(x, y)),
      2,
    ),
  );
  geo.setIndex([0, 2, 1, 0, 3, 2]);
  geo.computeVertexNormals();
  g.add(new Mesh(geo, material));
}

// Wheel and door centres register the side elevation to the model's wheelbase.
const landmarks = [
  [-1.45, 1192],
  [-0.93, 1003],
  [-0.76, 934],
  [-0.23, 662],
  [0.81, 369],
  [1, 246],
  [1.46, 48],
] as const;
function panelX(z: number): number {
  for (let i = 1; i < landmarks.length; i++) {
    const [a, xa] = landmarks[i - 1]!,
      [b, xb] = landmarks[i]!;
    if (z <= b) return xa + ((xb - xa) * (z - a)) / (b - a);
  }
  return 48;
}

/** Cross sections define the crown of the bonnet and the crease along the doors. */
export function sheetMetal(g: Group, rows: number, cols: number, point: (u: number, v: number) => CarPoint, sidePanel = false): void {
  const pos: number[] = [],
    uv: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const roadDust = new Color(0x8b7156),
    clean = new Color(0xfffcf4),
    tint = new Color();
  for (let i = 0; i <= rows; i++)
    for (let j = 0; j <= cols; j++) {
      const u = j / cols,
        v = i / rows,
        p = point(u, v);
      pos.push(...p);
      uv.push(...(sidePanel ? uvFromPixel(panelX(p[2]), 250 + (0.8 - p[1]) * 413) : uvFromPixel(93 - 52 * v + u * (442 + 93 * v), 838 + v * 87)));
      const dust = sidePanel ? Math.min(1, Math.max(0, (0.64 - p[1]) * 2.55)) * (0.7 + 0.17 * Math.sin(p[2] * 7.1)) : 0.095 * Math.max(0, v - 0.5);
      colors.push(...tint.copy(clean).lerp(roadDust, dust).toArray());
      if (i && j) {
        const k = i * (cols + 1) + j;
        indices.push(k - cols - 2, k - cols - 1, k, k - cols - 2, k, k - 1);
      }
    }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  g.add(new Mesh(geo, wagonFinish().body));
}

/** A pressed rim has real holes. The dark face behind it is the recessed brake drum. */
function makeWheel(): Group {
  const p = wagonFinish(),
    group = new Group();
  const lathe = (profile: number[][], mat: Material) => {
    const shape = new LatheGeometry(
      profile.map(([r, y]) => new Vector2(r, y)),
      48,
    );
    if (mat === p.tyre) {
      const pos = shape.getAttribute('position'),
        uv = shape.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, ...uvFromPixel(246 + pos.getX(i) * 310, 445 + pos.getZ(i) * 307));
    }
    const mesh = new Mesh(shape, mat);
    group.add(mesh);
    return mesh;
  };
  lathe(
    [
      [0.158, -0.075],
      [0.222, -0.091],
      [0.276, -0.095],
      [0.298, -0.077],
      [0.31, -0.054],
      [0.314, -0.034],
      [0.308, -0.03],
      [0.315, -0.026],
      [0.316, -0.007],
      [0.31, -0.004],
      [0.316, 0],
      [0.316, 0.023],
      [0.309, 0.027],
      [0.314, 0.032],
      [0.311, 0.054],
      [0.3, 0.076],
      [0.278, 0.095],
      [0.226, 0.101],
      [0.179, 0.084],
      [0.158, 0.075],
    ],
    p.tyre,
  );
  for (const [radius, width, h, mat] of [
    [0.274, 0.0025, 0.096, p.wall],
    [0.222, 0.0027, 0.099, p.wall],
    [0.179, 0.008, 0.092, p.steel],
  ] as const) {
    const ring = new Mesh(new TorusGeometry(radius, width, 5, 48), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = h;
    group.add(ring);
  }
  const drum = new Mesh(new CylinderGeometry(0.173, 0.173, 0.036, 40), p.dark);
  drum.position.y = 0.041;
  group.add(drum);
  const face = new Shape();
  face.absarc(0, 0, 0.164, 0, Math.PI * 2, false);
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5,
      hole = new Path();
    hole.absellipse(Math.cos(a) * 0.126, Math.sin(a) * 0.126, 0.011, 0.024, 0, Math.PI * 2, true, a);
    face.holes.push(hole);
  }
  const disc = new Mesh(
    new ExtrudeGeometry(face, { depth: 0.008, bevelEnabled: true, bevelSize: 0.0025, bevelThickness: 0.002, bevelSegments: 1, curveSegments: 5 }),
    p.hub,
  );
  const pos = disc.geometry.getAttribute('position'),
    uv = disc.geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, ...uvFromPixel(246 + pos.getX(i) * 324, 445 - pos.getY(i) * 324));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.07;
  group.add(disc);
  lathe(
    [
      [0.078, 0.073],
      [0.073, 0.089],
      [0.055, 0.095],
      [0.046, 0.111],
      [0, 0.112],
    ],
    p.steel,
  );
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    const nut = new Mesh(new CylinderGeometry(0.0125, 0.015, 0.013, 6), p.dark);
    nut.position.set(Math.cos(a) * 0.083, 0.086, Math.sin(a) * 0.083);
    group.add(nut);
  }
  return group;
}
let wheelTemplate: Group;
/** Axle is the local Y axis. The same spare lies flat on the roof rack. */
export function fittedWheel(): Group {
  return (wheelTemplate ??= makeWheel()).clone();
}

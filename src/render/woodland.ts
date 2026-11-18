// Shared woodland prototypes. Small bark scars, leaf veins and growth rings live on the
// materials, while trunk taper, drooping shoots and broken ends retain their silhouettes.
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { seeded } from './noise';
import { leafSpray, paintedFace, paintedMap, scannedBark, wind } from './painted-surfaces';
import { yardSprite } from '../engine/assets';
import { bankHeight } from './yard-soil';
import { distantCrown, plantImage } from './plant-images';
import { surfaceImage } from '../engine/material-images';
import { GRID_W, GRID_H } from '../core/map';
import { onTrack } from './terrainfield';
import type { Tree } from './scenery';
import type { Rot } from './projection';

type Point = [number, number, number];
type Section = [x: number, y: number, z: number, radius: number];
type Finish = 'birch' | 'leaves' | 'windfall' | 'endgrain';
const tau = Math.PI * 2;
const materials = new Map<Finish, MeshLambertMaterial>();

function leafCluster(ctx: CanvasRenderingContext2D): void {
  const rand = seeded(4576);
  function line(fromX: number, fromY: number, toX: number, toY: number, thickness: number): void {
    ctx.strokeStyle = '#7d653e';
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
  }
  const colours = ['#738245', '#ad953b', '#859749', '#d6b456', '#7e8e42', '#c2923d'];
  function leaf(x: number, y: number, angle: number, size: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(size, size);
    ctx.fillStyle = colours[Math.floor(rand() * colours.length)]!;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-0.36, -0.26);
    ctx.lineTo(-0.34, -0.35);
    ctx.lineTo(-0.42, -0.33);
    ctx.lineTo(-0.33, -0.55);
    ctx.lineTo(-0.35, -0.57);
    ctx.lineTo(0.03, -1.04);
    ctx.lineTo(0.32, -0.6);
    ctx.lineTo(0.29, -0.59);
    ctx.lineTo(0.43, -0.39);
    ctx.lineTo(0.34, -0.4);
    ctx.lineTo(0.32, -0.22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(230,209,125,0.26)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-0.32, -0.31);
    ctx.lineTo(-0.3, -0.55);
    ctx.lineTo(0.03, -1);
    ctx.fill();
    ctx.restore();
  }
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    const baseX = 123 + (rand() - 0.5) * 12;
    const baseY = 246 - (i >> 1) * 20;
    const tipX = i < 10 ? baseX + side * (65 + rand() * 40) : baseX + side * 23;
    const tipY = Math.max(12, baseY - 75 - rand() * 66);
    line(123, 249, baseX, baseY, 2.7);
    let px = baseX,
      py = baseY;
    for (let n = 1; n <= 7; n++) {
      const t = n / 7;
      const x = baseX + (tipX - baseX) * t;
      const y = baseY + (tipY - baseY) * t - 13 * Math.sin(Math.PI * t);
      line(px, py, x, y, 2.4 - 1.6 * t);
      for (const s of [-1, 1]) {
        const tilt = side * 0.48 + s * (0.64 + rand() * 0.39);
        leaf(x + s * 2, y + rand() * 4, tilt, 10 + 6 * rand() + 4 * Math.sin(Math.PI * t));
      }
      px = x;
      py = y;
    }
  }
}

function bark(ctx: CanvasRenderingContext2D, birch: boolean): void {
  const rand = seeded(birch ? 177 : 813);
  const wash = ctx.createLinearGradient(0, 256, 0, 0);
  if (birch) {
    wash.addColorStop(0, '#766952');
    wash.addColorStop(0.15, '#b5ad92');
    wash.addColorStop(0.47, '#d6cfb4');
    wash.addColorStop(1, '#c9c0a6');
  } else {
    wash.addColorStop(0, '#534633');
    wash.addColorStop(0.43, '#87704b');
    wash.addColorStop(1, '#67533b');
  }
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1050; i++) {
    const x = rand() * 256,
      y = rand() * 256,
      k = rand();
    ctx.strokeStyle = birch ? (k < 0.3 ? '#e3d9be' : k < 0.67 ? '#a09a83' : '#5c594b') : k < 0.4 ? '#b1986b' : k < 0.8 ? '#554836' : '#393729';
    ctx.globalAlpha = 0.2 + 0.46 * rand();
    ctx.lineWidth = 0.6 + rand() * (birch ? 2 : 3.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (birch) ctx.quadraticCurveTo(x + 4, y + 1, x + 4 + k * 12, y - k * 2);
    else ctx.bezierCurveTo(x + 6, y - 8, x - 4, y - 9, x - 1, y - 9 - k * 36);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const capture = surfaceImage('bark');
  if (capture) {
    ctx.save();
    ctx.globalCompositeOperation = birch ? 'soft-light' : 'source-over';
    ctx.globalAlpha = birch ? 0.62 : 1;
    if (birch) ctx.filter = 'grayscale(1) contrast(1.12)';
    ctx.drawImage(capture, 0, 0, 256, 256);
    ctx.restore();
  }
  if (!birch) {
    // Start the UV seam on top. Moss grows across it in continuous drifts and gives way to bare ridges down the sides.
    for (let n = 0; n < 135; n++) {
      const cx = (rand() - 0.5) * 68,
        cy = rand() * 256,
        r = 4 + rand() * 13;
      for (let j = 0; j < 28; j++) {
        const a = rand() * tau,
          d = r * Math.sqrt(rand()),
          x = cx + Math.cos(a) * d,
          y = cy + Math.sin(a) * d * 1.36;
        const w = 1.3 + rand() * 3.6,
          h = 2 + rand() * 4.4;
        ctx.fillStyle = ['#5c6242', '#697041', '#80824d', '#939053', '#aa9f64'][j % 5]!;
        for (const shift of [0, 256]) {
          ctx.beginPath();
          ctx.ellipse(x + shift, y, w, h, 0.3, 0, tau);
          ctx.fill();
        }
      }
    }
    return;
  }
  // The bark splits into curved, darker lips at old branches and peels in narrow strips.
  for (let i = 0; i < 49; i++) {
    const x = rand() * 236,
      y = rand() * 256;
    const w = 7 + rand() ** 2 * 38,
      h = 1.2 + rand() * 4;
    ctx.fillStyle = i % 7 ? '#575549' : '#847361';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.3, y + h * 0.4);
    ctx.quadraticCurveTo(x, y - h, x + w * 0.83, y + h * 0.6);
    ctx.quadraticCurveTo(x + w * 0.42, y + h * 0.3, x, y + h);
    ctx.fill();
  }
}

function growthRings(ctx: CanvasRenderingContext2D): void {
  const rand = seeded(771);
  ctx.fillStyle = '#b79a6c';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 1; i < 25; i++) {
    const r = i * 5.7;
    const cx = 123 + i * 0.3,
      cy = 133 - i * 0.26;
    ctx.beginPath();
    for (let j = 0; j <= 48; j++) {
      const a = (j * tau) / 48;
      const ring = r + (0.65 + 0.045 * i) * (Math.sin(4 * a + i * 0.09) + Math.cos(7 * a - 0.4));
      const x = cx + ring * Math.cos(a),
        y = cy + ring * Math.sin(a);
      if (j) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = i % 4 ? '#977752' : '#816140';
    ctx.lineWidth = 0.9 + rand() * 1.2;
    ctx.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const angle = rand() * tau;
    const dx = Math.cos(angle),
      dy = Math.sin(angle),
      r = 30 + rand() * 70;
    ctx.beginPath();
    ctx.moveTo(128 + dx * 127, 128 + dy * 127);
    ctx.lineTo(128 + dx * (r + 9) - dy * 3, 128 + dy * (r + 9) + dx * 3);
    ctx.lineTo(128 + dx * r, 128 + dy * r);
    ctx.lineTo(128 + dx * 127 + dy * 3.5, 128 + dy * 127 - dx * 3.5);
    ctx.fillStyle = '#574d36';
    ctx.fill();
  }
}

function finish(kind: Finish): MeshLambertMaterial {
  const known = materials.get(kind);
  if (known) return known;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  if (kind === 'leaves') {
    const leaves = plantImage('birch');
    if (leaves) ctx.drawImage(leaves, 0, 0, 256, 256);
    else leafCluster(ctx);
  } else if (kind === 'endgrain') growthRings(ctx);
  else bark(ctx, kind === 'birch');
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  const material = new MeshLambertMaterial({ map, vertexColors: true, side: DoubleSide });
  if (kind === 'birch' || kind === 'windfall') {
    const captured = surfaceImage('bark', 'normal');
    if (captured) {
      material.normalMap = new CanvasTexture(captured);
      material.normalMap.anisotropy = 4;
      material.normalScale.setScalar(kind === 'birch' ? 0.16 : 0.72);
    }
  }
  if (kind === 'leaves') {
    material.alphaTest = 0.35;
    material.alphaToCoverage = true;
    wind(material);
  }
  materials.set(kind, material);
  return material;
}

function geometry(positions: number[], uv: number[], colours: number[], indices: number[]): BufferGeometry {
  const surface = new BufferGeometry();
  surface.setAttribute('position', new Float32BufferAttribute(positions, 3));
  surface.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  surface.setAttribute('color', new Float32BufferAttribute(colours, 3));
  surface.setIndex(indices);
  surface.computeVertexNormals();
  return surface;
}

// Sweep a tapered profile along the actual stem. Keeping a parallel frame at forks
// prevents the white scars from twisting round the trunk as its centreline bends.
function stem(group: Group, path: readonly Section[], mat: MeshLambertMaterial, sides = 8, tint = '#ffffff'): void {
  const first = path[0]!,
    end = path[path.length - 1]!;
  const axis = new Vector3(end[0] - first[0], end[1] - first[1], end[2] - first[2]).normalize();
  const reference = Math.abs(axis.x) < 0.85 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
  const right = new Vector3().crossVectors(axis, reference).normalize();
  const forward = new Vector3().crossVectors(axis, right).normalize();
  const vertices: number[] = [],
    uv: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const shade = new Color(tint);
  for (let j = 0; j < path.length; j++) {
    const [x, y, z, r] = path[j]!;
    for (let i = 0; i <= sides; i++) {
      const a = (i * tau) / sides;
      const w = r * (1 + 0.064 * Math.sin(a * 3 + 0.3) + 0.036 * Math.cos(a * 5 - 0.4));
      const sx = Math.cos(a) * w,
        sz = Math.sin(a) * w;
      vertices.push(x + right.x * sx + forward.x * sz, y + right.y * sx + forward.y * sz, z + right.z * sx + forward.z * sz);
      uv.push(i / sides, j / (path.length - 1));
      colors.push(shade.r, shade.g, shade.b);
      if (i && j) {
        const k = j * (sides + 1) + i;
        indices.push(k - sides - 2, k - sides - 1, k, k - sides - 2, k, k - 1);
      }
    }
  }
  group.add(new Mesh(geometry(vertices, uv, colors, indices), mat));
}

let forestBark: MeshLambertMaterial | undefined;
/** Flaring roots and continuous taper hold the near trees together all the way from
 * the ground to the needle leader or terminal twigs. The same specimens bake the skyline. */
export function forestTree(pine: boolean, seed: number): Group | undefined {
  const bark = scannedBark();
  if (!bark || !plantImage('pine')) return;
  forestBark ??= bark.clone();
  forestBark.vertexColors = true;
  const mat = forestBark,
    g = new Group(),
    rand = seeded(4479 + seed * 29);
  const angle = rand() * tau,
    h = (pine ? 3.96 : 3.2) + rand() * 0.6,
    base = pine ? 0.17 : 0.23;
  const bendX = rand() * 0.34 - 0.17,
    bendZ = rand() * 0.3 - 0.15;
  const at = (t: number, r: number): Section => [bendX * t + 0.07 * Math.sin(t * 5), h * t, bendZ * t + 0.03 * Math.sin(t * 7), r];
  stem(
    g,
    [at(-0.038, base * 1.43), at(0.063, base * 1.15), at(0.29, base * 0.9), at(0.53, base * 0.62), at(0.77, base * 0.36), at(pine ? 1 : 0.94, 0.006)],
    mat,
    9,
    '#dddbcf',
  );
  for (let i = 0; i < 6; i++) {
    const a = angle + (i * tau) / 6 + rand() * 0.46,
      d = 0.43 + rand() * 0.33,
      dx = Math.sin(a),
      dz = Math.cos(a);
    stem(
      g,
      [
        [dx * 0.04, 0.22, dz * 0.04, base * 0.63],
        [dx * d * 0.34, 0.06, dz * d * 0.34, base * 0.58],
        [dx * d * 0.67, 0.001, dz * d * 0.67, base * 0.31],
        [dx * d, -0.065, dz * d - 0.05, 0.012],
      ],
      mat,
      5,
      '#a99a84',
    );
  }
  if (pine) {
    for (let tier = 0; tier < 7; tier++) {
      const t = tier / 6,
        ring = 7 - Math.round(t * 3),
        span = (1.47 - 1.18 * t) * (0.9 + rand() * 0.26);
      for (let j = 0; j < ring; j++) {
        const a = angle + (j * tau) / ring + tier * 2.4 + rand() * 0.37,
          dx = Math.sin(a),
          dz = Math.cos(a);
        const level = 0.19 + 0.71 * t + (rand() - 0.5) * 0.072,
          [sx, y, sz] = at(level, 1),
          len = span * (0.84 + rand() * 0.23),
          drop = (1 - t) * 0.14 - 0.08;
        stem(
          g,
          [
            [sx, y, sz, 0.038 + 0.015 * (1 - t)],
            [sx + dx * len * 0.43, y - 0.03 - drop, sz + dz * len * 0.43, 0.028],
            [sx + dx * len * 0.88, y - 0.04 - drop * 0.65, sz + dz * len * 0.88, 0.011],
          ],
          mat,
          5,
        );
        leafSpray(g, 'pine', sx + dx * 0.035, y + 0.06, sz + dz * 0.035, a, 0.47 + rand() * 0.50, len * 1.32, len * 1.27);
        for (const side of [-1, 1])
          leafSpray(
            g,
            'pine',
            sx + dx * len * 0.37,
            y - 0.03 - drop,
            sz + dz * len * 0.37,
            a + side * (0.51 + rand() * 0.24),
            0.14 + rand() * 0.56,
            len * 0.82,
            len * 0.93,
          );
      }
    }
    const [x, y, z] = at(0.925, 1);
    for (let i = 0; i < 5; i++) leafSpray(g, 'pine', x, y, z, angle + (i * tau) / 5, -0.73 - rand() * 0.33, 0.37, 0.51);
  } else {
    const warm = seed % 3 !== 1;
    for (let i = 0; i < 10; i++) {
      const a = angle + i * 2.399 + rand() * 0.38,
        dx = Math.sin(a),
        dz = Math.cos(a);
      const upper = i >= 6,
        t = upper ? 0.53 + rand() * 0.14 : 0.26 + rand() * 0.17,
        reach = (upper ? 0.54 : 1.01) * (0.8 + rand() * 0.45);
      const [sx, y, sz] = at(t, 1),
        ax = sx + dx * reach * 0.54,
        az = sz + dz * reach * 0.54,
        ay = h * (upper ? 0.73 : 0.57) + (rand() - 0.5) * 0.21;
      const bx = sx + dx * reach,
        bz = sz + dz * reach,
        by = h * (upper ? 0.86 : 0.7) + (rand() - 0.5) * 0.28;
      stem(
        g,
        [
          [sx, y, sz, upper ? 0.071 : 0.104],
          [ax, ay, az, upper ? 0.056 : 0.078],
          [bx, by, bz, 0.039],
        ],
        mat,
        7,
      );
      for (const side of [-1, 1]) {
        const fork = a + side * (0.55 + rand() * 0.49),
          fx = Math.sin(fork),
          fz = Math.cos(fork),
          length = 0.39 + rand() * 0.31;
        const tip: Point = [bx + fx * length, by + 0.27 + rand() * 0.37, bz + fz * length];
        stem(
          g,
          [
            [ax, ay, az, 0.047],
            [bx, by, bz, 0.034],
            [tip[0], tip[1], tip[2], 0.009],
          ],
          mat,
          5,
        );
        for (let j = 0; j < 4; j++) {
          const yaw = fork + (j - 1.5) * 0.79 + (rand() - 0.5) * 0.43;
          const s = 0.62 + rand() * 0.35;
          const kind = warm ? (j === 1 && i % 3 === 0 ? 'oak' : 'gold') : j === 2 && i % 4 === 0 ? 'gold' : 'oak';
          leafSpray(g, kind, tip[0] - fx * 0.22, tip[1] - 0.058 + (j % 2) * 0.12, tip[2] - fz * 0.22, yaw, -0.59 + rand() * 0.91, s * 1.2, s);
        }
      }
    }
  }
  return g;
}

let shootGeo: BufferGeometry | undefined;
function birchShoot(group: Group, x: number, y: number, z: number, yaw: number, width: number, length: number, droop: number): void {
  if (!shootGeo) {
    const position: number[] = [],
      uv: number[] = [],
      color: number[] = [],
      indices: number[] = [];
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      for (const side of [-1, 0, 1]) {
        const light = 0.69 + 0.27 * t + (side === 0 ? 0.04 : 0);
        position.push(side * (0.23 + 0.29 * Math.sin(t * Math.PI)), 0.19 * Math.sin(t * Math.PI) - 0.3 * t * t - Math.abs(side) * 0.08, t);
        uv.push((side + 1) * 0.5, t);
        color.push(light, light, light);
      }
      if (j) {
        const k = j * 3;
        indices.push(k - 3, k, k - 2, k, k + 1, k - 2, k - 2, k + 1, k - 1, k + 1, k + 2, k - 1);
      }
    }
    shootGeo = geometry(position, uv, color, indices);
  }
  const mesh = new Mesh(shootGeo, finish('leaves'));
  mesh.position.set(x, y, z);
  mesh.rotation.set(droop, yaw, 0, 'YXZ');
  mesh.scale.set(width, length, length);
  group.add(mesh);
}

export function birchCoppice(seed: number): Group {
  const g = new Group(),
    rand = seeded(seed + 5190),
    bark = finish('birch');
  const turn = rand() * tau;
  const stems = seed % 2 ? 3 : 2;
  for (let t = 0; t < stems; t++) {
    const a = turn + t * 2.26,
      dx = Math.sin(a),
      dz = Math.cos(a);
    const h = (t === 0 ? 4.04 : t === 1 ? 3.34 : 2.76) * (0.91 + rand() * 0.19);
    const lean = 0.39 + rand() * 0.48,
      width = t === 0 ? 0.127 : t === 1 ? 0.09 : 0.068;
    const path: Section[] = [];
    for (const [rise, r] of [
      [0, 1.5],
      [0.07, 1.07],
      [0.39, 0.83],
      [0.69, 0.53],
      [1, 0.065],
    ] as const) {
      path.push([dx * (0.15 + lean * rise ** 1.25), h * rise, dz * (0.15 + lean * rise ** 1.25) + 0.09 * Math.sin(rise * 3.5 + a), width * r]);
    }
    path[0]![1] = -0.18;
    stem(g, path, bark);
    for (let k = 0; k < 3; k++) {
      const yaw = a + (k * tau) / 3,
        rx = Math.sin(yaw),
        rz = Math.cos(yaw);
      stem(
        g,
        [
          [dx * 0.15, 0.13, dz * 0.15, width * 0.87],
          [dx * 0.15 + rx * 0.18, 0.052, dz * 0.15 + rz * 0.18, width * 0.54],
          [dx * 0.15 + rx * 0.43, -0.12, dz * 0.15 + rz * 0.43, 0.012],
        ],
        bark,
        5,
        '#afa18a',
      );
    }
    for (let j = 0; j < 8; j++) {
      const rise = 0.42 + j * 0.073,
        branchYaw = a + j * 2.4 + 0.37 * rand();
      const bx = Math.sin(branchYaw),
        bz = Math.cos(branchYaw);
      const px = dx * (0.15 + lean * rise ** 1.25),
        py = h * rise,
        pz = dz * (0.15 + lean * rise ** 1.25) + 0.09 * Math.sin(rise * 3.5 + a);
      const reach = (1.14 - rise * 0.59) * (0.77 + rand() * 0.34);
      const tip: Point = [px + bx * reach, py + 0.37 + rand() * 0.28, pz + bz * reach];
      stem(
        g,
        [
          [px, py, pz, 0.047 * (1 - rise * 0.53)],
          [px + bx * reach * 0.55, py + 0.31, pz + bz * reach * 0.55, 0.024],
          [...tip, 0.01],
        ],
        bark,
        5,
        '#c4b497',
      );
      for (const side of [-1, 1]) {
        const spread = branchYaw + side * (0.37 + rand() * 0.5);
        birchShoot(g, tip[0] - bx * 0.26, tip[1] - 0.1, tip[2] - bz * 0.26, spread, 0.76 + rand() * 0.29, 0.72 + rand() * 0.23, 0.22 + rand() * 0.51);
      }
      birchShoot(g, tip[0], tip[1], tip[2], branchYaw, 0.6 + rand() * 0.25, 0.7 + rand() * 0.29, 0.53 + rand() * 0.38);
    }
  }
  return g;
}

// A fallen oak exposes a broken heartwood rim at one end, spreading roots at the other,
// and small fruiting bodies on the moist flank. Its long axis lies along the bank.
export function windthrow(seed: number): Group {
  const g = new Group(),
    rand = seeded(seed + 550),
    rind = finish('windfall'),
    heart = finish('endgrain');
  const sides = 15,
    length = 1.9 + rand() * 0.76,
    radius = 0.24 + rand() * 0.075;
  const ring = Array.from({ length: sides }, () => 0.9 + rand() * 0.16);
  const fracture = Array.from({ length: sides }, () => 0.09 + rand() ** 3 * 0.32);
  const vertices: number[] = [],
    uv: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const section = [0, 0.16, 0.64, 0.9, 1];
  function cross(t: number, j: number): Point {
    const i = j % sides,
      a = (i * tau) / sides,
      r = radius * (1.15 - t * 0.27) * ring[i]!;
    return [
      (t - 0.5) * length + (t === 1 ? fracture[i]! : 0),
      0.2 + 0.08 * Math.sin(t * Math.PI) + r * Math.cos(a),
      0.13 * Math.sin(t * 4.8) + r * Math.sin(a),
    ];
  }
  for (const [row, t] of section.entries()) {
    for (let j = 0; j <= sides; j++) {
      vertices.push(...cross(t, j));
      uv.push(j / sides, t);
      colors.push(1, 1, 1);
      const k = row * (sides + 1) + j;
      if (j && row) indices.push(k - sides - 2, k - sides - 1, k, k - sides - 2, k, k - 1);
    }
  }
  g.add(new Mesh(geometry(vertices, uv, colors, indices), rind));
  for (const t of [0, 1]) {
    const middle: Point = [(t - 0.5) * length + (t === 1 ? 0.07 : 0), 0.2, 0.13 * Math.sin(t * 4.8)];
    const p = [...middle],
      maps = [0.49, 0.51],
      c = [1, 1, 1],
      tri: number[] = [];
    for (let j = 0; j <= sides; j++) {
      const edge = cross(t, j),
        a = (j * tau) / sides;
      p.push(...edge);
      maps.push(0.5 + Math.cos(a) * 0.49, 0.5 + Math.sin(a) * 0.49);
      c.push(0.84, 0.82, 0.78);
      if (j) tri.push(0, t ? j : j + 1, t ? j + 1 : j);
    }
    g.add(new Mesh(geometry(p, maps, c, tri), heart));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i - 2.45) * 0.5,
      lift = Math.cos(a),
      spread = Math.sin(a);
    const x = -length * 0.4,
      h = 0.4 + rand() * 0.48;
    const root: Section[] = [
      [x, 0.26, 0, 0.13],
      [x - 0.19, 0.25 + lift * h * 0.5, spread * h * 0.49, 0.081],
      [x - 0.3 - rand() * 0.2, 0.24 + lift * h, spread * h, 0.028],
      [x - 0.62 - rand() * 0.15, 0.2 + lift * (h + 0.1), spread * (h + 0.16), 0.008],
    ];
    stem(g, root, rind, 6, '#ad9c80');
  }
  stem(
    g,
    [
      [0.18, 0.25, -0.02, 0.12],
      [0.34, 0.44, -0.31, 0.074],
      [0.44, 0.47, -0.58, 0.035],
    ],
    rind,
    7,
  );
  // Shelf fungi curve back into the log. The outer, younger band is pale cream.
  const shelfP: number[] = [],
    shelfUV: number[] = [],
    shelfRGB: number[] = [],
    shelfIdx: number[] = [];
  const band = ['#9c6951', '#b28056', '#d6b981', '#e7ce99', '#bead83'].map((c) => new Color(c));
  for (let i = 0; i < 8; i++) {
    const x = (rand() - 0.4) * length * 0.86,
      width = 0.078 + rand() * 0.1,
      h = 0.23 + rand() * 0.13;
    const side = i % 3 === 1 ? -1 : 1,
      z = side * radius * 0.77 + 0.13 * Math.sin((x / length + 0.5) * 4.8);
    const first = shelfP.length / 3;
    for (const [ringIndex, radiusRatio] of [0.02, 0.57, 0.88, 1, 0.08].entries()) {
      for (let n = 0; n <= 8; n++) {
        const a = (n * Math.PI) / 8,
          lip = 0.93 + 0.07 * Math.sin(a * 3.1 + i);
        shelfP.push(
          x + Math.cos(a) * width * radiusRatio * lip,
          h + (ringIndex === 4 ? -0.027 : (1 - radiusRatio) * 0.037),
          z + side * Math.sin(a) * width * radiusRatio * 0.88,
        );
        shelfUV.push(0.5 + 0.12 * radiusRatio * Math.cos(a), 0.5 + 0.12 * radiusRatio * Math.sin(a));
        const colour = band[ringIndex]!;
        shelfRGB.push(colour.r, colour.g, colour.b);
        if (ringIndex && n) {
          const k = first + ringIndex * 9 + n;
          shelfIdx.push(k - 10, k - 9, k, k - 10, k, k - 1);
        }
      }
    }
  }
  g.add(new Mesh(geometry(shelfP, shelfUV, shelfRGB, shelfIdx), heart));
  return g;
}

// These cuts expose inclined beds in the hollow lane. The crest and foot intersect
// the bank at both ends, so the lean faces read as bedrock emerging from the slope.
export function roadsideLedges(group: Group): void {
  const rand = seeded(656);
  for (const barn of [true, false]) {
    for (const side of [-1, 1]) {
      const at = (u: number, offset: number): [number, number] => (barn ? [u, 12 + side * offset] : [11 + side * offset, u]);
      for (let pocket = 0; pocket < 2; pocket++) {
        const start = 22.55 + pocket * 2.16 + rand() * 0.34,
          span = 1.36 + rand() * 0.85;
        const count = 8 + Math.floor(rand() * 4);
        const phase = rand() * Math.PI,
          depth = 0.34 + rand() * 0.18;
        const profile: [Point, Point, Point, Point][] = [];
        for (let j = 0; j <= count; j++) {
          const t = j / count,
            relief = Math.sin(Math.PI * t) ** 0.63;
          const u = start + t * span;
          const foot = 1.38 + 0.22 * Math.sin(phase + t * 3.1) + rand() * 0.084;
          const crown = foot + depth * relief;
          const [ax, az] = at(u, foot),
            [bx, bz] = at(u, foot + 0.064 * relief),
            [cx, cz] = at(u, foot + 0.13 * relief),
            [dx, dz] = at(u, crown);
          const bottom = bankHeight(ax, az) - 0.11,
            top = bankHeight(dx, dz) + relief * 0.066 - 0.036;
          profile.push([
            [ax, bottom, az],
            [bx, bottom + (top - bottom) * (0.4 + rand() * 0.13), bz],
            [cx, top, cz],
            [dx, top - 0.055 * relief, dz],
          ]);
        }
        for (let j = 0; j < count; j++) {
          const u = 178 + (237 * j) / count,
            v = 178 + (237 * (j + 1)) / count;
          const [a, b, c, d] = profile[j]!,
            [aa, bb, cc, dd] = profile[j + 1]!;
          paintedFace(
            group,
            'obj_props2_rock',
            [a, aa, bb, b],
            [
              [u, 310],
              [v, 310],
              [v, 275],
              [u, 275],
            ],
          );
          paintedFace(
            group,
            'obj_props2_rock',
            [b, bb, cc, c],
            [
              [u, 272],
              [v, 272],
              [v, 214],
              [u, 214],
            ],
          );
          paintedFace(
            group,
            'obj_props2_rock',
            [c, cc, dd, d],
            [
              [u, 121],
              [v, 121],
              [v, 146],
              [u, 146],
            ],
          );
        }
      }
    }
  }
}

// A bowed surface preserves the distant contour without repeating the individual
// branches. These four cutouts were baked from the actual near-tree meshes.
export function distantWoods(rows: readonly Tree[], rot: Rot): Group {
  const group = new Group();
  const plane = new PlaneGeometry(1, 1, 4, 4);
  const p = plane.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i) + 0.5;
    p.setXYZ(i, x, y, (1 - 4 * x * x) * Math.sin(Math.PI * y) * 0.16);
  }
  plane.computeVertexNormals();
  const local = new Object3D(),
    tint = new Color();
  const captured = !!distantCrown(0);
  for (const slot of captured ? [0, 1, 2, 3] : [0, 2]) {
    const key = slot < 2 ? 'obj_trees_pine' : 'obj_trees_oak';
    const photo = captured ? distantCrown(slot) : undefined;
    const map = photo ? new CanvasTexture(photo) : paintedMap(key),
      art = yardSprite(key);
    if (!map || !art) continue;
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    const aspect = photo ? photo.width / photo.height : art.w / art.h;
    const sites = rows.filter((t) => t.key === key && (!captured || (t.trait > 0.5 ? 1 : 0) === slot % 2));
    const stand = new InstancedMesh(
      plane,
      new MeshLambertMaterial({ map, side: DoubleSide, alphaTest: photo ? 0.21 : 0.39, alphaToCoverage: true }),
      sites.length * 3,
    );
    let n = 0;
    for (const t of sites) {
      const depths = t.row === 3 ? 3 : 1;
      for (let layer = 0; layer < depths; layer++) {
        const east = Math.max(-t.gx, t.gx - GRID_W) > Math.max(-t.gy, t.gy - GRID_H);
        let x = t.gx,
          z = t.gy;
        const across = (t.flip ? 0.67 : -0.58) * layer,
          beyond = layer * (1.66 + t.trait * 1.06);
        if (east) {
          x += (x < 0 ? -1 : 1) * beyond;
          z += across;
        } else {
          z += (z < 0 ? -1 : 1) * beyond;
          x += across;
        }
        if (onTrack(x, z, 0.9)) continue;
        const height = (((key === 'obj_trees_pine' ? 4.14 : 3.62) * t.h) / 190) * (1 + layer * 0.067);
        local.position.set(x, bankHeight(x, z) - 0.06, z);
        local.rotation.y = (rot === 0 ? Math.PI / 4 : (-3 * Math.PI) / 4) + (t.flip ? Math.PI : 0) + (t.trait - 0.5) * 0.47;
        local.scale.set(height * aspect, height, height);
        local.updateMatrix();
        stand.setMatrixAt(n, local.matrix);
        const reach = (t.row - 2) * 0.24 + layer * 0.28,
          shade = 0.58 - 0.12 * reach;
        tint.setRGB(shade, shade + 0.075 + reach * 0.06, shade + 0.088 + reach * 0.17);
        stand.setColorAt(n, tint);
        n++;
      }
    }
    stand.count = n;
    stand.computeBoundingSphere();
    group.add(stand);
  }
  return group;
}

// pnpm exec tsx tools/bake-infected.ts regenerates the mesh and both skin maps offline.
// The artist's full-resolution scan and the original generated studies are in art/infected.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';

const input = new URL('../art/infected/', import.meta.url);
const output = new URL('../src/render/textures/', import.meta.url);
const file = (dir, name) => fileURLToPath(new URL(name, dir));
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(n, b));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

const glb = await readFile(file(input, 'lee-perry-smith.glb'));
const jsonSize = glb.readUInt32LE(12);
const schema = JSON.parse(glb.subarray(20, 20 + jsonSize).toString());
const primitive = schema.meshes[0].primitives[0];
function accessor(index, Type, count) {
  const a = schema.accessors[index],
    view = schema.bufferViews[a.bufferView];
  return new Type(glb.buffer, glb.byteOffset + 28 + jsonSize + view.byteOffset, a.count * count);
}
const baseP = accessor(primitive.attributes.POSITION, Float32Array, 3);
const baseN = accessor(primitive.attributes.NORMAL, Float32Array, 3);
const baseU = accessor(primitive.attributes.TEXCOORD_0, Float32Array, 2);
const original = accessor(primitive.indices, Uint16Array, 1);

// The scan is a closed-eyed bust. Retain the sculpted orbital bones and lacrimal
// corners while making space for open corneas, separately curved lids and wet margins.
const eyes = [
  [-0.746, 1.685, -1],
  [0.535, 1.684, 1],
];
function orbit(x, y, z) {
  if (z < 1.53) return;
  const e = eyes[x > -0.1 ? 1 : 0],
    u = (x - e[0]) / 0.329;
  const middle = e[1] - 0.033 * e[2] * u - 0.019 * u * u;
  const q = clamp(1 - Math.pow(Math.abs(u), 1.72));
  const upper = 0.123 * Math.pow(q, 0.72),
    lower = 0.097 * Math.pow(q, 0.72);
  return { u, middle, upper, lower, dy: y - middle, e };
}
function cornea(o, v) {
  const outward = o.e[2] * o.u;
  return 2.056 - 0.097 * outward - 0.087 * o.u * o.u - 0.024 * v * v + 0.009 * (1 - v * v) * (1 - o.u * o.u);
}
const vertices = Array.from(baseP),
  texcoords = Array.from(baseU),
  indices = [];
for (let k = 0; k < original.length; k += 3) {
  const t = original.subarray(k, k + 3);
  if (t.every((v) => baseP[v * 3 + 1] > -1.17)) indices.push(...t);
}
const orbitalTriangles = [[], []];
for (let k = 0; k < indices.length; k += 3) {
  const tri = indices.slice(k, k + 3);
  if (tri.some((i) => baseP[i * 3 + 2] > 1.5 && Math.abs(baseP[i * 3 + 1] - 1.68) < 0.29)) {
    orbitalTriangles[baseP[tri[0] * 3] > -0.1 ? 1 : 0].push(tri);
  }
}
function atOrbit(x, y, side) {
  let surface = -Infinity;
  for (const [a, b, c] of orbitalTriangles[side]) {
    const ax = baseP[3 * a],
      ay = baseP[3 * a + 1],
      bx = baseP[3 * b],
      by = baseP[3 * b + 1],
      cx = baseP[3 * c],
      cy = baseP[3 * c + 1];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-8) continue;
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d,
      v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d,
      w = 1 - u - v;
    if (Math.min(u, v, w) < -0.001) continue;
    surface = Math.max(surface, u * baseP[3 * a + 2] + v * baseP[3 * b + 2] + w * baseP[3 * c + 2]);
  }
  if (Number.isFinite(surface)) return surface;
  throw Error('Orbital surface outside scan at ' + [x, y]);
}
for (let i = 0; i < baseP.length; i += 3) {
  const eye = orbit(baseP[i], baseP[i + 1], baseP[i + 2]);
  if (!eye || Math.abs(eye.u) > 1.13) continue;
  const v = eye.dy / Math.max(0.045, eye.dy > 0 ? eye.upper : eye.lower);
  const keep = smooth(1.13, 1.8, Math.abs(v)) + smooth(0.93, 1.18, Math.abs(eye.u));
  vertices[i + 2] = mix(Math.min(vertices[i + 2], cornea(eye, v) - 0.18), vertices[i + 2], clamp(keep));
}
for (const [side, e] of eyes.entries()) {
  const start = vertices.length / 3;
  for (let col = 0; col <= 20; col++) {
    const u = -0.996 + (1.992 * col) / 20,
      x = e[0] + 0.329 * u,
      o = orbit(x, e[1], 2);
    for (const v of [-1.48, -1.12, -1, -0.64, 0, 0.64, 1, 1.13, 1.55]) {
      const y = o.middle + (v < 0 ? o.lower : o.upper) * v,
        z = atOrbit(x, y, side);
      const rim = Math.abs(v) > 1 ? clamp((Math.abs(v) - 1) / 0.55) : 0;
      const outer = mix(cornea(o, clamp(v, -1, 1)) + 0.007, z + 0.007, rim);
      vertices.push(x, y, outer + (Math.abs(v) > 1 ? 0.026 * Math.sin(Math.PI * rim) : 0));
      // The original UVs fold over the scan's closed eyelids. Give this open
      // surface a fresh island containing the uninterrupted photographed eye.
      const tu = 0.5 + 0.436 * u,
        tv = 0.5 + 0.035 * e[2] * u - 0.22 * v * Math.pow(clamp(1 - Math.abs(u) ** 1.72), 0.72);
      texcoords.push((24 + side * 222 + 200 * tu) / 2048, 1 - (1836 + 144 * tv) / 2048);
    }
  }
  for (let col = 0; col < 20; col++)
    for (let row = 0; row < 8; row++) {
      const a = start + col * 9 + row,
        b = a + 9;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
}
await MeshoptSimplifier.ready;
async function pack(name, triangles) {
  const positions = new Float32Array(vertices);
  const [smaller] = MeshoptSimplifier.simplify(new Uint32Array(indices), positions, 3, triangles * 3, 0.016, ['LockBorder']);
  const remap = new Map(),
    used = [];
  const topology = Array.from(smaller, (i) => {
    if (!remap.has(i)) {
      remap.set(i, remap.size);
      used.push(i);
    }
    return remap.get(i);
  });
  const bytes = Buffer.alloc(4 + 10 * used.length + 2 * topology.length);
  bytes.writeUInt16LE(used.length, 0);
  bytes.writeUInt16LE(topology.length / 3, 2);
  let offset = 4;
  for (const v of used) {
    for (let c = 0; c < 3; c++, offset += 2) bytes.writeInt16LE(Math.round(vertices[3 * v + c] * 4096), offset);
    for (let c = 0; c < 2; c++, offset += 2) bytes.writeUInt16LE(Math.round(texcoords[2 * v + c] * 65535), offset);
  }
  for (const index of topology) {
    bytes.writeUInt16LE(index, offset);
    offset += 2;
  }
  await writeFile(file(output, name + '.mesh64'), bytes.toString('base64'));
  console.log(name, used.length + ' vertices, ' + topology.length / 3 + ' triangles');
}
await pack('infected-head-camera', 1150);
await pack('infected-head-inspection', 4100);

// Sample the complete scan in its proper UV map, using the new front study only
// across the contiguous face. Ear folds, scalp and the back of the head remain seam-safe.
const width = 2048;
function mapped(x, pairs) {
  for (let i = 1; i < pairs.length; i++) {
    const [a, b] = pairs[i - 1],
      [c, d] = pairs[i];
    if (x <= c) return mix(b, d, clamp((x - a) / (c - a)));
  }
  return pairs[pairs.length - 1][1];
}
const center = -0.094;
const xFromScan = [-1.7, -1.42, -0.972, -0.649, -0.309, 0, 0.309, 0.625, 0.971, 1.42, 1.7];
const studies = [
  {
    name: 'villager',
    x: [90, 120, 155, 182, 216, 255, 292, 326, 353, 389, 411],
    y: [
      [-1.18, 500],
      [-0.52, 473],
      [-0.24, 447],
      [0.455, 372],
      [0.71, 337],
      [0.936, 305],
      [1.09, 283],
      [1.68, 211],
      [2.02, 179],
      [2.6, 128],
      [3.94, 6],
    ],
  },
  {
    name: 'mayor',
    x: [85, 117, 151, 181, 213, 258, 301, 337, 369, 401, 425],
    y: [
      [-1.18, 505],
      [-0.52, 470],
      [-0.24, 442],
      [0.455, 368],
      [0.71, 329],
      [0.936, 301],
      [1.09, 281],
      [1.68, 204],
      [2.02, 163],
      [2.6, 119],
      [3.94, 8],
    ],
  },
];
// Individual frontal studies use their own canthi, nostril and mouth landmarks.
const levels = [-1.18, -0.52, -0.24, 0.455, 0.71, 0.936, 1.09, 1.68, 2.02, 2.6, 3.94];
for (const [n, name, x, y] of [
  [0, 'brute', [53, 81, 115, 138, 158, 184, 211, 231, 253, 284, 304], [341, 317, 295, 231, 209, 194, 179, 134, 111, 75, 9]],
  [1, 'mower', [50, 78, 119, 138, 158, 181, 211, 232, 253, 281, 307], [329, 299, 270, 238, 219, 196, 183, 133, 109, 63, 3]],
  [2, 'mechanic', [52, 80, 116, 141, 161, 184, 211, 233, 255, 284, 304], [345, 327, 299, 243, 220, 202, 188, 142, 120, 81, 4]],
  [3, 'chief', [52, 79, 117, 137, 157, 182, 210, 231, 253, 282, 306], [339, 307, 282, 252, 232, 212, 199, 149, 126, 77, 8]],
]) {
  studies.push({ name, cell: n, x: x.map((v) => (v * 512) / 360), y: levels.map((v, i) => [v, (y[i] * 512) / 360]) });
}
const sourceN = await sharp(file(input, 'scan-normal.jpg')).resize(width, width).raw().toBuffer();
const base = await sharp(file(input, 'scan-color.jpg')).resize(width, width).raw().toBuffer();
const images = await Promise.all(
  studies.map(async (s) => ({
    ...s,
    data: await (
      s.cell === undefined
        ? sharp(file(input, s.name + '.webp'))
        : sharp(file(input, 'neighbours.webp')).extract({ left: (s.cell % 2) * 627, top: Math.floor(s.cell / 2) * 627, width: 627, height: 627 })
    )
      .resize(1254, 1254)
      .removeAlpha()
      .raw()
      .toBuffer(),
    baked: Buffer.alloc(base.length),
    xPairs: xFromScan.map((v, i) => [v, s.x[i]]),
  })),
);

// Registration in each 512px or 360px working portrait. The upper and lower
// lid offsets bound the exposed iris; photographed lid margins stay intact.
const infection = {
  villager: { side: -1, iris: [181, 192, 180], eyes: [[0, -2, 12.2, -7.6, 11], [-0.4, -2.1, 12.4, -7.4, 11.3]] },
  mayor: { side: 1, iris: [188, 183, 157], eyes: [[2.2, -2.5, 13.1, -4.8, 12.1], [0, -0.8, 12.9, -4.9, 12.1]] },
  brute: { side: 1, iris: [177, 183, 171], eyes: [[0.4, -0.1, 8.1, -4.9, 7.7], [0.3, -0.1, 8.2, -4.8, 8.0]] },
  mower: { side: -1, iris: [187, 183, 160], eyes: [[0.5, -1.5, 8.1, -3.8, 7.5], [-2.1, -1.1, 8.3, -3.9, 7.7]] },
  mechanic: { side: -1, iris: [168, 185, 188], eyes: [[0.5, -1.4, 8.2, -3.4, 7.5], [0.4, -1.5, 8.2, -3.9, 7.7]] },
  chief: { side: 1, iris: [189, 188, 172], eyes: [[0.3, -2.6, 8.1, -3.8, 7.6], [-0.1, -3.0, 8.1, -3.5, 7.2]] },
};

// Two scales of pigment under the skin, keyed to anatomical regions. Work in
// portrait space before unwrapping, so the colour crosses UV seams and LODs.
const tissue = new Float32Array(128 * 128);
let seed = 811;
for (let i = 0; i < tissue.length; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  tissue[i] = seed / 4294967296;
}
function noise(x, y) {
  const a = Math.floor(x), b = Math.floor(y), u = smooth(0, 1, x - a), v = smooth(0, 1, y - b);
  const i = (a & 127) + (b & 127) * 128, j = (a & 127) + ((b + 1) & 127) * 128;
  const next = ((a + 1) & 127) - (a & 127);
  return mix(mix(tissue[i], tissue[i + next], u), mix(tissue[j], tissue[j + next], u), v);
}
function softenComplexion(s, i) {
  const { side } = infection[s.name];
  const cy = mapped(1.68, s.y), mouth = mapped(0.455, s.y), cx = s.x[5];
  const radius = (s.x[10] - s.x[0]) * 0.5;
  const bell = (x, y) => Math.exp(-(x * x + y * y));
  for (let y = 0; y < 1254; y++) {
    const dy = (y * 512 / 1254 - cy) / (mouth - cy);
    for (let x = Math.floor(s.x[0] * 1254 / 512); x < Math.ceil(s.x[10] * 1254 / 512); x++) {
      const dx = (x * 512 / 1254 - cx) / radius, k = (y * 1254 + x) * 3;
      const edge = (1 - smooth(0.90, 1.04, Math.abs(dx))) * (1 - smooth(1.16, 1.64, dy));
      const coarse = noise(dx * 7.1 + i * 25.3 + 3, dy * 5.2 + i * 8.1);
      const grain = noise(dx * 24 + i * 8.7, dy * 19 - i * 6.4);
      const cloud = smooth(0.27, 0.76, 0.66 * coarse + 0.34 * grain);
      const temple = bell((dx - side * 0.69) / 0.32, (dy + 0.03) / 0.34);
      const lip = bell((dx + side * 0.28 + 0.11 * (dy - 1)) / 0.26, (dy - 0.99) / 0.27);
      const cheek = bell((Math.abs(dx) - 0.47) / 0.23, (dy - 0.54) / 0.37);
      const mottled = edge * (temple + 0.93 * lip + 0.36 * cheek) * (0.28 + 0.72 * cloud);
      const pale = edge * (0.16 + 0.20 * cloud + 0.08 * cheek);
      const r = s.data[k], g = s.data[k + 1], b = s.data[k + 2], luma = r * 0.32 + g * 0.48 + b * 0.20;
      s.data[k] = clamp(mix(r, luma, pale) + (1.5 + 2.8 * cloud) * edge - 10 * mottled, 0, 255);
      s.data[k + 1] = clamp(mix(g, luma, pale) + (3 + 3.5 * cloud) * edge - 19 * mottled, 0, 255);
      s.data[k + 2] = clamp(mix(b, luma, pale) + (5 + 4 * cloud) * edge + 3 * mottled, 0, 255);
    }
  }
}
function cloudIrises(s) {
  const { iris, eyes, side } = infection[s.name];
  const scale = 1254 / (s.cell === undefined ? 512 : 360);
  const eyeY = mapped(1.68, s.y) * 1254 / 512;
  for (const [i, [offsetX, offsetY, radius, upper, lower]] of eyes.entries()) {
    const cx = s.x[i ? 7 : 3] * 1254 / 512 + offsetX * scale, cy = eyeY + offsetY * scale, r = radius * scale;
    const stronger = (i ? 1 : -1) === side;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const u = (x - cx) / r, v = (y - cy) / r, radial = Math.hypot(u, v);
        const slant = (i ? 0.09 : -0.09) * u;
        const top = upper / radius + 0.25 * u * u + slant, bottom = lower / radius - 0.28 * u * u + slant;
        const exposed = smooth(top, top + 0.13, v) * (1 - smooth(bottom - 0.09, bottom, v));
        const alpha = exposed * (1 - smooth(0.78, 1, radial));
        if (alpha <= 0) continue;
        const k = (1254 * y + x) * 3;
        const old = 0.31 * s.data[k] + 0.47 * s.data[k + 1] + 0.22 * s.data[k + 2];
        const angle = Math.atan2(v, u), fibre = noise(angle * 19 + 20 * i, radial * 3.8);
        const haze = (stronger ? 0.86 : 0.71) * alpha;
        const shade = 0.74 + 0.23 * smooth(top, top + 0.72, v) + 0.10 * (fibre - 0.5);
        const pupil = 1 - smooth(0.22, 0.34, radial);
        const glint = smooth(94, 158, old); // retain the original, shaded corneal reflection
        for (let ch = 0; ch < 3; ch++) {
          const cloud = mix(iris[ch] * shade + (old - 64) * 0.21, 32 + 7 * ch, pupil);
          s.data[k + ch] = mix(s.data[k + ch], cloud, haze * (1 - glint * 0.76));
        }
      }
    }
  }
}
images.forEach((s, i) => {
  softenComplexion(s, i);
  cloudIrises(s);
});
for (let i = 0; i < base.length; i += 3) {
  const gray = 0.32 * base[i] + 0.46 * base[i + 1] + 0.22 * base[i + 2];
  for (const s of images) {
    s.baked[i] = gray * 0.9 + 12;
    s.baked[i + 1] = gray * 0.81 + 15;
    s.baked[i + 2] = gray * 0.75 + 18;
  }
}
const nx = baseP.length / 3;
const xc = new Float32Array(nx),
  yc = new Float32Array(nx),
  weight = new Float32Array(nx);
for (let i = 0; i < nx; i++) {
  const x = baseP[3 * i],
    y = baseP[3 * i + 1],
    z = baseP[3 * i + 2],
    normalZ = baseN[3 * i + 2];
  xc[i] = x - center;
  yc[i] = y;
  const acrossFace = smooth(1.05, 1.48, z) * (1 - smooth(1.19, 1.48, Math.abs(x - center))) * smooth(-0.65, -0.35, y);
  weight[i] =
    Math.max(acrossFace, smooth(0.15, 0.66, normalZ)) *
    smooth(0.19, 1.05, z) *
    (1 - smooth(1.3, 1.62, Math.abs(x - center))) *
    smooth(-0.85, -0.45, y);
}
function sample(data, x, y, c) {
  const a = Math.floor(x),
    b = Math.floor(y),
    u = x - a,
    v = y - b,
    p = (b * 1254 + a) * 3 + c;
  return mix(mix(data[p], data[p + 3], u), mix(data[p + 3762], data[p + 3765], u), v);
}
for (let t = 0; t < original.length; t += 3) {
  const a = original[t],
    b = original[t + 1],
    c = original[t + 2];
  if (!(weight[a] + weight[b] + weight[c] > 0.0001)) continue;
  const xx = [a, b, c].map((i) => baseU[2 * i] * width - 0.5),
    yy = [a, b, c].map((i) => (1 - baseU[2 * i + 1]) * width - 0.5);
  const delta = (yy[1] - yy[2]) * (xx[0] - xx[2]) + (xx[2] - xx[1]) * (yy[0] - yy[2]);
  if (Math.abs(delta) < 1e-5) continue;
  for (let y = Math.max(0, Math.floor(Math.min(...yy))); y <= Math.min(width - 1, Math.ceil(Math.max(...yy))); y++)
    for (let x = Math.max(0, Math.floor(Math.min(...xx))); x <= Math.min(width - 1, Math.ceil(Math.max(...xx))); x++) {
      const u = ((yy[1] - yy[2]) * (x - xx[2]) + (xx[2] - xx[1]) * (y - yy[2])) / delta;
      const v = ((yy[2] - yy[0]) * (x - xx[2]) + (xx[0] - xx[2]) * (y - yy[2])) / delta,
        w = 1 - u - v;
      if (Math.min(u, v, w) < -0.002) continue;
      const X = u * xc[a] + v * xc[b] + w * xc[c],
        Y = u * yc[a] + v * yc[b] + w * yc[c],
        alpha = clamp(u * weight[a] + v * weight[b] + w * weight[c]),
        k = (y * width + x) * 3;
      for (const s of images) {
        const px = clamp((mapped(X, s.xPairs) * 1254) / 512, 1, 1251),
          py = clamp((mapped(Y, s.y) * 1254) / 512, 1, 1251);
        for (let ch = 0; ch < 3; ch++) {
          const pigment = sample(s.data, px, py, ch);
          s.baked[k + ch] = mix(s.baked[k + ch], pigment, alpha);
        }
      }
      // Remove the scanned shut-lid crease where the independent wet eye now sits.
      for (const e of eyes) {
        const uu = (X + center - e[0]) / 0.36,
          vv = (Y - e[1]) / 0.18;
        const orbital = (1 - smooth(0.65, 1.32, Math.hypot(uu, vv))) * alpha;
        if (orbital > 0) {
          sourceN[k] = mix(sourceN[k], 128, orbital);
          sourceN[k + 1] = mix(sourceN[k + 1], 128, orbital);
          sourceN[k + 2] = mix(sourceN[k + 2], 255, orbital);
        }
      }
    }
}
for (const s of images) {
  const eyeY = mapped(1.68, s.y);
  const centers = [
    [s.x[3], eyeY],
    [s.x[7], eyeY],
  ];
  for (const [side, [cx, cy]] of centers.entries()) {
    for (let yy = 0; yy < 144; yy++)
      for (let xx = 0; xx < 200; xx++) {
        const aperture = side === 0 ? s.x[4] - s.x[2] : s.x[8] - s.x[6];
        const k = ((1836 + yy) * width + 24 + side * 222 + xx) * 3,
          px = ((cx + ((xx / 199 - 0.5) * aperture) / 0.86) * 1254) / 512,
          py = ((cy + (yy / 143 - 0.5) * aperture * 0.84) * 1254) / 512;
        for (let ch = 0; ch < 3; ch++) s.baked[k + ch] = sample(s.data, px, py, ch);
        sourceN[k] = sourceN[k + 1] = 128;
        sourceN[k + 2] = 255;
      }
  }
}
for (const s of images)
  await sharp(s.baked, { raw: { width, height: width, channels: 3 } })
    .resize(s.cell === undefined ? 2048 : 1536)
    .webp({ quality: 93, smartSubsample: true, effort: 5 })
    .toFile(file(output, 'infected-face-' + s.name + '.webp'));
await sharp(sourceN, { raw: { width, height: width, channels: 3 } })
  .resize(1024)
  .webp({ quality: 93, effort: 6 })
  .toFile(file(output, 'infected-face-normal.webp'));

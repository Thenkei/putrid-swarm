// pnpm exec tsx tools/bake-infected.ts
// Sculpt in local surface coordinates at 4× texture resolution. Bake tangent normals
// and short-range cavity shading before filtering down to a shared game-resolution atlas.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { surfaces, type Surface, TILE, GUTTER, ATLAS_COLUMNS } from '../src/render/infected-atlas';

const tau = Math.PI * 2;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const gauss = (x: number) => Math.exp(-x * x);
const oval = (x: number, y: number) => Math.exp(-x * x - y * y);
const fract = (n: number) => n - Math.floor(n);
const rib = (t: number, width: number) => gauss((fract(t + 0.5) - 0.5) / width);
const grain = (x: number, y: number) => fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);

function relief(kind: Surface, u: number, v: number): number {
  const x = Math.abs(u - 0.5),
    shoulder = Math.sin(u * tau);
  if (kind === 'face') {
    const eye = (x - 0.145) / 0.072;
    const arc = (v - 0.327 + 0.012 * Math.cos(eye * Math.PI)) / 0.032;
    return (
      -0.027 * oval(eye, (v - 0.33) / 0.068) +
      0.017 * oval(eye, (v - 0.245 - x * 0.1) / 0.039) +
      0.014 * oval(eye, arc) -
      0.009 * oval(eye, (v - 0.383) / 0.018) +
      0.023 * oval((x - 0.21) / 0.096, (v - 0.45) / 0.11) -
      0.017 * oval((x - 0.245) / 0.1, (v - 0.64) / 0.13) +
      0.018 * oval(x / 0.045, (v - 0.48) / 0.17) -
      0.012 * oval((x - 0.048) / 0.022, (v - 0.55) / 0.022) -
      0.012 * oval((x - 0.068 - 0.21 * (v - 0.55)) / 0.016, (v - 0.64) / 0.108) +
      0.011 * oval(x / 0.111, (v - 0.72) / 0.03) -
      0.009 * oval(x / 0.12, (v - 0.76) / 0.019) +
      0.015 * oval(x / 0.122, (v - 0.86) / 0.055) -
      0.0026 * rib(16 * v + 0.36 * Math.cos(x * 14), 0.13) * oval(x / 0.21, (v - 0.12) / 0.095)
    );
  }
  if (kind === 'skin') {
    const line = Math.sin(v * 6.4 + 1.4 * shoulder);
    return 0.009 * rib(3 * u + 0.22 * line, 0.16) * Math.sin(Math.PI * v) - 0.0022 * rib(13 * v + 0.21 * shoulder, 0.12) * gauss((v - 0.74) / 0.17);
  }
  if (kind === 'leather')
    return 0.013 * rib(5 * v + 0.48 * shoulder, 0.16) * gauss((v - 0.42) / 0.34) + 0.01 * rib(2 * u, 0.022) - 0.006 * rib(2 * u + 0.048, 0.02);
  if (kind === 'tweed')
    return -0.007 * rib(8 * u + 0.09 * shoulder * v, 0.07) + 0.0015 * Math.sin(tau * (42 * v + 32 * x)) + 0.009 * rib(v - 0.87, 0.027);
  if (kind === 'sock') return 0.0038 * Math.cos(tau * 26 * u) + 0.004 * rib(9 * v + 0.13 * shoulder, 0.21);
  if (kind === 'cuff') return 0.019 * Math.sin(tau * (2.7 * v + 0.12 * shoulder)) + 0.004 * Math.sin(tau * (7 * v - 0.18 * shoulder));
  const bend = kind === 'trousers' ? 0.5 : 0.76;
  const diagonal = 3.7 * v + 0.85 * Math.sin(tau * u + 2.1 * v) + 0.37 * Math.sin(2 * tau * u - 1.2 * v);
  const folds = (0.018 * rib(diagonal, 0.23) - 0.014 * rib(diagonal + 0.23, 0.13)) * (0.3 + 0.7 * gauss((v - bend) / 0.31));
  const hem = 0.006 * rib(v - 0.93, 0.018);
  const seam = 0.005 * rib(2 * u + 0.5, 0.022);
  if (kind === 'apron' || kind === 'bib') return hem + 0.019 * Math.cos(6 * tau * u + 1.8 * v) * (0.24 + v) + 0.27 * folds;
  return folds + hem + seam;
}

function dye(kind: Surface, u: number, v: number): number[] {
  const x = Math.abs(u - 0.5);
  if (kind === 'jersey') {
    const band = v + 0.5 * x + 0.06 * Math.sin(tau * u);
    return band < 0.46 ? [239, 186, 61] : band < 0.52 ? [183, 62, 42] : band < 0.59 ? [240, 207, 131] : [49, 108, 107];
  }
  if (kind === 'shorts') return x > 0.2 && x < 0.29 ? [205, 155, 56] : [58, 105, 110];
  if (kind === 'apron') {
    const stripe = fract(u * 12 + 0.095 * Math.sin(v * 4 + tau * u));
    const ink = clamp((0.4 - stripe) * 45) * clamp(stripe * 45);
    return [222 - ink * 69, 199 - ink * 114, 154 - ink * 91];
  }
  if (kind === 'sock' && (Math.abs(v - 0.19) < 0.054 || Math.abs(v - 0.34) < 0.022)) return [142, 73, 49];
  if (kind === 'skin') {
    const freckle = gauss((fract(19 * u + Math.sin(v * 13)) - 0.5) / 0.14) * gauss((fract(v * 17 + Math.cos(u * 8)) - 0.5) / 0.12);
    const mottle = Math.sin(u * 22 + Math.sin(v * 21)) * Math.sin(v * 16 + u * 9);
    return [224 - 32 * freckle + 8 * mottle, 224 - 49 * freckle + 3 * mottle, 210 - 42 * freckle - 4 * mottle];
  }
  return [238, 235, 225];
}

// Each surface study covers a different physical process. The macro sculpt supplies
// garment folds while the original photographed weave, hide and pores supply the grain.
const sources = new URL('../art/infected/', import.meta.url);
const swatches = new Map<string, { data: Buffer; mean: number }>();
for (const [kind, left, top] of [
  ['canvas', 0, 0],
  ['denim', 627, 0],
  ['leather', 0, 627],
  ['fur', 627, 627],
  ['skin', 220, 625],
] as const) {
  const skin = kind === 'skin';
  const patch = await sharp(fileURLToPath(new URL(skin ? 'villager.webp' : 'surfaces.webp', sources)))
    .extract({ left: left + (skin ? 0 : 14), top: top + (skin ? 0 : 14), width: skin ? 147 : 599, height: skin ? 158 : 599 })
    .resize(600, 600)
    .removeAlpha()
    .raw()
    .toBuffer();
  let mean = 0;
  for (let i = 0; i < patch.length; i += 3) mean += (patch[i]! * 0.29 + patch[i + 1]! * 0.55 + patch[i + 2]! * 0.16) / 360000;
  swatches.set(kind, { data: patch, mean });
}
function study(kind: Surface) {
  const fabric =
    kind === 'skin' ? 'skin' : kind === 'leather' ? 'leather' : ['trousers', 'shorts', 'knee', 'vest'].includes(kind) ? 'denim' : 'canvas';
  const { data, mean } = swatches.get(fabric)!;
  function value(u: number, v: number) {
    const t = (a: number) => 1 - Math.abs((((a % 2) + 2) % 2) - 1);
    const ix = Math.min(599, Math.floor(t(u) * 600)),
      iy = Math.min(599, Math.floor(t(v) * 600));
    const p = (iy * 600 + ix) * 3;
    return (0.29 * data[p]! + 0.55 * data[p + 1]! + 0.16 * data[p + 2]!) / mean;
  }
  return value;
}

const path = fileURLToPath(new URL('../src/render/textures/', import.meta.url));
mkdirSync(path, { recursive: true });
const superSize = TILE * 2,
  margin = GUTTER * 2,
  span = superSize - 2 * margin;
const layers: sharp.OverlayOptions[][] = [[], []];
for (const [index, kind] of surfaces.entries()) {
  const fibre = study(kind);
  const heights = new Float32Array(superSize * superSize);
  for (let y = 0; y < superSize; y++)
    for (let x = 0; x < superSize; x++) {
      heights[y * superSize + x] = relief(kind, clamp((x - margin + 0.5) / span), clamp((y - margin + 0.5) / span));
    }
  const normal = Buffer.alloc(superSize * superSize * 3),
    albedo = Buffer.alloc(normal.length);
  const sample = (x: number, y: number) => heights[Math.max(0, Math.min(superSize - 1, y)) * superSize + Math.max(0, Math.min(superSize - 1, x))]!;
  for (let y = 0; y < superSize; y++)
    for (let x = 0; x < superSize; x++) {
      const i = (y * superSize + x) * 3,
        u = clamp((x - margin + 0.5) / span),
        v = clamp((y - margin + 0.5) / span);
      const nx = ((sample(x - 1, y) - sample(x + 1, y)) * span) / 2,
        ny = ((sample(x, y + 1) - sample(x, y - 1)) * span) / 2;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const gx = (fibre(u + 1 / 384, v) - fibre(u - 1 / 384, v)) * 0.42;
      const gy = (fibre(u, v + 1 / 384) - fibre(u, v - 1 / 384)) * 0.42;
      normal[i] = Math.max(2, Math.min(253, 127.5 + 127.5 * (nx * inv - gx)));
      normal[i + 1] = Math.max(2, Math.min(253, 127.5 + 127.5 * (ny * inv + gy)));
      normal[i + 2] = 127.5 + 127.5 * inv;
      const h = sample(x, y);
      let occlusion = 0;
      for (const r of [5, 16])
        for (const [dx, dy] of [
          [r, 0],
          [-r, 0],
          [0, r],
          [0, -r],
        ]) {
          occlusion += clamp(((sample(x + dx!, y + dy!) - h) * span) / r);
        }
      const weave = kind === 'skin' ? 0 : 0.018 * Math.sin(tau * 55 * v) * Math.sin(tau * (48 * u + 4 * v));
      const wear = 0.011 * Math.sin(29 * u + 18 * v) + 0.024 * (grain(x >> 2, y >> 2) - 0.5);
      const value = 0.99 - 0.062 * occlusion + weave + wear;
      const dyeColour = dye(kind, u, v);
      const fibreValue = fibre(u, v);
      const base = dyeColour.map((c) => c * clamp(0.56 + 0.44 * fibreValue) * Math.min(1.3, 0.66 + 0.34 * fibreValue));
      for (let c = 0; c < 3; c++) albedo[i + c] = Math.round(clamp((value * base[c]!) / 255) * 255);
    }
  for (const [k, buffer] of [albedo, normal].entries()) {
    const input = await sharp(buffer, { raw: { width: superSize, height: superSize, channels: 3 } })
      .resize(TILE, TILE)
      .png()
      .toBuffer();
    layers[k]!.push({ input, left: (index % ATLAS_COLUMNS) * TILE, top: Math.floor(index / ATLAS_COLUMNS) * TILE });
  }
}
for (const [i, name] of ['infected-cloth', 'infected-normals'].entries()) {
  await sharp({
    create: { width: TILE * ATLAS_COLUMNS, height: TILE * Math.ceil(surfaces.length / ATLAS_COLUMNS), channels: 3, background: 'white' },
  })
    .composite(layers[i]!)
    .webp({ quality: i === 1 ? 88 : 90, smartSubsample: true, effort: 5 })
    .toFile(path + name + '.webp');
}

const pelt = swatches.get('fur')!.data;
const furPigment = Buffer.alloc(pelt.length),
  furNormal = Buffer.alloc(pelt.length);
const luma = (x: number, y: number) => {
  const p = (Math.max(0, Math.min(599, y)) * 600 + Math.max(0, Math.min(599, x))) * 3;
  return 0.29 * pelt[p]! + 0.55 * pelt[p + 1]! + 0.16 * pelt[p + 2]!;
};
for (let y = 0; y < 600; y++)
  for (let x = 0; x < 600; x++) {
    const k = (600 * y + x) * 3,
      light = luma(x, y) / swatches.get('fur')!.mean;
    for (let c = 0; c < 3; c++) furPigment[k + c] = Math.max(35, Math.min(251, (178 + (light - 1) * 128) * (c === 0 ? 1.03 : c === 1 ? 1 : 0.95)));
    const dx = (luma(x - 1, y) - luma(x + 1, y)) / 138,
      dy = (luma(x, y + 1) - luma(x, y - 1)) / 138,
      z = 1 / Math.hypot(dx, dy, 1);
    furNormal[k] = 128 + 126 * dx * z;
    furNormal[k + 1] = 128 + 126 * dy * z;
    furNormal[k + 2] = 128 + 126 * z;
  }
for (const [name, data] of [
  ['infected-fur', furPigment],
  ['infected-fur-normal', furNormal],
] as const) {
  await sharp(data, { raw: { width: 600, height: 600, channels: 3 } })
    .webp({ quality: 91, smartSubsample: true })
    .toFile(path + name + '.webp');
}
const animalStudy = await sharp(fileURLToPath(new URL('animals.webp', sources)))
  .resize(660, 660)
  .removeAlpha()
  .raw()
  .toBuffer();
for (const [type, x0, y0, x1, y1] of [
  ['dog', 439, 117, 549, 183],
  ['boar', 432, 269, 595, 401],
  ['deer', 430, 566, 528, 630],
] as const) {
  const side = 448,
    bytes = Buffer.alloc(side * side * 3);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const a = (Math.round(y0 + ((y1 - y0) * y) / (side - 1)) * 660 + Math.round(x0 + ((x1 - x0) * x) / (side - 1))) * 3;
      const fx = Math.floor((x * 599) / side),
        fy = Math.floor((y * 599) / side),
        k = (y * side + x) * 3;
      const fibre = Math.max(0.72, Math.min(1.3, 0.69 + (0.31 * luma(fx, fy)) / swatches.get('fur')!.mean));
      for (let c = 0; c < 3; c++) bytes[k + c] = Math.max(12, Math.min(246, (1.13 * animalStudy[a + c]! + 13) * fibre));
    }
  await sharp(bytes, { raw: { width: side, height: side, channels: 3 } })
    .webp({ quality: 85, smartSubsample: true })
    .toFile(path + 'infected-coat-' + type + '.webp');
}
await sharp(fileURLToPath(new URL('animals.webp', sources)))
  .modulate({ saturation: 0.87 })
  .resize(1254, 1254)
  .webp({ quality: 90, smartSubsample: true })
  .toFile(path + 'infected-muzzles.webp');
await import('./bake-infected-head.mjs');

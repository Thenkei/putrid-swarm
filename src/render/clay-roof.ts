import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshPhongMaterial } from 'three';
import { yardSprite } from '../engine/assets';
import { paintedMap } from './painted-surfaces';
import { seeded } from './noise';
import { surfaceImage } from '../engine/material-images';
import { farmSurface } from './farm-materials';

export const patchedRoof = [
  [155, 119],
  [367, 51],
  [530, 225],
  [310, 300],
] as const;

// Coordinates on the flattened roof painting. Each swatch is one intact pan tile.
const clay = [
  [34, 12, 70, 42],
  [78, 13, 111, 43],
  [152, 12, 185, 41],
  [281, 9, 310, 40],
  [34, 51, 65, 81],
  [315, 50, 347, 79],
  [6, 165, 32, 194],
  [315, 239, 346, 269],
  [159, 282, 189, 311],
  [273, 51, 307, 81],
] as const;

let scan: Uint8ClampedArray | undefined;
const scanned = new Map<number, Mesh>();

function scannedSlope(side: number): Mesh | undefined {
  const previous = scanned.get(side);
  if (previous) return previous.clone();
  const image = surfaceImage('roof', 'surface');
  if (!image || !surfaceImage('roof')) return;
  const samples = 384;
  if (!scan) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = samples;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0, samples, samples);
    scan = ctx.getImageData(0, 0, samples, samples).data;
  }
  const height = scan;
  const pixel = (x: number, y: number) => height[4 * ((x % samples) + samples * (y % samples))]! / 255;
  const cols = 148,
    rows = 86,
    pos: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const u0 = side > 0 ? 0.061 : 0.315,
    v0 = side > 0 ? 0.076 : 0.231;
  for (let row = 0; row <= rows + 1; row++) {
    const apron = row > rows,
      v = Math.min(1, row / rows);
    for (let col = 0; col <= cols; col++) {
      const u = col / cols,
        s = u0 + 0.66 * u,
        t = v0 + 0.67 * v;
      const sx = s * samples,
        sy = t * samples,
        x = Math.floor(sx),
        y = Math.floor(sy),
        fx = sx - x,
        fy = sy - y;
      const h = (pixel(x, y) * (1 - fx) + pixel(x + 1, y) * fx) * (1 - fy) + (pixel(x, y + 1) * (1 - fx) + pixel(x + 1, y + 1) * fx) * fy;
      const lift = 0.014 + h * 0.089 - (apron ? 0.035 : 0);
      const overhang = 0.026 * v ** 10 * (0.6 + h);
      pos.push(side * (2.22 * v + 0.562 * lift + overhang), 4.105 - 1.506 * v + 0.827 * lift, 2.235 - 4.47 * u);
      uv.push(s, 1 - t - (apron ? 0.0025 : 0));
      if (!row || !col) continue;
      const d = row * (cols + 1) + col,
        a = d - cols - 2,
        b = a + 1,
        c = d - 1;
      if (side > 0) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // The mesh carries the broad relief of the scan. The normal map supplies smaller chips and ridges.
  const mesh = new Mesh(geo, farmSurface('roof', 0.58, { color: 0xfff9ed }));
  scanned.set(side, mesh);
  return mesh;
}

/** Real overlapping courses give the eaves a scalloped silhouette and receive moving light. */
export function claySlope(side: number): Mesh | undefined {
  const measured = scannedSlope(side);
  if (measured) return measured;
  const art = yardSprite('obj_house_back'),
    map = paintedMap('obj_house_back');
  if (!art || !map) return;
  const positions: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const rand = seeded(side > 0 ? 912 : 514);
  const tint = new Color();
  const cols = 15,
    rows = 9;
  const profile = [0.018, 0.049, 0.058, 0.031, 0.007, 0.011];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const swatch = clay[Math.floor(rand() * clay.length)]!;
      const overhang = 0.018 + rand() * 0.014;
      const skew = (rand() - 0.5) * 0.06;
      const value = 0.83 + rand() * 0.21;
      // The last strip turns back under the lip. Adjacent rows tuck behind it.
      for (let band = 0; band < 4; band++) {
        const along = [0, 0.68, 1, 1][band]!;
        for (let rib = 0; rib < profile.length; rib++) {
          const across = rib / (profile.length - 1);
          const u = (col + across + skew * along * Math.sin(Math.PI * across)) / cols;
          const v = (row + along) / rows;
          const lift = band === 3 ? -0.009 : profile[rib]! + along * 0.019;
          positions.push(
            side * (2.22 * v + 0.562 * lift + overhang * along),
            4.1 - 1.506 * v + 0.827 * lift - overhang * along * 0.68,
            2.235 - u * 4.47,
          );
          const s = (swatch[0] + across * (swatch[2] - swatch[0])) / 570;
          const t = (swatch[1] + along * (swatch[3] - swatch[1])) / 345;
          const [a, b, c, d] = patchedRoof;
          const weights = s >= t ? [1 - s, s - t, t, 0] : [1 - t, 0, s, t - s];
          const pixel = (axis: 0 | 1) => (a[axis] * weights[0]! + b[axis] * weights[1]! + c[axis] * weights[2]! + d[axis] * weights[3]!) / 550;
          uvs.push(pixel(0), 1 - (pixel(1) * art.w) / art.h);
          tint.setRGB(value, value * (0.97 + 0.03 * along), value * 0.95).multiplyScalar(band === 3 ? 0.45 : 1);
          colors.push(tint.r, tint.g, tint.b);
          if (rib && band) {
            const i = positions.length / 3 - 1,
              a = i - profile.length - 1,
              b = a + 1,
              c = i - 1;
            if (side > 0) indices.push(a, c, b, b, c, i);
            else indices.push(a, b, c, b, i, c);
          }
        }
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new Mesh(geo, new MeshPhongMaterial({ map, vertexColors: true, specular: 0x33261e, shininess: 13 }));
}

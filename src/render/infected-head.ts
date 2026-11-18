// Scanned starting geometry by Lee Perry-Smith / Infinite-Realities (CC BY 3.0).
// The fitted mesh, maps, transformations and full attribution are described in art/infected/CREDITS.md.
import { BufferGeometry, Color, Float32BufferAttribute, FrontSide, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import type { Villager } from './infected-sculpt';
import { infectedMap, furMaterial } from './infected-surfaces';
import yardData from './textures/infected-head-camera.mesh64?raw';
import inspectionData from './textures/infected-head-inspection.mesh64?raw';
import maleSkin from './textures/infected-face-villager.webp?url';
import butcherSkin from './textures/infected-face-brute.webp?url';
import mowerSkin from './textures/infected-face-mower.webp?url';
import mechanicSkin from './textures/infected-face-mechanic.webp?url';
import chiefSkin from './textures/infected-face-chief.webp?url';
import mayorSkin from './textures/infected-face-mayor.webp?url';
import scanNormals from './textures/infected-face-normal.webp?url';

export type InfectedDetail = 'camera' | 'inspection';
const cache = new Map<string, Mesh>();
let hairEdge: MeshStandardMaterial | undefined;
interface Shape {
  width: number;
  length: number;
  jaw: number;
  cheeks: number;
  bridge: number;
  brow: number;
  chin: number;
  tint: string;
  beard: number;
}
const shapes: Record<Villager, Shape> = {
  shambler: { width: 0.97, length: 1.03, jaw: -0.13, cheeks: -0.15, bridge: 0.05, brow: 0.04, chin: -0.018, tint: '#e1dfcb', beard: 0.37 },
  runner: { width: 0.95, length: 0.98, jaw: -0.07, cheeks: -0.035, bridge: -0.16, brow: -0.07, chin: 0.025, tint: '#e1d9c8', beard: 0.04 },
  brute: { width: 1.13, length: 0.96, jaw: 0.22, cheeks: 0.17, bridge: -0.1, brow: 0.28, chin: 0.16, tint: '#d8d2c3', beard: 0.72 },
  mower: { width: 1.04, length: 1.01, jaw: 0.064, cheeks: -0.04, bridge: 0.17, brow: 0.2, chin: 0.09, tint: '#d5c9a9', beard: 0.68 },
  mechanic: { width: 1.09, length: 0.99, jaw: 0.15, cheeks: -0.1, bridge: 0.1, brow: 0.13, chin: 0.145, tint: '#d5d4c4', beard: 0.86 },
  mail: { width: 0.94, length: 1.035, jaw: -0.12, cheeks: -0.13, bridge: -0.095, brow: -0.055, chin: -0.05, tint: '#d8d4b9', beard: 0.07 },
  chief: { width: 1.055, length: 1.02, jaw: 0.16, cheeks: -0.07, bridge: 0.15, brow: 0.23, chin: 0.14, tint: '#c8cbb6', beard: 0.45 },
  mayor: { width: 0.95, length: 0.986, jaw: -0.115, cheeks: 0.06, bridge: -0.12, brow: -0.2, chin: -0.05, tint: '#e1d5c8', beard: 0 },
};

const bell = (x: number, width: number) => Math.exp(-((x / width) ** 2));
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function skull(type: Villager, detail: InfectedDetail): Mesh {
  const packed = detail === 'inspection' ? inspectionData : yardData;
  const bytes = Uint8Array.from(atob(packed), (c) => c.charCodeAt(0));
  const words = new DataView(bytes.buffer),
    count = words.getUint16(0, true),
    triangles = words.getUint16(2, true);
  const positions = new Float32Array(count * 3),
    uv = new Float32Array(count * 2),
    shades = new Float32Array(count * 3);
  const profile = shapes[type],
    tint = new Color(profile.tint);
  for (let i = 0; i < count; i++) {
    const k = 4 + i * 10;
    let x = words.getInt16(k, true) / 4096 + 0.094;
    const y = words.getInt16(k + 2, true) / 4096;
    let z = words.getInt16(k + 4, true) / 4096;
    const lateral = Math.abs(x),
      front = smooth(0.25, 1.6, z);
    const jaw = bell(y - 0.04, 0.77),
      malar = bell(y - 1.1, 0.47) * bell(lateral - 1.02, 0.68);
    x *= profile.width * (1 + profile.jaw * 0.58 * jaw + profile.cheeks * 0.28 * malar);
    z +=
      front *
      (profile.bridge * bell(x, 0.29) * bell(y - 1.14, 0.51) +
        profile.brow * bell(lateral - 0.65, 0.6) * bell(y - 2.03, 0.23) +
        profile.chin * bell(x, 0.65) * bell(y + 0.1, 0.45) +
        profile.cheeks * malar);
    positions[i * 3] = 0.105 * x;
    positions[i * 3 + 1] = 1.505 + 0.0895 * (1.68 + (y - 1.68) * profile.length);
    positions[i * 3 + 2] = 0.112 + 0.099 * z;
    uv[i * 2] = words.getUint16(k + 6, true) / 65535;
    uv[i * 2 + 1] = words.getUint16(k + 8, true) / 65535;
    // Shade the projecting jawline and the mouth's stubble differently on each neighbour.
    const goatee = front * (bell(y - 0.08, 0.46) * bell(lateral, 0.92) + 0.67 * bell(y - 0.666, 0.097) * bell(lateral, 0.53));
    const temple = front * bell(lateral - 0.88, 0.34) * bell(y - 1.64, 0.29);
    const dirt = type === 'mechanic' || type === 'mower' || type === 'shambler' ? 0.13 * bell(x - 0.64, 0.6) * bell(y - 0.96, 0.64) : 0;
    const dye = 1 - Math.min(0.16, goatee * profile.beard * 0.2) - dirt;
    shades[i * 3] = tint.r * dye * (1 - 0.06 * temple);
    shades[i * 3 + 1] = tint.g * dye * (1 - 0.14 * temple);
    shades[i * 3 + 2] = tint.b * dye * (1 - 0.03 * temple);
  }
  const start = 4 + 10 * count,
    indices = new Uint16Array(triangles * 3);
  for (let i = 0; i < indices.length; i++) indices[i] = words.getUint16(start + 2 * i, true);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new Float32BufferAttribute(shades, 3));
  geo.setIndex(Array.from(indices));
  geo.computeVertexNormals();
  const skin: Partial<Record<Villager, string>> = {
    brute: butcherSkin,
    mower: mowerSkin,
    mechanic: mechanicSkin,
    chief: chiefSkin,
    mayor: mayorSkin,
  };
  const mat = new MeshStandardMaterial({
    map: infectedMap(skin[type] ?? maleSkin, true),
    normalMap: infectedMap(scanNormals, false),
    vertexColors: true,
    roughness: 0.72,
    metalness: 0,
    envMapIntensity: 0.48,
  });
  mat.normalScale.setScalar(0.46);
  const head = new Mesh(geo, mat);
  head.castShadow = true;
  head.receiveShadow = true;
  const hairColours: Record<Villager, string> = {
    shambler: '#554b40',
    runner: '#50463a',
    brute: '#65584b',
    mower: '#56524d',
    mechanic: '#6f6656',
    mail: '#574d43',
    chief: '#494a46',
    mayor: '#b0a99c',
  };
  // Place actual hair above the scalp. Thin temples remain under the caps; the
  // mayor has a swept hairline and a low tied knot, visible in profile and from behind.
  const hairIndex: number[] = [],
    hairUV = new Float32Array(count * 2),
    hairPos = positions.slice(),
    hairRGB = new Float32Array(count * 3),
    normal = geo.getAttribute('normal');
  const coverage = new Float32Array(count),
    hairColour = new Color(hairColours[type]);
  for (let i = 0; i < count; i++) {
    const j = 4 + 10 * i,
      x = words.getInt16(j, true) / 4096 + 0.094,
      y = words.getInt16(j + 2, true) / 4096,
      z = words.getInt16(j + 4, true) / 4096;
    const angle = Math.atan2(x, z),
      forward = Math.cos(angle),
      side = Math.abs(Math.sin(angle));
    const natural = type === 'mayor' ? 2.85 : type === 'runner' || type === 'mail' ? 2.89 : 3.38;
    const line = 1.2 + (natural - 1.2) * smooth(-0.49, 0.97, forward) + 0.28 * side + 0.1 * Math.sin(angle * 3 + 1) + 0.035 * Math.sin(angle * 26);
    let scalp = y - line;
    const capped = type === 'mail' || type === 'chief' || type === 'shambler' || type === 'runner';
    if (capped) scalp = Math.min(scalp, 3.72 - y);
    coverage[i] = scalp;
    const halo = type === 'mayor' ? 0.014 : 0.005;
    const lift = halo * (0.13 + 0.87 * smooth(0.01, 0.45, scalp));
    hairPos[i * 3]! += normal.getX(i) * lift;
    hairPos[i * 3 + 1]! += normal.getY(i) * lift;
    hairPos[i * 3 + 2]! += normal.getZ(i) * lift;
    hairUV[i * 2] = (angle / Math.PI) * 1.55 + 0.055 * y;
    hairUV[i * 2 + 1] = y * 0.54 + 0.18 * side;
    const salt = 0.83 + 0.23 * (0.5 + 0.5 * Math.sin(23 * angle + 0.7 * y)) * Math.max(0.2, side);
    hairRGB[i * 3] = hairColour.r * salt;
    hairRGB[i * 3 + 1] = hairColour.g * salt;
    hairRGB[i * 3 + 2] = hairColour.b * salt;
  }
  const p = Array.from(hairPos),
    rgb: number[] = [],
    u = Array.from(hairUV),
    n = Array.from(normal.array),
    cuts = new Map<number, number>();
  for (let i = 0; i < count; i++) rgb.push(hairRGB[i * 3]!, hairRGB[i * 3 + 1]!, hairRGB[i * 3 + 2]!, smooth(-0.015, 0.23, coverage[i]!));
  function trim(a: number, b: number): number {
    const key = Math.min(a, b) * count + Math.max(a, b),
      previous = cuts.get(key);
    if (previous !== undefined) return previous;
    const t = coverage[a]! / (coverage[a]! - coverage[b]!),
      idx = p.length / 3;
    for (const [array, channels] of [
      [p, 3],
      [rgb, 4],
      [n, 3],
      [u, 2],
    ] as const) {
      for (let c = 0; c < channels; c++) array.push(array[a * channels + c]! * (1 - t) + array[b * channels + c]! * t);
    }
    cuts.set(key, idx);
    return idx;
  }
  // Intersect the scan triangles with the hairline, at the forehead and sideburns.
  // Simply selecting whole triangles produces a stair step at the temples in close-ups.
  for (let k = 0; k < indices.length; k += 3) {
    const triangle = [indices[k]!, indices[k + 1]!, indices[k + 2]!],
      polygon: number[] = [];
    for (let j = 0; j < 3; j++) {
      const a = triangle[j]!,
        b = triangle[(j + 1) % 3]!,
        inside = coverage[a]! >= 0;
      if (inside) polygon.push(a);
      if (inside !== coverage[b]! >= 0) polygon.push(trim(a, b));
    }
    for (let j = 2; j < polygon.length; j++) hairIndex.push(polygon[0]!, polygon[j - 1]!, polygon[j]!);
  }
  const hairGeo = new BufferGeometry();
  hairGeo.setAttribute('position', new Float32BufferAttribute(p, 3));
  hairGeo.setAttribute('normal', new Float32BufferAttribute(n, 3));
  hairGeo.setAttribute('uv', new Float32BufferAttribute(u, 2));
  hairGeo.setAttribute('color', new Float32BufferAttribute(rgb, 4));
  hairGeo.setIndex(hairIndex);
  if (!hairEdge) {
    hairEdge = furMaterial().clone();
    hairEdge.transparent = true;
    hairEdge.depthWrite = false;
    hairEdge.forceSinglePass = true;
    hairEdge.side = FrontSide;
    hairEdge.alphaTest = 0.02;
  }
  const hair = new Mesh(hairGeo, hairEdge);
  hair.castShadow = hair.receiveShadow = true;
  head.add(hair);
  if (type === 'mayor') {
    const knot = new SphereGeometry(1, 18, 12),
      coords = knot.getAttribute('position'),
      rgb = new Float32Array(coords.count * 3);
    for (let i = 0; i < coords.count; i++) {
      const value = 0.69 + 0.28 * Math.abs(Math.sin(coords.getX(i) * 4 + coords.getZ(i) * 2));
      rgb[i * 3] = hairColour.r * value;
      rgb[i * 3 + 1] = hairColour.g * value;
      rgb[i * 3 + 2] = hairColour.b * value;
    }
    knot.setAttribute('color', new Float32BufferAttribute(rgb, 3));
    const bun = new Mesh(knot, furMaterial());
    bun.position.set(0, 1.62, -0.115);
    bun.scale.set(0.081, 0.072, 0.065);
    bun.castShadow = bun.receiveShadow = true;
    head.add(bun);
  }
  return head;
}

// Keep the scanned geometry indexed. Batching rigid wardrobe pieces generally de-indexes
// them; this mesh is already one draw and shares its buffers across all instances of a rig.
export function addInfectedHead(group: Group, type: Villager, detail: InfectedDetail): void {
  const key = type + ':' + detail;
  let mesh = cache.get(key);
  if (!mesh) {
    mesh = skull(type, detail);
    cache.set(key, mesh);
  }
  const face = mesh.clone();
  face.position.set(0, -1.46, -0.115);
  group.add(face);
}

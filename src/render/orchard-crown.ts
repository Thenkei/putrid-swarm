import { BufferGeometry, CanvasTexture, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial, SRGBColorSpace } from 'three';
import { spar } from './gate-models';
import { seeded } from './noise';
import { wind } from './painted-surfaces';
import { plantImage } from './plant-images';

let foliage: MeshLambertMaterial | undefined;
function appleLeaf(): MeshLambertMaterial {
  if (foliage) return foliage;
  const photographed = plantImage('dead');
  if (photographed) {
    // Unwrap the photographed blade across the modelled leaf's changing width.
    // The mesh supplies the curl. The neutral value variation carries the actual
    // secondary veins and spots through the different colours of the crown.
    const w = 96,
      h = 144,
      source = photographed.getContext('2d')!.getImageData(0, 0, photographed.width, photographed.height).data;
    const texture = document.createElement('canvas');
    texture.width = w;
    texture.height = h;
    const ctx = texture.getContext('2d')!,
      pixels = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const ry = Math.floor((0.085 + (0.82 * y) / (h - 1)) * photographed.height);
      let left = 0,
        right = photographed.width - 1;
      const row = ry * photographed.width * 4;
      while (left < right && source[row + left * 4 + 3]! < 120) left++;
      while (right > left && source[row + right * 4 + 3]! < 120) right--;
      for (let x = 0; x < w; x++) {
        const i = row + 4 * Math.round(left + (right - left) * (0.04 + (0.92 * x) / (w - 1))),
          o = (y * w + x) * 4;
        const l = 164 + (source[i]! * 0.26 + source[i + 1]! * 0.64 + source[i + 2]! * 0.1 - 135) * 0.77;
        pixels.data[o] = l * 1.03;
        pixels.data[o + 1] = l * 1.07;
        pixels.data[o + 2] = l * 0.86;
        pixels.data[o + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
    const map = new CanvasTexture(texture);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 6;
    foliage = new MeshLambertMaterial({ map, side: DoubleSide, vertexColors: true });
    wind(foliage);
    return foliage;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 144;
  const ctx = canvas.getContext('2d')!;
  const wash = ctx.createLinearGradient(0, 0, 96, 5);
  for (const [position, color] of [
    [0, '#c0be94'],
    [0.44, '#e9e2ac'],
    [0.5, '#a99b68'],
    [0.54, '#eee5b1'],
    [1, '#c8bc89'],
  ] as const)
    wash.addColorStop(position, color);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 96, 144);
  const rand = seeded(1982);
  for (let i = 0; i < 350; i++) {
    ctx.fillStyle = i % 3 ? 'rgba(119,88,45,0.18)' : 'rgba(240,224,164,0.6)';
    ctx.fillRect(rand() * 96, rand() * 144, 1 + rand() * 5, 1 + rand() * 4);
  }
  ctx.strokeStyle = '#ada175';
  for (let row = 0; row < 8; row++) {
    const y = 29 + row * 14;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(48, y);
      ctx.quadraticCurveTo(48 + side * 22, y - 4, 48 + side * 46, y - 22);
      ctx.stroke();
    }
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  foliage = new MeshLambertMaterial({ map, side: DoubleSide, vertexColors: true });
  wind(foliage);
  return foliage;
}

// Each fruiting branch carries arching shoots with alternate, cupped leaves.
// Outer leaves turn gold first. Gaps between the shoots let the branch and fruit show through.
export function fruitingBranch(g: Group, x: number, y: number, z: number, yaw: number, seed: number): void {
  const rand = seeded(seed);
  const positions: number[] = [],
    uvs: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const gold = new Color('#dfc356'),
    green = new Color('#6d934f'),
    copper = new Color('#ce853a'),
    tint = new Color();
  const branch = new Group();
  branch.position.set(x, y, z);
  branch.rotation.y = yaw;
  for (let shoot = 0; shoot < 6; shoot++) {
    const a = shoot * 2.4 + rand() * 0.45;
    const radius = 0.47 + rand() * 0.29;
    const rise = 0.32 + rand() * 0.42;
    const at = (t: number): [number, number, number] => [Math.sin(a) * radius * t, rise * t + 0.25 * Math.sin(Math.PI * t), Math.cos(a) * radius * t];
    spar(branch, at(0), at(0.5), 0.044, '#685237');
    spar(branch, at(0.5), at(1), 0.029, '#79643e');
    for (let leaf = 0; leaf < 10; leaf++) {
      const t = 0.21 + leaf * 0.084;
      const [px, py, pz] = at(t);
      const dir = a + (leaf % 2 ? -1 : 1) * (0.63 + rand() * 0.94);
      const dx = Math.sin(dir),
        dz = Math.cos(dir);
      const length = 0.26 + rand() * 0.17,
        half = length * (0.21 + rand() * 0.07);
      const tipY = (rand() - 0.51) * 0.38;
      const roll = (rand() - 0.5) * 0.95;
      tint
        .copy(green)
        .lerp(shoot % 4 === 2 ? copper : gold, Math.min(1, rand() * 0.68 + t * 0.42))
        .multiplyScalar(0.86 + t * 0.35);
      const first = positions.length / 3;
      for (let j = 0; j <= 6; j++) {
        const u = j / 6;
        const curve = Math.sin(Math.PI * u);
        for (const side of [-1, 0, 1]) {
          const s = side * half * Math.pow(curve, 0.8);
          positions.push(px + dx * length * u + dz * s, py + tipY * u + curve * (side ? 0.034 : 0.078) + roll * s, pz + dz * length * u - dx * s);
          uvs.push((side + 1) / 2, u);
          const light = side === -1 ? 0.84 : 1;
          colors.push(tint.r * light, tint.g * light, tint.b * light);
        }
        if (j) {
          const k = first + j * 3;
          indices.push(k - 3, k, k - 2, k, k + 1, k - 2, k - 2, k + 1, k - 1, k + 1, k + 2, k - 1);
        }
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  branch.add(new Mesh(geo, appleLeaf()));
  g.add(branch);
}

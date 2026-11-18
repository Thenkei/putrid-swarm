// One draw material for wood, fittings and painted surfaces. Each packed tile carries
// its own normal, roughness and metal response even when all the resting parts are batched.
import {
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector2,
} from 'three';
import { surfaceImage } from '../engine/material-images';
import { clamp01, hash2, valueNoise } from './noise';

const surfaces = [
  'timber',
  'endgrain',
  'bark',
  'iron',
  'rope',
  'enamel',
  'hazard',
  'brass',
  'rubber',
  'grille',
  'reflector',
  'lens',
] as const;
type Surface = (typeof surfaces)[number];
type Source = 'timber' | 'endgrain' | 'bark' | 'iron' | 'rope' | 'enamel';
const sources: Record<Surface, Source> = {
  timber: 'timber',
  endgrain: 'endgrain',
  bark: 'bark',
  iron: 'iron',
  rope: 'rope',
  enamel: 'enamel',
  hazard: 'timber',
  brass: 'iron',
  rubber: 'enamel',
  grille: 'iron',
  reflector: 'iron',
  lens: 'enamel',
};
const swatch: Record<Source, string> = {
  timber: '#967b5a',
  endgrain: '#b49a77',
  bark: '#605447',
  iron: '#808982',
  rope: '#b99a6e',
  enamel: '#718078',
};
const cells = 4,
  rows = 3,
  tile = 384,
  pad = 4,
  core = tile - 2 * pad;
let hardware: MeshStandardMaterial | undefined;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function rawTile(kind: Source, channel: 'albedo' | 'normal' | 'surface'): ImageData {
  const ctx = canvas(core, core).getContext('2d', { willReadFrequently: true })!;
  const image = surfaceImage(kind, channel);
  if (image) {
    // The scanned plank floor contains ten complete boards. Retain three full-width
    // boards at this atlas resolution instead of shrinking ten grain fields into it.
    if (kind === 'timber')
      ctx.drawImage(image, image.naturalWidth * 0.325, 0, image.naturalWidth * 0.3, image.naturalHeight, 0, 0, core, core);
    else ctx.drawImage(image, 0, 0, core, core);
  } else {
    ctx.fillStyle = channel === 'albedo' ? swatch[kind] : channel === 'normal' ? '#8080ff' : kind === 'iron' ? '#8090a6' : '#80bd06';
    ctx.fillRect(0, 0, core, core);
  }
  return ctx.getImageData(0, 0, core, core);
}
// Replicate the gutter, keeping unrelated metal and timber out of the low mips.
function paste(ctx: CanvasRenderingContext2D, data: ImageData, x: number, y: number): void {
  const buffer = canvas(core, core);
  buffer.getContext('2d')!.putImageData(data, 0, 0);
  ctx.drawImage(buffer, x + pad, y + pad);
  ctx.drawImage(buffer, 0, 0, core, 1, x + pad, y, core, pad);
  ctx.drawImage(buffer, 0, core - 1, core, 1, x + pad, y + tile - pad, core, pad);
  ctx.drawImage(buffer, 0, 0, 1, core, x, y + pad, pad, core);
  ctx.drawImage(buffer, core - 1, 0, 1, core, x + tile - pad, y + pad, pad, core);
  for (const a of [0, 1])
    for (const b of [0, 1])
      ctx.drawImage(buffer, a * (core - 1), b * (core - 1), 1, 1, x + a * (tile - pad), y + b * (tile - pad), pad, pad);
}
function atlas(): MeshStandardMaterial {
  const maps = Array.from({ length: 3 }, () => canvas(cells * tile, rows * tile).getContext('2d')!);
  for (const [index, kind] of surfaces.entries()) {
    const base = sources[kind],
      photo = rawTile(base, 'albedo'),
      normal = rawTile(base, 'normal'),
      packed = rawTile(base, 'surface');
    if (kind === 'bark')
      for (let i = 0; i < photo.data.length; i += 4) {
        const grey = photo.data[i]! * 0.3 + photo.data[i + 1]! * 0.54 + photo.data[i + 2]! * 0.16;
        photo.data[i] = photo.data[i]! * 0.56 + grey * 0.26;
        photo.data[i + 1] = photo.data[i + 1]! * 0.59 + grey * 0.24;
        photo.data[i + 2] = photo.data[i + 2]! * 0.67 + grey * 0.23;
      }
    if (kind !== base)
      for (let py = 0; py < core; py++)
        for (let px = 0; px < core; px++) {
          const i = (px + py * core) * 4,
            u = px / (core - 1),
            v = py / (core - 1);
          const r = photo.data[i]!,
            g = photo.data[i + 1]!,
            b = photo.data[i + 2]!,
            l = (r * 0.28 + g * 0.57 + b * 0.15) / 255;
          const mottling = valueNoise(u * 12, v * 12, 118),
            grit = hash2(px, py, 42);
          let red = r,
            green = g,
            blue = b,
            rough = packed.data[i + 1]! / 255,
            metal = packed.data[i + 2]! / 255;
          if (kind === 'hazard') {
            const stripe = (u * 3.2 - v * 0.53 + 0.33) % 1,
              edge = Math.min(u, 1 - u, v, 1 - v);
            const coat = clamp01((mottling * 0.47 + grit * 0.3 + l * 0.43 + Math.min(0.09, edge) * 1.3 - 0.35) * 8);
            const tone = 0.76 + 0.39 * l + 0.12 * mottling;
            const pigment = stripe > 0.49 ? [164, 66, 37] : [207, 193, 153];
            red = r * (1 - coat) + pigment[0]! * tone * coat;
            green = g * (1 - coat) + pigment[1]! * tone * coat;
            blue = b * (1 - coat) + pigment[2]! * tone * coat;
            rough = 0.79 - 0.24 * coat + 0.13 * (mottling - 0.5);
            metal = 0.015;
          } else if (kind === 'brass') {
            const patina = clamp01((mottling - 0.6) * 3.7),
              light = 0.5 + l * 0.66;
            red = (183 - 73 * patina) * light;
            green = (149 - 40 * patina) * light;
            blue = (91 - 5 * patina) * light;
            rough = 0.31 + 0.34 * patina + 0.18 * (1 - l);
            metal = 0.77 - 0.36 * patina;
          } else if (kind === 'reflector') {
            const light = 0.77 + l * 0.21 + 0.043 * (grit - 0.5);
            red = 231 * light;
            green = 232 * light;
            blue = 226 * light;
            rough = 0.13 + mottling * 0.13;
            metal = 0.88;
            normal.data[i] = 128 + (normal.data[i]! - 128) * 0.12;
            normal.data[i + 1] = 128 + (normal.data[i + 1]! - 128) * 0.12;
          } else if (kind === 'rubber') {
            const grey = 41 + 24 * l + 15 * (grit - 0.5);
            red = grey * 1.03;
            green = grey;
            blue = grey * 0.91;
            rough = 0.75 + 0.13 * mottling;
            metal = 0.005;
          } else if (kind === 'grille') {
            const row = Math.floor(v * 27),
              x = ((u * 24 + row * 0.5) % 1) - 0.5,
              y = ((v * 27) % 1) - 0.5,
              d = Math.hypot(x, y);
            const rim = clamp01((d - 0.3) * 12),
              light = clamp01(0.63 + l * 0.5 + Math.max(0, 0.44 - d) * rim * (x - y));
            red = (25 + 85 * rim) * light;
            green = (27 + 88 * rim) * light;
            blue = (24 + 84 * rim) * light;
            normal.data[i] = 128 + clamp01(1 - Math.abs(d - 0.38) * 11) * x * 98;
            normal.data[i + 1] = 128 - clamp01(1 - Math.abs(d - 0.38) * 11) * y * 98;
            rough = 0.78 - rim * 0.24;
            metal = 0.04 + rim * 0.46;
          } else if (kind === 'lens') {
            const flute = 0.42 + 0.58 * (0.5 + 0.5 * Math.cos(v * 105)) ** 2;
            red = 149 + 58 * flute + 16 * mottling;
            green = 61 + 57 * flute;
            blue = 21 + 25 * flute;
            rough = 0.23;
            metal = 0.1;
            normal.data[i] = 128;
            normal.data[i + 1] = 128 + 21 * Math.sin(v * 105);
          }
          photo.data[i] = red;
          photo.data[i + 1] = green;
          photo.data[i + 2] = blue;
          packed.data[i + 1] = rough * 255;
          packed.data[i + 2] = metal * 255;
        }
    [photo, normal, packed].forEach((image, i) => paste(maps[i]!, image, (index % cells) * tile, Math.floor(index / cells) * tile));
  }
  const [albedo, normal, response] = maps.map((ctx) => {
    const t = new CanvasTexture(ctx.canvas);
    t.anisotropy = 8;
    return t;
  });
  albedo!.colorSpace = SRGBColorSpace;
  return new MeshStandardMaterial({
    map: albedo!,
    normalMap: normal!,
    normalScale: new Vector2(0.86, 0.86),
    roughnessMap: response!,
    metalnessMap: response!,
    roughness: 1,
    metalness: 1,
    vertexColors: true,
    envMapIntensity: 0.91,
  });
}

const tints: Record<string, [Surface, string?]> = {
  '9b7148': ['timber'],
  d5aa70: ['endgrain'],
  e3c58a: ['timber', '#fff2da'],
  ae722d: ['hazard'],
  ccb17a: ['rope'],
  '977341': ['rope', '#dbccae'],
  a98556: ['rope'],
  d39b3e: ['brass'],
  '9b7540': ['brass', '#d6caac'],
  a5804c: ['brass'],
  ac8352: ['brass'],
  a98550: ['brass'],
  ce8137: ['lens'],
  '49473e': ['rubber'],
  '403f39': ['rubber'],
  '3a3831': ['rubber'],
  '747c7b': ['grille'],
  c4cbcc: ['reflector'],
  '515851': ['iron', '#b3b8b5'],
  '97a4a0': ['reflector', '#d5d7d0'],
  '646459': ['reflector', '#9ca29c'],
  '77745c': ['iron', '#cabda0'],
  '886747': ['iron', '#b39c7e'],
  '76624e': ['iron', '#a29584'],
  b78f5f: ['iron', '#d8cab4'],
  b69468: ['iron', '#dad1bb'],
  ac7854: ['iron', '#b3a89a'],
  '977b5b': ['iron', '#c8bba7'],
  a95c38: ['enamel', '#d9b88d'],
  a65b3d: ['rubber', '#dcc09b'],
  '637873': ['enamel', '#abb5aa'],
  '687b77': ['enamel', '#9daf9f'],
  e6d9bd: ['reflector', '#ffecce'],
  '7f7965': ['bark', '#cac5ac'],
  '988b70': ['iron'],
  bdd1c4: ['reflector'],
};

export function weatherFittings(group: Group): void {
  hardware ??= atlas();
  group.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const source = obj.material as MeshLambertMaterial;
    if (source.map || source.transparent || source.emissive?.getHex() !== 0) return;
    const [kind, paint] = tints[source.color.getHexString()] ?? ['iron'];
    const geom = obj.geometry.clone(),
      uv = geom.getAttribute('uv');
    if (!uv) return;
    const type = geom.getAttribute('surface'),
      pos = geom.getAttribute('position'),
      colors = new Float32Array(pos.count * 3),
      tint = new Color(paint ?? '#ffffff');
    geom.computeBoundingBox();
    const box = geom.boundingBox!,
      mud = ['timber', 'rope', 'bark'].includes(kind);
    for (let i = 0; i < pos.count; i++) {
      const code = type?.getX(i),
        surface = code === 1 ? 'endgrain' : code === 2 ? 'bark' : code === 3 ? 'timber' : code === 4 ? 'hazard' : kind;
      const slot = surfaces.indexOf(surface),
        u = uv.getX(i),
        v = uv.getY(i);
      uv.setXY(
        i,
        ((slot % cells) * tile + pad + clamp01(u) * core) / (cells * tile),
        1 - (Math.floor(slot / cells) * tile + pad + (1 - clamp01(v)) * core) / (rows * tile),
      );
      const base = (pos.getY(i) - box.min.y) / (box.max.y - box.min.y || 1);
      const shade = code === 3 ? 1.65 : mud && kind !== 'rope' ? 0.91 + 0.09 * clamp01(base * 2) : 1;
      colors[i * 3] = tint.r * shade;
      colors[i * 3 + 1] = tint.g * shade;
      colors[i * 3 + 2] = tint.b * shade;
    }
    geom.deleteAttribute('surface');
    geom.setAttribute('color', new Float32BufferAttribute(colors, 3));
    obj.geometry = geom;
    obj.material = hardware!;
  });
}

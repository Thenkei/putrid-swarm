// node tools/bake-yard-surfaces.mjs [source-cache-directory]
// Runtime never contacts the source library. Rebuild the checked-in maps from CC0 scans.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const cache = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'putrid-materials-'));
const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'public/assets/materials');
mkdirSync(cache, { recursive: true });
mkdirSync(out, { recursive: true });

const scans = {
  grass: 'leafy_grass',
  gravel: 'gravel_floor_02',
  trail: 'grass_path_2',
  soil: 'dirt_floor',
  litter: 'leaves_forest_ground',
  bark: 'bark_brown_01',
  timber: 'weathered_brown_planks',
  iron: 'rusty_metal_04',
  plaster: 'rough_plaster_broken',
  stone: 'rustic_stone_wall',
  roof: 'clay_roof_tiles',
};
const metadata = new Map();
async function source(filename, id, map, size, format) {
  const file = join(cache, filename);
  if (existsSync(file)) return file;
  let manifest = metadata.get(id);
  if (!manifest) {
    manifest = fetch('https://api.polyhaven.com/files/' + id).then(async (response) => {
      if (!response.ok) throw Error(id + ' manifest: ' + response.status);
      return response.json();
    });
    metadata.set(id, manifest);
  }
  const record = (await manifest)[map][size][format];
  const response = await fetch(record.url);
  if (!response.ok) throw Error(record.url + ': ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('md5').update(bytes).digest('hex') !== record.md5) throw Error('Incomplete source: ' + record.url);
  writeFileSync(file, bytes);
  return file;
}

function writeRGB(id, channel, pixels, size, quality) {
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .webp({ quality: channel === 'surface' ? 89 : quality, smartSubsample: true, effort: 5 })
    .toFile(join(out, id + '-' + channel + '.webp'));
}

// Grass004 is distributed as a single CC0 source archive by ambientCG. Packing
// its native height and roughness matches the other ground tiles' channel layout.
const turfFile = join(cache, 'Grass004_1K-JPG.zip');
if (!existsSync(turfFile)) {
  const response = await fetch('https://ambientcg.com/get?file=Grass004_1K-JPG.zip');
  if (!response.ok) throw Error('Grass004 archive: ' + response.status);
  writeFileSync(turfFile, Buffer.from(await response.arrayBuffer()));
}
if (createHash('sha256').update(readFileSync(turfFile)).digest('hex') !== '4b63495f459db8481f4d5144e4e9069345c81cf898cc71f2216f5dd3bb344469')
  throw Error('Grass004 source archive checksum mismatch');
const turf = async (channel, size) => {
  const bytes = execFileSync('unzip', ['-p', turfFile, 'Grass004_1K-JPG_' + channel + '.jpg'], { maxBuffer: 8_000_000 });
  return sharp(bytes).resize(size, size).removeAlpha().toColourspace('srgb').raw().toBuffer();
};
const [grassColour, grassNormal, grassHeight, grassRough] = await Promise.all([
  turf('Color', 1024),
  turf('NormalGL', 768),
  turf('Displacement', 512),
  turf('Roughness', 512),
]);
for (let i = 0; i < grassHeight.length; i += 3) {
  grassHeight[i + 1] = grassRough[i];
  grassHeight[i + 2] = 0;
}
await Promise.all([
  writeRGB('turf', 'albedo', grassColour, 1024, 89),
  writeRGB('turf', 'normal', grassNormal, 768, 90),
  writeRGB('turf', 'surface', grassHeight, 512, 81),
]);

for (const [id, asset] of Object.entries(scans)) {
  const large = ['roof', 'stone', 'timber', 'plaster'].includes(id);
  const colorSize = large ? 1536 : 1024;
  const normalSize = id === 'timber' || id === 'roof' ? 1024 : 768;
  const dataSize = 512;
  const read = async (name, map, resolution, size) => {
    const file = await source(id + '-' + name + '.jpg', asset, map, resolution, 'jpg');
    return sharp(file)
      .rotate(id === 'timber' ? 90 : 0)
      .resize(size, size)
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer();
  };
  const [color, normal, arm, heights] = await Promise.all([
    read('albedo', 'Diffuse', large ? '2k' : '1k', colorSize),
    read('normal', 'nor_gl', '1k', normalSize),
    read('arm', 'arm', '1k', dataSize),
    read('height', 'Displacement', '1k', dataSize),
  ]);
  if (id === 'timber') {
    // A clockwise turn in image space puts the boards along V. Turn the tangent vector too.
    for (let i = 0; i < normal.length; i += 3) {
      const nx = normal[i];
      normal[i] = normal[i + 1];
      normal[i + 1] = 255 - nx;
    }
  }
  for (let i = 0; i < arm.length; i += 3) arm[i] = heights[i];
  await Promise.all([
    writeRGB(id, 'albedo', color, colorSize, 87),
    writeRGB(id, 'normal', normal, normalSize, 91),
    writeRGB(id, 'surface', arm, dataSize, 79),
  ]);
}

// The three custom materials share one original image. Their relief is estimated from
// the diffuse reference. Chipped paint exposes a rougher metallic layer.
const workshop = readFileSync(join(root, 'art/materials/workshop.webp'));
const { width } = await sharp(workshop).metadata();
const half = Math.floor(width / 2),
  size = 576;
for (const [id, x, y] of [
  ['endgrain', 0, 0],
  ['rope', 1, 0],
  ['enamel', 0, 1],
]) {
  const rgb = await sharp(workshop)
    .extract({ left: x * half + 3, top: y * half + 3, width: half - 6, height: half - 6 })
    .resize(size, size)
    .removeAlpha()
    .raw()
    .toBuffer();
  const surface = Buffer.alloc(rgb.length),
    normal = Buffer.alloc(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const l = (0.25 * rgb[i] + 0.62 * rgb[i + 1] + 0.13 * rgb[i + 2]) / 255;
    const bare = id === 'enamel' ? Math.min(1, Math.max(0, (0.56 - l) * 7)) : 0;
    surface[i] = Math.round(255 * l);
    surface[i + 1] = Math.round(id === 'enamel' ? 133 + 84 * bare : 225 - 29 * l);
    surface[i + 2] = Math.round(98 * bare);
  }
  const h = (x, y) => surface[3 * (((x + size) % size) + ((y + size) % size) * size)] / 255;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const strength = id === 'enamel' ? 0.95 : 1.9;
      const nx = (h(x - 1, y) - h(x + 1, y)) * strength,
        ny = (h(x, y + 1) - h(x, y - 1)) * strength;
      const l = Math.hypot(nx, ny, 1),
        i = 3 * (x + y * size);
      normal[i] = Math.round(127.5 + (127.5 * nx) / l);
      normal[i + 1] = Math.round(127.5 + (127.5 * ny) / l);
      normal[i + 2] = Math.round(127.5 + 127.5 / l);
    }
  await Promise.all([writeRGB(id, 'albedo', rgb, size, 90), writeRGB(id, 'normal', normal, size, 90), writeRGB(id, 'surface', surface, size, 78)]);
}

const hdr = await source('orchard.hdr', 'spruit_sunrise', 'hdri', '1k', 'hdr');
// The estate is a unique surface. Keep paint chips and pitted steel registered
// to the three elevations of the original study; leave the glass optically flat.
{
  const n = 768,
    image = await sharp(join(out, 'coachwork-albedo.webp')).resize(n, n).removeAlpha().raw().toBuffer();
  const relief = Buffer.alloc(n * n),
    control = Buffer.alloc(n * n * 3),
    normals = Buffer.alloc(n * n * 3);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = i + n * j,
        x = i / n,
        y = j / n,
        r = image[3 * k] / 255,
        g = image[3 * k + 1] / 255,
        b = image[3 * k + 2] / 255;
      const intensity = 0.25 * r + 0.59 * g + 0.16 * b;
      const window = (y > 0.088 && y < 0.2 && x > 0.31 && x < 0.95) || (y > 0.55 && y < 0.669);
      const rust = Math.max(0, Math.min(1, (r - b) * 3.4)) * (1 - intensity);
      relief[k] = window ? 128 : 112 + Math.round(intensity * 60);
      control[3 * k] = relief[k];
      control[3 * k + 1] = Math.round((window ? 0.23 + 0.27 * (1 - intensity) : 0.4 + 0.48 * rust + 0.12 * (1 - intensity)) * 255);
      control[3 * k + 2] = window ? 0 : Math.round(50 + 85 * (1 - rust));
    }
  const at = (x, y) => relief[Math.min(n - 1, Math.max(0, x)) + n * Math.min(n - 1, Math.max(0, y))] / 255;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const k = 3 * (x + n * y),
        nx = (at(x - 1, y) - at(x + 1, y)) * 2,
        ny = (at(x, y + 1) - at(x, y - 1)) * 2,
        length = Math.hypot(nx, ny, 1);
      normals[k] = 127.5 + (127.5 * nx) / length;
      normals[k + 1] = 127.5 + (127.5 * ny) / length;
      normals[k + 2] = 127.5 + 127.5 / length;
    }
  await Promise.all([writeRGB('coachwork', 'normal', normals, n, 89), writeRGB('coachwork', 'surface', control, n, 89)]);
}
// Register larger cracks and footing stones to the facade. The measured plaster
// contributes its finer surface normals and roughness on top of this height estimate.
{
  const w = 1024,
    h = 682;
  const bytes = await sharp(join(out, 'limewash-albedo.webp')).resize(w, h).greyscale().raw().toBuffer();
  const fine = await sharp(join(out, 'plaster-normal.webp')).resize(w, h, { fit: 'fill' }).raw().toBuffer();
  const control = await sharp(join(out, 'plaster-surface.webp')).resize(w, h, { fit: 'fill' }).raw().toBuffer();
  const normals = Buffer.alloc(w * h * 3);
  const at = (x, y) => bytes[Math.min(w - 1, Math.max(0, x)) + w * Math.min(h - 1, Math.max(0, y))] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x,
        k = 3 * i;
      const nx = (at(x - 1, y) - at(x + 1, y)) * 0.98 + (fine[k] / 127.5 - 1) * 0.47;
      const ny = (at(x, y + 1) - at(x, y - 1)) * 0.98 + (fine[k + 1] / 127.5 - 1) * 0.47;
      const len = Math.hypot(nx, ny, 1);
      normals[k] = 127.5 + (127.5 * nx) / len;
      normals[k + 1] = 127.5 + (127.5 * ny) / len;
      normals[k + 2] = 127.5 + 127.5 / len;
      control[k] = Math.round(94 + bytes[i] * 0.36);
      control[k + 2] = 0;
    }
  await Promise.all(
    [
      ['normal', normals],
      ['surface', control],
    ].map(([channel, data]) =>
      sharp(data, { raw: { width: w, height: h, channels: 3 } })
        .webp({ quality: 87, smartSubsample: true })
        .toFile(join(out, 'limewash-' + channel + '.webp')),
    ),
  );
}
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-y',
  '-i',
  hdr,
  '-vf',
  'scale=512:256:flags=area',
  '-frames:v',
  '1',
  '-c:v',
  'hdr',
  '-update',
  '1',
  join(out, 'farm-light.hdr'),
]);

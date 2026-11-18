// node tools/bake-yard-plants.mjs [source-cache]. The game serves only the baked atlas.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = process.argv[2] ?? (await mkdtemp(join(tmpdir(), 'woodland-scans-')));
await mkdir(source, { recursive: true });
const output = fileURLToPath(new URL('../public/assets/materials/', import.meta.url));
const photos = [
  ['fern_08', 'e25da4e72bc34538566df55b68ba5e1678fbbb51563488eb67b229778268a82e'],
  ['tree_branch_30', 'b1ea33293aa6194c1dd81acf26f440e50a59b5844ce0cb466d26bad76dd2247d'],
  ['tree_branch_17', 'b5362a6dda527a6e674e8532bcf1b24da76dbdbd3027bb0738bd90feb9a3a1f7'],
  ['leaf_dry_01', '5e19d5af87b7e515d5f9660b3e3f9f36e734dd83d53aa6ec984d4a52fdfbfdf7'],
  ['leaf_dandelion_03', '644fdc0f78f6b12833dbd89a3a1148fad76ef099b0220261577ac4f93fe49863'],
  ['clover_02', '8d4fda683ab36ca7e6b299befd9cfee9deb0faddfcaccf5befb1059923515960'],
  ['daisie_05', '856f11721a494abbcc550f50a1de8bdc623a86e034426098e00834223da0052e'],
];
const polyHaven = [
  ['pine_tree_01', 'twig_alpha', 'png', '6f91aa99f2c27108d6f817f874954aa7df8bfbb4dea2673e9322555a6ae79d99'],
  ['pine_tree_01', 'twig_diff', 'jpg', 'e649f0f9bc74d1af5f1a45eaf2fe7a29adaaddfab251f746b983da301e4b80e1'],
  ['grass_medium_02', 'alpha', 'png', '15976877b3dbd22cd496a9549f1eb7d86710846a3631fb87eedbf046519e339f'],
  ['grass_medium_02', 'diff', 'jpg', '91ae99005b449011aceb207a68a937258fd9bfd66ff367d344c50398b1df389c'],
];
async function cache(name, url, sha256) {
  const local = join(source, name);
  if (!existsSync(local)) {
    const response = await fetch(url);
    if (!response.ok) throw Error('Could not fetch ' + url + ' (' + response.status + ')');
    await writeFile(local, Buffer.from(await response.arrayBuffer()));
  }
  if (
    createHash('sha256')
      .update(await readFile(local))
      .digest('hex') !== sha256
  )
    throw Error('Unexpected source checksum for ' + name);
}
await Promise.all([
  ...photos.map(([id, hash]) => {
    const name = 'vegetation_' + id + '.png';
    return cache(name, 'https://opengameart.org/sites/default/files/' + name, hash);
  }),
  ...polyHaven.map(([id, channel, format, hash]) => {
    const file = id + '_' + channel + '_1k.' + format;
    return cache(file, 'https://dl.polyhaven.org/file/ph-assets/Models/' + format + '/1k/' + id + '/' + file, hash);
  }),
  cache('oak.zip', 'https://ambientcg.com/get?file=LeafSet016_1K-PNG.zip', 'b65c385285c053add2b7f776103db975e3d0e9579a58306e7630070ed1401af6'),
]);
for (const suffix of ['Color', 'Opacity']) {
  const file = 'LeafSet016_1K-PNG_' + suffix + '.png';
  await writeFile(join(source, file), execFileSync('unzip', ['-p', join(source, 'oak.zip'), file], { maxBuffer: 8_000_000 }));
}
const size = 384;
const tiles = [];
const blank = { r: 0, g: 0, b: 0, alpha: 0 };
let strokes = [];
let seed = 4317;
function rand() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

async function sample(rgb, alpha, crop, mask) {
  const { data, info } = await sharp(join(source, rgb)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const opacity = alpha && (await sharp(join(source, alpha)).greyscale().raw({ depth: 'uchar' }).toBuffer());
  let l = info.width,
    t = info.height,
    r = 0,
    b = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      let a = opacity ? opacity[i / 4] : data[i + 3];
      if (crop && (x < crop[0] * info.width || y < crop[1] * info.height || x > crop[2] * info.width || y > crop[3] * info.height)) a = 0;
      if (mask && !mask(x / info.width, y / info.height)) a = 0;
      data[i + 3] = a;
      if (a > 25) {
        l = Math.min(l, x);
        r = Math.max(r, x);
        t = Math.min(t, y);
        b = Math.max(b, y);
      }
    }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: l, top: t, width: r - l + 1, height: b - t + 1 })
    .resize({ width: 360, height: 420, fit: 'inside' })
    .png()
    .toBuffer();
}
const oak = [];
for (let i = 0; i < 6; i++)
  oak.push(
    await sample('LeafSet016_1K-PNG_Color.png', 'LeafSet016_1K-PNG_Opacity.png', [
      (i % 3) / 3,
      Math.floor(i / 3) * 0.5,
      ((i % 3) + 1) / 3,
      (Math.floor(i / 3) + 1) * 0.5,
    ]),
  );
const name = (key) => 'vegetation_' + key + '.png';
const fern = await sample(name('fern_08'));
const birch = await sample(name('tree_branch_30'));
const pear = await sample(name('tree_branch_17'));
const dry = await sample(name('leaf_dry_01'));
const rosette = await sample(name('leaf_dandelion_03'));
const clover = await sample(name('clover_02'));
const flower = await sample(name('daisie_05'));
const pine = await sample(
  'pine_tree_01_twig_diff_1k.jpg',
  'pine_tree_01_twig_alpha_1k.png',
  [0.029, 0.037, 0.216, 0.439],
  (x, y) => x < 0.185 + 0.05 * Math.sin(12 * y) && (y < 0.36 || Math.abs(x - 0.136) < 0.08),
);
const grass = [];
for (const [l, t, r, b] of [
  [0.019, 0.015, 0.154, 0.98],
  [0.353, 0.194, 0.428, 0.755],
  [0.65, 0.126, 0.771, 0.906],
  [0.884, 0.027, 0.982, 0.978],
]) {
  grass.push(await sample('grass_medium_02_diff_1k.jpg', 'grass_medium_02_alpha_1k.png', [l, t, r, b]));
}

const colours = {
  green: [0.8, 0.83, 0.66, 0.45],
  bronze: [1.05, 0.62, 0.39, 0.92],
  olive: [0.86, 0.85, 0.59, 0.73],
  gold: [1.1, 0.86, 0.43, 0.9],
  shaded: [0.74, 0.74, 0.61, 0.5],
  pine: [0.97, 1.12, 1.01, 0.43],
  natural: [1, 1, 1, 0],
};
const variants = new Map();
async function imageFor(buffer, colour) {
  let byColor = variants.get(buffer);
  if (!byColor) {
    byColor = new Map();
    variants.set(buffer, byColor);
  }
  if (byColor.has(colour)) return byColor.get(colour);
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const [r, g, b, amount] = colours[colour];
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.24 * data[i] + 0.65 * data[i + 1] + 0.11 * data[i + 2];
    const value = colour === 'pine' ? l * 1.12 + 8 : l;
    data[i] = Math.min(255, data[i] * (1 - amount) + value * r * amount);
    data[i + 1] = Math.min(255, data[i + 1] * (1 - amount) + value * g * amount);
    data[i + 2] = Math.min(255, data[i + 2] * (1 - amount) + value * b * amount);
  }
  const url = 'data:image/png;base64,' + (await sharp(data, { raw: info }).png().toBuffer()).toString('base64');
  byColor.set(colour, url);
  return url;
}
async function stamp(buffer, x, y, w, h, angle, colour = 'natural', flip = false) {
  const url = await imageFor(buffer, colour);
  strokes.push(
    '<image preserveAspectRatio="none" transform="translate(' +
      x +
      ' ' +
      y +
      ') rotate(' +
      angle +
      ') scale(' +
      (flip ? -1 : 1) +
      ' 1)" x="' +
      -w / 2 +
      '" y="' +
      -h +
      '" width="' +
      w +
      '" height="' +
      h +
      '" href="' +
      url +
      '"/>',
  );
}
function twig(x, y, tx, ty, bend = '#71634d', w = 4) {
  strokes.push(
    '<path d="M ' +
      x +
      ' ' +
      y +
      ' Q ' +
      (x * 0.58 + tx * 0.42 + 3) +
      ' ' +
      (y * 0.47 + ty * 0.53) +
      ' ' +
      tx +
      ' ' +
      ty +
      '" fill="none" stroke="' +
      bend +
      '" stroke-width="' +
      w +
      '" stroke-linecap="round"/>',
  );
}
async function tile() {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 384 384">' + strokes.join('') + '</svg>');
  const img = await sharp(svg).resize(size, size).png().toBuffer();
  tiles.push({ input: img, left: (tiles.length % 4) * size, top: Math.floor(tiles.length / 4) * size });
  strokes = [];
}
twig(192, 377, 189, 38, '#675742', 4);
// Second-year shoots overlap last year's needles, especially along the central leader.
for (let k = 0; k < 5; k++) {
  const y = 367 - k * 48;
  for (const side of [-1, 1]) await stamp(pine, 192 + side * 5, y, 85 - k * 6, 147 - k * 10, side * (19 + k * 3), 'pine', side < 0);
}
for (let k = 0; k < 5; k++)
  for (const d of [-1, 1]) {
    const y = 340 - k * 47;
    await stamp(
      pine,
      192 + (rand() - 0.5) * 10,
      y,
      (100 - k * 9) * (1 + rand() * 0.1),
      158 - k * 12,
      d * (46 + k * 2 + (rand() - 0.5) * 10),
      'pine',
      d < 0,
    );
  }
await stamp(pine, 190, 136, 70, 122, 3, 'pine');
await tile();
async function deciduousPhotographs() {
  twig(192, 375, 188, 44);
  for (let j = 0; j < 3; j++)
    for (const d of [-1, 1]) {
      const y = 345 - j * 80;
      await stamp(birch, 191, y, 100 - j * 12, 182 - j * 28, d * (45 + rand() * 12), j % 2 ? 'gold' : d < 0 ? 'bronze' : 'olive', d < 0);
    }
  await stamp(birch, 186, 153, 81, 146, 6, 'gold');
  await tile();
}
await deciduousPhotographs();
for (const warm of [false, true]) {
  twig(192, 374, 185, 29, '#62533c', 5);
  for (let k = 0; k < 3; k++)
    for (const side of [-1, 1]) {
      const y = 327 - k * 76;
      const reach = 93 - k * 12 + rand() * 14;
      twig(192, y, 193 + side * reach, y - 79, '#706344', 2.7);
      for (let l = 0; l < 5; l++) {
        const t = 0.19 + l * 0.155;
        await stamp(
          oak[(k * 2 + l + (side > 0 ? 1 : 0)) % oak.length],
          192 + side * reach * t,
          y - 80 * t,
          32 + rand() * 13,
          51 + rand() * 18,
          side * (l % 2 ? 17 + rand() * 22 : 76 + rand() * 20),
          warm ? (k % 2 ? 'bronze' : 'gold') : l % 3 ? 'green' : 'olive',
          side < 0,
        );
      }
      await stamp(oak[k], 193 + side * reach, y - 78, 38, 62, side * 51, warm ? 'gold' : 'olive');
    }
  await stamp(oak[1], 186, 95, 42, 77, 4, warm ? 'gold' : 'olive');
  await tile();
}
for (const isDry of [false, true]) {
  for (let i = 0; i < 22; i++) {
    const u = rand() * 2 - 1;
    const h = 130 + rand() * 145 + Math.abs(u) * 28;
    await stamp(
      grass[i % 4],
      192 + u * 44,
      374 - rand() * 16,
      16 + rand() * 21,
      h,
      u * (18 + rand() * 24),
      isDry ? (i % 3 ? 'gold' : 'olive') : i % 3 ? 'green' : 'shaded',
      i % 3 === 0,
    );
  }
  await tile();
}
await stamp(fern, 193, 377, 264, 365, 0, 'green');
await tile();
// The scanned dandelion and fallen leaf have their petioles at the top.
await stamp(rosette, 192, 7, 155, 364, 180, 'green');
await tile();
await stamp(clover, 193, 379, 230, 363, 0, 'green');
await tile();
await stamp(flower, 192, 358, 337, 332, 0, 'natural');
await tile();
await stamp(dry, 192, 8, 191, 366, 180, 'natural');
await tile();
await stamp(pear, 192, 378, 221, 365, 0, 'olive');
await tile();
await mkdir(output, { recursive: true });
await sharp({ create: { width: size * 4, height: size * 3, channels: 4, background: blank } })
  .composite(tiles)
  .webp({ quality: 88, alphaQuality: 97, smartSubsample: true })
  .toFile(join(output, 'woodland-plants.webp'));

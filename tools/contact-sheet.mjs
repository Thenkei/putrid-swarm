#!/usr/bin/env node
// Dev aid: lays processed assets out on labelled contact sheets for visual QA.
//   node tools/contact-sheet.mjs <outDir> [prefix,prefix…]
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? '.');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/assets/manifest.json'), 'utf8'));

async function sheet(name, keys, cell, cols) {
  const rows = Math.ceil(keys.length / cols);
  const label = 16;
  const composites = [];
  for (const [i, key] of keys.entries()) {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * (cell + label);
    const img = await sharp(join(ROOT, 'public/assets', manifest[key].file)).resize({ width: cell - 8, height: cell - 8, fit: 'inside' }).png().toBuffer();
    const meta = await sharp(img).metadata();
    composites.push({ input: img, left: x + Math.round((cell - meta.width) / 2), top: y + Math.round((cell - meta.height) / 2) });
    const text = Buffer.from(`<svg width="${cell}" height="${label}"><text x="${cell / 2}" y="12" font-size="11" font-family="monospace" fill="#fff" text-anchor="middle">${key.replace(/&/g, '')} ${manifest[key].w}x${manifest[key].h}</text></svg>`);
    composites.push({ input: text, left: x, top: y + cell });
  }
  await sharp({ create: { width: cols * cell, height: rows * (cell + label), channels: 3, background: '#4a5a4a' } }).composite(composites).jpeg({ quality: 82 }).toFile(join(OUT, `${name}.jpg`));
  console.log(join(OUT, `${name}.jpg`));
}

const keys = Object.keys(manifest);
const pick = (...prefixes) => keys.filter((k) => prefixes.some((p) => k.startsWith(p)));
await sheet('sheet_enemies', pick('en_', 'boss_'), 200, 8);
await sheet('sheet_portraits_objects', pick('por_', 'obj_', 'logo'), 230, 7);
await sheet('sheet_devices', pick('dev_', 'icons', 'fx', 'tex_'), 170, 10);
await sheet('sheet_plates', pick('plate_'), 400, 5);

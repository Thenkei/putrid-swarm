#!/usr/bin/env node
// Turns raw generated art and concept plates into runtime assets under public/assets.
//
//   node tools/process-art.mjs            # process everything available
//   node tools/process-art.mjs --only en_dog,logo
//
// - plates   → resized opaque webp
// - sprites  → magenta keyed out, trimmed, resized, webp with alpha
// - splits   → cut into cells at the empty gaps, then as sprites
// - textures → cut at exact fractions (inner crop), resized
// - poses    → animation frames of one character: cut like a split, then scaled by one common factor
//              and centred on the body, so the frames can be swapped without the figure jumping
// Writes public/assets/manifest.json describing every produced file.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ART } from './art-manifest.mjs';
import { buildMowerGait } from './mower-gait.mjs';
import { buildMobGaits } from './mob-gaits.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'art', 'raw');
const OUT_DIR = join(ROOT, 'public', 'assets');
const MANIFEST_PATH = join(OUT_DIR, 'manifest.json');

const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? args[onlyIndex + 1].split(',') : null;

for (const dir of ['plates', 'sprites', 'textures']) mkdirSync(join(OUT_DIR, dir), { recursive: true });

const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : {};

// ───────────────────────────── Chroma key ─────────────────────────────

const KEY_LOW = 46; // below: fully opaque
const KEY_HIGH = 120; // above: fully transparent
const ALPHA_SOLID = 40; // alpha considered "something is here" for cutting/trimming

/** Returns { data: RGBA Buffer, width, height } with magenta removed and spill suppressed. */
async function keyed(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    // "Magenta-ness": strong red and blue with little green.
    const m = Math.min(r, b) - g;
    if (m <= KEY_LOW) continue;
    const alpha = m >= KEY_HIGH ? 0 : 1 - (m - KEY_LOW) / (KEY_HIGH - KEY_LOW);
    out[i + 3] = Math.round(alpha * 255);
    // Despill: pull red/blue back toward green so edges do not glow pink.
    const spill = m * 0.85;
    out[i] = Math.max(0, Math.round(r - spill));
    out[i + 2] = Math.max(0, Math.round(b - spill));
  }
  return { data: out, width: info.width, height: info.height };
}

function occupancy(img, axis, x0 = 0, y0 = 0, x1 = img.width, y1 = img.height) {
  const length = axis === 'x' ? x1 - x0 : y1 - y0;
  const counts = new Uint32Array(length);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > ALPHA_SOLID) counts[axis === 'x' ? x - x0 : y - y0]++;
    }
  }
  return counts;
}

/** Position of the cut nearest to `expected`: centre of the widest empty run in the search window. */
function findCut(counts, expected, window) {
  const from = Math.max(1, Math.round(expected - window));
  const to = Math.min(counts.length - 2, Math.round(expected + window));
  let best = null;
  let runStart = -1;
  for (let i = from; i <= to + 1; i++) {
    const empty = i <= to && counts[i] <= 1;
    if (empty && runStart < 0) runStart = i;
    if (!empty && runStart >= 0) {
      const run = { start: runStart, end: i - 1, width: i - runStart };
      if (!best || run.width > best.width) best = run;
      runStart = -1;
    }
  }
  if (best) return Math.round((best.start + best.end) / 2);
  // No clean gap: cut where the least is crossed.
  let min = from;
  for (let i = from; i <= to; i++) if (counts[i] < counts[min]) min = i;
  return min;
}

/**
 * Cuts for objects that are not laid out on an even grid (a row of things of very different widths):
 * the centres of the `n` widest empty runs between the first and the last occupied position.
 */
function gapCuts(counts, n) {
  const runs = [];
  let start = -1;
  let seen = false;
  for (let i = 0; i < counts.length; i++) {
    const empty = counts[i] <= 1;
    if (!empty) {
      if (seen && start >= 0) runs.push({ start, end: i - 1 });
      seen = true;
      start = -1;
    } else if (start < 0) start = i;
  }
  if (runs.length < n) throw new Error(`expected ${n} gaps, found ${runs.length}`);
  return runs
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, n)
    .map((run) => Math.round((run.start + run.end) / 2))
    .sort((a, b) => a - b);
}

function bbox(img, x0, y0, x1, y1) {
  let minX = x1;
  let minY = y1;
  let maxX = x0 - 1;
  let maxY = y0 - 1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > ALPHA_SOLID) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { x0: minX, y0: minY, x1: maxX + 1, y1: maxY + 1 };
}

/** Drops specks: keeps only what is connected (loosely) to the main mass by clearing far-away tiny islands. */
function pad(box, img, amount = 3) {
  return {
    x0: Math.max(0, box.x0 - amount),
    y0: Math.max(0, box.y0 - amount),
    x1: Math.min(img.width, box.x1 + amount),
    y1: Math.min(img.height, box.y1 + amount),
  };
}

async function writeSprite(img, box, entry, name) {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  let pipeline = sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).extract({ left: box.x0, top: box.y0, width, height });
  const resize = entry.h ? { height: Math.min(entry.h, height) } : { width: Math.min(entry.w ?? width, width) };
  pipeline = pipeline.resize({ ...resize, kernel: 'lanczos3' });
  if (entry.mirrorSprites?.includes(name)) pipeline = pipeline.flop();
  // Perspective in these reverse paintings shortened the vegetable bed and wheelbase.
  // Re-space the source columns at the near post or tyres without leaning the uprights.
  const columns = name === 'yard_rear_veg' ? [[0, 0], [252, 219], [342, 342]]
    : name === 'obj_car_back' ? [[0, 0], [175, 137], [281, 268], [320, 320]] : undefined;
  if (columns) {
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const strips = [];
    for (let i = 1; i < columns.length; i++) {
      const [start, left] = columns[i - 1], [end, right] = columns[i];
      const source = sharp(data, { raw: info }).extract({ left: start, top: 0, width: end - start, height: info.height });
      strips.push({ left, top: 0, input: await source.resize(right - left, info.height, { fit: 'fill' }).png().toBuffer() });
    }
    pipeline = sharp({ create: { width: info.width, height: info.height, channels: 4, background: '#00000000' } }).composite(strips);
  }
  if (['dev_log', 'dev_spikes', 'dev_net', 'dev_barrier', 'dev_floodlight', 'dev_horn'].includes(entry.id) && name.endsWith('_triggered')) {
    // The concept sheet included detached comic rays, dust and action strokes. Keep the
    // actual apparatus: sound waves, light and impact fragments are animated in the game.
    const result = await pipeline.raw().toBuffer({ resolveWithObject: true });
    keepMechanism(result.data, result.info.width, result.info.height);
    if (entry.id === 'dev_barrier') {
      // One dust puff touches the underside of the foot on this painting.
      const { width, height } = result.info;
      for (let y = Math.floor(height * 0.74); y < height; y++) {
        for (let x = Math.floor(width * 0.635); x < width * 0.82; x++) {
          const u = x * 200 / width;
          const v = y * 200 / height;
          if (v > (u < 154 ? 152 - (u - 127) * 0.2 : 160)) result.data[(y * width + x) * 4 + 3] = 0;
        }
      }
    }
    pipeline = sharp(result.data, { raw: result.info });
  }
  const file = `sprites/${name}.webp`;
  const info = await pipeline.webp({ quality: 90, alphaQuality: 95, effort: 5 }).toFile(join(OUT_DIR, file));
  manifest[name] = { file, w: info.width, h: info.height };
  // On these single-stemmed shrubs, most ink near the ground belongs to hanging
  // leaves and fruit. The cut end of the woody stem is the planting point.
  const stem = {
    yard_flora_bramble: [19.5, 132], yard_flora_back_bramble: [148, 133],
    yard_flora_hazel: [63, 133], yard_flora_back_hazel: [92, 134],
  }[name];
  if (stem) {
    manifest[name].footX = Number((stem[0] / info.width).toFixed(4));
    manifest[name].footY = Number((stem[1] / info.height).toFixed(4));
  } else if (/^(forest_stands|yard_flora|yard_scatter)(_back)?$/.test(entry.id)) {
    // A leaning seed head or asymmetric crown puts the stem well off the centre of the
    // trimmed picture. Register both paintings by the opaque feet near the soil line.
    const { data, info: rgba } = await sharp(join(OUT_DIR, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const footBand = entry.id.startsWith('forest_stands') ? 0.93 : 0.82;
    let mass = 0;
    let weightedX = 0;
    let weightedY = 0;
    for (let y = Math.floor(rgba.height * footBand); y < rgba.height; y++) {
      for (let x = 0; x < rgba.width; x++) {
        const alpha = data[(y * rgba.width + x) * 4 + 3];
        mass += alpha;
        weightedX += (x + 0.5) * alpha;
        weightedY += (y + 0.5) * alpha;
      }
    }
    manifest[name].footX = mass ? Number((weightedX / mass / rgba.width).toFixed(4)) : 0.5;
    manifest[name].footY = mass ? Number((weightedY / mass / rgba.height).toFixed(4)) : 1;
  }
  if (name === 'dev_fence_broken') await fallenPalisades(join(OUT_DIR, file));
}

// The original diagonal sheet ends at the damaged pose. Lay the two painted stumps and
// the loose planks into each of the same footprints for the persistent wreck.
async function fallenPalisades(source) {
  const paint = await sharp(source).resize(169, 150, { fit: 'fill' }).png().toBuffer();
  const far = '7,107 4,88 7,46 11,28 25,17 43,11 43,25 40,48 46,65 43,90 39,101 28,111';
  const near = '129,137 129,121 128,111 132,98 131,81 142,70 166,57 169,67 163,94 169,106 168,135 154,145 140,145';
  async function cut(polygons, remove = false) {
    const mask = Buffer.from(`<svg width="169" height="150" xmlns="http://www.w3.org/2000/svg">${polygons.map((p) => `<polygon points="${p}" fill="white"/>`).join('')}</svg>`);
    const masked = await sharp(paint).composite([{ input: mask, blend: remove ? 'dest-out' : 'dest-in' }]).png().toBuffer();
    return sharp(masked).trim({ background: '#00000000', threshold: 8 }).png().toBuffer();
  }
  const posts = [await cut([far]), await cut([near])];
  const plankMask = await cut([far, near], true);
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  const planks = await sharp(plankMask).affine([[1, 0], [-0.31, 1]], { background: clear }).png().toBuffer();
  const loose = await cut(['40,114 43,105 92,76 103,75 108,85 102,92 56,122 44,126']);
  const uprightPlank = await sharp(loose).rotate(101, { background: clear }).png().toBuffer();
  for (const flat of [true, false]) {
    const w = flat ? 219 : 76;
    const boards = flat ? planks : await sharp(planks).rotate(77, { background: clear }).png().toBuffer();
    const components = flat
      ? [[posts[0], 32, 76, 4, 61], [boards, 183, 58, 20, 85], [posts[1], 33, 69, 181, 70]]
      : [[posts[0], 20, 46, 24, 28], [uprightPlank, 23, 53, 26, 62], [boards, 61, 77, 9, 65], [posts[1], 25, 49, 24, 96]];
    const overlays = [];
    for (const [input, width, height, left, top] of components) {
      const cropped = await sharp(input).trim({ background: '#00000000', threshold: 8 }).png().toBuffer();
      overlays.push({ input: await sharp(cropped).resize(width, height, { fit: 'fill' }).png().toBuffer(), left, top });
    }
    const id = `fence_diag_${flat ? 'flat' : 'deep'}_broken`;
    const file = `sprites/${id}.webp`;
    await sharp({ create: { width: w, height: 150, channels: 4, background: clear } }).composite(overlays).webp({ quality: 90, alphaQuality: 95 }).toFile(join(OUT_DIR, file));
    manifest[id] = { file, w, h: 150 };
  }
}

function keepMechanism(rgba, width, height) {
  const seen = new Uint8Array(width * height);
  let largest = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || rgba[start * 4 + 3] < 40) continue;
    const part = [start];
    seen[start] = 1;
    for (let i = 0; i < part.length; i++) {
      const p = part[i];
      const x = p % width;
      const y = Math.floor(p / width);
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const next = ny * width + nx;
          if (seen[next] || rgba[next * 4 + 3] < 40) continue;
          seen[next] = 1;
          part.push(next);
        }
      }
    }
    if (part.length > largest.length) largest = part;
  }
  // Retain the antialiased fringe around the surviving component.
  const keep = new Uint8Array(seen.length);
  for (const p of largest) {
    const x = p % width;
    const y = Math.floor(p / width);
    for (let ny = Math.max(0, y - 2); ny <= Math.min(height - 1, y + 2); ny++) {
      keep.fill(1, ny * width + Math.max(0, x - 2), ny * width + Math.min(width, x + 3));
    }
  }
  for (let p = 0; p < keep.length; p++) if (!keep[p]) rgba[p * 4 + 3] = 0;
}

// ───────────────────────────── Per-kind processing ─────────────────────────────

async function processPlate(entry, source) {
  const atlas = entry.kind === 'atlas';
  const file = `${atlas ? 'sprites' : 'plates'}/${entry.id}.webp`;
  const info = await sharp(source).resize({ width: entry.w, withoutEnlargement: true }).webp({ quality: atlas ? 90 : 84, effort: 5 }).toFile(join(OUT_DIR, file));
  manifest[entry.id] = { file, w: info.width, h: info.height };
}

async function processSprite(entry, source) {
  const img = await keyed(source);
  const box = bbox(img, 0, 0, img.width, img.height);
  if (!box) throw new Error('nothing left after keying');
  await writeSprite(img, pad(box, img), entry, entry.id);
}

async function processSplit(entry, source) {
  const img = await keyed(source);
  const { cols, rows, names } = entry;
  // State sheets must keep their relative position between states, so they share one crop box.
  const aligned = entry.id.startsWith('dev_');

  const xCuts = [0];
  const yCuts = [0];
  if (aligned) {
    for (let c = 1; c < cols; c++) xCuts.push(Math.round((img.width * c) / cols));
    for (let r = 1; r < rows; r++) yCuts.push(Math.round((img.height * r) / rows));
  } else {
    const colCounts = occupancy(img, 'x');
    const rowCounts = occupancy(img, 'y');
    if (entry.cut === 'gaps') {
      xCuts.push(...gapCuts(colCounts, cols - 1));
      yCuts.push(...gapCuts(rowCounts, rows - 1));
    } else {
      for (let c = 1; c < cols; c++) xCuts.push(findCut(colCounts, (img.width * c) / cols, img.width * 0.16));
      for (let r = 1; r < rows; r++) yCuts.push(findCut(rowCounts, (img.height * r) / rows, img.height * 0.16));
    }
  }
  xCuts.push(img.width);
  yCuts.push(img.height);

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = { x0: xCuts[c], y0: yCuts[r], x1: xCuts[c + 1], y1: yCuts[r + 1] };
      const box = bbox(img, cell.x0, cell.y0, cell.x1, cell.y1);
      if (!box) throw new Error(`cell ${names[r * cols + c]} is empty`);
      cells.push({ cell, box, name: names[r * cols + c] });
    }
  }

  if (aligned) {
    // Union of the boxes in cell-local coordinates → identical framing for every state.
    const local = cells.map(({ cell, box }) => ({ x0: box.x0 - cell.x0, y0: box.y0 - cell.y0, x1: box.x1 - cell.x0, y1: box.y1 - cell.y0 }));
    const union = {
      x0: Math.max(0, Math.min(...local.map((b) => b.x0)) - 3),
      y0: Math.max(0, Math.min(...local.map((b) => b.y0)) - 3),
      x1: Math.max(...local.map((b) => b.x1)) + 3,
      y1: Math.max(...local.map((b) => b.y1)) + 3,
    };
    for (const { cell, name } of cells) {
      if (!name) continue;
      const box = {
        x0: cell.x0 + union.x0,
        y0: cell.y0 + union.y0,
        x1: Math.min(cell.x1, cell.x0 + union.x1),
        y1: Math.min(cell.y1, cell.y0 + union.y1),
      };
      await writeSprite(img, box, entry, `${entry.id}_${name}`);
    }
    return;
  }
  // A null name is a cell made elsewhere now: cut, and left alone.
  for (const { box, name } of cells) if (name) await writeSprite(img, pad(box, img), entry, `${entry.id}_${name}`);
}

/** Horizontal centre of mass of a figure's trunk (the middle band of its box), which moves far less than its limbs. */
function trunkCentre(img, box) {
  const height = box.y1 - box.y0;
  const from = Math.round(box.y0 + height * 0.3);
  const to = Math.round(box.y0 + height * 0.7);
  let weight = 0;
  let sum = 0;
  for (let y = from; y < to; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const alpha = img.data[(y * img.width + x) * 4 + 3];
      if (alpha > ALPHA_SOLID) {
        weight += alpha;
        sum += alpha * x;
      }
    }
  }
  return weight > 0 ? sum / weight : (box.x0 + box.x1) / 2;
}

async function processPoses(entry, source) {
  const img = await keyed(source);
  const { cols, rows, names } = entry;
  const colCounts = occupancy(img, 'x');
  const rowCounts = occupancy(img, 'y');
  const xCuts = [0];
  const yCuts = [0];
  for (let c = 1; c < cols; c++) xCuts.push(findCut(colCounts, (img.width * c) / cols, img.width * 0.12));
  for (let r = 1; r < rows; r++) yCuts.push(findCut(rowCounts, (img.height * r) / rows, img.height * 0.12));
  xCuts.push(img.width);
  yCuts.push(img.height);

  const frames = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const name = names[r * cols + c];
      const box = bbox(img, xCuts[c], yCuts[r], xCuts[c + 1], yCuts[r + 1]);
      if (!box) throw new Error(`pose ${name} is empty`);
      frames.push({ name, box });
    }
  }

  // One scale for the whole sheet, set by the first pose: a raised arm must not shrink the body.
  const first = frames[0].box;
  const scale = entry.h / (first.y1 - first.y0);
  for (const { name, box } of frames) {
    const centre = trunkCentre(img, box);
    // Pad so the trunk sits on the vertical centre line; the feet stay on the bottom edge.
    const half = Math.ceil(Math.max(centre - box.x0, box.x1 - centre)) + 2;
    const left = Math.round(half - (centre - box.x0));
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const file = `sprites/${entry.base}_${name}.webp`;
    const info = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } })
      .extract({ left: box.x0, top: box.y0, width, height })
      .extend({ left, right: Math.max(0, half * 2 - left - width), top: 2, bottom: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer({ resolveWithObject: true })
      .then(async ({ data, info: raw }) => {
        // These boss effects are drawn in motion. Strip the loose painted
        // clippings, envelopes and sound lines while preserving the figure.
        if (name === 'x' && /^boss_(mower|mail|chief|mayor)_/.test(entry.base)) {
          keepMechanism(data, raw.width, raw.height);
        }
        return sharp(data, { raw: { width: raw.width, height: raw.height, channels: 4 } })
          .resize({ height: Math.max(1, Math.round(raw.height * scale)), kernel: 'lanczos3' })
          .webp({ quality: 90, alphaQuality: 95, effort: 5 })
          .toFile(join(OUT_DIR, file));
      });
    manifest[`${entry.base}_${name}`] = { file, w: info.width, h: info.height };
  }
}

async function processTexture(entry, source) {
  const meta = await sharp(source).metadata();
  const cellW = Math.floor(meta.width / entry.cols);
  const cellH = Math.floor(meta.height / entry.rows);
  // Stay clear of the seams between swatches.
  const inset = Math.round(Math.min(cellW, cellH) * 0.1);
  for (let r = 0; r < entry.rows; r++) {
    for (let c = 0; c < entry.cols; c++) {
      const name = `${entry.id}_${entry.names[r * entry.cols + c]}`;
      const file = `textures/${name}.webp`;
      const info = await sharp(source)
        .extract({ left: c * cellW + inset, top: r * cellH + inset, width: cellW - 2 * inset, height: cellH - 2 * inset })
        .resize({ width: entry.w, height: entry.w })
        .webp({ quality: 86 })
        .toFile(join(OUT_DIR, file));
      manifest[name] = { file, w: info.width, h: info.height };
    }
  }
}

// ───────────────────────────── Main ─────────────────────────────

const processors = { plate: processPlate, atlas: processPlate, sprite: processSprite, split: processSplit, texture: processTexture, poses: processPoses };
const missing = [];
const failed = [];

for (const entry of ART) {
  if (only && !only.includes(entry.id)) continue;
  // Raw material for another entry, not a runtime asset.
  if (entry.rawOnly) continue;
  const source = entry.source ? join(ROOT, entry.source.concept) : join(RAW_DIR, `${entry.id}.png`);
  if (!existsSync(source)) {
    missing.push(entry.id);
    continue;
  }
  try {
    await processors[entry.kind](entry, source);
    console.log(`✓ ${entry.id}`);
  } catch (error) {
    failed.push(entry.id);
    console.error(`✗ ${entry.id}: ${error.message}`);
  }
}

if (!only || only.includes('boss_mower_gait')) {
  try {
    manifest.boss_mower_gait = await buildMowerGait(OUT_DIR);
    console.log('✓ boss_mower_gait');
  } catch (error) {
    failed.push('boss_mower_gait');
    console.error(`✗ boss_mower_gait: ${error.message}`);
  }
}

if (!only || only.some((id) => id === 'mob_gaits' || id.startsWith('mob_gait_'))) {
  try {
    await buildMobGaits(OUT_DIR, only);
  } catch (error) {
    failed.push('mob_gaits');
    console.error(`✗ mob_gaits: ${error.message}`);
  }
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log(`\n${Object.keys(manifest).length} runtime assets listed in public/assets/manifest.json`);
if (missing.length) console.log(`Not generated yet: ${missing.join(', ')}`);
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}

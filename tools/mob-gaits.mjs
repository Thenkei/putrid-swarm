import { join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import layout from '../src/render/mob-gaits.json' with { type: 'json' };

const { frames, columns, cellWidth: w, cellHeight: h, inkHeight } = layout;
const ground = h - 4;
const profiles = new URL('../src/render/mob-cycles/', import.meta.url);
const bosses = new Set(['mechanic', 'mail', 'chief', 'mayor']);
const animals = new Set(['dog', 'boar', 'deer']);

const mix = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function rowBounds(pixels, width, height) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    let left = width, right = 0;
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 112) continue;
      left = Math.min(left, x);
      right = x;
    }
    rows.push(left < right ? [left, right] : rows.at(-1) ?? [width * 0.4, width * 0.6]);
  }
  // Smooth the registration curve over painted gaps between toes, elbows and antlers.
  return rows.map((_, y) => [0, 1].map((i) => [-3, -2, -1, 0, 1, 2, 3].reduce(
    (sum, d) => sum + (4 - Math.abs(d)) * rows[clamp(y + d, 0, height - 1)][i], 0,
  ) / 16));
}

async function loadPose(out, key, view, pose, scale) {
  const texture = sharp(join(out, `sprites/${key}_${view}_${pose}.webp`));
  const { height } = await texture.metadata();
  const { data, info } = await texture.ensureAlpha().resize({ height: Math.round(height * scale) }).raw()
    .toBuffer({ resolveWithObject: true });
  return { pixels: data, w: info.width, h: info.height, bounds: rowBounds(data, info.width, info.height) };
}

function sample({ pixels, w, h }, sx, sy, target, pixel) {
  const ix = Math.floor(sx), iy = Math.floor(sy);
  const dx = sx - ix, dy = sy - iy;
  let r = 0, g = 0, b = 0, alpha = 0;
  for (let j = 0; j < 2; j++) {
    if (iy + j < 0 || iy + j >= h) continue;
    for (let i = 0; i < 2; i++) {
      if (ix + i < 0 || ix + i >= w) continue;
      const source = ((iy + j) * w + ix + i) * 4;
      const a = pixels[source + 3] * (i ? dx : 1 - dx) * (j ? dy : 1 - dy);
      alpha += a;
      r += a * pixels[source];
      g += a * pixels[source + 1];
      b += a * pixels[source + 2];
    }
  }
  if (alpha < 0.5) return;
  target[pixel] = r / alpha;
  target[pixel + 1] = g / alpha;
  target[pixel + 2] = b / alpha;
  target[pixel + 3] = alpha;
}

// Draw one inked pose through the in-between silhouette. Use the other painting
// once the moving contours have converged, so paws and antlers never ghost.
function inbetween(a, b, t, type, profile, view, phase) {
  const source = t < 0.5 ? a : b;
  const pixels = Buffer.alloc(w * h * 4);
  const wheel = type === 'mechanic' || type === 'mayor';
  const animal = animals.has(type);
  const amount = smooth(t);
  const ink = mix(a.h, b.h, amount);
  const reach = Math.sin(phase * Math.PI * (animal ? 2 : 4));
  for (let y = Math.max(0, Math.floor(ground - ink - 1)); y <= ground; y++) {
    const f = clamp(1 - (ground - 1 - y) / (ink - 1), 0, 1);
    const sy = f * (source.h - 1);
    const [al, ar] = a.bounds[Math.round(f * (a.h - 1))];
    const [bl, br] = b.bounds[Math.round(f * (b.h - 1))];
    const [sl, sr] = source.bounds[Math.round(sy)];
    const dstL = mix(al - a.w / 2, bl - b.w / 2, amount);
    const dstR = mix(ar - a.w / 2, br - b.w / 2, amount);
    const register = wheel ? 0.23 * (1 - f) : 0.74;
    const scale = mix(1, clamp((dstR - dstL) / Math.max(5, sr - sl), 0.75, 1.28), register);
    const centre = (sl + sr) / 2 - source.w / 2;
    const drift = clamp((dstL + dstR) / 2 - centre, -9, 9) * register;
    const flex = reach * (wheel ? 1 - f : Math.sin(f * Math.PI)) * profile.flex;
    const dragPhase = Math.sin(Math.PI * clamp((phase - 0.5) * 2, 0, 1));
    const drag = profile.drag * dragPhase * smooth(clamp((f - 0.65) / 0.35, 0, 1)) * (view === 'front' ? 1 : -1);
    const cx = w / 2 + centre + drift + flex + drag;
    for (let x = 0; x < w; x++) {
      const sx = (x - cx) / scale + centre + source.w / 2;
      if (sx > -1 && sx < source.w) sample(source, sx, sy, pixels, (y * w + x) * 4);
    }
    if (pixels[y * w * 4 + 3] > 40 || pixels[(y * w + w - 1) * 4 + 3] > 40) {
      throw new Error(`${type} ${view} exceeds its atlas cell at phase ${phase}`);
    }
  }
  return sharp(pixels, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

export async function buildMobGaits(out, only) {
  const files = await readdir(profiles).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return [];
  });
  for (const name of files.filter((file) => file.endsWith('.json')).sort()) {
    const type = name.slice(0, -5);
    if (only && !only.includes('mob_gaits') && !only.includes(`mob_gait_${type}`)) continue;
    const profile = JSON.parse(await readFile(new URL(name, profiles), 'utf8'));
    if (!profile.timing?.length || profile.timing[0][0] !== 0 ||
      profile.timing.some(([at, pose], i) => !(at >= 0 && at < 1) || (i > 0 && at <= profile.timing[i - 1][0]) ||
        !['a', 'p', 'b'].includes(pose)) ||
      !['stride', 'flex', 'lean', 'lift', 'drag'].every((field) => Number.isFinite(profile[field]) && profile[field] >= 0) ||
      profile.stride === 0) throw new Error(`Invalid mob cycle profile: ${name}`);
    const key = `${bosses.has(type) ? 'boss' : 'en'}_${type}`;
    const sequence = [...profile.timing, [1, profile.timing[0][1]]];
    const inputs = [];
    for (const [dir, view] of ['front', 'back'].entries()) {
      const reference = await sharp(join(out, `sprites/${key}_${view}_a.webp`)).metadata();
      const scale = inkHeight / reference.height;
      const poses = {};
      for (const pose of ['a', 'p', 'b']) poses[pose] = await loadPose(out, key, view, pose, scale);
      for (let frame = 0; frame < frames; frame++) {
        const phase = frame / frames;
        const next = sequence.findIndex(([time]) => phase < time);
        const [start, a] = sequence[next - 1];
        const [end, b] = sequence[next];
        const input = await inbetween(poses[a], poses[b], (phase - start) / (end - start), type, profile, view, phase);
        const index = dir * frames + frame;
        inputs.push({ input, left: index % columns * w, top: Math.floor(index / columns) * h });
      }
    }
    const width = columns * w, height = Math.ceil(inputs.length / columns) * h;
    const id = `mob_gait_${type}`;
    const file = `sprites/${id}.webp`;
    await sharp({ create: { width, height, channels: 4, background: '#00000000' } })
      .composite(inputs).webp({ quality: 87, alphaQuality: 100, effort: 5 }).toFile(join(out, file));
    console.log(`✓ ${id}`);
  }
}

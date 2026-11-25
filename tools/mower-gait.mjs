import { join } from 'node:path';
import sharp from 'sharp';
import gait from '../src/render/mower-gait.json' with { type: 'json' };

const { columns, cycleFrames, cellWidth, cellHeight, atlasScale, renderHeight, standingHeight } = gait;
const laneStepX = 32; // Screen pixels per grid cell along a lane (projection.TW / 2).
const file = 'sprites/boss_mower_gait.webp';
const frontLeg = [[147, 113], [159, 101], [177, 103], [175, 237], [131, 237], [133, 219],
  [143, 205], [140, 189], [139, 175], [139, 153], [136, 139], [140, 124], [144, 112]];
const frontJoints = [[151, 105], [149, 164], [149, 205], [148, 235]];

// Source-space landmarks on the gardener's painted cels. Keep the handbar and deck
// together. The upper body moves about the grip line, and both boots have their own track.
const views = [
  {
    side: 'front', width: 280, direction: -1, gripY: 100,
    body: [[0, 0], [280, 0], [280, 83], [191, 83], [174, 101], [162, 105], [148, 105],
      [139, 108], [123, 105], [107, 104], [97, 104], [89, 105], [74, 105], [0, 107]],
    mower: [
      [[0, 251], [0, 185], [26, 181], [73, 103], [76, 86], [101, 86], [105, 90], [131, 90],
        [135, 84], [148, 82], [161, 88], [165, 102], [155, 109], [138, 109], [128, 101],
        [103, 101], [91, 109], [86, 109], [36, 196], [93, 196], [101, 189], [125, 189], [125, 251]],
      [[146, 102], [151, 103], [145, 115], [139, 126], [130, 144], [122, 160], [116, 175],
        [109, 184], [107, 192], [103, 197], [100, 194], [104, 180], [109, 173], [115, 157],
        [122, 141], [131, 124], [138, 111]],
    ],
    wheel: [112.7, 221.5, 6.5, 19],
    legs: [
      { cel: 'p', mask: frontLeg, joints: frontJoints, hip: [163, 96], home: [180, 214], shade: 0.83 },
      { cel: 'p', mask: frontLeg, joints: frontJoints, hip: [136, 98], home: [153, 229], shade: 1 },
    ],
  },
  {
    side: 'back', width: 225, direction: 1, gripY: 105,
    body: [[0, 0], [225, 0], [225, 99], [162, 101], [156, 109], [138, 109], [135, 97],
      [118, 102], [114, 121], [104, 131], [91, 131], [79, 127], [68, 130], [50, 127], [46, 119], [0, 120]],
    mower: [[[114, 99], [137, 97], [145, 91], [157, 91], [164, 99], [164, 109], [194, 154],
      [225, 149], [225, 209], [129, 209], [123, 191], [122, 173], [125, 159], [132, 152], [136, 151],
      [130, 144], [120, 128], [113, 114]]],
    wheel: [213.7, 176.5, 6.2, 16.5],
    legs: [
      { cel: 'a', mask: [[91, 120], [114, 118], [121, 133], [121, 149], [122, 224], [82, 224], [84, 158], [80, 135]],
        joints: [[100, 120], [110, 165], [98, 197], [99, 223]], hip: [99, 119], home: [102, 220], shade: 0.90 },
      { cel: 'a', mask: [[50, 120], [78, 124], [83, 135], [79, 151], [63, 177], [42, 208], [40, 251], [6, 251],
        [6, 197], [26, 166], [36, 144], [39, 130]],
        joints: [[65, 120], [51, 167], [28, 207], [24, 252]], hip: [66, 120], home: [53, 239], shade: 1 },
    ],
  },
];

const mix = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

async function cut(source, ...polygons) {
  const { width, height } = await sharp(source).metadata();
  const shapes = polygons.map((polygon) => `<polygon points="${polygon.join(' ')}"/>`).join('');
  const mask = Buffer.from(`<svg width="${width}" height="${height}">${shapes}</svg>`);
  const pixels = await sharp(source).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).raw().toBuffer();
  return { pixels, width, height };
}

function over(target, i, r, g, b, a) {
  const behind = target[i + 3] * (1 - a / 255);
  const opacity = a + behind;
  target[i] = (r * a + target[i] * behind) / opacity;
  target[i + 1] = (g * a + target[i + 1] * behind) / opacity;
  target[i + 2] = (b * a + target[i + 2] * behind) / opacity;
  target[i + 3] = opacity;
}

function sample(target, i, { pixels, width, height }, sx, sy, shade) {
  const ix = Math.floor(sx), iy = Math.floor(sy);
  const dx = sx - ix, dy = sy - iy;
  let r = 0, g = 0, b = 0, a = 0;
  for (let row = 0; row < 2; row++) {
    if (iy + row < 0 || iy + row >= height) continue;
    for (let col = 0; col < 2; col++) {
      if (ix + col < 0 || ix + col >= width) continue;
      const p = ((iy + row) * width + ix + col) * 4;
      const weight = pixels[p + 3] * (row ? dy : 1 - dy) * (col ? dx : 1 - dx);
      r += weight * pixels[p];
      g += weight * pixels[p + 1];
      b += weight * pixels[p + 2];
      a += weight;
    }
  }
  if (a > 0.5) over(target, i, r * shade / a, g * shade / a, b * shade / a, a);
}

// Two triangles per strip keep the knees connected and preserve the painted volume
// as a leg pivots. The cutout is sampled premultiplied to avoid dark fringes.
function triangle(target, layer, [a, b, c], points, shade) {
  const dx1 = b[0] - a[0], dx2 = c[0] - a[0];
  const dy1 = b[1] - a[1], dy2 = c[1] - a[1];
  const area = dx1 * dy2 - dx2 * dy1;
  if (area < 0.001) return;
  const x0 = Math.max(0, Math.ceil(Math.min(a[0], b[0], c[0])));
  const x1 = Math.min(cellWidth - 1, Math.floor(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.ceil(Math.min(a[1], b[1], c[1])));
  const y1 = Math.min(cellHeight - 1, Math.floor(Math.max(a[1], b[1], c[1])));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const u = ((x - a[0]) * dy2 - (y - a[1]) * dx2) / area;
      const v = ((y - a[1]) * dx1 - (x - a[0]) * dy1) / area;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const sx = (1 - u - v) * points[0][0] + u * points[1][0] + v * points[2][0];
      const sy = (1 - u - v) * points[0][1] + u * points[1][1] + v * points[2][1];
      sample(target, (y * cellWidth + x) * 4, layer, sx, sy, shade);
    }
  }
}

function paint(target, layer, rest, posed, widths, twists, shade = 1) {
  const rails = (points, angles) => points.map(([x, y], i) => {
    const angle = angles[i] ?? 0;
    const dx = widths[i] * Math.cos(angle), dy = widths[i] * Math.sin(angle);
    return [[x - dx, y - dy], [x + dx, y + dy]];
  });
  const from = rails(rest, []), to = rails(posed, twists);
  for (let i = 1; i < rest.length; i++) {
    const patch = (rows) => [...rows[i - 1], ...rows[i]];
    const src = patch(from), dst = patch(to);
    for (const ids of [[0, 1, 2], [2, 1, 3]]) {
      triangle(target, layer, ids.map((j) => dst[j]), ids.map((j) => src[j]), shade);
    }
  }
}

function rollWheel(layer, wheel, phase) {
  const { pixels: original, width } = layer;
  const pixels = Buffer.from(original);
  const [cx, cy, rx, ry] = wheel;
  const cos = Math.cos(phase * 2 * Math.PI), sin = Math.sin(phase * 2 * Math.PI);
  for (let y = Math.ceil(cy - ry); y < cy + ry; y++) {
    for (let x = Math.ceil(cx - rx); x < cx + rx; x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry;
      const blend = Math.min(1, Math.max(0, (1 - Math.hypot(u, v)) * 6));
      if (!blend) continue;
      const sx = cx + (u * cos - v * sin) * rx;
      const sy = cy + (u * sin + v * cos) * ry;
      const i = (y * width + x) * 4;
      const left = Math.floor(sx), top = Math.floor(sy);
      const from = (top * width + left) * 4;
      for (let c = 0; c < 3; c++) {
        const above = mix(original[from + c], original[from + 4 + c], sx - left);
        const below = mix(original[from + width * 4 + c], original[from + width * 4 + 4 + c], sx - left);
        pixels[i + c] = mix(pixels[i + c], mix(above, below, sy - top), blend);
      }
    }
  }
  return { ...layer, pixels };
}

function legAt(leg, phase, direction, stride, charge, still, bodyAt) {
  const support = charge ? 0.47 : 0.56;
  const swing = Math.max(0, (phase - support) / (1 - support));
  // The support foot travels backward at world speed. The 2:1 slope matches the
  // isometric projection along a lane. Only the swing foot lifts off that plane.
  const distance = stride * laneStepX * standingHeight / renderHeight;
  const offset = still ? 0 : (phase <= support ? 0.5 - phase / support : ease(swing) - 0.5) * support * distance;
  const lift = Math.sin(Math.PI * swing) * (charge ? 24 : 13);
  const [hx, hy] = bodyAt(...leg.hip);
  const foot = [leg.home[0] + direction * offset, leg.home[1] - direction * 0.5 * offset - lift];
  const bootHeight = Math.min(33, leg.joints[3][1] - leg.joints[2][1]) * (1 - Math.sin(Math.PI * swing) * 0.19);
  const ankle = [foot[0] + leg.joints[2][0] - leg.joints[3][0], foot[1] - bootHeight];
  const vx = ankle[0] - hx, vy = ankle[1] - hy;
  const reach = Math.hypot(vx, vy);
  const bend = Math.sqrt(Math.max(0, 43 ** 2 - reach ** 2 / 4)) * (charge ? 0.75 : 0.47);
  const knee = [hx + vx / 2 + direction * vy / reach * bend, hy + vy / 2 - direction * vx / reach * bend];
  const posed = [[hx, hy], knee, ankle, foot];
  const angle = (a, b) => Math.atan2(a[0] - b[0], b[1] - a[1]);
  const rotate = (a, b) => Math.max(-0.85, Math.min(0.85, angle(posed[a], posed[b]) - angle(leg.joints[a], leg.joints[b])));
  return { posed, twists: [0, rotate(0, 2), rotate(1, 2) * 0.5, 0] };
}

async function render(view, layers, phase, charge, still) {
  const [body, mower, ...legs] = layers;
  const stride = charge ? gait.chargeStride : gait.walkStride;
  const w = cellWidth, h = cellHeight;
  const target = Buffer.alloc(w * h * 4);
  const dx = (w - view.width) / 2, dy = h - standingHeight - gait.groundPadding;
  const inCell = ([x, y]) => [x + dx, y + dy];
  const pulse = still ? 0 : Math.cos(4 * Math.PI * (phase - 0.1));
  const pressure = (charge ? 0.14 : 0.03) + pulse * (charge ? 0.029 : 0.018);
  const bodyAt = (x, y) => [x + view.direction * (view.gripY - y) * pressure, y + (view.gripY - y) * pulse * 0.027];
  const bar = [[view.width / 2, 0], [view.width / 2, view.gripY], [view.width / 2, body.height]];
  const bodyWidths = bar.map(() => view.width / 2);
  const machine = () => {
    const wheel = still ? mower : rollWheel(mower, view.wheel, -view.direction * phase);
    const axle = view.width / 2;
    const wheelAxis = [[axle, 0], [axle, wheel.height]];
    paint(target, wheel, wheelAxis, wheelAxis.map(inCell), [axle, axle], []);
  };
  if (view.side === 'back') machine();
  for (const [i, leg] of view.legs.entries()) {
    const { posed, twists } = legAt(leg, (phase + i * 0.5) % 1, view.direction, stride, charge, still, bodyAt);
    paint(target, legs[i], leg.joints, posed.map(inCell), [34, 24, 20, 31], twists, leg.shade);
  }
  paint(target, body, bar, bar.map(([x, y]) => inCell(bodyAt(x, y))), bodyWidths, []);
  if (view.side === 'front') machine();
  return sharp(target, { raw: { width: w, height: h, channels: 4 } })
    .resize(w * atlasScale, h * atlasScale).png().toBuffer();
}

export async function buildMowerGait(outDir) {
  const layers = await Promise.all(views.map(async (view) => {
    const name = (cel) => join(outDir, `sprites/boss_mower_${view.side}_${cel}.webp`);
    const base = name('a');
    for (const [source, w, h] of [[base, view.width, standingHeight], ...(view.side === 'front' ? [[name('p'), 253, 259]] : [])]) {
      const { width, height } = await sharp(source).metadata();
      if (width !== w || height !== h) throw new Error(`Sprite dimensions changed for ${source}. Update the cutout landmarks.`);
    }
    return Promise.all([cut(base, view.body), cut(base, ...view.mower), ...view.legs.map((leg) => cut(name(leg.cel), leg.mask))]);
  }));
  const cels = [];
  for (const charge of [false, true]) {
    for (const [i, view] of views.entries()) {
      for (let frame = 0; frame < cycleFrames; frame++) {
        cels.push(await render(view, layers[i], frame / cycleFrames, charge, false));
      }
    }
  }
  for (const [i, view] of views.entries()) cels.push(await render(view, layers[i], 0, false, true));
  const sw = cellWidth * atlasScale, sh = cellHeight * atlasScale;
  const w = sw * columns, h = sh * Math.ceil(cels.length / columns);
  await sharp({ create: { width: w, height: h, channels: 4, background: '#00000000' } })
    .composite(cels.map((input, i) => ({ input, left: i % columns * sw, top: Math.floor(i / columns) * sh })))
    .webp({ quality: 91, alphaQuality: 100, effort: 6 }).toFile(join(outDir, file));
  return { file, w, h };
}

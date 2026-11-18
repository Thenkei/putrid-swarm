// Terrain detail is generated in map space so the two cameras see the same banks and puddles.
import { GRID_H, GRID_W, PROPS } from '../core/map';
import { fbm, seeded, smoothstep, valueNoise } from './noise';
import { TREES } from './scenery';
import { plantImage } from './plant-images';
import { FIELD_MARGIN, groundTerrainAt, TRACKS, type TerrainField } from './terrainfield';

export function bankHeight(x: number, z: number): number {
  const edge = Math.max(-x, -z, x - GRID_W, z - GRID_H);
  if (edge <= 0 || edge >= FIELD_MARGIN) return 0;
  const roadDistance = Math.min(
    x > GRID_W ? Math.abs(z - (TRACKS.barn.y0 + TRACKS.barn.y1) / 2) : Infinity,
    z > GRID_H ? Math.abs(x - (TRACKS.gate.x0 + TRACKS.gate.x1) / 2) : Infinity,
  );
  const hummock = fbm(x * 0.64, z * 0.64, 618, 3);
  const rise = smoothstep(0, 1.58, edge) * (1 - smoothstep(3.8, FIELD_MARGIN, edge));
  const verge = smoothstep(1, 1.95 + hummock * 0.42, roadDistance);
  // Centuries of traffic leave the exits in shallow cuts. Exposed shoulders fade into the wooded slopes.
  const shoulder = 0.63 * (1 - smoothstep(1.9, 3.2, roadDistance));
  return rise * verge * (0.22 + 1.42 * hummock * hummock + shoulder);
}

// Filled depressions along the wheel tracks. Use the same shoreline for the damp earth and the water surface.
const rain = seeded(259);
export const puddles = (
  [
    [16.9, 11.56, 0.71, 0.19, 0.04],
    [18.9, 12.45, 0.96, 0.21, -0.06],
    [21.5, 11.56, 0.74, 0.18, 0.05],
    [24.5, 12.44, 1.14, 0.26, 0.035],
    [15.75, 16.28, 0.68, 0.25, -0.21],
    [10.54, 18.88, 0.91, 0.16, 1.48],
    [11.55, 21.36, 0.73, 0.18, 1.56],
  ] as const
).map(([x, z, rx, rz, angle]) => {
  const outline: [number, number][] = [];
  const kink = rain() * Math.PI * 2;
  for (let i = 0; i < 26; i++) {
    const a = (i * Math.PI * 2) / 26,
      r = 0.85 + rain() * 0.2;
    const dx = Math.cos(a) * rx * r,
      dz = (Math.sin(a) * (0.6 + 0.35 * Math.cos(3 * a + kink)) + 0.2 * Math.sin(2 * a + kink)) * rz * r;
    outline.push([x + dx * Math.cos(angle) - dz * Math.sin(angle), z + dz * Math.cos(angle) + dx * Math.sin(angle)]);
  }
  return { x, z, outline };
});

export function meadowTint(field: TerrainField): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  layer.width = layer.height = field.size;
  const ctx = layer.getContext('2d')!;
  const image = ctx.createImageData(field.size, field.size);
  for (let i = 0; i < field.tone.length; i++) {
    const t = field.tone[i]!,
      grass = field.weights.grass[i]!,
      forest = field.weights.forest[i]!;
    const x = field.origin + ((i % field.size) + 0.5) / field.pxPerCell;
    const z = field.origin + (Math.floor(i / field.size) + 0.5) / field.pxPerCell;
    const fresh = smoothstep(-0.38, 0.46, -t);
    // Broad mats of woodland moss break around roots and stones. The smaller scale
    // roughens the edges while the yard keeps its warmer, open meadow palette.
    const mottling = 0.72 * valueNoise(x * 0.68, z * 0.68, 328) + 0.28 * valueNoise(x * 2.9, z * 2.9, 329);
    const moss = forest * smoothstep(0.36, 0.66, mottling + t * 0.13);
    const amount = grass * (0.22 + fresh * 0.29) + forest * 0.15 + moss * 0.55;
    const o = i * 4;
    image.data[o] = 148 - 68 * fresh - forest * 35 + moss * 16;
    image.data[o + 1] = 132 - 20 * fresh - forest * 30 + moss * 12;
    image.data[o + 2] = 65 - 4 * fresh - moss * 5;
    image.data[o + 3] = 255 * amount;
  }
  ctx.putImageData(image, 0, 0);
  return layer;
}

// Wheel beds have compressed clay ridges and softer silt between stones. All of the
// small marks are baked into colour and height together and cost no extra draws.
function laneWear(ctx: CanvasRenderingContext2D, height: CanvasRenderingContext2D): void {
  const rand = seeded(1481);
  for (const barn of [true, false]) {
    const start = barn ? 13.8 : 16.0;
    const end = (barn ? GRID_W : GRID_H) + FIELD_MARGIN - 0.42;
    const middle = barn ? (TRACKS.barn.y0 + TRACKS.barn.y1) / 2 : (TRACKS.gate.x0 + TRACKS.gate.x1) / 2;
    const point = (along: number, across: number): [number, number] => {
      const curve = (valueNoise(along * 0.38, barn ? 2 : 8, 219) - 0.5) * 0.2;
      return barn ? [along, middle + curve + across] : [middle + curve + across, along];
    };
    function ribbon(at: number, width: number, color: string, level: string): void {
      const path = new Path2D();
      // The near end feathers into undisturbed gravel along the porch. Ruts shift
      // slightly as they pass from heavy gravel into softer earth under the trees.
      const n = Math.ceil((end - start) * 5);
      for (const side of [-1, 1]) {
        for (let j = 0; j <= n; j++) {
          const t = (side < 0 ? j : n - j) / n;
          const u = start + (end - start) * t;
          const spread = width * smoothstep(0, 0.11, t) * (0.63 + valueNoise(u * 2.8, at * 7, 392) * 0.53);
          const p = point(u, at + side * spread);
          if (side < 0 && j === 0) path.moveTo(...p);
          else path.lineTo(...p);
        }
      }
      path.closePath();
      ctx.fillStyle = color;
      ctx.fill(path);
      height.fillStyle = level;
      height.fill(path);
    }
    for (const side of [-1, 1]) {
      ribbon(side * 0.45, 0.23, 'rgba(91,75,51,0.44)', 'rgba(97,97,97,0.63)');
      ribbon(side * 0.46, 0.116, 'rgba(125,107,74,0.49)', 'rgba(78,78,78,0.71)');
      ribbon(side * 0.7, 0.055, 'rgba(181,151,102,0.42)', 'rgba(173,173,173,0.58)');
    }
    for (let i = 0; i < 320; i++) {
      const along = start + (end - start) * rand();
      const across = (rand() > 0.5 ? 1 : -1) * (0.3 + rand() * 0.48);
      const [x, z] = point(along, across);
      const len = 0.026 + rand() * 0.087;
      ctx.lineWidth = height.lineWidth = 0.014 + rand() * 0.016;
      const fleck = new Path2D();
      fleck.moveTo(x, z);
      fleck.lineTo(x + (barn ? len : 0.007), z + (barn ? 0.007 : len));
      ctx.strokeStyle = i % 4 ? 'rgba(202,176,122,0.58)' : 'rgba(57,49,36,0.70)';
      height.strokeStyle = i % 4 ? '#b3b3b3' : '#535353';
      ctx.stroke(fleck);
      height.stroke(fleck);
    }
    // Rain drains along the outside wheel bed. A soft bed of silt and small
    // overlapping shale faces follow the same irregular cut into the trees.
    const drainStart = barn ? 18.6 : 17.0;
    const side = barn ? -1 : 1;
    const shoulder = (u: number) => side * (1.08 + 0.36 * valueNoise(u * 0.74, 9, 506) + 0.13 * Math.sin(u * 0.92));
    const channel = (offset: number, width: number, color: string, level: string) => {
      const path = new Path2D();
      for (let edge = 0; edge < 2; edge++) {
        for (let i = 0; i <= 65; i++) {
          const t = (edge === 0 ? i : 65 - i) / 65,
            u = drainStart + (end - drainStart) * t;
          const spread = width * smoothstep(0, 0.13, t) * (0.65 + 0.44 * valueNoise(u * 2.8, 1, 385));
          const at = point(u, shoulder(u) + side * offset + (edge === 0 ? -spread : spread));
          if (edge === 0 && i === 0) path.moveTo(...at);
          else path.lineTo(...at);
        }
      }
      path.closePath();
      ctx.fillStyle = color;
      ctx.fill(path);
      height.fillStyle = level;
      height.fill(path);
    };
    channel(0.06, 0.29, 'rgba(121,100,68,0.57)', 'rgba(119,119,119,.68)');
    channel(-0.04, 0.165, 'rgba(66,67,48,0.68)', 'rgba(70,70,70,.80)');
    channel(-0.077, 0.062, 'rgba(98,95,69,0.69)', 'rgba(88,88,88,.80)');
    for (let u = drainStart + 0.45; u < end; u += 0.17 + rand() * 0.24) {
      if (rand() < 0.18) continue;
      const lateral = shoulder(u) + side * (0.05 + rand() * 0.11);
      const long = 0.095 + rand() * 0.15,
        deep = 0.045 + rand() * 0.065;
      const stone = new Path2D();
      for (const [ix, [du, dv]] of [
        [-0.94, -0.28],
        [-0.72, -0.86],
        [0.36, -0.98],
        [0.98, -0.13],
        [0.61, 0.91],
        [-0.47, 0.67],
      ].entries()) {
        const p = point(u + du! * long, lateral + dv! * deep);
        if (ix) stone.lineTo(...p);
        else stone.moveTo(...p);
      }
      stone.closePath();
      ctx.strokeStyle = '#665b43';
      ctx.lineWidth = 0.029;
      ctx.stroke(stone);
      ctx.fillStyle = ['#968972', '#968674', '#aa967c', '#aba18a', '#7c7d64'][Math.floor(rand() * 5)]!;
      ctx.fill(stone);
      height.fillStyle = 'rgb(166 166 166)';
      height.fill(stone);
      const lip = new Path2D();
      lip.moveTo(...point(u - long * 0.68, lateral + side * deep * 0.55));
      lip.lineTo(...point(u + long * 0.47, lateral + side * deep * 0.78));
      ctx.strokeStyle = 'rgba(207,191,150,0.79)';
      ctx.lineWidth = 0.023;
      ctx.stroke(lip);
    }
    // A torn ribbon of grass survives between tyre tracks near each opening.
    for (let i = 0; i < 80; i++) {
      const a = 18 + rand() * (end - 18),
        b = (rand() - 0.5) * 0.25,
        [x, z] = point(a, b);
      if (valueNoise(a * 0.56, b, barn ? 37 : 92) < 0.27) continue;
      const r = (0.056 + rand() * 0.17) * smoothstep(17.8, 20, a);
      ctx.beginPath();
      ctx.ellipse(x, z, r * (barn ? 1.42 : 0.62), r * (barn ? 0.62 : 1.42), 0, 0, Math.PI * 2);
      ctx.fillStyle = ['rgba(107,110,61,0.59)', 'rgba(126,123,66,0.57)', 'rgba(132,125,72,0.54)'][i % 3]!;
      ctx.fill();
    }
  }
}

function forestLitter(ctx: CanvasRenderingContext2D, height: CanvasRenderingContext2D): void {
  const rand = seeded(8104);
  const span = GRID_W + 2 * FIELD_MARGIN;
  // Pockets of humus and exposed roots stay on the forest floor even where the
  // camera cuts its foreground canopy back. Their height falls towards the root tip.
  for (const tree of TREES) {
    if (tree.row > 1 || tree.trait < 0.4) continue;
    const a = rand() * Math.PI * 2,
      x = tree.gx,
      z = tree.gy;
    ctx.save();
    ctx.translate(x, z);
    ctx.scale(0.94, 0.78);
    const humus = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    humus.addColorStop(0, 'rgba(49,45,29,0.48)');
    humus.addColorStop(0.5, 'rgba(83,73,45,0.31)');
    humus.addColorStop(1, 'rgba(89,78,47,0)');
    ctx.fillStyle = humus;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
    for (let i = 0; i < 4; i++) {
      const angle = a + i * 1.61 + rand() * 0.34,
        dx = Math.sin(angle),
        dz = Math.cos(angle),
        len = 0.45 + rand() * 0.56;
      const root = new Path2D();
      root.moveTo(x + dx * 0.07 - dz * 0.038, z + dz * 0.07 + dx * 0.038);
      root.quadraticCurveTo(x + dx * len * 0.53 - dz * 0.17, z + dz * len * 0.53 + dx * 0.17, x + dx * len, z + dz * len);
      root.quadraticCurveTo(x + dx * len * 0.56 - dz * 0.072, z + dz * len * 0.56 + dx * 0.072, x + dx * 0.09 + dz * 0.034, z + dz * 0.09 - dx * 0.034);
      root.closePath();
      ctx.fillStyle = i % 2 ? '#8d7953' : '#776442';
      ctx.fill(root);
      height.fillStyle = i % 2 ? '#babab8' : '#aeaeae';
      height.fill(root);
    }
  }
  const tones = ['#74694b', '#988257', '#675b41', '#986d42'];
  for (let i = 0; i < 850; i++) {
    const x = rand() * span - FIELD_MARGIN,
      z = rand() * span - FIELD_MARGIN;
    if (groundTerrainAt(x, z) !== 'forest') continue;
    const a = rand() * Math.PI * 2,
      dx = Math.sin(a),
      dz = Math.cos(a);
    if (i % 6 === 0) {
      const length = 0.29 + rand() * 0.51;
      const fork = new Path2D();
      fork.moveTo(x, z);
      fork.lineTo(x + dx * length * 0.52 - dz * 0.038, z + dz * length * 0.52 + dx * 0.038);
      fork.lineTo(x + dx * length, z + dz * length);
      fork.moveTo(x + dx * length * 0.35, z + dz * length * 0.35);
      fork.lineTo(x + dx * length * 0.6 + dz * 0.11, z + dz * length * 0.6 - dx * 0.11);
      height.lineWidth = 0.049;
      height.strokeStyle = '#c1c1c1';
      height.stroke(fork);
      ctx.lineWidth = 0.054;
      ctx.strokeStyle = '#544b36';
      ctx.stroke(fork);
      ctx.lineWidth = 0.024;
      ctx.strokeStyle = '#97805c';
      ctx.stroke(fork);
    } else {
      const du = 0.1 + rand() * 0.27;
      ctx.strokeStyle = tones[i % 4]!;
      ctx.lineWidth = 0.01 + rand() * 0.016;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const side = k % 2 ? 1 : -1,
          dist = 0.05 + 0.07 * rand(),
          u = k / 9;
        ctx.moveTo(x + dx * du * u, z + dz * du * u);
        ctx.lineTo(x + dx * du * (u + 0.2) + dz * side * dist, z + dz * du * (u + 0.2) - dx * side * dist);
      }
      ctx.stroke();
    }
  }
}

export function dressSoil(ctx: CanvasRenderingContext2D, height: CanvasRenderingContext2D, photographed = false): void {
  const rand = seeded(712);
  ctx.save();
  if (photographed) ctx.globalAlpha = 0.53;
  laneWear(ctx, height);
  forestLitter(ctx, height);
  ctx.restore();
  // Accumulated drifts below the orchard canopy and windrows along the woodland margin.
  const drifts: (readonly [number, number, number])[] = PROPS.filter((p) => p.kind === 'apple' || p.kind === 'oak').map(
    (p) => [p.x + p.w / 2, p.y + p.h / 2, 1.65] as const,
  );
  for (let i = 0; i < 110; i++) {
    const x = rand() * 32 - 5,
      z = rand() * 32 - 5;
    const forest = groundTerrainAt(x, z) === 'forest';
    if (!forest && (groundTerrainAt(x, z) !== 'grass' || rand() > 0.23)) continue;
    drifts.push([x, z, forest ? 1.06 : 0.68]);
  }
  const leaves = ['#ac773c', '#846538', '#b48b48', '#9d572f', '#846e46', '#be9450'];
  const fallen = photographed ? plantImage('dead') : undefined;
  for (const [x, z, size] of drifts) {
    for (let i = 0; i < 63; i++) {
      const a = rand() * Math.PI * 2,
        r = Math.sqrt(rand()) * size;
      const px = x + Math.cos(a) * r * 1.4,
        pz = z + Math.sin(a) * r * 0.69;
      const angle = rand() * Math.PI,
        len = 0.046 + rand() * 0.095;
      if (fallen) {
        // Individual fallen leaves sit over the scanned litter. Larger ones
        // collect at the edge of a windrow and below the orchard trees.
        if (i % 3) continue;
        ctx.save();
        ctx.translate(px, pz);
        ctx.rotate(angle);
        ctx.globalAlpha = 0.65 + (i % 5) * 0.056;
        ctx.drawImage(fallen, -len * 0.66, -len, len * 1.32, len * 1.9);
        ctx.restore();
        continue;
      }
      const dx = Math.cos(angle) * len,
        dz = Math.sin(angle) * len;
      ctx.beginPath();
      ctx.moveTo(px - dx, pz - dz);
      ctx.quadraticCurveTo(px - dz * 0.62, pz + dx * 0.62, px + dx, pz + dz);
      ctx.quadraticCurveTo(px + dz * 0.45, pz - dx * 0.45, px - dx, pz - dz);
      ctx.fillStyle = leaves[i % leaves.length]!;
      ctx.fill();
      ctx.strokeStyle = 'rgba(69,48,29,0.64)';
      ctx.lineWidth = 0.015;
      ctx.beginPath();
      ctx.moveTo(px - dx, pz - dz);
      ctx.lineTo(px + dx * 0.75, pz + dz * 0.75);
      ctx.stroke();
    }
  }
  for (const { outline } of puddles) {
    const pool = new Path2D();
    outline.forEach(([x, z], i) => (i ? pool.lineTo(x, z) : pool.moveTo(x, z)));
    pool.closePath();
    ctx.lineJoin = height.lineJoin = 'round';
    ctx.lineWidth = 0.13;
    ctx.strokeStyle = 'rgba(96,73,45,0.45)';
    ctx.stroke(pool);
    ctx.lineWidth = 0.058;
    ctx.strokeStyle = 'rgba(53,47,36,0.63)';
    ctx.stroke(pool);
    ctx.fillStyle = 'rgba(57,52,39,0.55)';
    ctx.fill(pool);
    height.lineWidth = 0.1;
    height.strokeStyle = '#a6a6a6';
    height.stroke(pool);
    height.fillStyle = '#545454';
    height.fill(pool);
  }
}

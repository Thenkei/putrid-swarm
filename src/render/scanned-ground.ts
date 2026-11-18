// World-aligned albedo, normal and surface scans share the exact same footprints.
// The three maps are baked once so a four-camera frame never has to splat terrain layers.
import { GRID_W, GRID_H, PROPS } from '../core/map';
import { surfaceImage } from '../engine/material-images';
import { smoothstep, valueNoise } from './noise';
import { GROUND_TERRAINS, layerAlpha, TRACKS, type GroundTerrain, type TerrainField } from './terrainfield';

const surfaces = { grass: 'grass', path: 'soil', gravel: 'gravel', forest: 'litter' } as const;
type Channel = 'albedo' | 'normal' | 'surface';
// One cell is roughly a metre. A single leaf, a gravel chip and a grass blade keep
// their own scale as the track crosses sunlight, shadow and neighbouring materials.
const spans: Record<GroundTerrain, number> = { grass: 2.65, path: 1.72, gravel: 1.7, forest: 2.36 };
function canvas(size: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = out.height = size;
  return out;
}
const turnedNormals = new Map<GroundTerrain, HTMLCanvasElement>();
export function scanPattern(
  ctx: CanvasRenderingContext2D,
  type: GroundTerrain,
  channel: Channel = 'albedo',
  turned = false,
): CanvasPattern | undefined {
  const growing = type === 'grass' && !turned;
  const stony = (type === 'gravel' && !turned) || (type === 'path' && turned);
  let source: HTMLImageElement | HTMLCanvasElement | undefined =
    surfaceImage(growing ? 'turf' : stony ? 'trail' : surfaces[type], channel) ?? surfaceImage(surfaces[type], channel);
  if (!source) return;
  if (turned && channel === 'normal') {
    let warped = turnedNormals.get(type);
    if (!warped) {
      warped = canvas(source.width);
      const normal = warped.getContext('2d')!;
      normal.drawImage(source, 0, 0, warped.width, warped.height);
      const pixels = normal.getImageData(0, 0, warped.width, warped.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        pixels.data[i] = 255 - pixels.data[i]!;
        pixels.data[i + 1] = 255 - pixels.data[i + 1]!;
      }
      normal.putImageData(pixels, 0, 0);
      turnedNormals.set(type, warped);
    }
    source = warped;
  }
  const pattern = ctx.createPattern(source, 'repeat');
  if (!pattern) return;
  const scale = (growing ? 2.04 : stony ? 2.42 : spans[type]) / source.width;
  pattern.setTransform(
    turned
      ? new DOMMatrix()
          .translate(0.88, 0.39)
          .rotate(180)
          .scale(scale * 1.17)
      : new DOMMatrix().scale(scale),
  );
  return pattern;
}

function farmField(field: TerrainField): TerrainField {
  const weights = Object.fromEntries(GROUND_TERRAINS.map((k) => [k, field.weights[k].slice()])) as Record<GroundTerrain, Float32Array>;
  const litter = canvas(field.size).getContext('2d')!,
    wear = canvas(field.size).getContext('2d')!;
  for (const ctx of [litter, wear])
    ctx.setTransform(field.pxPerCell, 0, 0, field.pxPerCell, -field.origin * field.pxPerCell, -field.origin * field.pxPerCell);
  for (const p of PROPS) {
    if (p.kind !== 'oak' && p.kind !== 'apple') continue;
    const x = p.x + p.w / 2,
      z = p.y + p.h / 2;
    const radius = p.kind === 'oak' ? 2.45 : 1.78;
    litter.save();
    litter.translate(x, z);
    litter.rotate(-0.51);
    litter.scale(radius * 1.15, radius * 0.9);
    const fall = litter.createRadialGradient(0, 0, 0, 0, 0, 1);
    fall.addColorStop(0, '#fff');
    fall.addColorStop(0.5, 'rgba(255,255,255,.76)');
    fall.addColorStop(1, 'rgba(255,255,255,0)');
    litter.fillStyle = fall;
    litter.fillRect(-1, -1, 2, 2);
    litter.restore();
  }
  const footpaths = [
    [8.5, 10.5, 6.8, 10.9, 5.0, 12.45],
    [5.0, 12.45, 4.0, 13.5, 3.55, 14.35],
    [6.8, 10.92, 5.4, 10.1, 4.65, 8.55],
    [11.45, 6.35, 12.35, 5.45, 13.8, 5.65],
    [12.7, 6.1, 14.4, 6.7, 15.45, 6.5],
    [11.2, 6.2, 10.1, 5.25, 9.1, 4.64],
    [13.45, 8.65, 14.42, 8.28, 14.58, 8.34],
    [14.1, 12.3, 14.35, 13.8, 15.35, 14.1],
  ] as const;
  wear.lineCap = 'round';
  for (const segment of footpaths) {
    const path = new Path2D();
    path.moveTo(segment[0], segment[1]);
    path.quadraticCurveTo(segment[2], segment[3], segment[4], segment[5]);
    for (const [width, ink] of [
      [1.38, 0.13],
      [1.0, 0.17],
      [0.64, 0.23],
      [0.38, 0.21],
    ] as const) {
      wear.strokeStyle = 'rgba(255,255,255,' + ink + ')';
      wear.lineWidth = width;
      wear.stroke(path);
    }
  }
  const roots = litter.getImageData(0, 0, field.size, field.size).data;
  const steps = wear.getImageData(0, 0, field.size, field.size).data;
  for (let i = 0; i < field.tone.length; i++) {
    const x = field.origin + ((i % field.size) + 0.5) / field.pxPerCell;
    const z = field.origin + (Math.floor(i / field.size) + 0.5) / field.pxPerCell;
    const grass = weights.grass[i]!,
      wood = weights.forest[i]!;
    const broken = 0.56 * valueNoise(x * 1.13, z * 1.13, 389) + 0.44 * valueNoise(x * 4.13, z * 4.13, 270);
    const broad = valueNoise(x * 0.52 + z * 0.09, z * 0.48, 149);
    const woodland = grass * Math.min(0.92, (roots[4 * i + 3]! / 255) * (0.36 + broken * 0.94));
    const tread = (steps[4 * i + 3]! / 255) * (0.5 + broken * 1.14);
    const scrub = smoothstep(0.53, 0.85, broad * 0.54 + broken * 0.46) * 0.47;
    const exposed = (grass - woodland) * Math.min(0.9, tread + scrub);
    // A living verge creeps into the first rows of leaf litter. Bare earth breaks
    // through the sward in trampled places and below the fruit trees.
    const edgeDistance = Math.max(-x, -z, x - GRID_W, z - GRID_H);
    const edgeGrass = wood * (1 - smoothstep(0.27, 3.5, edgeDistance)) * (0.11 + smoothstep(0.31, 0.71, broad) * 0.48);
    weights.grass[i] = grass - woodland - exposed + edgeGrass;
    weights.forest[i] = wood + woodland - edgeGrass;
    const gravel = weights.gravel[i]!,
      dirt = weights.path[i]!;
    const binder = gravel * (0.12 + 0.19 * broad + 0.15 * broken);
    const chips = dirt * (0.05 + 0.15 * broken);
    weights.gravel[i] = gravel - binder + chips;
    weights.path[i] = dirt + exposed + binder - chips;
  }
  return { ...field, weights };
}

export function capturedGround(field: TerrainField, blend: HTMLCanvasElement) {
  if (!Object.values(surfaces).every((k) => surfaceImage(k) && surfaceImage(k, 'normal') && surfaceImage(k, 'surface'))) return;
  const mix = farmField(field);
  const masks = GROUND_TERRAINS.map((terrain, i) => {
    if (!i) return;
    const alpha = layerAlpha(mix, terrain),
      out = canvas(field.size),
      ctx = out.getContext('2d')!,
      rgba = ctx.createImageData(field.size, field.size);
    for (let j = 0; j < alpha.length; j++) rgba.data[4 * j + 3] = 255 * alpha[j]!;
    ctx.putImageData(rgba, 0, 0);
    return out;
  });
  function render(channel: Channel, size: number): HTMLCanvasElement {
    const output = canvas(size),
      ctx = output.getContext('2d')!;
    const layer = canvas(size).getContext('2d')!,
      variation = canvas(size).getContext('2d')!;
    const scale = size / field.extent,
      origin = -field.origin * scale;
    for (const [i, terrain] of GROUND_TERRAINS.entries()) {
      for (const [turned, paint] of [
        [false, layer],
        [true, variation],
      ] as const) {
        paint.resetTransform();
        paint.globalCompositeOperation = 'copy';
        paint.setTransform(scale, 0, 0, scale, origin, origin);
        paint.fillStyle = scanPattern(paint, terrain, channel, turned)!;
        paint.fillRect(field.origin, field.origin, field.extent, field.extent);
        paint.resetTransform();
        paint.globalCompositeOperation = 'source-over';
      }
      variation.globalCompositeOperation = 'destination-in';
      variation.drawImage(blend, 0, 0, size, size);
      if (terrain === 'grass') layer.globalAlpha = 0.37;
      layer.drawImage(variation.canvas, 0, 0);
      layer.globalAlpha = 1;
      const mask = masks[i];
      if (mask) {
        layer.globalCompositeOperation = 'destination-in';
        layer.drawImage(mask, 0, 0, size, size);
      }
      ctx.drawImage(layer.canvas, 0, 0);
    }
    layer.canvas.width = variation.canvas.width = 1;
    return output;
  }
  return { albedo: render('albedo', 2048), normal: render('normal', 1536), surface: render('surface', 1536), weights: mix.weights };
}

/** R, G and B are high-frequency reflectance in stone, lawn and leaf litter.
 * A retains the native scanned height of the stone bed for close directional light.
 * One repeatable lookup serves all three as the camera resolves individual grains. */
export function scannedGrain(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4).fill(128);
  const tile = canvas(size).getContext('2d', { willReadFrequently: true })!;
  const blur = canvas(size).getContext('2d', { willReadFrequently: true })!;
  for (const [c, id] of (['trail', 'turf', 'litter'] as const).entries()) {
    const source = surfaceImage(id) ?? surfaceImage(c === 0 ? 'gravel' : c === 1 ? 'grass' : 'litter');
    if (!source) continue;
    tile.drawImage(source, 0, 0, size, size);
    blur.filter = 'blur(8px)';
    // Wrap the low-pass sample so its edges share the same neighbourhood.
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) blur.drawImage(tile.canvas, x * size, y * size);
    const src = tile.getImageData(0, 0, size, size).data,
      mean = blur.getImageData(0, 0, size, size).data;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.26 * src[i]! + 0.64 * src[i + 1]! + 0.1 * src[i + 2]!;
      const local = 0.26 * mean[i]! + 0.64 * mean[i + 1]! + 0.1 * mean[i + 2]!;
      data[i + c] = Math.min(255, Math.max(0, 128 + 1.7 * (l - local)));
    }
  }
  const height = surfaceImage('trail', 'surface') ?? surfaceImage('gravel', 'surface');
  if (height) {
    tile.drawImage(height, 0, 0, size, size);
    const src = tile.getImageData(0, 0, size, size).data;
    for (let i = 0; i < data.length; i += 4) data[i + 3] = src[i]!;
  }
  tile.canvas.width = blur.canvas.width = 1;
  return data;
}

/** Continue the wheel beds into the surrounding wood at the wide build zoom. */
export function outerTracks(ctx: CanvasRenderingContext2D, end: number): void {
  ctx.save();
  for (const barn of [true, false]) {
    const start = (barn ? GRID_W : GRID_H) - 1,
      centre = barn ? (TRACKS.barn.y0 + TRACKS.barn.y1) / 2 : (TRACKS.gate.x0 + TRACKS.gate.x1) / 2;
    function course(u: number, offset: number): [number, number] {
      const drift = (valueNoise(u * 0.21, barn ? 2 : 6, 812) - 0.5) * 0.94 * smoothstep(start + 3, start + 8, u);
      return barn ? [u, centre + offset + drift] : [centre + offset + drift, u];
    }
    function ribbon(offset: number, radius: number, edgeNoise: number, ink: string | CanvasPattern, opacity: number) {
      const count = Math.ceil((end - start) * 5),
        path = new Path2D();
      for (const side of [-1, 1])
        for (let i = 0; i <= count; i++) {
          const u = start + ((end - start) * (side < 0 ? i : count - i)) / count;
          const width = radius + edgeNoise * (valueNoise(u * 1.62, offset + side * 9, 49) - 0.5);
          const p = course(u, offset + side * width);
          if (side < 0 && !i) path.moveTo(...p);
          else path.lineTo(...p);
        }
      path.closePath();
      ctx.fillStyle = ink;
      ctx.globalAlpha = opacity;
      ctx.fill(path);
    }
    const soil = scanPattern(ctx, 'path')!,
      stones = scanPattern(ctx, 'gravel')!,
      grass = scanPattern(ctx, 'grass', 'albedo', true)!;
    ribbon(0, 1.33, 0.71, soil, 0.49);
    ribbon(0, 1.1, 0.47, soil, 1);
    ribbon(0, 1.06, 0.42, stones, barn ? 0.86 : 0.61);
    for (const side of [-1, 1]) {
      ribbon(side * 0.46, 0.22, 0.12, soil, 0.55);
      ribbon(side * 0.46, 0.14, 0.086, '#514837', 0.32);
      ribbon(side * 0.73, 0.055, 0.058, '#b5a180', 0.18);
    }
    ribbon(0, 0.12, 0.19, grass, 0.66);
  }
  ctx.restore();
}

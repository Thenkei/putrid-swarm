// The ground of the lot, painted once per side of the house and reused every frame.
//
// What is baked here never changes during a run: the four terrains with their frayed borders, the
// slow drift of colour that hides the tiling, the lip of the turf, the ruts of the track, the shade
// under the trees and the shadow of the house. What does change (the edge of the world as the
// view pans, the darkness closing in beyond the clearing) is drawn live by `drawGround`.

import { GRID_H, GRID_W, HOUSE, PROPS } from '../core/map';
import { sprite, type Sprite } from '../engine/assets';
import { dressSoil, meadowTint } from './yard-soil';
import { capturedGround, outerTracks, scanPattern } from './scanned-ground';
import { surfaceHeight } from './surface-height';
import { fbm, seeded, smoothstep } from './noise';
import { TH, TW, groundMatrix, project, viewBounds, viewX, viewY, world, type Rot, type View } from './projection';
import { TREES } from './scenery';
import { SHADOW_RGB } from './shadows';
import { FIELD_MARGIN, GROUND_TERRAINS, TRACKS, layerAlpha, terrainField, type GroundTerrain, type TerrainField } from './terrainfield';

const MARGIN = FIELD_MARGIN;
/** Cache pixels per stage unit at zoom 1: the swatches are laid at one texel per pixel or finer. */
const GROUND_SCALE = 1.5;
/** Room kept above the far corner of the ground, in stage units, for what stands on it there: the back rows of trees. */
const HEADROOM = 250;
const GROUND_W = (GRID_W + GRID_H + 4 * MARGIN) * (TW / 2);
const GROUND_H = (GRID_W + GRID_H + 4 * MARGIN) * (TH / 2) + HEADROOM;
/** World x of the ground cache's left edge, and world y of its top edge. */
const GROUND_X0 = -(GRID_H + 2 * MARGIN) * (TW / 2);
const GROUND_Y0 = -(2 * MARGIN) * (TH / 2) - HEADROOM;
/** Cells at the rim of the painted ground over which it fades into the live forest floor. */
const RIM = 1.6;

/**
 * Whatever stands on the ground and never moves or changes (the shadows of the scenery, the
 * trees too far back to matter) is painted into it once. The dresser is handed a context and a
 * view that draws at zoom 1 onto the ground being built, so it draws exactly as it would live.
 */
export type GroundDresser = (ctx: CanvasRenderingContext2D, view: View) => void;

let dresser: GroundDresser | null = null;

/** Registers what to paint onto the ground once it is laid. Call before the first frame. */
export function setGroundDresser(dress: GroundDresser): void {
  dresser = dress;
}

/** The view under which stage units at zoom 1 land on the ground cache of a side. */
function bakingView(rot: Rot): View {
  // The point of the grid whose world position is the middle of the cache.
  const wx = GROUND_X0 + GROUND_W / 2;
  const wy = GROUND_Y0 + GROUND_H / 2;
  const vx = wy / TH + wx / TW;
  const vy = wy / TH - wx / TW;
  return { rot, zoom: 1, cx: viewX(rot, vx), cy: viewY(rot, vy), x: 0, y: 0, w: GROUND_W, h: GROUND_H };
}

interface Swatch {
  readonly key: string;
  readonly fallback: string;
  /** Texels of the swatch per cell: higher is finer. Set so a painted leaf is the size of a leaf. */
  readonly texels: number;
  /** How dark the lip under this terrain's edge is: turf and gravel lie on top of what they meet. */
  readonly lip: number;
}

const SWATCHES: Readonly<Record<GroundTerrain, Swatch>> = {
  forest: { key: 'tex_ground_forest', fallback: '#4a3a28', texels: 126, lip: 0 },
  path: { key: 'tex_ground_path', fallback: '#8a6a47', texels: 110, lip: 0 },
  gravel: { key: 'tex_ground_gravel', fallback: '#9c917c', texels: 122, lip: 0.2 },
  grass: { key: 'tex_ground_grass', fallback: '#6f7a3a', texels: 104, lip: 0.3 },
};

// ───────────────────────────── Swatches ─────────────────────────────

const tiles = new Map<string, HTMLCanvasElement>();

/**
 * A swatch that repeats without a seam. The painted swatches do not tile; mirroring them does,
 * but shows as a kaleidoscope. Instead each edge is cross-faded with the middle of the picture
 * (a copy shifted by half), one axis after the other.
 */
function seamlessTile(source: Sprite): HTMLCanvasElement {
  const size = Math.min(source.w, source.h);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(source.img, 0, 0, size, size);

  const shifted = document.createElement('canvas');
  shifted.width = size;
  shifted.height = size;
  const sctx = shifted.getContext('2d') as CanvasRenderingContext2D;
  for (const axis of ['x', 'y'] as const) {
    const dx = axis === 'x' ? size / 2 : 0;
    const dy = axis === 'y' ? size / 2 : 0;
    // The picture as it stands, shifted by half along this axis and wrapped round.
    sctx.globalCompositeOperation = 'copy';
    sctx.drawImage(canvas, -dx, -dy);
    sctx.globalCompositeOperation = 'source-over';
    sctx.drawImage(canvas, dx, dy);
    // Kept near the two edges only: in the middle the shifted copy has the seam.
    const fade = axis === 'x' ? sctx.createLinearGradient(0, 0, size, 0) : sctx.createLinearGradient(0, 0, 0, size);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.1, 'rgba(0,0,0,1)');
    fade.addColorStop(0.36, 'rgba(0,0,0,0)');
    fade.addColorStop(0.64, 'rgba(0,0,0,0)');
    fade.addColorStop(0.9, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    sctx.globalCompositeOperation = 'destination-in';
    sctx.fillStyle = fade;
    sctx.fillRect(0, 0, size, size);
    ctx.drawImage(shifted, 0, 0);
  }
  return canvas;
}

function tileOf(terrain: GroundTerrain): HTMLCanvasElement | null {
  const swatch = SWATCHES[terrain];
  const known = tiles.get(swatch.key);
  if (known) return known;
  const art = sprite(swatch.key);
  if (!art) return null;
  const tile = seamlessTile(art);
  tiles.set(swatch.key, tile);
  return tile;
}

const fills = new Map<string, CanvasPattern>();

/** The swatch as a fill, in grid units. `turned` is the second lay: a quarter turn, a different size, off the first one's beat. */
function swatchFill(ctx: CanvasRenderingContext2D, terrain: GroundTerrain, turned = false): CanvasPattern | string {
  const id = `${terrain}:${turned}`;
  const known = fills.get(id);
  if (known) return known;
  const tile = tileOf(terrain);
  // Not cached: the swatch may only be late.
  if (!tile) return SWATCHES[terrain].fallback;
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return SWATCHES[terrain].fallback;
  const scale = 1 / SWATCHES[terrain].texels;
  const matrix = new DOMMatrix();
  if (turned) pattern.setTransform(matrix.translate(0.37, 0.61).rotate(90).scale(scale * 1.27));
  else pattern.setTransform(matrix.scale(scale));
  fills.set(id, pattern);
  return pattern;
}

// ───────────────────────────── Field → canvases ─────────────────────────────

/** A white canvas whose opacity is the given 0..1 values. */
function alphaCanvas(values: Float32Array, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let i = 0; i < values.length; i++) {
    const o = i * 4;
    data[o] = 255;
    data[o + 1] = 255;
    data[o + 2] = 255;
    data[o + 3] = Math.round((values[i] as number) * 255);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** The slow drift of light over the lot, as a picture to lay over the ground in soft light: grey leaves it alone. */
function toneCanvas(field: TerrainField): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = field.size;
  canvas.height = field.size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = ctx.createImageData(field.size, field.size);
  const data = image.data;
  for (let i = 0; i < field.tone.length; i++) {
    const t = field.tone[i] as number;
    const o = i * 4;
    // Lighter patches lean dry and warm, darker ones damp and cool.
    data[o] = 128 + t * 62 + Math.max(0, t) * 16;
    data[o + 1] = 128 + t * 62;
    data[o + 2] = 128 + t * 62 - Math.max(0, t) * 22 + Math.max(0, -t) * 10;
    data[o + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const SHADE_PX = 4;
/** How dark the floor of the wood gets, a few cells in. The live ground beyond the cache is given the same. */
const SHADE_DEPTH = 0.5;

/** The shade of the wood: nothing on the lot, deepening from the first trees outward. */
function shadeCanvas(field: TerrainField): HTMLCanvasElement {
  const size = field.extent * SHADE_PX;
  const values = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    const gy = field.origin + (py + 0.5) / SHADE_PX;
    for (let px = 0; px < size; px++) {
      const gx = field.origin + (px + 0.5) / SHADE_PX;
      // Distance past the border row of the lot, in cells; the two ways out stay a little lighter.
      const out = Math.max(1 - gx, gx - (GRID_W - 1), 1 - gy, gy - (GRID_H - 1));
      const lane = Math.min(Math.abs(gx - (TRACKS.gate.x0 + TRACKS.gate.x1) / 2), Math.abs(gy - (TRACKS.barn.y0 + TRACKS.barn.y1) / 2));
      const open = out > 0 && (gy > GRID_H - 1 || gx > GRID_W - 1) ? 1 - smoothstep(0.6, 2.2, lane) : 0;
      const ragged = out + (fbm(gx * 0.7, gy * 0.7, 77, 2) - 0.5) * 1.4;
      values[py * size + px] = smoothstep(-0.4, 4.4, ragged) * SHADE_DEPTH * (1 - open * 0.45);
    }
  }
  const canvas = alphaCanvas(values, size);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = `rgb(${SHADOW_RGB})`;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

// ───────────────────────────── Build ─────────────────────────────

interface FieldArt {
  readonly field: TerrainField;
  readonly masks: Readonly<Record<GroundTerrain, HTMLCanvasElement | null>>;
  readonly blend: HTMLCanvasElement;
  readonly tone: HTMLCanvasElement;
  readonly shade: HTMLCanvasElement;
}

let fieldArt: FieldArt | null = null;

/** The field as pictures. Shared by both sides of the house: they are the same ground. */
function fieldPictures(): FieldArt {
  if (fieldArt) return fieldArt;
  const field = terrainField();
  const masks = Object.fromEntries(GROUND_TERRAINS.map((terrain) => [terrain, terrain === 'forest' ? null : alphaCanvas(layerAlpha(field, terrain), field.size)])) as Record<GroundTerrain, HTMLCanvasElement | null>;
  fieldArt = { field, masks, blend: alphaCanvas(field.blend, field.size), tone: toneCanvas(field), shade: shadeCanvas(field) };
  return fieldArt;
}

// Stamp each chip into colour and height at the same world coordinates. Lighting and the
// printed route overlay stay out of the height field. The same ruts continue into the woods.
function dressPaths(ctx: CanvasRenderingContext2D, height: CanvasRenderingContext2D): void {
  const random = seeded(3219);
  const gravel = scanPattern(ctx, 'gravel') ?? swatchFill(ctx, 'gravel');
  function stone(x: number, y: number, width: number, length: number, rotation: number): void {
    const face = new Path2D();
    const lip = new Path2D();
    const shade = Math.round(32 + random() * 17);
    for (let i = 0; i < 8; i++) {
      const angle = ((i + 0.5) * Math.PI) / 4;
      const u = Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), 0.62) * width * (0.43 + random() * 0.13);
      const v = Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), 0.62) * length * (0.43 + random() * 0.13);
      const px = x + u * Math.cos(rotation) - v * Math.sin(rotation);
      const py = y + u * Math.sin(rotation) + v * Math.cos(rotation);
      if (i === 0) {
        face.moveTo(px, py);
        lip.moveTo(px, py + length * 0.08);
      } else {
        face.lineTo(px, py);
        lip.lineTo(px, py + length * 0.08);
      }
    }
    face.closePath();
    lip.closePath();
    ctx.fillStyle = '#574d3d';
    ctx.fill(lip);
    height.fillStyle = '#494949';
    height.fill(lip);
    ctx.fillStyle = 'hsl(39 13% ' + shade + '%)';
    ctx.fill(face);
    ctx.save();
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = gravel;
    ctx.fill(face);
    ctx.restore();
    const level = Math.round(155 + random() * 65);
    height.fillStyle = 'rgb(' + level + ' ' + level + ' ' + level + ')';
    height.fill(face);
    if (width > 0.3) {
      // A broken vein across selected slabs, with a thin lip on the high side.
      const vein = new Path2D();
      vein.moveTo(x - width * 0.34, y - length * 0.34);
      vein.lineTo(x - width * 0.08, y - length * 0.05);
      vein.lineTo(x + width * 0.09, y - length * 0.08);
      vein.lineTo(x + width * 0.22, y + length * (random() - 0.5));
      ctx.strokeStyle = 'rgba(45,37,31,0.51)';
      height.strokeStyle = '#666';
      ctx.lineWidth = height.lineWidth = 0.023;
      ctx.stroke(vein);
      height.stroke(vein);
    }
  }
  // The porch paving splits into loose shale the farther it gets from either threshold.
  for (const side of [1, -1]) {
    const rows = side > 0 ? 13 : 7;
    for (let row = 0; row < rows; row++) {
      for (let col = -1; col <= 1; col++) {
        if (random() < (row / rows) * 0.66) continue;
        stone(
          11 + col * 0.49 + ((row % 2) - 0.5) * 0.17 + random() * 0.09,
          11 + side * (2.79 + row * 0.33 + random() * 0.09),
          0.36 + random() * 0.22,
          0.23 + random() * 0.14,
          (random() - 0.5) * 0.49,
        );
      }
    }
  }
  for (let i = 0; i < 330; i++) {
    const along = random() * 13;
    const across = (random() > 0.5 ? 1 : -1) * (0.55 + random() * 0.64);
    const barn = i % 3 !== 0;
    stone(barn ? 13.5 + along : 11 + across, barn ? 12 + across : 14.3 + along, 0.045 + random() * 0.14, 0.04 + random() * 0.1, random() * Math.PI);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 57; i++) {
      const x = 14.1 + i * 0.21;
      const y = 12 + side * 0.44 + (fbm(x * 0.6, side * 3.1, 91, 2) - 0.5) * 0.22;
      if (random() < 0.19) continue;
      const groove = new Path2D();
      groove.moveTo(x - 0.078, y - 0.095);
      groove.lineTo(x, y);
      groove.lineTo(x - 0.078, y + 0.095);
      ctx.lineWidth = height.lineWidth = 0.042;
      ctx.strokeStyle = 'rgba(57,45,34,0.38)';
      height.strokeStyle = '#515151';
      ctx.stroke(groove);
      height.stroke(groove);
    }
  }
}

/** Diffuse texture in world coordinates for the mesh yard. The live lights supply its shadows. */
export function groundAlbedo(): {
  clearing: HTMLCanvasElement;
  relief: HTMLCanvasElement;
  normal?: HTMLCanvasElement;
  grain: Uint8Array;
  clearingSize: number;
  surround: HTMLCanvasElement;
  surroundSize: number;
} {
  const { field, masks, blend, tone, shade } = fieldPictures();
  const photographed = capturedGround(field, blend);
  const canvas = photographed?.albedo ?? document.createElement('canvas');
  if (!photographed) canvas.width = canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;
  const layer = document.createElement('canvas');
  layer.width = layer.height = photographed ? 1 : canvas.width;
  const paint = layer.getContext('2d')!;
  const variation = layer.cloneNode() as HTMLCanvasElement;
  const turned = variation.getContext('2d')!;
  const scale = canvas.width / field.extent;
  if (!photographed) for (const terrain of GROUND_TERRAINS) {
    paint.resetTransform();
    paint.clearRect(0, 0, layer.width, layer.height);
    paint.setTransform(scale, 0, 0, scale, -field.origin * scale, -field.origin * scale);
    paint.fillStyle = swatchFill(paint, terrain);
    paint.fillRect(field.origin, field.origin, field.extent, field.extent);
    paint.resetTransform();
    // Break up the swatch repeat before clipping the combined paint to this terrain.
    turned.globalCompositeOperation = 'copy';
    turned.drawImage(blend, 0, 0, variation.width, variation.height);
    turned.globalCompositeOperation = 'source-in';
    turned.setTransform(scale, 0, 0, scale, -field.origin * scale, -field.origin * scale);
    turned.fillStyle = swatchFill(turned, terrain, true);
    turned.fillRect(field.origin, field.origin, field.extent, field.extent);
    turned.resetTransform();
    paint.drawImage(variation, 0, 0);
    const mask = masks[terrain];
    if (mask) {
      paint.globalCompositeOperation = 'destination-in';
      paint.drawImage(mask, 0, 0, layer.width, layer.height);
      paint.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(layer, 0, 0);
  }
  const relief = photographed?.surface ?? surfaceHeight(canvas, 1536);
  const height = relief.getContext('2d')!;
  const reliefScale = relief.width / field.extent;
  height.setTransform(reliefScale, 0, 0, reliefScale, -field.origin * reliefScale, -field.origin * reliefScale);
  ctx.setTransform(scale, 0, 0, scale, -field.origin * scale, -field.origin * scale);
  ctx.save();
  ctx.resetTransform();
  if (!photographed) ctx.drawImage(meadowTint(field), 0, 0, canvas.width, canvas.height);
  ctx.restore();
  paintRutLines(height);
  dressSoil(ctx, height, !!photographed);
  dressPaths(ctx, height);
  ctx.resetTransform();
  ctx.globalAlpha = photographed ? 0.48 : 1;
  ctx.globalCompositeOperation = 'soft-light';
  ctx.drawImage(tone, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(shade, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  ctx.setTransform(scale, 0, 0, scale, -field.origin * scale, -field.origin * scale);
  paintRutLines(ctx);
  // Contact shade is stable between cameras. The vehicle and actors can move, so only
  // permanent scenery receives it here. The renderer supplies their directional shadows.
  function shadeAt(x: number, y: number, rx: number, ry: number, alpha: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const blob = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    blob.addColorStop(0, 'rgba(37,26,16,' + alpha + ')');
    blob.addColorStop(0.5, 'rgba(43,32,20,' + alpha * 0.62 + ')');
    blob.addColorStop(1, 'rgba(43,32,20,0)');
    ctx.fillStyle = blob;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  for (const t of TREES) if (t.row < 2) shadeAt(t.gx, t.gy, 1.72, 1.47, 0.29);
  for (const prop of PROPS) {
    if (prop.kind === 'car') continue;
    const canopy = prop.kind === 'oak' || prop.kind === 'apple';
    shadeAt(prop.x + prop.w / 2, prop.y + prop.h / 2, canopy ? 1.85 : prop.w * 0.88, canopy ? 1.55 : prop.h * 0.85, 0.46);
  }
  for (const sign of [-1, 1]) {
    shadeAt(11 + sign * 1.96, 11, 0.92, 2.9, 0.49);
    shadeAt(11, 11 + sign * 1.96, 2.83, 0.93, 0.49);
  }
  ctx.resetTransform();
  // The wide day view can pan past the clearing. Continue both tracks across forest litter.
  const extent = field.extent + 52;
  const origin = (GRID_W - extent) / 2;
  const surround = document.createElement('canvas');
  surround.width = surround.height = photographed ? 1792 : 1280;
  const outer = surround.getContext('2d')!;
  const density = surround.width / extent;
  outer.setTransform(density, 0, 0, density, -origin * density, -origin * density);
  outer.fillStyle = scanPattern(outer, 'forest') ?? swatchFill(outer, 'forest');
  outer.fillRect(origin, origin, extent, extent);
  if (photographed) outerTracks(outer,origin+extent);
  else {
    outer.fillStyle = swatchFill(outer, 'path');
    outer.fillRect(TRACKS.gate.x0, GRID_H, TRACKS.gate.x1 - TRACKS.gate.x0, extent / 2);
    outer.fillStyle = swatchFill(outer, 'gravel');
    outer.fillRect(GRID_W, TRACKS.barn.y0, extent / 2, TRACKS.barn.y1 - TRACKS.barn.y0);
  }
  outer.fillStyle = photographed ? 'rgba(30,32,26,0.31)' : 'rgba(27,22,17,0.48)';
  outer.fillRect(origin, origin, extent, extent);
  // Feather the last rows into the surrounding forest, including the track shoulders.
  ctx.globalCompositeOperation = 'destination-out';
  for (const reversed of [false, true]) {
    const start = reversed ? canvas.width : 0;
    const end = reversed ? canvas.width - 80 : 80;
    for (const horizontal of [true, false]) {
      const fade = ctx.createLinearGradient(horizontal ? start : 0, horizontal ? 0 : start, horizontal ? end : 0, horizontal ? 0 : end);
      fade.addColorStop(0, '#000');
      fade.addColorStop(1, 'transparent');
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  // Red carries macro height. Green and blue select the fine grass and gravel:
  // packed earth supplies the rest, with a little grass fibre in the forest litter.
  const grain = new Uint8Array(photographed ? 0 : 256 * 256 * 4).fill(128);
  const packed = height.getImageData(0, 0, relief.width, relief.height);
  for (let y = 0; y < relief.height; y++) {
    const row = Math.floor(y * field.size / relief.height) * field.size;
    for (let x = 0; x < relief.width; x++) {
      const i = row + Math.floor(x * field.size / relief.width);
      const p = (y * relief.width + x) * 4;
      if (photographed) {
        // The ground is dielectric. Its unused blue channel locates the native
        // trail, turf and litter grain without another material-mask texture.
        const w = photographed.weights;
        packed.data[p + 2] = 128 + 127 * (w.gravel[i]! + w.path[i]! - w.forest[i]!);
        continue;
      }
      packed.data[p + 1] = 255 * (field.weights.grass[i]! + field.weights.forest[i]! * 0.35);
      packed.data[p + 2] = 255 * field.weights.gravel[i]!;
    }
  }
  height.putImageData(packed, 0, 0);
  if (photographed) return { clearing: canvas, relief, normal: photographed.normal, grain, clearingSize: field.extent, surround, surroundSize: extent };
  for (const [channel, terrain] of (['grass', 'gravel', 'path'] as const).entries()) {
    const tile = tileOf(terrain);
    if (!tile) continue;
    const fine = surfaceHeight(tile, 256);
    const pixels = fine.getContext('2d')!.getImageData(0, 0, fine.width, fine.height).data;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (Math.floor(y * fine.height / 256) * fine.width + Math.floor(x * fine.width / 256)) * 4;
      grain[(y * 256 + x) * 4 + channel] = pixels[i]!;
    }
  }
  return { clearing: canvas, relief, grain, clearingSize: field.extent, surround, surroundSize: extent };
}

/** Sets a context of the cache to grid coordinates for a side of the house. */
function toGrid(target: CanvasRenderingContext2D, rot: Rot): void {
  const s = GROUND_SCALE;
  target.setTransform((TW / 2) * s, (TH / 2) * s, (-TW / 2) * s, (TH / 2) * s, -GROUND_X0 * s, -GROUND_Y0 * s);
  if (rot === 1) {
    // The other side is the same lot turned half a circle.
    target.translate(GRID_W, GRID_H);
    target.scale(-1, -1);
  }
}

/** Cache pixel of a point given in view cells (the grid as that side of the house sees it). */
const cachePoint = (vx: number, vy: number): { x: number; y: number } => ({
  x: (((vx - vy) * TW) / 2 - GROUND_X0) * GROUND_SCALE,
  y: (((vx + vy) * TH) / 2 - GROUND_Y0) * GROUND_SCALE,
});

/**
 * Fills a polygon, given in cache pixels, as a blurred patch of shadow ink. The blur is the
 * canvas's own drop shadow of a shape drawn off the picture, which every browser has, unlike the
 * blur filter; it is paid once, when the ground is built.
 */
function softPolygon(ctx: CanvasRenderingContext2D, points: readonly { x: number; y: number }[], blur: number, alpha: number): void {
  const away = 20000;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.shadowColor = `rgba(${SHADOW_RGB}, ${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = away;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x - away, p.y) : ctx.lineTo(p.x - away, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Two wheel ruts along the gravel track, worn darker, running out under the trees. */
function paintRutLines(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const centre = (TRACKS.barn.y0 + TRACKS.barn.y1) / 2;
  for (const side of [-1, 1]) {
    for (const [width, alpha] of [
      [0.3, 0.1],
      [0.16, 0.16],
    ] as const) {
      ctx.beginPath();
      for (let x = 13.9; x <= GRID_W + MARGIN; x += 0.25) {
        const y = centre + side * 0.44 + (fbm(x * 0.6, side * 3.1, 91, 2) - 0.5) * 0.22;
        if (x === 13.9) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = width;
      ctx.strokeStyle = `rgba(58, 40, 24, ${alpha})`;
      ctx.stroke();
    }
  }
}

function buildGround(rot: Rot): HTMLCanvasElement {
  const { field, masks, blend, tone, shade } = fieldPictures();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(GROUND_W * GROUND_SCALE);
  canvas.height = Math.round(GROUND_H * GROUND_SCALE);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const { width, height } = canvas;
  const span = [field.origin, field.origin, field.extent, field.extent] as const;

  // Two scratch layers, shared by every terrain: one terrain being laid, and whatever is cut out for it.
  const scratch = (): CanvasRenderingContext2D => {
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = width;
    layerCanvas.height = height;
    const layerCtx = layerCanvas.getContext('2d') as CanvasRenderingContext2D;
    // The swatches are laid smaller than they were painted, and squashed by the projection on top of that.
    layerCtx.imageSmoothingQuality = 'high';
    return layerCtx;
  };
  const lay = scratch();
  const cut = scratch();
  const wipe = (target: CanvasRenderingContext2D): void => {
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalCompositeOperation = 'source-over';
    target.globalAlpha = 1;
    target.clearRect(0, 0, width, height);
  };

  for (const terrain of GROUND_TERRAINS) {
    // 1. The swatch, laid flat on the ground plane…
    wipe(lay);
    toGrid(lay, rot);
    lay.fillStyle = swatchFill(lay, terrain);
    lay.fillRect(...span);

    // 2. …with a second lay of it showing through in patches, so the eye finds no repeat.
    if (tileOf(terrain)) {
      wipe(cut);
      toGrid(cut, rot);
      cut.fillStyle = swatchFill(cut, terrain, true);
      cut.fillRect(...span);
      cut.globalCompositeOperation = 'destination-in';
      cut.drawImage(blend, ...span);
      lay.setTransform(1, 0, 0, 1, 0, 0);
      lay.drawImage(cut.canvas, 0, 0);
    }

    // 3. Kept only where this terrain is, and set down with the lip its edge casts on what is under it.
    const mask = masks[terrain];
    if (mask) {
      toGrid(lay, rot);
      lay.globalCompositeOperation = 'destination-in';
      lay.drawImage(mask, ...span);
      const lip = SWATCHES[terrain].lip;
      if (lip > 0) {
        wipe(cut);
        toGrid(cut, rot);
        cut.drawImage(mask, ...span);
        cut.setTransform(1, 0, 0, 1, 0, 0);
        cut.globalCompositeOperation = 'source-in';
        cut.fillStyle = `rgb(${SHADOW_RGB})`;
        cut.fillRect(0, 0, width, height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = lip;
        ctx.drawImage(cut.canvas, 0, 2.6 * GROUND_SCALE);
        ctx.globalAlpha = 1;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lay.canvas, 0, 0);
  }

  toGrid(ctx, rot);
  paintRutLines(ctx);

  // The slow drift of light and colour, then the shade of the wood.
  toGrid(ctx, rot);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.46;
  ctx.drawImage(tone, ...span);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(shade, ...span);

  // The house: dark where it meets the ground, and its shadow thrown behind it to the right.
  const x0 = Math.min(viewX(rot, HOUSE.x0), viewX(rot, HOUSE.x1 + 1));
  const x1 = Math.max(viewX(rot, HOUSE.x0), viewX(rot, HOUSE.x1 + 1));
  const y0 = Math.min(viewY(rot, HOUSE.y0), viewY(rot, HOUSE.y1 + 1));
  const y1 = Math.max(viewY(rot, HOUSE.y0), viewY(rot, HOUSE.y1 + 1));
  const grow = 0.22;
  softPolygon(ctx, [cachePoint(x0 - grow, y0 - grow), cachePoint(x1 + grow, y0 - grow), cachePoint(x1 + grow, y1 + grow), cachePoint(x0 - grow, y1 + grow)], 16 * GROUND_SCALE, 0.5);
  const reach = 2.3;
  softPolygon(ctx, [cachePoint(x0 + 0.3, y0 - reach), cachePoint(x1 - 0.1, y0 - reach), cachePoint(x1, y0 + 0.4), cachePoint(x0, y0 + 0.4)], 11 * GROUND_SCALE, 0.34);

  // The cache ends in forest floor; its last cells fade out so the live ground beyond takes over unseen.
  toGrid(ctx, rot);
  ctx.globalCompositeOperation = 'destination-out';
  const far = field.origin + field.extent;
  const band = RIM;
  const edges: readonly (readonly [number, number, number, number, number, number, number, number])[] = [
    [field.origin, 0, field.origin + band, 0, field.origin, field.origin, band, field.extent],
    [far, 0, far - band, 0, far - band, field.origin, band, field.extent],
    [0, field.origin, 0, field.origin + band, field.origin, field.origin, field.extent, band],
    [0, far, 0, far - band, field.origin, far - band, field.extent, band],
  ];
  for (const [gx0, gy0, gx1, gy1, rx, ry, rw, rh] of edges) {
    const fade = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(rx, ry, rw, rh);
  }
  ctx.globalCompositeOperation = 'source-over';

  // What stands on it for good.
  if (dresser) {
    ctx.setTransform(GROUND_SCALE, 0, 0, GROUND_SCALE, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    dresser(ctx, bakingView(rot));
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // The scratch layers are as large as the ground itself: hand their memory back now.
  lay.canvas.width = 0;
  cut.canvas.width = 0;
  return canvas;
}

const groundCache: Partial<Record<Rot, HTMLCanvasElement>> = {};

function ground(rot: Rot): HTMLCanvasElement {
  let canvas = groundCache[rot];
  if (!canvas) {
    canvas = buildGround(rot);
    groundCache[rot] = canvas;
  }
  return canvas;
}

/** Paints both sides of the house ahead of time, so the first frame of a scene does not pay for it. */
export function prepareGround(): void {
  ground(0);
  ground(1);
}

// ───────────────────────────── Live ─────────────────────────────

/** Radius, in stage units at zoom 1, inside which the clearing is in full light. */
const CLEARING = 560;

/** Draws the ground for a view. The context is expected to be clipped to the view already. */
export function drawGround(ctx: CanvasRenderingContext2D, view: View): void {
  const z = view.zoom;
  const bounds = viewBounds(view);

  // Beyond the painted lot the forest floor simply goes on, wherever the view is panned to. A
  // camera trained on the house never sees that far, and does not pay for it.
  const low = -MARGIN + RIM;
  const high = Math.max(GRID_W, GRID_H) + MARGIN - RIM;
  if (bounds.x < low || bounds.y < low || bounds.x + bounds.w > high || bounds.y + bounds.h > high) {
    ctx.save();
    ctx.transform(...groundMatrix(view));
    ctx.fillStyle = swatchFill(ctx, 'forest');
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.restore();
    ctx.fillStyle = `rgba(${SHADOW_RGB}, ${SHADE_DEPTH})`;
    ctx.fillRect(view.x, view.y, view.w, view.h);
  }

  const c = world(view.rot, view.cx, view.cy);
  const gx0 = view.x + view.w / 2 + (GROUND_X0 - c.x) * z;
  const gy0 = view.y + view.h / 2 + (GROUND_Y0 - c.y) * z;
  ctx.drawImage(ground(view.rot), gx0, gy0, GROUND_W * z, GROUND_H * z);

  // The lot reads as a clearing: the further into the wood, the less light gets down.
  const centre = project(view, GRID_W / 2, GRID_H / 2);
  const reaches = (sx: number, sy: number): boolean => Math.hypot(sx - centre.x, (sy - centre.y) * 2) > CLEARING * z;
  if (!reaches(view.x, view.y) && !reaches(view.x + view.w, view.y) && !reaches(view.x, view.y + view.h) && !reaches(view.x + view.w, view.y + view.h)) return;
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.scale(1, 0.5);
  const dark = ctx.createRadialGradient(0, 0, CLEARING * z, 0, 0, 1700 * z);
  dark.addColorStop(0, 'rgba(14,10,6,0)');
  dark.addColorStop(0.3, 'rgba(14,10,6,0.14)');
  dark.addColorStop(0.58, 'rgba(12,8,5,0.5)');
  dark.addColorStop(1, 'rgba(8,6,4,0.9)');
  ctx.fillStyle = dark;
  ctx.fillRect(view.x - centre.x - 2, (view.y - centre.y) * 2 - 2, view.w + 4, view.h * 2 + 4);
  ctx.restore();
}

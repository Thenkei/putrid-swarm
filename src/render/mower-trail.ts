import { BOSS } from '../core/data/enemies';
import { idx, LANES } from '../core/map';
import type { Enemy, NightSim } from '../core/night';
import type { Cell, Decal } from '../core/types';
import { hash2, seeded, smoothstep, valueNoise } from './noise';
import { groundMatrix, project, type View } from './projection';
import { terrainField, weightAt, type TerrainField } from './terrainfield';

const TEXELS = 72;
const HALF_WIDTH = 0.64;
const laneTextures = new Map<readonly Cell[], { texture: HTMLCanvasElement; runs: Map<string, HTMLCanvasElement> }>();

function turfCover(field: TerrainField, x: number, y: number): number {
  // Fade into the same frayed grass borders that the yard paints around the dirt and gravel.
  return smoothstep(0.63, 0.91, weightAt(field, 'grass', x, y));
}

function laneGeometry(cells: readonly Cell[]) {
  const start = cells[0]!;
  const end = cells[cells.length - 1]!;
  const dx = Math.sign(end.x - start.x);
  const dy = Math.sign(end.y - start.y);
  return { dx, dy, x: start.x + 0.5 - dx * 0.5, y: start.y + 0.5 - dy * 0.5 };
}

/** One continuous ground-space painting per lane, shared by the feeds and the daylight yard. */
function laneTexture(cells: readonly Cell[]) {
  const cached = laneTextures.get(cells);
  if (cached) return cached;
  const texture = document.createElement('canvas');
  const w = texture.width = Math.ceil(HALF_WIDTH * 2 * TEXELS);
  const h = texture.height = cells.length * TEXELS;
  const ctx = texture.getContext('2d')!;
  const field = terrainField();
  const { x, y, dx, dy } = laneGeometry(cells);
  const random = seeded(2193 + idx(cells[0]!.x, cells[0]!.y));
  const grass = (cross: number, along: number) => turfCover(field, x + dy * cross + dx * along, y - dx * cross + dy * along);
  const image = ctx.createImageData(w, h);
  for (let row = 0; row < h; row++) {
    const along = (row + 0.5) / TEXELS;
    const centre = (valueNoise(1, along * 1.4, 93) - 0.5) * 0.075;
    for (let col = 0; col < w; col++) {
      const cross = ((col + 0.5) / w * 2 - 1) * HALF_WIDTH;
      const turf = grass(cross, along);
      if (turf === 0) continue;
      const offset = Math.abs(cross - centre);
      const fray = (valueNoise(cross * 19, along * 23, 718) - 0.5) * 0.11;
      const cut = 1 - smoothstep(0.32 + fray, 0.47 + fray, offset);
      const press = 1 - smoothstep(0.01, 0.06, Math.abs(offset - 0.26));
      const grain = (valueNoise(cross * 28, along * 12, 621) - 0.5) * 25 + random() * 9;
      const pixel = (row * w + col) * 4;
      image.data[pixel] = 149 + grain - press * 39;
      image.data[pixel + 1] = 149 + grain - press * 28;
      image.data[pixel + 2] = 70 + grain * 0.54 - press * 15;
      image.data[pixel + 3] = Math.round(155 * cut * turf);
    }
  }
  ctx.putImageData(image, 0, 0);

  // Short stubble and the small tufts flung to either shoulder, embedded in the ground texture.
  const cuttings = ['#c1b86d', '#d1c480', '#666735', '#808347'];
  ctx.lineCap = 'round';
  for (let i = 0; i < cells.length * 130; i++) {
    const along = random() * cells.length;
    const shoulder = i % 5 === 0;
    const cross = shoulder ? (0.34 + 0.21 * random()) * (i % 2 ? 1 : -1) : (random() - 0.5) * 0.79;
    const turf = grass(cross, along);
    if (turf === 0) continue;
    const px = (cross / HALF_WIDTH + 1) * w * 0.5;
    const py = along * TEXELS;
    ctx.globalAlpha = turf * (0.17 + random() * 0.37);
    ctx.strokeStyle = cuttings[i % cuttings.length]!;
    ctx.lineWidth = 0.66 + random() * 0.72;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + (random() - 0.45) * (shoulder ? 6 : 3), py - 1.1 - random() * 4.3);
    ctx.stroke();
  }
  const paint = { texture, runs: new Map<string, HTMLCanvasElement>() };
  laneTextures.set(cells, paint);
  return paint;
}

function runTexture(cells: readonly Cell[], start: number, end: number): HTMLCanvasElement {
  const { texture, runs } = laneTexture(cells);
  const key = `${start}:${end}`;
  const cached = runs.get(key);
  if (cached) return cached;
  const run = document.createElement('canvas');
  const width = run.width = texture.width;
  const height = run.height = (end - start) * TEXELS;
  const ctx = run.getContext('2d')!;
  ctx.drawImage(texture, 0, start * TEXELS, width, height, 0, 0, width, height);
  // Only the ends of a pass fade. Every interior tile shares the same uninterrupted grain.
  const fade = 0.24 / (end - start);
  const cap = ctx.createLinearGradient(0, 0, 0, height);
  cap.addColorStop(0, 'transparent');
  cap.addColorStop(fade, '#000');
  cap.addColorStop(1 - fade, '#000');
  cap.addColorStop(1, 'transparent');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = cap;
  ctx.fillRect(0, 0, width, height);
  runs.set(key, run);
  return run;
}

/** Draw only recorded passes. Gaps from interrupted charges stay untouched, including in old saves. */
export function drawMowerTrails(ctx: CanvasRenderingContext2D, view: View, decals: readonly Decal[]): void {
  if (!decals.some(decal => decal.kind === 'mown')) return;
  const mown = new Set<number>();
  for (const decal of decals) if (decal.kind === 'mown') mown.add(idx(decal.x, decal.y));
  const hasCut = (cell: Cell) => mown.has(idx(cell.x, cell.y));
  ctx.save();
  ctx.transform(...groundMatrix(view));
  for (const cells of Object.values(LANES)) {
    if (!cells.some(hasCut)) continue;
    const { x, y, dx, dy } = laneGeometry(cells);
    ctx.save();
    ctx.transform(dy, -dx, dx, dy, x, y);
    for (let start = 0; start < cells.length; start++) {
      if (!hasCut(cells[start]!)) continue;
      let end = start + 1;
      while (end < cells.length && hasCut(cells[end]!)) end++;
      ctx.drawImage(runTexture(cells, start, end), -HALF_WIDTH, start, HALF_WIDTH * 2, end - start);
      start = end - 1;
    }
    ctx.restore();
  }
  ctx.restore();
}

type MowerLane = ReturnType<NightSim['telegraphedLanes']>[number];

/** The warning stays in front of the mower once it moves, leaving its wake visible. */
export function drawMowerWarning(ctx: CanvasRenderingContext2D, view: View, lane: MowerLane, time: number, reduced: boolean, mower?: Enemy): void {
  const { cells, seconds } = lane;
  const { x, y, dx, dy } = laneGeometry(cells);
  const from = seconds > 0 || !mower ? 0.5 : (mower.x - x) * dx + (mower.y - y) * dy + 0.42;
  const to = cells.length - 0.5;
  if (to <= from) return;
  const z = view.zoom;
  const pulse = reduced ? 0.72 : 0.67 + 0.15 * Math.sin(time * 6);
  ctx.save();
  ctx.globalAlpha *= seconds > 0 ? pulse : 0.48;
  ctx.lineCap = 'round';
  const at = (cross: number, along: number) => project(view, x + dy * cross + dx * along, y - dx * cross + dy * along);
  ctx.beginPath();
  for (const cross of [-0.4, 0.4]) {
    const start = at(cross, from), end = at(cross, to);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  }
  ctx.setLineDash([6 * z, 5 * z]);
  ctx.lineWidth = 3.5 * z;
  ctx.strokeStyle = '#52301d';
  ctx.stroke();
  ctx.lineWidth = 1.7 * z;
  ctx.strokeStyle = '#ffc26d';
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let step = Math.ceil(from - 0.5) + 0.5; step + 0.21 < to; step += 1) {
    const left = at(-0.17, step), tip = at(0, step + 0.21), right = at(0.17, step);
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(right.x, right.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Grass flung clear of the reel. Flight is driven by the charge clock, so all feeds agree. */
export function drawMowerClippings(ctx: CanvasRenderingContext2D, view: View, mower: Enemy): void {
  const { fx, fy, actionSeconds } = mower;
  const field = terrainField();
  const speed = BOSS.mower.chargeSpeed * (mower.lit ? 0.8 : 1);
  const rate = 38;
  const last = Math.floor(actionSeconds * rate);
  ctx.save();
  const opacity = ctx.globalAlpha;
  ctx.lineCap = 'round';
  for (let i = Math.max(0, last - 13); i <= last; i++) {
    const age = actionSeconds - i / rate;
    const t = age / 0.36;
    const offset = 0.10 + speed * age;
    const sourceX = mower.x - fx * offset;
    const sourceY = mower.y - fy * offset;
    const spread = hash2(i, mower.id, 63);
    const side = (i % 2 ? 1 : -1) * (0.19 + spread * (0.18 + t * 0.47));
    const turf = turfCover(field, sourceX + fy * side * 0.6, sourceY - fx * side * 0.6);
    if (turf === 0 || t >= 1) continue;
    const p = project(view, sourceX + fy * side, sourceY - fx * side);
    const lift = (3 + 4 * t * (1 - t) * (6 + spread * 11)) * view.zoom;
    ctx.globalAlpha = opacity * turf * smoothstep(0, 0.12, t) * (1 - smoothstep(0.38, 1, t)) * 0.78;
    ctx.strokeStyle = i % 3 ? '#c6bb73' : '#827f47';
    ctx.lineWidth = (0.8 + 0.55 * spread) * view.zoom;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - lift);
    ctx.lineTo(p.x + (spread - 0.45) * 6 * view.zoom, p.y - lift - 2 * view.zoom);
    ctx.stroke();
  }
  ctx.restore();
}

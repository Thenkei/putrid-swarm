// Light and air over a view that has just been drawn: the hour of the day, the night and its
// pools of lamplight, what a cheap camera does to the picture, and what drifts across the lot
// (cloud shadow by day, ground mist by night).
//
// Everything is a function of the time it is handed, never of a clock of its own: the four
// cameras show the same mist in the same place, and a paused night stands still.

import { periodicFbm, smoothstep, valueNoise } from './noise';
import { TW, groundMatrix, project, viewBounds, type View } from './projection';

export interface Light {
  readonly gx: number;
  readonly gy: number;
  /** Radius on the ground, in cells. */
  readonly radius: number;
  readonly color: string;
  /** 0..1: how much light the source emits at this instant. */
  readonly intensity?: number;
  /** Screen-space lift, for lights that hang above the ground (lanterns). */
  readonly lift?: number;
  /** Screen-space shift to the right, in stage units at zoom 1, for lamps fixed to a sprite. */
  readonly dx?: number;
  /** 0..1: how much the light wavers, as a flame behind glass does. */
  readonly flicker?: number;
  /** 0..1: a source one can see (a window, a lamp): it gets a small halo over the finished picture. */
  readonly glow?: number;
  /** Fraction of daylight spent where the source begins to glow and reaches full output. */
  readonly twilight?: readonly [start: number, full: number];
  /** Hangs in the air instead of lying on the ground: drawn round, not flattened into a pool. */
  readonly round?: boolean;
}

let motionQuery: MediaQueryList | null | undefined;

/** True when the player asked their system for less motion: what only decorates then holds still. */
export function calmMotion(): boolean {
  // Asked once: the list stays live, so a change of the setting is seen without asking again.
  if (motionQuery === undefined) motionQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  return motionQuery?.matches === true;
}

/** 0..1, wandering smoothly: how bright a flame is at a given moment. Each `seed` wanders on its own. */
const waver = (time: number, seed: number): number => valueNoise(time * 5.5, seed * 7.31, 5) * 0.65 + valueNoise(time * 13, seed * 3.17, 6) * 0.35;

function lightPoint(view: View, light: Light): { x: number; y: number } {
  const p = project(view, light.gx, light.gy);
  return { x: p.x + (light.dx ?? 0) * view.zoom, y: p.y - (light.lift ?? 0) * view.zoom };
}

// ───────────────────────────── Night ─────────────────────────────

// The desk alternates between the main monitor and a thumbnail every frame. Each size keeps
// its backing store so switching feeds doesn't clear and reallocate the other monitor's surface.
const lightMaps = new Map<string, HTMLCanvasElement>();

/** Multiplies a light map over a view that has just been drawn: blue night, warm pools of light, then the lamps themselves. */
export function applyNight(ctx: CanvasRenderingContext2D, view: View, lights: readonly Light[], time = 0): void {
  const scale = 0.5;
  const w = Math.ceil(view.w * scale);
  const h = Math.ceil(view.h * scale);
  const key = `${w}x${h}`;
  let lightCanvas = lightMaps.get(key);
  if (!lightCanvas) {
    lightCanvas = document.createElement('canvas');
    lightCanvas.width = w;
    lightCanvas.height = h;
    lightMaps.set(key, lightCanvas);
  }
  const lctx = lightCanvas.getContext('2d') as CanvasRenderingContext2D;
  lctx.globalCompositeOperation = 'source-over';
  lctx.globalAlpha = 1;
  // What little light the sky gives comes from one side.
  const sky = lctx.createLinearGradient(0, 0, w, h);
  sky.addColorStop(0, '#a7bbd1');
  sky.addColorStop(0.58, '#8ba3bd');
  sky.addColorStop(1, '#738aaa');
  lctx.fillStyle = sky;
  lctx.fillRect(0, 0, w, h);
  lctx.globalCompositeOperation = 'lighter';
  const still = calmMotion();
  for (const light of lights) {
    const p = lightPoint(view, light);
    const x = (p.x - view.x) * scale;
    const y = (p.y - view.y) * scale;
    const dip = light.flicker && !still ? light.flicker * waver(time, light.gx * 3.1 + light.gy * 5.7 + (light.dx ?? 0)) : 0;
    const rx = light.radius * Math.SQRT2 * (TW / 2) * view.zoom * scale * (1 - dip * 0.12);
    if (x < -rx || y < -rx || x > w + rx || y > h + rx) continue;
    lctx.save();
    lctx.globalAlpha = (light.intensity ?? 1) * (1 - dip * 0.45);
    lctx.translate(x, y);
    lctx.scale(1, light.round ? 0.9 : 0.62);
    const gradient = lctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    gradient.addColorStop(0, light.color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = gradient;
    lctx.beginPath();
    lctx.arc(0, 0, rx, 0, Math.PI * 2);
    lctx.fill();
    lctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(lightCanvas, view.x, view.y, view.w, view.h);
  drawGlows(ctx, view, lights, time);
  ctx.restore();
}

/** The lamps themselves: a small bright halo on each visible source, added over the picture. */
const DEFAULT_TWILIGHT = [0.55, 0.95] as const;

function drawGlows(ctx: CanvasRenderingContext2D, view: View, lights: readonly Light[], time: number, dusk?: number): void {
  const still = calmMotion();
  ctx.globalCompositeOperation = 'lighter';
  for (const light of lights) {
    if (!light.glow) continue;
    const strength = dusk === undefined ? 1 : smoothstep(...(light.twilight ?? DEFAULT_TWILIGHT), dusk);
    if (strength <= 0) continue;
    const p = lightPoint(view, light);
    const dip = light.flicker && !still ? light.flicker * waver(time, light.gx * 3.1 + light.gy * 5.7 + (light.dx ?? 0)) : 0;
    const r = (9 + 26 * light.glow) * view.zoom;
    if (p.x < view.x - r || p.y < view.y - r || p.x > view.x + view.w + r || p.y > view.y + view.h + r) continue;
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    const peak = (0.2 + 0.36 * light.glow) * strength * (light.intensity ?? 1) * (1 - dip * 0.5);
    halo.addColorStop(0, `rgba(255, 214, 150, ${peak})`);
    halo.addColorStop(0.4, `rgba(255, 170, 90, ${peak * 0.38})`);
    halo.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ───────────────────────────── Day ─────────────────────────────

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The color of the outdoor light, shared by the yard and illustrations drawn in daylight. */
export function applyDayGrade(ctx: CanvasRenderingContext2D, frame: Pick<View, 'x' | 'y' | 'w' | 'h'>, dusk: number): void {
  paintDayGrade(ctx, frame, dusk, smoothstep(0.88, 1, dusk));
}

function paintDayGrade(ctx: CanvasRenderingContext2D, frame: Pick<View, 'x' | 'y' | 'w' | 'h'>, dusk: number, blue: number): void {
  ctx.save();
  // The colour of the light, multiplied in: white at noon, amber late, slate at the very end.
  const gold = smoothstep(0.3, 0.86, dusk);
  const r = mix(mix(255, 255, gold), 164, blue);
  const g = mix(mix(251, 204, gold), 152, blue);
  const b = mix(mix(243, 150, gold), 190, blue);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  ctx.fillRect(frame.x, frame.y, frame.w, frame.h);

  // A low sun rakes in from the upper left.
  const sun = gold * (1 - blue);
  if (sun > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const rake = ctx.createLinearGradient(frame.x, frame.y, frame.x + frame.w * 0.75, frame.y + frame.h);
    rake.addColorStop(0, `rgba(255, 150, 60, ${0.2 * sun})`);
    rake.addColorStop(0.55, `rgba(255, 120, 50, ${0.05 * sun})`);
    rake.addColorStop(1, 'rgba(255, 110, 40, 0)');
    ctx.fillStyle = rake;
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
  }
  ctx.restore();
}

/**
 * The hour of the day over the yard. `dusk` runs from 0 (morning) to 1 (the last of the light):
 * the picture warms through the afternoon, goes gold, then blue, and the lamps of the house
 * come on before it is dark.
 */
export function applyDaylight(ctx: CanvasRenderingContext2D, view: View, dusk: number, lamps: readonly Light[], time = 0): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();

  const blue = smoothstep(0.88, 1, dusk);
  paintDayGrade(ctx, view, dusk, blue);
  drawGlows(ctx, view, lamps, time, dusk);

  // The corners fall off a little, as they do through any lens.
  ctx.globalCompositeOperation = 'source-over';
  const vignette = ctx.createRadialGradient(view.x + view.w / 2, view.y + view.h / 2, view.h * 0.45, view.x + view.w / 2, view.y + view.h / 2, view.w * 0.74);
  vignette.addColorStop(0, 'rgba(20, 12, 6, 0)');
  vignette.addColorStop(1, `rgba(20, 12, 6, ${0.2 + 0.12 * blue})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.restore();
}

// ───────────────────────────── What drifts across the lot ─────────────────────────────

const DRIFT_SIZE = 160;
const drifts = new Map<string, CanvasPattern | null>();

/**
 * A repeating picture of soft patches in one colour, to lay on the ground plane and slide along.
 * `cover` is how much of it is patch rather than gap.
 */
function driftPattern(ctx: CanvasRenderingContext2D, rgb: string, seed: number, cover: number): CanvasPattern | null {
  const id = `${rgb}:${seed}:${cover}`;
  const known = drifts.get(id);
  if (known !== undefined) return known;
  const canvas = document.createElement('canvas');
  canvas.width = DRIFT_SIZE;
  canvas.height = DRIFT_SIZE;
  const dctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const [red = 0, green = 0, blue = 0] = rgb.split(',').map(Number);
  const image = dctx.createImageData(DRIFT_SIZE, DRIFT_SIZE);
  const period = 4;
  for (let y = 0; y < DRIFT_SIZE; y++) {
    for (let x = 0; x < DRIFT_SIZE; x++) {
      const n = periodicFbm((x / DRIFT_SIZE) * period, (y / DRIFT_SIZE) * period, period, seed, 4);
      const o = (y * DRIFT_SIZE + x) * 4;
      image.data[o] = red;
      image.data[o + 1] = green;
      image.data[o + 2] = blue;
      image.data[o + 3] = Math.round(smoothstep(1 - cover - 0.14, 1 - cover + 0.2, n) * 255);
    }
  }
  dctx.putImageData(image, 0, 0);
  const pattern = ctx.createPattern(canvas, 'repeat');
  drifts.set(id, pattern);
  return pattern;
}

/** Lays a drift pattern on the ground plane of a view: one tile every `cells` cells, slid by (ox, oy) cells. */
function layDrift(ctx: CanvasRenderingContext2D, view: View, pattern: CanvasPattern, cells: number, ox: number, oy: number, alpha: number): void {
  const bounds = viewBounds(view);
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();
  ctx.transform(...groundMatrix(view));
  pattern.setTransform(new DOMMatrix().translate(ox, oy).scale(cells / DRIFT_SIZE));
  ctx.fillStyle = pattern;
  ctx.globalAlpha *= alpha;
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.restore();
}

/** By day: the shadow of clouds sliding over the lot, slow enough to be felt more than seen. */
export function drawCloudShadows(ctx: CanvasRenderingContext2D, view: View, time: number): void {
  const pattern = driftPattern(ctx, '26, 22, 34', 311, 0.42);
  if (!pattern) return;
  const t = calmMotion() ? 0 : time;
  layDrift(ctx, view, pattern, 30, t * 0.42, t * -0.16, 0.15);
}

/** By night: mist lying on the ground, in two sheets that slide at different speeds. */
export function drawMist(ctx: CanvasRenderingContext2D, view: View, time: number): void {
  const pattern = driftPattern(ctx, '196, 214, 226', 127, 0.5);
  if (!pattern) return;
  const t = calmMotion() ? 0 : time;
  layDrift(ctx, view, pattern, 19, t * 0.22, t * 0.09, 0.13);
  layDrift(ctx, view, pattern, 11, 5.3 - t * 0.13, 2.1 + t * 0.2, 0.07);
}

// ───────────────────────────── CCTV ─────────────────────────────

let scanlines: CanvasPattern | null = null;
let grain: CanvasPattern | null = null;

function grainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grain) return grain;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const gctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = gctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const light = Math.random() < 0.5 ? 255 : 0;
    image.data[i * 4] = light;
    image.data[i * 4 + 1] = light;
    image.data[i * 4 + 2] = light;
    image.data[i * 4 + 3] = Math.random() * Math.random() * 150;
  }
  gctx.putImageData(image, 0, 0);
  grain = ctx.createPattern(canvas, 'repeat');
  return grain;
}

/** Sensor grain, scanlines, a little roll and a vignette over the graded night feed. */
export function applyCctv(ctx: CanvasRenderingContext2D, view: Pick<View, 'x' | 'y' | 'w' | 'h'>, time: number, strength = 1): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();

  // Sample the sensor at 12 Hz, independently of display refresh and how often a feed is drawn.
  const exposure = calmMotion() ? 0 : Math.floor(time * 12);
  const noise = grainPattern(ctx);
  if (noise) {
    noise.setTransform(new DOMMatrix().translate((exposure * 47) % 128, (exposure * 71) % 128));
    ctx.fillStyle = noise;
    ctx.globalAlpha = 0.075 * strength;
    ctx.fillRect(view.x, view.y, view.w, view.h);
    ctx.globalAlpha = 1;
  }

  if (!scanlines) {
    const tile = document.createElement('canvas');
    tile.width = 4;
    tile.height = 3;
    const tctx = tile.getContext('2d') as CanvasRenderingContext2D;
    tctx.fillStyle = 'rgba(4,12,18,0.1)';
    tctx.fillRect(0, 2, 4, 1);
    scanlines = ctx.createPattern(tile, 'repeat');
  }
  if (scanlines) {
    ctx.fillStyle = scanlines;
    ctx.globalAlpha = strength;
    ctx.fillRect(view.x, view.y, view.w, view.h);
    ctx.globalAlpha = 1;
  }

  // A slow bright band rolling down the tube.
  const band = view.y + (((calmMotion() ? 0 : time) * 46) % (view.h + 120)) - 60;
  const roll = ctx.createLinearGradient(0, band - 40, 0, band + 40);
  roll.addColorStop(0, 'rgba(255,255,255,0)');
  roll.addColorStop(0.5, `rgba(255,255,255,${0.045 * strength})`);
  roll.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = roll;
  ctx.fillRect(view.x, band - 40, view.w, 80);

  const vignette = ctx.createRadialGradient(view.x + view.w / 2, view.y + view.h / 2, view.h * 0.35, view.x + view.w / 2, view.y + view.h / 2, view.w * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(4,10,16,${0.37 * strength})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.restore();
}

/** One roll as the monitor locks onto the new feed. The picture underneath is already live. */
export function drawRetune(ctx: CanvasRenderingContext2D, view: Pick<View, 'x' | 'y' | 'w' | 'h'>, age: number): void {
  const duration = 0.2;
  if (age < 0 || age >= duration || calmMotion()) return;
  const thickness = 58;
  const y = view.y - thickness + (view.h + thickness * 2) * age / duration;
  const top = Math.max(view.y, y - thickness);
  const bottom = Math.min(view.y + view.h, y + thickness);
  if (bottom <= top) return;
  const band = ctx.createLinearGradient(0, y - thickness, 0, y + thickness);
  band.addColorStop(0, 'transparent');
  band.addColorStop(0.47, 'rgba(7,15,20,0.42)');
  band.addColorStop(0.52, 'rgba(135,168,166,0.26)');
  band.addColorStop(0.61, 'rgba(7,15,20,0.36)');
  band.addColorStop(1, 'transparent');
  ctx.save();
  ctx.fillStyle = band;
  ctx.fillRect(view.x, top, view.w, bottom - top);
  ctx.restore();
}

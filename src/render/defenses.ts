import { BARRICADE, DEVICES } from '../core/data/devices';
import type { DeviceRuntimeState, NightSim } from '../core/night';
import { SECTOR_IDS, type DeviceTypeId, type Facing, type SectorId } from '../core/types';
import { sprite, type Sprite } from '../engine/assets';
import { calmMotion } from './lighting';
import type { Rot } from './projection';
import type { Foot } from './registration';
import { castShadow, castSilhouette, SHADOW_RGB } from './shadows';

type Kind = DeviceTypeId | 'barricade';
type Pose = 'resting' | 'armed' | 'triggered' | 'broken';

export interface DefenseArt { key: string; h: number; lift: number; foot: Foot; flip: boolean; rear?: boolean }

// Fixed mounting points of both paintings: midline between fence posts, midpoint of the
// anchored frame, centre of the trolley wheels and planted base of the floodlight pole.
const fittings: Record<DeviceTypeId | 'flat' | 'deep', readonly [height: number, front: Foot, rear: Foot]> = {
  fence: [42, [0.5, 0.84], [0.5, 0.84]], flat: [40, [0.5, 0.958], [0.5, 0.953]], deep: [60, [0.5, 0.74], [0.5, 0.74]],
  spikes: [50, [0.51, 0.576], [0.53, 0.62]], log: [74, [0.484, 0.833], [0.50, 0.83]],
  net: [64, [0.51, 0.881], [0.567, 0.855]], barrier: [54, [0.50, 0.82], [0.51, 0.82]],
  horn: [54, [0.438, 0.83], [0.593, 0.818]], floodlight: [78, [0.584, 0.963], [0.573, 0.965]],
};

export function deviceArt(type: DeviceTypeId, facing: Facing | undefined, pose: Pose, rot: Rot): DefenseArt {
  // Turning the camera through 180° keeps the slope of a fence line. It swaps ends and
  // exposes the opposite side of the apparatus; only changing the installed axis mirrors it.
  const angle = type === 'fence' && facing === 2 ? 'flat' : type === 'fence' && facing === 3 ? 'deep' : type;
  const [h, front, back] = fittings[angle];
  const foot = rot === 0 ? front : back;
  let key = `dev_${rot === 1 ? 'back_' : ''}${type}_${pose}`;
  if (angle === 'flat' || angle === 'deep') {
    const suffix = pose === 'broken' ? '_broken' : pose === 'triggered' ? '_hurt' : '';
    const backPose = angle === 'deep' && pose === 'armed' ? 'resting' : pose;
    key = rot === 1 ? `dev_back_${angle}_${backPose}` : `fence_diag_${angle}${suffix}`;
  }
  return { key, h, lift: (1 - foot[1]) * h, foot, flip: facing === 1, rear: rot === 1 };
}

export function devicePose(d: { type: DeviceTypeId; state: DeviceRuntimeState | 'idle'; hpRatio: number }): Pose {
  if (d.state === 'broken') return 'broken';
  if ((d.type === 'fence' && d.hpRatio <= 0.5) || d.state === 'active') return 'triggered';
  return d.state === 'armed' ? 'armed' : 'resting';
}

/** Bulb on the exposed face, and the light escaping past the housing on the reverse face. */
export function floodlightEmitter(facing: Facing | undefined, rot: Rot): { dx: number; lift: number } {
  const art = deviceArt('floodlight', facing, 'triggered', rot);
  const paint = sprite(art.key);
  const width = art.h * (paint ? paint.w / paint.h : 0.83);
  const [x, y] = rot === 0 ? [0.365, 0.25] as const : [0.89, 0.155] as const;
  return { dx: (x - art.foot[0]) * width * (art.flip ? -1 : 1), lift: (art.foot[1] - y) * art.h };
}

export function doorPose(ratio: number, level: 0 | 1): Pose {
  return ratio <= 0 ? 'broken' : ratio <= 0.5 ? 'triggered' : level === 1 ? 'armed' : 'resting';
}

interface Wear {
  hp: number;
  pose: Pose;
  hitAt: number;
  brokeAt: number;
  beforeBreak: Pose;
  beforeBreakHp: number;
  state: DeviceRuntimeState | 'idle';
  timer: number;
  beforeState: DeviceRuntimeState | 'idle';
  beforeTimer: number;
  strikes: number;
}

/** Sample the authoritative lot once after stepping. Looking through another camera never restarts a hit. */
export class DefenseMotion {
  private readonly wear = new Map<number | SectorId, Wear>();
  private time = 0;

  update(sim: Pick<NightSim, 'time' | 'devices' | 'barricades'>): void {
    this.time = sim.time;
    for (const d of sim.devices) this.sample(d.id, d.hp, devicePose({ type: d.type, state: d.state, hpRatio: d.hp / DEVICES[d.type].maxHp }), d.state, d.timer);
    for (const sector of SECTOR_IDS) {
      const b = sim.barricades[sector];
      this.sample(sector, b.hp, doorPose(b.hp / BARRICADE.maxHp[b.level], b.level), 'idle', 0);
    }
  }

  private sample(id: number | SectorId, hp: number, pose: Pose, state: DeviceRuntimeState | 'idle', timer: number): void {
    const w = this.wear.get(id);
    if (!w) {
      this.wear.set(id, { hp, pose, state, timer, hitAt: -Infinity, brokeAt: -Infinity, beforeBreak: pose, beforeBreakHp: hp, beforeState: state, beforeTimer: timer, strikes: 0 });
      return;
    }
    // Bites can deal damage on every fixed tick. Let each recoil settle before the next.
    if (hp < w.hp && (this.time - w.hitAt > 0.36 || hp === 0)) {
      w.hitAt = this.time;
      w.strikes++;
      if (hp === 0) {
        w.brokeAt = this.time;
        w.beforeBreak = w.pose;
        w.beforeBreakHp = w.hp;
        w.beforeState = w.state;
        w.beforeTimer = w.timer;
      }
    }
    w.hp = hp;
    w.pose = pose;
    w.state = state;
    w.timer = timer;
  }

  at(id: number | SectorId): Readonly<Wear> | undefined {
    return this.wear.get(id);
  }
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
const metal = (type: Kind) => type === 'floodlight' || type === 'horn';

/** The hand-painted states use different arrangements within their sheet cells. Register the fixed foot. */
const firedShift: Partial<Record<DeviceTypeId, readonly [number, number]>> = {
  log: [-8, 7], net: [-14, 11], barrier: [-11, 10], spikes: [-15, 8], horn: [-5, 1],
};

// The marks are local to a load-bearing part of each painting (coordinates on a 200 square).
const scars: Record<Kind, readonly [number, number]> = {
  fence: [89, 87], spikes: [91, 113], barrier: [85, 111], net: [32, 125],
  log: [132, 80], horn: [107, 103], floodlight: [119, 101], barricade: [93, 119],
};
const rearScars: Partial<typeof scars> = {
  spikes: [76, 125], barrier: [101, 126], net: [161, 113],
  log: [140, 87], horn: [99, 98], floodlight: [116, 105],
};

const worn = new Map<string, CanvasImageSource>();

function finish(art: Sprite, key: string, type: Kind, ratio: number): CanvasImageSource {
  const level = ratio <= 0.32 ? 2 : ratio <= 0.64 ? 1 : 0;
  if (!level || key.endsWith('broken')) return art.img;
  const cacheKey = `${key}:${level}`;
  const cached = worn.get(cacheKey);
  if (cached) return cached;
  const surface = document.createElement('canvas');
  surface.width = art.w;
  surface.height = art.h;
  const c = surface.getContext('2d');
  if (!c) return art.img;
  c.drawImage(art.img, 0, 0);
  c.scale(art.w / 200, art.h / 200);
  c.globalCompositeOperation = 'source-atop';
  const [x, y] = (key.startsWith('dev_back_') && rearScars[type]) || scars[type];
  const grime = c.createRadialGradient(x, y, 4, x, y, 55 + 15 * level);
  grime.addColorStop(0, `rgba(39,29,24,${0.16 + 0.12 * level})`);
  grime.addColorStop(1, 'rgba(39,29,24,0)');
  c.fillStyle = grime;
  c.fillRect(0, 0, 200, 200);
  for (let i = 0; i <= level; i++) {
    c.save();
    c.translate(x + (i - 1) * 7, y + i * 9);
    c.rotate(type === 'barricade' || type === 'barrier' || type === 'spikes' ? -1.2 : 0.08);
    c.fillStyle = metal(type) ? '#a7aaa1' : '#d5ad76';
    c.beginPath(); c.moveTo(0, -12); c.lineTo(4, -2); c.lineTo(1, 3); c.lineTo(3, 10); c.lineTo(-1, 2); c.closePath(); c.fill();
    c.fillStyle = '#3c2c23';
    c.beginPath(); c.moveTo(0, -12); c.lineTo(2.1, -1); c.lineTo(-0.8, 3); c.lineTo(3, 10); c.lineTo(-3, 2); c.closePath(); c.fill();
    c.restore();
  }
  worn.set(cacheKey, surface);
  return surface;
}

// Moving parts traced on the firing paintings. Their fixed frame is prepared once at native resolution.
const movingParts: Partial<Record<Kind, readonly number[]>> = {
  spikes: [0,0, 200,0, 200,76, 142,116, 58,93, 0,99],
  barrier: [39,147, 39,16, 120,0, 164,0, 167,131, 59,155],
  net: [53,76, 60,82, 70,123, 78,139, 108,125, 132,115, 139,52, 146,53, 143,110, 145,121, 155,136, 165,144, 185,151, 200,151, 200,179, 105,197, 39,192, 43,172, 60,166, 61,142, 61,122],
};
const backParts: Partial<typeof movingParts> = {
  spikes: [13,0, 167,0, 174,74, 165,98, 130,147, 117,158, 29,125, 21,114],
  barrier: [19,128, 19,0, 153,0, 157,80, 175,143, 44,166, 29,158],
  net: [72,88, 79,90, 126,105, 141,101, 161,53, 165,52, 160,66, 154,83, 148,108,
    149,121, 150,161, 83,174, 82,147, 73,144],
};
const backNetLeft = [0,123, 44,122, 46,144, 38,148, 38,170, 0,170];

function trace(ctx: CanvasRenderingContext2D, points: readonly number[], append = false): void {
  if (!append) ctx.beginPath();
  ctx.moveTo(points[0]!, points[1]!);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i]!, points[i + 1]!);
  ctx.closePath();
}

interface Layers { base: HTMLCanvasElement; moving: HTMLCanvasElement }
const layers = new WeakMap<CanvasImageSource, Layers>();

function cut(art: Sprite, image: CanvasImageSource, outline: readonly number[], extra?: readonly number[]): Layers | null {
  const cached = layers.get(image);
  if (cached) return cached;
  const pair = { base: document.createElement('canvas'), moving: document.createElement('canvas') };
  for (const [key, c] of Object.entries(pair)) {
    c.width = art.w; c.height = art.h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    ctx.scale(art.w / 200, art.h / 200);
    ctx.globalCompositeOperation = key === 'base' ? 'destination-out' : 'destination-in';
    trace(ctx, outline);
    if (extra) trace(ctx, extra, true);
    ctx.fill();
  }
  layers.set(image, pair);
  return pair;
}

// The load and lashings move independently of the gallows. Copy the back timbers from the
// relaxed painting in the area the raised log used to cover.
const load = [37,51, 47,51, 60,55, 88,64, 117,75, 125,77, 124,98, 117,109, 104,108, 42,86, 33,79];
function drawLog(ctx: CanvasRenderingContext2D, ratio: number, release: number): boolean {
  const ready = sprite('dev_log_armed');
  const resting = sprite('dev_log_resting');
  if (!ready || !resting) return false;
  const layer = cut(ready, finish(ready, 'dev_log_armed', 'log', ratio), load);
  if (!layer) return false;
  ctx.save();
  trace(ctx, load); ctx.clip();
  // Only the back leg occupies this hole. The relaxed drawing also has two vertical ropes here.
  trace(ctx, [32,42, 45,40, 76,136, 59,142]); ctx.clip();
  ctx.drawImage(resting.img, -7, 0, 200, 200);
  ctx.restore();
  ctx.drawImage(layer.base, 0, 0, 200, 200);
  const dx = -17 * release;
  const dy = 56 * release;
  // Extension from the two knots; the original short upper lashings stay at their pivots.
  ctx.lineCap = 'round';
  for (const [color, width] of [['#392514', 4.3], ['#d1a35c', 2]] as const) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    ctx.moveTo(59, 55); ctx.lineTo(54 + dx, 63 + dy);
    ctx.moveTo(91, 69); ctx.lineTo(88 + dx, 75 + dy); ctx.stroke();
  }
  ctx.drawImage(layer.moving, dx, dy, 200, 200);
  return true;
}

// Looking through the far gallows, the near A-frame passes in front of the moving load.
// Its feet and the back winch remain stationary throughout the swing.
const backLoadHole = [47,51, 62,47, 70,44, 76,29, 89,32, 81,49, 97,54, 108,55,
  113,42, 125,45, 114,63, 140,72, 146,79, 142,105, 124,102, 48,76, 43,68];
const nearLeg = [104,188, 105,180, 112,175, 136,69, 152,68, 153,75, 130,178, 134,180, 133,188, 118,199];
interface BackRig { base: HTMLCanvasElement; foreground: HTMLCanvasElement }
const backRigs = new WeakMap<CanvasImageSource, BackRig>();
function backRig(ready: Sprite, resting: Sprite, image: CanvasImageSource): BackRig | undefined {
  const cached = backRigs.get(image);
  if (cached) return cached;
  const base = document.createElement('canvas'), foreground = document.createElement('canvas');
  for (const surface of [base, foreground]) { surface.width = ready.w; surface.height = ready.h; }
  const c = base.getContext('2d'), front = foreground.getContext('2d');
  if (!c || !front) return;
  c.scale(ready.w / 200, ready.h / 200); c.drawImage(image, 0, 0, 200, 200);
  c.save(); trace(c, backLoadHole); c.clip(); c.clearRect(0, 0, 200, 200);
  // Restore the leg where the hoisted load covered it using the unloaded part of the neutral painting.
  trace(c, [47,23, 58,23, 90,144, 73,144]); c.clip();
  c.drawImage(resting.img, 0, 0, 200, 200); c.restore();
  front.scale(ready.w / 200, ready.h / 200);
  trace(front, nearLeg);
  trace(front, [152,70, 160,72, 185,158, 190,156, 197,160, 197,168, 174,174, 170,164], true);
  front.clip(); front.drawImage(image, 0, 0, 200, 200);
  const result = { base, foreground };
  backRigs.set(image, result);
  return result;
}

function drawBackLog(ctx: CanvasRenderingContext2D, ratio: number, release: number): boolean {
  const ready = sprite('dev_back_log_armed'), resting = sprite('dev_back_log_resting'), trunkArt = sprite('dev_log_armed');
  if (!ready || !resting || !trunkArt) return false;
  const rig = backRig(ready, resting, finish(ready, 'dev_back_log_armed', 'log', ratio));
  const trunk = cut(trunkArt, finish(trunkArt, 'dev_log_armed', 'log', ratio), load);
  if (!rig || !trunk) return false;
  ctx.drawImage(rig.base, 0, 0, 200, 200);
  // Both cameras follow the same swing. In this view the trunk moves away and to the right.
  const x = 19 + 17 * release, y = -2 + 52 * release;
  ctx.lineCap = 'round';
  for (const [color, width] of [['#432b19', 4.6], ['#c69a58', 2]] as const) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    ctx.moveTo(85, 32); ctx.lineTo(x + 56, y + 62);
    ctx.moveTo(119, 45); ctx.lineTo(x + 91, y + 76); ctx.stroke();
  }
  ctx.drawImage(trunk.moving, x, y, 200, 200);
  ctx.drawImage(rig.foreground, 0, 0, 200, 200);
  return true;
}

function drawMechanism(ctx: CanvasRenderingContext2D, type: Kind, art: Sprite, image: CanvasImageSource, age: number, rear: boolean): void {
  const shift = rear || type === 'barricade' ? undefined : firedShift[type];
  if (shift) ctx.translate(...shift);
  const outline = (rear ? backParts : movingParts)[type];
  const backNet = rear && type === 'net';
  const pair = outline && age < 0.55 ? cut(art, image, outline, backNet ? backNetLeft : undefined) : null;
  if (pair) {
    if (!backNet) ctx.drawImage(pair.base, 0, 0, 200, 200);
    const t = clamp(age / (type === 'net' ? 0.45 : 0.29));
    const open = type === 'net' ? t * t : 1 - (1 - t) ** 3;
    const settle = Math.sin(t * Math.PI * 2) * Math.sin(Math.PI * t);
    ctx.save();
    if (type === 'net') {
      const anchor = rear ? 108 : 94;
      ctx.translate(anchor, 80);
      ctx.scale(0.8 + 0.2 * open, 0.4 + 0.6 * open);
      ctx.translate(-anchor, -80 - 16 * (1 - open));
    } else {
      const pivot = type === 'barrier' ? 150 : rear ? 139 : 95;
      ctx.translate(0, pivot);
      ctx.transform(1, 0, (rear ? 0.12 : -0.12) * (1 - open), 0.18 + open * 0.82 + 0.06 * settle, 0, 0);
      ctx.translate(0, -pivot);
    }
    ctx.drawImage(pair.moving, 0, 0, 200, 200);
    ctx.restore();
    if (backNet) {
      // The net drops onto the far side of the frame. Keep the near post in front.
      ctx.drawImage(pair.base, 0, 0, 200, 200);
    }
    return;
  }
  ctx.drawImage(image, 0, 0, 200, 200);
  if (type === 'horn') {
    const pulse = (age * 2.5) % 1;
    if (rear) { ctx.translate(201, -6); ctx.scale(-1, 1); }
    ctx.strokeStyle = `rgba(255,214,133,${0.72 * (1 - pulse)})`; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(155, 50, 15 + 28 * pulse, 9 + 24 * pulse, -0.18, -0.94, 1.02); ctx.stroke();
  }
  if (type === 'floodlight') {
    const x = rear ? 178 : 73, y = rear ? 31 : 50, radius = rear ? 20 : 48;
    const glow = ctx.createRadialGradient(x, y, 2, x, y, radius);
    glow.addColorStop(0, rear ? 'rgba(255,237,174,0.26)' : 'rgba(255,248,203,0.62)');
    glow.addColorStop(0.4, 'rgba(255,211,123,0.18)'); glow.addColorStop(1, 'rgba(255,200,125,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

const fragments = [
  [0,0, 67,0, 58,79, 70,98, 54,200, 0,200],
  [67,0, 140,0, 131,93, 70,98, 58,79],
  [70,98, 131,93, 150,200, 54,200],
  [140,0, 200,0, 200,200, 150,200, 131,93],
] as const;

function collapse(ctx: CanvasRenderingContext2D, image: CanvasImageSource, age: number, direction: number): void {
  fragments.forEach((shape, i) => {
    const t = clamp((age - 0.026 * i) / 0.54);
    const cx = [38, 101, 101, 171][i]!;
    const cy = [100, 55, 144, 101][i]!;
    const outward = (cx - 100) / 100;
    ctx.save();
    ctx.globalAlpha *= 1 - ease((t - 0.48) / 0.52);
    ctx.translate(cx + (outward * 23 + direction * 9) * t, cy + (178 - cy) * t * t - 15 * Math.sin(Math.PI * t));
    ctx.rotate((outward * 0.7 + direction * (i % 2 ? 0.38 : -0.22)) * t);
    ctx.scale(1, 1 - 0.38 * t); ctx.translate(-cx, -cy);
    trace(ctx, shape); ctx.clip(); ctx.drawImage(image, 0, 0, 200, 200);
    ctx.restore();
  });
}

function chips(ctx: CanvasRenderingContext2D, type: Kind, age: number, broken: boolean, direction: number): void {
  const t = clamp(age / (broken ? 0.68 : 0.34));
  const iron = metal(type);
  const count = broken ? 9 : 3;
  for (let i = 0; i < count; i++) {
    const spread = Math.sin((i + 1) * 13.7);
    const x = 104 + 54 * spread * t + direction * 18 * t;
    const y = 111 - (28 + 33 * Math.abs(spread)) * 4 * t * (1 - t) + 63 * t * t;
    ctx.save(); ctx.globalAlpha *= 1 - ease((t - 0.58) / 0.42);
    ctx.translate(x, y); ctx.rotate(spread * 4 * t - 0.7);
    ctx.fillStyle = iron ? '#a6a69a' : '#bf874e';
    ctx.beginPath(); ctx.moveTo(-5, -1.8); ctx.lineTo(5, -0.4); ctx.lineTo(-2.7, 2.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = iron ? '#e8debe' : '#eed0a0'; ctx.fillRect(-4, -1.4, 5.8, 0.9); ctx.restore();
  }
}

interface DefenseDrawing {
  kind: Kind; art: DefenseArt; previous: (pose: Pose) => DefenseArt;
  hpRatio: number; id: number | SectorId; state?: DeviceRuntimeState | 'idle'; activeAge?: number;
  motion: DefenseMotion | undefined; time: number; rearm?: number; maxHp?: number;
}

// A trap can be destroyed halfway through a swing or while winching back. Freeze that
// exact mechanism once; each camera then draws the same fragments from the same pose.
const fractureFrames = new WeakMap<Readonly<Wear>, Map<string, CanvasImageSource>>();
function fractureFrame(d: DefenseDrawing, w: Readonly<Wear>, art: Sprite, key: string, ratio: number): CanvasImageSource {
  const image = finish(art, key, d.kind, ratio);
  if (d.kind === 'barricade' || (w.beforeState !== 'active' && w.beforeState !== 'rearming')) return image;
  let views = fractureFrames.get(w);
  const cached = views?.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = art.w; c.height = art.h;
  const ctx = c.getContext('2d');
  if (!ctx) return image;
  const def = DEVICES[d.kind];
  ctx.scale(art.w / 200, art.h / 200);
  drawOperation(ctx, { ...d, state: w.beforeState, hpRatio: ratio, activeAge: def.activeSeconds - w.beforeTimer, rearm: 1 - w.beforeTimer / def.rearmSeconds }, art, image, false);
  if (!views) { views = new Map(); fractureFrames.set(w, views); }
  views.set(key, c);
  return c;
}

/** Draw about a fixed ground contact. All local articulation coordinates use a 200×200 painting. */
export function drawDefense(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, d: DefenseDrawing): boolean {
  const art = sprite(d.art.key);
  if (!art) return false;
  const image = finish(art, d.art.key, d.kind, d.hpRatio);
  const w = d.motion?.at(d.id);
  const hitAge = w ? d.time - w.hitAt : Infinity;
  const breakAge = w ? d.time - w.brokeAt : Infinity;
  const h = d.art.h * zoom;
  const width = h * art.w / art.h;
  const side = d.art.rear ? -1 : 1;
  const direction = ((w?.strikes ?? 0) % 2 ? 1 : -1) * side;
  const still = calmMotion();
  ctx.save(); ctx.translate(x, y);
  if (d.art.flip) ctx.scale(-1, 1);
  const capacity = d.maxHp ?? (d.kind === 'barricade' ? BARRICADE.maxHp[0] : DEVICES[d.kind].maxHp);
  const beforeRatio = w ? w.beforeBreakHp / capacity : 1;
  // Weight shifts towards the cracked brace as a device wears down.
  const sag = 0.105 * clamp((0.64 - (d.hpRatio > 0 ? d.hpRatio : beforeRatio)) / 0.64);
  if (d.hpRatio > 0 && d.kind !== 'barricade' && d.kind !== 'fence') ctx.transform(1, 0, side * sag, 1 - 0.15 * sag, 0, 0);
  if (!still && hitAge < 0.36 && d.hpRatio > 0) {
    const swing = Math.sin(hitAge * 42 + 0.26) * Math.exp(-hitAge * 10);
    ctx.transform(1, 0, direction * swing * 0.13, 1 - Math.abs(swing) * 0.045, 0, 0);
  }
  const [footX, footY] = d.art.foot;
  ctx.scale(width / 200, h / 200); ctx.translate(-200 * footX, -200 * footY);
  if (!still && w && breakAge < 0.7) {
    ctx.save(); ctx.globalAlpha *= ease((breakAge - 0.06) / 0.32); ctx.drawImage(image, 0, 0, 200, 200); ctx.restore();
    const beforeArt = d.previous(w.beforeBreak), beforeKey = beforeArt.key;
    const former = sprite(beforeKey);
    if (former && breakAge < 0.63) {
      ctx.save(); ctx.translate(200 * footX, 200 * footY);
      if (d.kind !== 'barricade' && d.kind !== 'fence') ctx.transform(1, 0, side * sag * h / width, 1 - 0.15 * sag, 0, 0);
      ctx.scale((former.w / former.h) / (art.w / art.h), 1); ctx.translate(-200 * beforeArt.foot[0], -200 * beforeArt.foot[1]);
      collapse(ctx, fractureFrame(d, w, former, beforeKey, beforeRatio), breakAge, direction); ctx.restore();
    }
    chips(ctx, d.kind, breakAge, true, direction);
  } else drawOperation(ctx, d, art, image, still);
  if (!still && hitAge < 0.34 && d.hpRatio > 0) chips(ctx, d.kind, hitAge, false, direction);
  ctx.restore();
  return true;
}

function drawOperation(ctx: CanvasRenderingContext2D, d: DefenseDrawing, art: Sprite, image: CanvasImageSource, still: boolean): void {
  const rear = d.art.rear === true;
  const logRig = rear ? drawBackLog : drawLog;
  if (d.state === 'active') {
    const age = still ? 1 : (d.activeAge ?? 1);
    if (d.kind === 'log' && !still) {
      const drop = ease(age / 0.29) + 0.31 * Math.sin(Math.max(0, age - 0.29) * 10) * Math.exp(-Math.max(0, age - 0.29) * 2.1);
      if (!logRig(ctx, d.hpRatio, drop)) ctx.drawImage(image, 0, 0, 200, 200);
    } else {
      ctx.save(); drawMechanism(ctx, d.kind, art, image, age, rear); ctx.restore();
    }
  } else if (d.state === 'rearming' && d.kind !== 'barricade' && !still) {
    const progress = d.rearm ?? 0;
    const age = progress * DEVICES[d.kind].rearmSeconds;
    const fired = sprite(d.previous('triggered').key);
    // The winch takes the full re-arm to lift the trunk back into its cradle.
    if (d.kind !== 'log' || !logRig(ctx, d.hpRatio, 1 - ease(progress))) {
      ctx.drawImage(image, 0, 0, 200, 200);
      if (fired && movingParts[d.kind] && age < 0.55) {
        ctx.save(); ctx.globalAlpha *= 1 - ease((age - 0.16) / 0.39);
        drawMechanism(ctx, d.kind, fired, finish(fired, d.previous('triggered').key, d.kind, d.hpRatio), (0.55 - age) * 0.7, rear); ctx.restore();
      }
      if (progress > 0.94) {
        const ready = sprite(d.previous('armed').key);
        if (ready) {
          ctx.save(); ctx.globalAlpha *= ease((progress - 0.94) / 0.06);
          ctx.drawImage(finish(ready, d.previous('armed').key, d.kind, d.hpRatio), 0, 0, 200, 200); ctx.restore();
        }
      }
    }
  } else ctx.drawImage(image, 0, 0, 200, 200);
}

// Operating mechanisms change their silhouette. Quantize the brief release stroke and winch
// return to small shared masks; devices, thumbnails and both cameras can reuse each sample.
const castPoses = new Map<string, HTMLCanvasElement>();
export function drawDeviceCast(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, type: DeviceTypeId,
  art: DefenseArt, state: DeviceRuntimeState | 'idle', activeAge: number, rearm: number, alpha: number): void {
  const h = art.h * zoom;
  const moving = type === 'log' || movingParts[type];
  const resetting = state === 'rearming';
  const resetAge = rearm * DEVICES[type].rearmSeconds;
  if (!moving || calmMotion() || (state !== 'active' && !resetting) || (resetting && type !== 'log' && resetAge >= 0.55)) {
    castShadow(ctx, art.key, x, y, h, art.flip, alpha, 0.85, art.foot);
    return;
  }
  const duration = resetting ? (type === 'log' ? DEVICES.log.rearmSeconds : 0.55) : (type === 'log' ? DEVICES.log.activeSeconds : 0.55);
  const phase = Math.round(clamp((resetting ? resetAge : activeAge) / duration) * 12);
  const key = `${art.key}/${state}/${phase}`;
  let shape = castPoses.get(key);
  if (!shape) {
    const source = sprite(art.key);
    if (!source) return;
    shape = document.createElement('canvas');
    shape.height = 40; shape.width = Math.max(1, Math.round(shape.height * source.w / source.h));
    const c = shape.getContext('2d');
    if (!c) return;
    const seconds = duration * phase / 12;
    c.scale(shape.width / 200, shape.height / 200);
    const previous = (pose: Pose) => deviceArt(type, art.flip ? 1 : 0, pose, art.rear ? 1 : 0);
    drawOperation(c, { kind: type, art, previous, state, hpRatio: 1, id: 0, motion: undefined, time: 0,
      activeAge: seconds, rearm: seconds / DEVICES[type].rearmSeconds }, source, source.img, false);
    c.globalCompositeOperation = 'source-in'; c.fillStyle = `rgb(${SHADOW_RGB})`; c.fillRect(0, 0, 200, 200);
    castPoses.set(key, shape);
  }
  castSilhouette(ctx, shape, x, y, h, art.flip, alpha, 0.85, art.foot);
}

import { BARRICADE, DEVICES } from '../core/data/devices';
import { LOG_CONTACT_SECONDS, type DeviceRuntimeState, type LogTarget, type NightSim } from '../core/night';
import { SECTOR_IDS, type DeviceTypeId, type Facing, type SectorId } from '../core/types';
import { sprite, type Sprite } from '../engine/assets';
import { defenseMount, type DefensePose as Pose } from './defense-mounts';
import { DOOR_OUTWARD, doorStance } from './house';
import { attackBeat, shoulderAt } from './infected';
import { calmMotion } from './lighting';
import { TH, type Point, type Rot, type View } from './projection';
import type { Foot, PaintFit } from './registration';
import { castShadow, castSilhouette, SHADOW_REACH, SHADOW_RGB } from './shadows';

type Kind = DeviceTypeId | 'barricade';

export interface DefenseArt { key: string; h: number; lift: number; foot: Foot; flip: boolean; rear?: boolean; fit?: PaintFit }

/** Normalized 200-square painting to unzoomed pixels relative to the mount, before mirroring. */
export function defensePaintMatrix(art: DefenseArt, aspect: number): readonly [number, number, 0, number, number, number] {
  const width = art.h * aspect;
  const shear = width * (art.fit?.shearY ?? 0);
  const height = art.h * (art.fit?.scaleY ?? 1);
  return [width / 200, shear / 200, 0, height / 200, -width * art.foot[0], -shear * art.foot[0] - height * art.foot[1]];
}

export function deviceArt(type: DeviceTypeId, facing: Facing | undefined, pose: Pose, rot: Rot): DefenseArt {
  // Turning the camera through 180° keeps the slope of a fence line. It swaps ends and
  // exposes the opposite side of the apparatus; only changing the installed axis mirrors it.
  const angle = type === 'fence' && facing === 2 ? 'flat' : type === 'fence' && facing === 3 ? 'deep' : type;
  const mount = defenseMount(angle, pose, rot);
  let key = `dev_${rot === 1 ? 'back_' : ''}${type}_${pose}`;
  if (angle === 'flat' || angle === 'deep') {
    const suffix = pose === 'broken' ? '_broken' : pose === 'triggered' ? '_hurt' : '';
    const backPose = angle === 'deep' && pose === 'armed' ? 'resting' : pose;
    key = rot === 1 ? `dev_back_${angle}_${backPose}` : `fence_diag_${angle}${suffix}`;
  }
  return { key, ...mount, lift: (1 - mount.foot[1]) * mount.h, flip: facing === 1, rear: rot === 1 };
}

export function devicePose(d: { type: DeviceTypeId; state: DeviceRuntimeState | 'idle'; hpRatio: number }): Pose {
  if (d.state === 'broken') return 'broken';
  if ((d.type === 'fence' && d.hpRatio <= 0.5) || d.state === 'active') return 'triggered';
  return d.state === 'armed' ? 'armed' : 'resting';
}

/** Bulb on the exposed face, and the light escaping past the housing on the reverse face. */
export function floodlightEmitter(facing: Facing | undefined, rot: Rot, hpRatio = 1, hitAge = Infinity, strikes = 0): { dx: number; lift: number } {
  const art = deviceArt('floodlight', facing, 'triggered', rot);
  const paint = sprite(art.key);
  const [a, b, , d, e, f] = defensePaintMatrix(art, paint ? paint.w / paint.h : 0.83);
  const [x, y] = rot === 0 ? [73, 50] as const : [178, 31] as const;
  const px = a * x + e, py = b * x + d * y + f;
  const lean = deviceLean(hpRatio, rot === 0 ? 1 : -1, calmMotion() ? Infinity : hitAge, strikes);
  return { dx: (px + lean.shear * py) * (art.flip ? -1 : 1), lift: -py * lean.scale };
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
  pullX: number;
  pullY: number;
  lowPullX: number;
  lowPullY: number;
}

/** Sample the authoritative lot once after stepping. Looking through another camera never restarts a hit. */
export class DefenseMotion {
  private readonly wear = new Map<number | SectorId, Wear>();
  private time = 0;

  update(sim: Pick<NightSim, 'time' | 'devices' | 'barricades' | 'enemies'>): void {
    const dt = Math.max(0, sim.time - this.time);
    this.time = sim.time;
    for (const d of sim.devices) this.sample(d.id, d.hp, devicePose({ type: d.type, state: d.state, hpRatio: d.hp / DEVICES[d.type].maxHp }), d.state, d.timer);
    for (const sector of SECTOR_IDS) {
      const b = sim.barricades[sector];
      this.sample(sector, b.hp, doorPose(b.hp / BARRICADE.maxHp[b.level], b.level), 'idle', 0);
    }

    // Add world-space forces once per simulation sample. Two jaws on the same rail
    // reinforce one another; pulls from opposite sides cancel, in every camera.
    const loads = new Map<SectorId | number, { x: number; y: number }>();
    const lowLoads = new Map<SectorId | number, { x: number; y: number }>();
    for (const enemy of sim.enemies) {
      const target = enemy.gripTarget;
      if (target === null || !enemy.alive || enemy.hitFlash > 0 || enemy.stunnedFor > 0 || enemy.nettedFor > 0) continue;
      const outward = typeof target === 'string' ? DOOR_OUTWARD[target] : [-enemy.fx, -enemy.fy] as const;
      const load = attackBeat(enemy).load * enemy.def.size;
      const low = enemy.type === 'dog' || enemy.type === 'boar' || enemy.type === 'mower';
      const rail = typeof target === 'string' && low ? lowLoads : loads;
      const total = rail.get(target) ?? { x: 0, y: 0 };
      total.x += outward[0] * load;
      total.y += outward[1] * load;
      rail.set(target, total);
    }
    const release = Math.exp(-24 * dt);
    for (const [id, w] of this.wear) {
      const load = loads.get(id);
      const lowLoad = lowLoads.get(id);
      const divisor = load ? Math.max(1, Math.hypot(load.x, load.y) / 1.3) : 1;
      const lowDivisor = lowLoad ? Math.max(1, Math.hypot(lowLoad.x, lowLoad.y) / 1.3) : 1;
      // Interrupting the grip releases the spring from its last displacement.
      w.pullX = load ? load.x / divisor : w.pullX * release;
      w.pullY = load ? load.y / divisor : w.pullY * release;
      w.lowPullX = lowLoad ? lowLoad.x / lowDivisor : w.lowPullX * release;
      w.lowPullY = lowLoad ? lowLoad.y / lowDivisor : w.lowPullY * release;
    }
  }

  private sample(id: number | SectorId, hp: number, pose: Pose, state: DeviceRuntimeState | 'idle', timer: number): void {
    const w = this.wear.get(id);
    if (!w) {
      this.wear.set(id, { hp, pose, state, timer, hitAt: -Infinity, brokeAt: -Infinity, beforeBreak: pose, beforeBreakHp: hp, beforeState: state, beforeTimer: timer, strikes: 0, pullX: 0, pullY: 0, lowPullX: 0, lowPullY: 0 });
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

/** Wear and recoil both pivot the mechanism, including its emitter, around the planted base. */
export function deviceLean(hpRatio: number, side: number, hitAge: number, strikes: number) {
  const sag = 0.105 * clamp((0.64 - hpRatio) / 0.64);
  const swing = hitAge < 0.36 ? Math.sin(hitAge * 42 + 0.26) * Math.exp(-hitAge * 10) : 0;
  const recoilScale = 1 - Math.abs(swing) * 0.045;
  const shear = side * (sag * recoilScale + (strikes % 2 ? 1 : -1) * swing * 0.13);
  return { shear, scale: (1 - 0.15 * sag) * recoilScale };
}

/** The hand-painted states use different arrangements within their sheet cells. Register the fixed foot. */
const firedShift: Partial<Record<DeviceTypeId, readonly [number, number]>> = {
  log: [-8, 7], horn: [-5, 1],
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
const resetStroke: Partial<Record<Kind, number>> = { spikes: 0.30, barrier: 0.51, net: 0.91 };

function trace(ctx: CanvasRenderingContext2D, points: readonly number[], append = false): void {
  if (!append) ctx.beginPath();
  ctx.moveTo(points[0]!, points[1]!);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i]!, points[i + 1]!);
  ctx.closePath();
}

interface Layers { base: HTMLCanvasElement; moving: HTMLCanvasElement }
const layers = new WeakMap<readonly number[], WeakMap<CanvasImageSource, Layers>>();

function cut(art: Sprite, image: CanvasImageSource, outline: readonly number[], extra?: readonly number[], woodBacking = false): Layers | null {
  let byImage = layers.get(outline);
  if (!byImage) { byImage = new WeakMap(); layers.set(outline, byImage); }
  const cached = byImage.get(image);
  if (cached) return cached;
  const pair = { base: document.createElement('canvas'), moving: document.createElement('canvas') };
  for (const [key, c] of Object.entries(pair)) {
    c.width = art.w; c.height = art.h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    ctx.scale(art.w / 200, art.h / 200);
    // A flexing slat exposes a narrow, unlit strip of the timber behind it.
    ctx.globalCompositeOperation = key === 'moving' || woodBacking ? 'destination-in' : 'destination-out';
    trace(ctx, outline);
    if (extra) trace(ctx, extra, true);
    ctx.fill();
    if (woodBacking && key === 'base') {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(48,32,22,0.85)';
      ctx.fillRect(0, 0, 200, 200);
    }
  }
  byImage.set(image, pair);
  return pair;
}

// The bearing nail and loose end belong to the painting. A pulled board can
// lift away from them without moving a jamb, a post foot, or the whole fence.
interface Plank { outline: number[]; nail: number; span: number; vertical?: true }
const planks = {
  doorBrace: { outline: [44,80, 119,58, 119,74, 48,101, 44,98], nail: 114, span: -64 },
  doorIron: { outline: [40,74, 172,42, 175,53, 42,86], nail: 162, span: -113 },
  tabletop: { outline: [39,121, 121,96, 126,101, 166,94, 172,98, 169,110, 54,145, 40,136], nail: 52, span: 111 },
  upright: { outline: [77,49, 89,44, 104,50, 103,166, 91,169, 76,163], nail: 155, span: -101, vertical: true },
  sheet: { outline: [41,58, 158,96, 157,169, 40,131], nail: 51, span: 97 },
  splinter: { outline: [64,155, 90,54, 103,55, 112,66, 91,160, 80,166], nail: 81, span: -81, vertical: true },
  rail: { outline: [26,64, 155,102, 157,126, 25,83], nail: 36, span: 112 },
  flat: { outline: [75,51, 85,26, 95,19, 103,28, 108,52, 110,191, 78,194], nail: 168, span: -125, vertical: true },
  flatHurt: { outline: [52,176, 77,57, 87,42, 95,45, 98,58, 74,180, 58,191], nail: 172, span: -118, vertical: true },
  flatRail: { outline: [29,70, 164,69, 166,97, 31,100], nail: 43, span: 111 },
  deep: { outline: [16,115, 46,105, 134,105, 178,117, 164,133, 162,152, 32,151], nail: 141, span: -100 },
} as const satisfies Record<string, Plank>;

function bearingPlank(key: string): Plank {
  if (key.includes('barricade')) return key.endsWith('_armed') ? planks.doorIron : planks.doorBrace;
  if (key.includes('deep')) return planks.deep;
  if (key.includes('flat')) {
    if (key.startsWith('dev_back')) return planks.flatRail;
    return key.endsWith('_hurt') ? planks.flatHurt : planks.flat;
  }
  if (key.startsWith('dev_back')) return planks.rail;
  if (key.endsWith('_triggered')) return planks.splinter;
  return key.endsWith('_armed') ? planks.sheet : planks.upright;
}

function drawPlank(ctx: CanvasRenderingContext2D, art: Sprite, image: CanvasImageSource, plank: Plank, dx: number, dy: number): void {
  if (Math.abs(dx) + Math.abs(dy) < 0.1) return;
  const layer = cut(art, image, plank.outline, undefined, true);
  if (!layer) return;
  ctx.drawImage(layer.base, 0, 0, 200, 200);
  ctx.save();
  const x = dx / plank.span, y = dy / plank.span;
  if (plank.vertical) ctx.transform(1, 0, x, 1 + y, -x * plank.nail, -y * plank.nail);
  else ctx.transform(1 + x, y, 0, 1, -x * plank.nail, -y * plank.nail);
  ctx.drawImage(layer.moving, 0, 0, 200, 200);
  ctx.restore();
}

// The load and lashings move independently of the gallows. Copy the back timbers from the
// relaxed painting in the area the raised log used to cover.
const load = [37,51, 47,51, 60,55, 88,64, 117,75, 125,77, 124,98, 117,109, 104,108, 42,86, 33,79];

export type LogLayer = 'far' | 'near';

/** Painter depth of the planted feet on either side of the gallows. */
export function logLayerDepth(centre: number, art: DefenseArt, layer: LogLayer): number {
  const foot = layer === 'near' ? (art.rear ? 198 : 196) : (art.rear ? 140 : 143);
  return centre + (foot / 200 - art.foot[1]) * art.h / (TH / 2);
}
// Traces between the two A-frames, including the near winch. Mirroring a fitted
// rig flips x alone: the same two painted feet still register its depth.
const nearFrame = [118,44, 200,44, 200,200, 89,200, 94,156, 110,122, 117,80];
const rearNearFrame = [127,34, 200,34, 200,200, 92,200, 104,156, 120,93];
const slackLoad = [44,114, 51,110, 66,110, 69,38, 77,38, 73,111, 104,120,
  106,48, 115,48, 112,122, 127,129, 129,156, 114,162, 45,140, 42,134];
const rearSlackLoad = [57,119, 68,111, 79,109, 79,29, 90,29, 87,111, 108,118,
  111,40, 121,42, 119,122, 151,130, 155,150, 144,162, 125,163, 58,140];

function logFrameImage(art: Sprite, image: CanvasImageSource, rear: boolean, layer?: LogLayer, suspended?: readonly number[]): CanvasImageSource | null {
  if (!layer) return image;
  const parts = cut(art, image, rear ? rearNearFrame : nearFrame, suspended);
  return parts ? (layer === 'near' ? parts.moving : parts.base) : layer === 'near' ? image : null;
}

/** The fixed frame and its suspended load use the same split for drawing and picking. */
export function stillLogLayer(art: DefenseArt, source: Sprite, image: CanvasImageSource, layer: LogLayer): CanvasImageSource | null {
  const raised = art.key.endsWith('_armed');
  const suspended = art.rear ? (raised ? backLoadHole : rearSlackLoad) : (raised ? load : slackLoad);
  return logFrameImage(source, image, !!art.rear, layer, suspended);
}

function paintLogFrame(ctx: CanvasRenderingContext2D, art: Sprite, image: CanvasImageSource,
  rear: boolean, layer?: LogLayer): void {
  const part = logFrameImage(art, image, rear, layer);
  if (part) ctx.drawImage(part, 0, 0, 200, 200);
}

/** Displacement from the resting swing arc that puts the near end of the timber on the shoulder. */
export function logAim(view: View, root: Point, art: DefenseArt, target: LogTarget, shadow = false, hpRatio = 1): Point {
  const shoulder = shoulderAt(view, doorStance(target));
  const dx = shoulder.x - root.x, dy = shoulder.y - root.y;
  const h = art.h * view.zoom;
  const paint = sprite(art.key);
  const w = paint ? h * paint.w / paint.h : h;
  // For a shadow, invert the same oblique projection castSilhouette uses. An off-axis
  // victim's feet are on a different patch of ground than the gallows.
  const groundX = shadow ? dx - dy * SHADOW_REACH.x / SHADOW_REACH.y : dx;
  const groundY = shadow ? -dy / (SHADOW_REACH.y * 0.85) : dy;
  const lean = deviceLean(shadow ? 1 : hpRatio, art.rear ? -1 : 1, Infinity, 0);
  const localY = (groundY - shoulder.lift) / lean.scale;
  const localX = (art.flip ? -groundX : groundX) - lean.shear * localY;
  const x = 200 * (art.foot[0] + localX / w);
  const y = 200 * (art.foot[1] + localY / h);
  const midX = art.rear ? 115 : 62, midY = art.rear ? 128 : 134;
  const inkX = 200 * (art.foot[0] + (art.flip ? -1 : 1) * dx / w);
  const cap = Math.max(-1, Math.min(1, (inkX - midX) / 56)) * 32;
  return { x: x - midX - cap, y: y - midY - cap * 0.32 };
}

function drawLog(ctx: CanvasRenderingContext2D, ratio: number, release: number, aimX = 0, aimY = 0, pass?: LogLayer): boolean {
  const ready = sprite('dev_log_armed');
  const resting = sprite('dev_log_resting');
  if (!ready || !resting) return false;
  const layer = cut(ready, finish(ready, 'dev_log_armed', 'log', ratio), load);
  if (!layer) return false;
  if (pass !== 'near') {
    ctx.save();
    trace(ctx, load); ctx.clip();
    // Only the back leg occupies this hole. The relaxed drawing also has two vertical ropes here.
    trace(ctx, [32,42, 45,40, 76,136, 59,142]); ctx.clip();
    ctx.drawImage(resting.img, -7, 0, 200, 200);
    ctx.restore();
  }
  paintLogFrame(ctx, ready, layer.base, false, pass);
  if (pass === 'far') return true;
  const dx = -17 * release + aimX;
  const dy = 56 * release + aimY;
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
const backRigs = new WeakMap<CanvasImageSource, HTMLCanvasElement>();
function backRig(ready: Sprite, resting: Sprite, image: CanvasImageSource): HTMLCanvasElement | undefined {
  const cached = backRigs.get(image);
  if (cached) return cached;
  const base = document.createElement('canvas');
  base.width = ready.w; base.height = ready.h;
  const c = base.getContext('2d');
  if (!c) return;
  c.scale(ready.w / 200, ready.h / 200); c.drawImage(image, 0, 0, 200, 200);
  c.save(); trace(c, backLoadHole); c.clip(); c.clearRect(0, 0, 200, 200);
  // Restore the leg where the hoisted load covered it using the unloaded part of the neutral painting.
  trace(c, [47,23, 58,23, 90,144, 73,144]); c.clip();
  c.drawImage(resting.img, 0, 0, 200, 200); c.restore();
  // The mask for the hoisted load also touches the near leg.
  trace(c, nearLeg); c.clip(); c.drawImage(image, 0, 0, 200, 200);
  backRigs.set(image, base);
  return base;
}

function drawBackLog(ctx: CanvasRenderingContext2D, ratio: number, release: number, aimX = 0, aimY = 0, pass?: LogLayer): boolean {
  const ready = sprite('dev_back_log_armed'), resting = sprite('dev_back_log_resting'), trunkArt = sprite('dev_log_armed');
  if (!ready || !resting || !trunkArt) return false;
  const rig = backRig(ready, resting, finish(ready, 'dev_back_log_armed', 'log', ratio));
  const trunk = cut(trunkArt, finish(trunkArt, 'dev_log_armed', 'log', ratio), load);
  if (!rig || !trunk) return false;
  if (pass !== 'near') paintLogFrame(ctx, ready, rig, true, 'far');
  if (pass === 'far') return true;
  // Both cameras follow the same swing. In this view the trunk moves away and to the right.
  const x = 19 + 17 * release + aimX, y = -2 + 52 * release + aimY;
  ctx.lineCap = 'round';
  for (const [color, width] of [['#432b19', 4.6], ['#c69a58', 2]] as const) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    ctx.moveTo(85, 32); ctx.lineTo(x + 56, y + 62);
    ctx.moveTo(119, 45); ctx.lineTo(x + 91, y + 76); ctx.stroke();
  }
  ctx.drawImage(trunk.moving, x, y, 200, 200);
  paintLogFrame(ctx, ready, rig, true, 'near');
  return true;
}

function drawMechanism(ctx: CanvasRenderingContext2D, type: Kind, art: Sprite, image: CanvasImageSource, age: number, rear: boolean, recovery?: number): void {
  const shift = rear || type === 'barricade' ? undefined : firedShift[type];
  if (shift) ctx.translate(...shift);
  const outline = (rear ? backParts : movingParts)[type];
  const backNet = rear && type === 'net';
  const pair = outline && (recovery !== undefined || age < 0.55) ? cut(art, image, outline, backNet ? backNetLeft : undefined) : null;
  if (pair) {
    if (!backNet) ctx.drawImage(pair.base, 0, 0, 200, 200);
    const t = clamp(age / (type === 'net' ? 0.45 : 0.29));
    const open = recovery === undefined ? (type === 'net' ? t * t : 1 - (1 - t) ** 3) : 1 - ease(recovery);
    const settle = recovery === undefined ? Math.sin(t * Math.PI * 2) * Math.sin(Math.PI * t) : 0;
    ctx.save();
    if (type === 'net') {
      if (recovery === undefined) {
        const anchor = rear ? 108 : 94;
        ctx.translate(anchor, 80);
        ctx.scale(0.8 + 0.2 * open, 0.4 + 0.6 * open);
        ctx.translate(-anchor, -80 - 16 * (1 - open));
      } else {
        // Lift the mesh first, then haul the loose end toward its reel.
        const gather = ease((recovery - 0.22) / 0.78);
        const reel = rear ? 158 : 51;
        ctx.translate(reel, 74 - 27 * gather);
        ctx.scale(1 - 0.76 * gather, 0.33 + 0.67 * open);
        ctx.translate(-reel, -74);
      }
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
  kind: Kind; art: DefenseArt; rot: Rot; previous: (pose: Pose) => DefenseArt;
  hpRatio: number; id: number | SectorId; state?: DeviceRuntimeState | 'idle'; activeAge?: number;
  motion: DefenseMotion | undefined; time: number; rearm?: number; maxHp?: number;
  aim?: Point;
  logLayer?: LogLayer;
}

// A trap can be destroyed halfway through a swing or while winching back. Freeze that
// exact mechanism once; each camera then draws the same fragments from the same pose.
const fractureFrames = new WeakMap<Readonly<Wear>, Map<string, CanvasImageSource>>();
function fractureFrame(d: DefenseDrawing, w: Readonly<Wear>, art: Sprite, pose: DefenseArt, ratio: number): CanvasImageSource {
  const key = pose.key;
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
  drawOperation(ctx, { ...d, art: pose, state: w.beforeState, hpRatio: ratio, activeAge: def.activeSeconds - w.beforeTimer, rearm: 1 - w.beforeTimer / def.rearmSeconds }, art, image, false);
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
  const aspect = art.w / art.h;
  const paint = defensePaintMatrix(d.art, aspect);
  const side = d.art.rear ? -1 : 1;
  const timber = d.kind === 'barricade' || d.kind === 'fence';
  const viewSign = d.rot === 0 ? 1 : -1;
  const localX = viewSign * (d.art.flip ? -1 : 1);
  const direction = timber ? Math.sign(w ? (w.pullX + w.lowPullX - w.pullY - w.lowPullY) * localX : 0) : ((w?.strikes ?? 0) % 2 ? 1 : -1) * side;
  const still = calmMotion();
  ctx.save(); ctx.translate(x, y);
  ctx.scale(d.art.flip ? -zoom : zoom, zoom);
  const capacity = d.maxHp ?? (d.kind === 'barricade' ? BARRICADE.maxHp[0] : DEVICES[d.kind].maxHp);
  const beforeRatio = w ? w.beforeBreakHp / capacity : 1;
  // Weight shifts towards the cracked brace as a device wears down.
  if (!timber && d.hpRatio > 0) {
    const pressed = d.kind === 'barrier' && d.state === 'active';
    const lean = deviceLean(d.hpRatio, side, still || pressed ? Infinity : hitAge, w?.strikes ?? 0);
    const flex = pressed && !still && w ? (w.pullX - w.pullY) * localX : 0;
    const dip = pressed && !still && w ? (w.pullX + w.pullY) * viewSign : 0;
    ctx.transform(1, 0, lean.shear - .08 * flex, lean.scale - .035 * dip, 0, 0);
  }
  if (!still && w && breakAge < 0.7) {
    ctx.save();
    ctx.transform(...paint);
    ctx.globalAlpha *= ease((breakAge - 0.06) / 0.32);
    ctx.drawImage(image, 0, 0, 200, 200);
    ctx.restore();
    const returning = w.beforeState === 'rearming' && d.kind !== 'barricade'
      && DEVICES[d.kind].rearmSeconds - w.beforeTimer < (resetStroke[d.kind] ?? 0);
    const beforeArt = d.previous(returning ? 'triggered' : w.beforeBreak), beforeKey = beforeArt.key;
    const former = sprite(beforeKey);
    if (former && breakAge < 0.63) {
      ctx.save();
      if (!timber) {
        const lean = deviceLean(beforeRatio, side, Infinity, 0);
        ctx.transform(1, 0, lean.shear, lean.scale, 0, 0);
      }
      ctx.transform(...defensePaintMatrix(beforeArt, former.w / former.h));
      collapse(ctx, fractureFrame(d, w, former, beforeArt, beforeRatio), breakAge, direction);
      ctx.restore();
    }
    ctx.transform(...paint);
    chips(ctx, d.kind, breakAge, true, direction);
  } else {
    ctx.transform(...paint);
    if (timber && !still && d.hpRatio > 0 && w) {
      ctx.drawImage(image, 0, 0, 200, 200);
      const across = 23 * localX / aspect, down = 11.5 * viewSign;
      drawPlank(ctx, art, image, bearingPlank(d.art.key), (w.pullX - w.pullY) * across, (w.pullX + w.pullY) * down);
      if (d.kind === 'barricade') drawPlank(ctx, art, image, planks.tabletop, (w.lowPullX - w.lowPullY) * across, (w.lowPullX + w.lowPullY) * down);
    } else drawOperation(ctx, d, art, image, still);
    if (d.logLayer !== 'far' && !timber && !still && hitAge < 0.34 && d.hpRatio > 0) chips(ctx, d.kind, hitAge, false, direction);
  }
  ctx.restore();
  return true;
}

/** Switch between local paintings about their common planted mount. Also works inside a cached shadow or fracture frame. */
function changePainting(ctx: CanvasRenderingContext2D, from: DefenseArt, original: Sprite, to: DefenseArt, replacement: Sprite): void {
  const [a, b, , d] = defensePaintMatrix(from, original.w / original.h);
  ctx.translate(200 * from.foot[0], 200 * from.foot[1]);
  ctx.transform(1 / a, -b / (a * d), 0, 1 / d, 0, 0);
  ctx.transform(...defensePaintMatrix(to, replacement.w / replacement.h));
}

function drawOperation(ctx: CanvasRenderingContext2D, d: DefenseDrawing, art: Sprite, image: CanvasImageSource, still: boolean): void {
  const rear = d.art.rear === true;
  const logRig = rear ? drawBackLog : drawLog;
  if (d.state === 'active') {
    const age = still ? 1 : (d.activeAge ?? 1);
    if (d.kind === 'log') {
      const afterContact = Math.max(0, age - LOG_CONTACT_SECONDS);
      const drop = still ? Number((d.activeAge ?? 1) >= LOG_CONTACT_SECONDS)
        : ease(age / LOG_CONTACT_SECONDS) + 0.31 * Math.sin(afterContact * 10) * Math.exp(-afterContact * 2.1);
      const swing = still ? drop * Number((d.activeAge ?? 1) < LOG_CONTACT_SECONDS + 0.53)
        : ease(age / LOG_CONTACT_SECONDS) * (1 - ease((afterContact - 0.045) / 0.48));
      if (!logRig(ctx, d.hpRatio, drop, (d.aim?.x ?? 0) * swing, (d.aim?.y ?? 0) * swing, d.logLayer) && d.logLayer !== 'far') ctx.drawImage(image, 0, 0, 200, 200);
    } else {
      ctx.save(); drawMechanism(ctx, d.kind, art, image, age, rear); ctx.restore();
    }
  } else if (d.state === 'rearming' && d.kind !== 'barricade' && !still) {
    const progress = d.rearm ?? 0;
    const age = progress * DEVICES[d.kind].rearmSeconds;
    // The winch takes the full re-arm to lift the trunk back into its cradle.
    if (d.kind === 'log' && (logRig(ctx, d.hpRatio, 1 - ease(progress), 0, 0, d.logLayer) || d.logLayer === 'far')) return;
    const stroke = resetStroke[d.kind];
    if (stroke && age <= stroke) {
      const firedPose = d.previous('triggered');
      const fired = sprite(firedPose.key);
      if (fired) {
        // Keep one planted frame while its working part returns to rest.
        ctx.save();
        changePainting(ctx, d.art, art, firedPose, fired);
        drawMechanism(ctx, d.kind, fired, finish(fired, firedPose.key, d.kind, d.hpRatio), 1, rear, age / stroke);
        ctx.restore();
        return;
      }
    }
    ctx.drawImage(image, 0, 0, 200, 200);
    if (progress > 0.94) {
      const armedPose = d.previous('armed');
      const ready = sprite(armedPose.key);
      if (ready) {
        ctx.save(); ctx.globalAlpha *= ease((progress - 0.94) / 0.06);
        changePainting(ctx, d.art, art, armedPose, ready);
        ctx.drawImage(finish(ready, armedPose.key, d.kind, d.hpRatio), 0, 0, 200, 200); ctx.restore();
      }
    }
  } else if (d.kind === 'log' && d.logLayer) {
    const layer = stillLogLayer(d.art, art, image, d.logLayer);
    if (layer) ctx.drawImage(layer, 0, 0, 200, 200);
  } else ctx.drawImage(image, 0, 0, 200, 200);
}

// Operating mechanisms change their silhouette. Quantize the brief release stroke and winch
// return to small shared masks; devices, thumbnails and both cameras can reuse each sample.
const castPoses = new Map<string, HTMLCanvasElement>();
// An aimed beam can travel well outside the gallows painting. These two low-resolution
// working masks are reused by consecutive swings and the main/thumbnail feeds.
const aimedCast = new Map<boolean, HTMLCanvasElement>();
export function drawDeviceCast(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, type: DeviceTypeId,
  art: DefenseArt, state: DeviceRuntimeState | 'idle', activeAge: number, rearm: number, alpha: number, aim?: Point): void {
  const moving = type === 'log' || movingParts[type];
  const resetting = state === 'rearming';
  const resetAge = rearm * DEVICES[type].rearmSeconds;
  const resetDuration = type === 'log' ? DEVICES.log.rearmSeconds : resetStroke[type] ?? 0;
  // The deployed mesh extends past the resting cel. Cache its return stroke in the cel
  // it was painted in, so the edge of the offscreen buffer never cuts through it.
  if (resetting && resetAge < (resetStroke[type] ?? 0) && !calmMotion()) {
    art = deviceArt(type, art.flip ? 1 : 0, 'triggered', art.rear ? 1 : 0);
  }
  const h = art.h * zoom;
  if (aim && state === 'active' && activeAge < LOG_CONTACT_SECONDS + 0.53) {
    const source = sprite(art.key);
    if (!source) return;
    const rear = art.rear === true;
    const shape = aimedCast.get(rear) ?? document.createElement('canvas');
    aimedCast.set(rear, shape);
    const height = 40, width = Math.max(1, Math.round(height * source.w / source.h));
    const px = 4 + Math.ceil(Math.abs(aim.x) * width / 200);
    const py = 4 + Math.ceil(Math.abs(aim.y) * height / 200);
    if (shape.width !== width + px * 2) shape.width = width + px * 2;
    if (shape.height !== height + py * 2) shape.height = height + py * 2;
    const c = shape.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, shape.width, shape.height);
    c.save(); c.translate(px, py); c.scale(width / 200, height / 200);
    drawOperation(c, { kind: type, art, rot: rear ? 1 : 0, previous: () => art, state, hpRatio: 1,
      id: 0, motion: undefined, time: 0, activeAge, aim }, source, source.img, calmMotion());
    c.restore(); c.save(); c.globalCompositeOperation = 'source-in';
    c.fillStyle = `rgb(${SHADOW_RGB})`; c.fillRect(0, 0, shape.width, shape.height); c.restore();
    castSilhouette(ctx, shape, x, y, h * shape.height / height, art.flip, alpha, 0.85,
      [(px + art.foot[0] * width) / shape.width, (py + art.foot[1] * height) / shape.height]);
    return;
  }
  if (!moving || calmMotion() || (state !== 'active' && !resetting) || (resetting && resetAge >= resetDuration)) {
    castShadow(ctx, art.key, x, y, h, art.flip, alpha, 0.85, art.foot, art.fit);
    return;
  }
  const duration = resetting ? resetDuration : (type === 'log' ? DEVICES.log.activeSeconds : 0.55);
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
    drawOperation(c, { kind: type, art, rot: art.rear ? 1 : 0, previous, state, hpRatio: 1, id: 0, motion: undefined, time: 0,
      activeAge: seconds, rearm: seconds / DEVICES[type].rearmSeconds }, source, source.img, false);
    c.globalCompositeOperation = 'source-in'; c.fillStyle = `rgb(${SHADOW_RGB})`; c.fillRect(0, 0, 200, 200);
    castPoses.set(key, shape);
  }
  castSilhouette(ctx, shape, x, y, h, art.flip, alpha, 0.85, art.foot, art.fit);
}

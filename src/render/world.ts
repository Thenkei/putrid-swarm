// Isometric renderer for the homestead. It draws whatever state it is handed; it owns no game logic.
// One renderer serves the daytime yard and all four night cameras, so the views cannot disagree.

import { BARRICADE, DEVICES } from '../core/data/devices';
import { ENTRIES, GRID_H, GRID_W, HOUSE, HOUSE_CENTER, PROPS, sectorOf, terrainAt, type PropKind, type Terrain } from '../core/map';
import type { DeviceRuntimeState, Enemy } from '../core/night';
import type { Cell, Decal, DeviceTypeId, EnemyTypeId, Facing, SectorId } from '../core/types';
import { SECTOR_IDS } from '../core/types';
import { sprite, type Sprite } from '../engine/assets';

export const TW = 64;
export const TH = 32;
const MARGIN = 6;
const GROUND_SCALE = 1.5;
const TEXTURE_PX_PER_CELL = 96;

/** 0 looks from the gate side (sees gate + barn doors); 1 looks from the back (sees back + orchard doors). */
export type Rot = 0 | 1;

export interface View {
  readonly rot: Rot;
  readonly zoom: number;
  /** Grid point shown at the centre of the rectangle. */
  readonly cx: number;
  readonly cy: number;
  /** Stage rectangle the view is drawn into. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface DeviceVisual {
  readonly id: number;
  readonly type: DeviceTypeId;
  readonly x: number;
  readonly y: number;
  /** How the piece is turned on its cell (see Facing). */
  readonly facing?: Facing;
  readonly state: DeviceRuntimeState | 'idle';
  readonly hpRatio: number;
  /** 0..1 progress of the re-arm, when rearming. */
  readonly rearm?: number;
  readonly label?: string;
  readonly highlight?: boolean;
  /** Manual trap with enough under it to be worth firing now: drawn so it cannot be missed. */
  readonly cue?: boolean;
}

export interface Particle {
  kind: 'burst' | 'dust' | 'smoke' | 'ring' | 'text' | 'splat';
  x: number;
  y: number;
  age: number;
  life: number;
  radius?: number;
  text?: string;
  color?: string;
}

/** How long a fallen infected stays on screen, in seconds. */
export const FALL_SECONDS = 0.95;

export interface Fallen {
  readonly id: number;
  readonly type: EnemyTypeId;
  readonly x: number;
  readonly y: number;
  readonly fx: number;
  readonly fy: number;
  age: number;
}

export interface Ghost {
  readonly type: DeviceTypeId;
  readonly x: number;
  readonly y: number;
  readonly facing?: Facing;
  readonly ok: boolean;
  /** Allowed, but nobody is predicted to walk within reach of it. */
  readonly idle?: boolean;
}

export interface WorldFrame {
  readonly time: number;
  readonly night: boolean;
  readonly carPresent: boolean;
  readonly devices: readonly DeviceVisual[];
  readonly barricades: Readonly<Record<SectorId, { hp: number; level: 0 | 1 }>>;
  readonly decals: readonly Decal[];
  readonly enemies: readonly Enemy[];
  /** Infected that have just been put down, kept a moment so they are seen to fall. */
  readonly fallen?: readonly Fallen[];
  readonly particles: readonly Particle[];
  readonly ghost?: Ghost | null;
  readonly routes?: readonly (readonly Cell[])[];
  /** Predicted footfall per cell (grid index → number of routes), painted as worn ground under the routes. */
  readonly traffic?: ReadonlyMap<number, number>;
  readonly lanes?: readonly { readonly cells: readonly Cell[]; readonly seconds: number }[];
  readonly hoverCell?: Cell | null;
  readonly hoverRadius?: number;
  /** Dim everything outside this camera's sector. */
  readonly focusSector?: SectorId;
  readonly showBuildable?: boolean;
  readonly doorHighlight?: SectorId | null;
}

// ───────────────────────────── Projection ─────────────────────────────

const viewX = (rot: Rot, gx: number): number => (rot === 0 ? gx : GRID_W - gx);
const viewY = (rot: Rot, gy: number): number => (rot === 0 ? gy : GRID_H - gy);

/** Grid → un-zoomed world pixels for a rotation. */
function world(rot: Rot, gx: number, gy: number): { x: number; y: number } {
  const vx = viewX(rot, gx);
  const vy = viewY(rot, gy);
  return { x: ((vx - vy) * TW) / 2, y: ((vx + vy) * TH) / 2 };
}

export function project(view: View, gx: number, gy: number): { x: number; y: number } {
  const p = world(view.rot, gx, gy);
  const c = world(view.rot, view.cx, view.cy);
  return { x: view.x + view.w / 2 + (p.x - c.x) * view.zoom, y: view.y + view.h / 2 + (p.y - c.y) * view.zoom };
}

export function unproject(view: View, sx: number, sy: number): { gx: number; gy: number } {
  const c = world(view.rot, view.cx, view.cy);
  const wx = (sx - view.x - view.w / 2) / view.zoom + c.x;
  const wy = (sy - view.y - view.h / 2) / view.zoom + c.y;
  const vx = wy / TH + wx / TW;
  const vy = wy / TH - wx / TW;
  return view.rot === 0 ? { gx: vx, gy: vy } : { gx: GRID_W - vx, gy: GRID_H - vy };
}

export const inView = (view: View, sx: number, sy: number): boolean => sx >= view.x && sy >= view.y && sx < view.x + view.w && sy < view.y + view.h;

const depthOf = (rot: Rot, gx: number, gy: number): number => viewX(rot, gx) + viewY(rot, gy);

/** The camera framing of each sector: which side it is seen from and where it is centred. */
export function cameraView(sector: SectorId, rect: { x: number; y: number; w: number; h: number }, zoom: number): View {
  const rot: Rot = sector === 'portail' || sector === 'grange' ? 0 : 1;
  const reach = 5.4;
  const centre: Record<SectorId, Cell> = {
    portail: { x: HOUSE_CENTER.x - 0.4, y: HOUSE_CENTER.y + reach },
    grange: { x: HOUSE_CENTER.x + reach, y: HOUSE_CENTER.y - 0.4 },
    arriere: { x: HOUSE_CENTER.x + 0.4, y: HOUSE_CENTER.y - reach },
    verger: { x: HOUSE_CENTER.x - reach, y: HOUSE_CENTER.y + 0.4 },
  };
  return { rot, zoom, cx: centre[sector].x, cy: centre[sector].y, ...rect };
}

// ───────────────────────────── Sprite tables ─────────────────────────────

const ENEMY_ART: Readonly<Record<EnemyTypeId, { key: string; h: number }>> = {
  shambler: { key: 'en_shambler', h: 64 },
  runner: { key: 'en_runner', h: 64 },
  brute: { key: 'en_brute', h: 84 },
  dog: { key: 'en_dog', h: 40 },
  boar: { key: 'en_boar', h: 54 },
  deer: { key: 'en_deer', h: 74 },
  mower: { key: 'boss_mower', h: 82 },
  mechanic: { key: 'boss_mechanic', h: 92 },
  mail: { key: 'boss_mail', h: 76 },
  chief: { key: 'boss_chief', h: 86 },
  mayor: { key: 'boss_mayor', h: 96 },
};

/** Animation poses: three of a walk cycle and one action pose (attack, wind-up, speech…). */
type Pose = 'a' | 'p' | 'b' | 'x';
/** Contact, passing, opposite contact, passing: two steps. */
const WALK_CYCLE: readonly Pose[] = ['a', 'p', 'b', 'p'];

/** How a kind of infected carries itself. Angles in radians, `bob` in pixels at zoom 1. */
interface Gait {
  /** Vertical bounce of each step. */
  readonly bob: number;
  /** Rocking of the body: side to side for walkers, nose to tail for anything that gallops. */
  readonly rock: number;
  /** Constant lean into the direction of travel. */
  readonly lean: number;
  /** 0..0.5: how uneven two successive steps are. */
  readonly limp: number;
  /** Four-legged: one bound per cycle instead of one bounce per step. */
  readonly gallop?: boolean;
  /** Heavy enough to raise dust at each footfall. */
  readonly dust?: boolean;
  /** Multiplier on how fast the poses follow each other (the mayor rides: her gestures are unhurried). */
  readonly pace?: number;
}

const GAIT: Readonly<Record<EnemyTypeId, Gait>> = {
  shambler: { bob: 2.2, rock: 0.07, lean: 0.03, limp: 0.32 },
  runner: { bob: 4, rock: 0.035, lean: 0.13, limp: 0 },
  brute: { bob: 2.2, rock: 0.05, lean: 0.04, limp: 0.1, dust: true },
  dog: { bob: 3, rock: 0.1, lean: 0, limp: 0, gallop: true },
  boar: { bob: 2.6, rock: 0.07, lean: 0, limp: 0, gallop: true, dust: true },
  deer: { bob: 5.5, rock: 0.09, lean: 0, limp: 0, gallop: true },
  mower: { bob: 1.6, rock: 0.025, lean: 0.04, limp: 0 },
  mechanic: { bob: 1.6, rock: 0.03, lean: 0.03, limp: 0.12, dust: true },
  mail: { bob: 3.6, rock: 0.03, lean: 0.11, limp: 0 },
  chief: { bob: 2, rock: 0.05, lean: 0.02, limp: 0, dust: true },
  mayor: { bob: 0.8, rock: 0.02, lean: 0, limp: 0, pace: 0.3 },
};

/** How much brighter than the scenery the infected are drawn at night, before the darkness is laid over everything. */
const NIGHT_LIFT = 0.34;

/** A stable 0..1 number per individual, so a crowd does not march in step or stand the same height. */
const trait = (id: number, salt: number): number => {
  const v = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const DEVICE_ART: Readonly<Record<DeviceTypeId, { key: string; h: number; lift: number }>> = {
  fence: { key: 'dev_fence', h: 42, lift: 11 },
  spikes: { key: 'dev_spikes', h: 50, lift: 14 },
  log: { key: 'dev_log', h: 74, lift: 12 },
  net: { key: 'dev_net', h: 64, lift: 12 },
  barrier: { key: 'dev_barrier', h: 54, lift: 12 },
  horn: { key: 'dev_horn', h: 54, lift: 11 },
  floodlight: { key: 'dev_floodlight', h: 78, lift: 9 },
};

/** Palisades laid along a diagonal of the grid have their own drawings: face-on, and end-on. */
const FENCE_DIAGONAL: Readonly<Partial<Record<Facing, { key: string; h: number; lift: number }>>> = {
  2: { key: 'fence_diag_flat', h: 40, lift: 6 },
  3: { key: 'fence_diag_deep', h: 60, lift: 17 },
};

type DeviceSpriteState = 'resting' | 'armed' | 'triggered' | 'broken';

/**
 * The drawing of a device for the way it is turned. Along the grid's axes the same sprite serves
 * both ways: mirrored, a piece running along x is the same piece running along y in this projection.
 */
function deviceArt(type: DeviceTypeId, facing: Facing | undefined, state: DeviceSpriteState): { key: string; h: number; lift: number; flip: boolean } {
  const diagonal = type === 'fence' && state !== 'broken' ? FENCE_DIAGONAL[facing ?? 0] : undefined;
  if (diagonal) return { key: state === 'triggered' ? `${diagonal.key}_hurt` : diagonal.key, h: diagonal.h, lift: diagonal.lift, flip: false };
  const art = DEVICE_ART[type];
  return { key: `${art.key}_${state}`, h: art.h, lift: art.lift, flip: facing === 1 };
}

const PROP_ART: Readonly<Record<PropKind, { key: string; h: number; lift: number }>> = {
  car: { key: 'obj_car', h: 112, lift: 4 },
  well: { key: 'obj_props_well', h: 86, lift: 14 },
  woodpile: { key: 'obj_props_woodpile', h: 74, lift: 14 },
  veg: { key: 'obj_props_veg', h: 84, lift: 4 },
  apple: { key: 'obj_trees_apple', h: 150, lift: 8 },
  oak: { key: 'obj_trees_oak', h: 176, lift: 8 },
  rock: { key: 'obj_props2_rock', h: 46, lift: 14 },
  barrel: { key: 'obj_props2_barrel', h: 48, lift: 12 },
  mailbox: { key: 'obj_props2_mailbox', h: 52, lift: 8 },
  bush: { key: 'obj_props2_bush', h: 54, lift: 14 },
};

const HOUSE_DRAW_WIDTH = 300;
const HOUSE_LIFT = 10;

// ───────────────────────────── Ground cache ─────────────────────────────

const groundCache: Partial<Record<Rot, HTMLCanvasElement>> = {};
const GROUND_W = (GRID_W + GRID_H + 4 * MARGIN) * (TW / 2);
const GROUND_H = (GRID_W + GRID_H + 4 * MARGIN) * (TH / 2);
/** World x of the ground cache's left edge, and world y of its top edge. */
const GROUND_X0 = -(GRID_H + 2 * MARGIN) * (TW / 2);
const GROUND_Y0 = -(2 * MARGIN) * (TH / 2);

const TERRAIN_TEXTURE: Readonly<Record<Exclude<Terrain, 'house'>, string>> = {
  grass: 'tex_ground_grass',
  path: 'tex_ground_path',
  gravel: 'tex_ground_gravel',
  forest: 'tex_ground_forest',
};
const TERRAIN_FALLBACK: Readonly<Record<Exclude<Terrain, 'house'>, string>> = {
  grass: '#6f7a3a',
  path: '#8a6a47',
  gravel: '#9c917c',
  forest: '#4a3a28',
};

function mirroredTile(source: Sprite): HTMLCanvasElement {
  // The swatches are not seamless; mirroring them 2x2 makes every edge meet itself.
  const size = source.w;
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size * 2;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    ctx.save();
    ctx.translate(fx ? size * 2 : 0, fy ? size * 2 : 0);
    ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
    ctx.drawImage(source.img, 0, 0, size, size);
    ctx.restore();
  }
  return canvas;
}

function terrainOfViewCell(rot: Rot, vx: number, vy: number): Exclude<Terrain, 'house'> {
  const gx = rot === 0 ? vx : GRID_W - 1 - vx;
  const gy = rot === 0 ? vy : GRID_H - 1 - vy;
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return 'forest';
  const terrain = terrainAt(gx, gy);
  return terrain === 'house' ? 'path' : terrain;
}

function buildGround(rot: Rot): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(GROUND_W * GROUND_SCALE);
  canvas.height = Math.round(GROUND_H * GROUND_SCALE);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const canBlur = typeof ctx.filter === 'string';

  const toGrid = (target: CanvasRenderingContext2D): void => {
    const s = GROUND_SCALE;
    target.setTransform((TW / 2) * s, (TH / 2) * s, (-TW / 2) * s, (TH / 2) * s, -GROUND_X0 * s, -GROUND_Y0 * s);
  };

  // Two scratch layers, shared by every terrain: the cells of one, then those cells textured.
  const scratch = (): CanvasRenderingContext2D => {
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = canvas.width;
    layerCanvas.height = canvas.height;
    return layerCanvas.getContext('2d') as CanvasRenderingContext2D;
  };
  const mctx = scratch();
  const pctx = scratch();

  const layer = (terrain: Exclude<Terrain, 'house'>, everywhere: boolean): void => {
    // 1. Mask: the cells of this terrain.
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, canvas.width, canvas.height);
    toGrid(mctx);
    mctx.fillStyle = '#fff';
    for (let vy = -MARGIN; vy < GRID_H + MARGIN; vy++) {
      for (let vx = -MARGIN; vx < GRID_W + MARGIN; vx++) {
        if (everywhere || terrainOfViewCell(rot, vx, vy) === terrain) mctx.fillRect(vx - 0.02, vy - 0.02, 1.04, 1.04);
      }
    }

    // Slightly feathered, so paths melt into the grass. The mask is blurred whole, in one pass: a
    // filter left on while the cells are filled blurs each of them as a full-size layer of its own,
    // which froze the first frame of the yard for half a second.
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.globalCompositeOperation = 'copy';
    if (canBlur && !everywhere) pctx.filter = `blur(${5 * GROUND_SCALE}px)`;
    pctx.drawImage(mctx.canvas, 0, 0);
    pctx.filter = 'none';

    // 2. Texture, laid flat on the ground plane, kept only where the mask is.
    toGrid(pctx);
    pctx.globalCompositeOperation = 'source-in';
    const texture = sprite(TERRAIN_TEXTURE[terrain]);
    if (texture) {
      const pattern = pctx.createPattern(mirroredTile(texture), 'repeat') as CanvasPattern;
      pattern.setTransform(new DOMMatrix().scale(1 / TEXTURE_PX_PER_CELL));
      pctx.fillStyle = pattern;
    } else {
      pctx.fillStyle = TERRAIN_FALLBACK[terrain];
    }
    pctx.fillRect(-MARGIN, -MARGIN, GRID_W + 2 * MARGIN, GRID_H + 2 * MARGIN);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(pctx.canvas, 0, 0);
  };

  layer('forest', true);
  layer('grass', false);
  layer('gravel', false);
  layer('path', false);

  // Darken toward the tree line so the lot reads as a clearing.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cx = canvas.width / 2;
  const cy = ((GRID_W + GRID_H) / 2) * (TH / 2) * GROUND_SCALE - GROUND_Y0 * GROUND_SCALE;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.5);
  const shade = ctx.createRadialGradient(0, 0, canvas.width * 0.2, 0, 0, canvas.width * 0.5);
  shade.addColorStop(0, 'rgba(20,14,8,0)');
  shade.addColorStop(0.75, 'rgba(20,14,8,0.35)');
  shade.addColorStop(1, 'rgba(12,8,4,0.78)');
  ctx.fillStyle = shade;
  ctx.fillRect(-canvas.width, -canvas.height * 2, canvas.width * 2, canvas.height * 4);
  ctx.restore();
  return canvas;
}

function ground(rot: Rot): HTMLCanvasElement {
  let canvas = groundCache[rot];
  if (!canvas) {
    canvas = buildGround(rot);
    groundCache[rot] = canvas;
  }
  return canvas;
}

// ───────────────────────────── Forest ring ─────────────────────────────

interface Tree {
  readonly gx: number;
  readonly gy: number;
  readonly key: string;
  readonly h: number;
  readonly flip: boolean;
}

const TREES: readonly Tree[] = (() => {
  // Deterministic scatter so both rotations and every camera agree on the tree line.
  let seed = 1337;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const trees: Tree[] = [];
  const add = (gx: number, gy: number): void => {
    const pine = rand() < 0.7;
    trees.push({ gx, gy, key: pine ? 'obj_trees_pine' : 'obj_trees_oak', h: (pine ? 185 : 165) * (0.82 + rand() * 0.4), flip: rand() < 0.5 });
  };
  for (let ring = 0; ring < 3; ring++) {
    const offset = 0.6 + ring * 1.25;
    for (let t = -MARGIN; t < GRID_W + MARGIN; t += 1.15 + rand() * 0.5) {
      add(t + rand() * 0.6, -offset - rand() * 0.5);
      add(t + rand() * 0.6, GRID_H + offset + rand() * 0.5);
      add(-offset - rand() * 0.5, t + rand() * 0.6);
      add(GRID_W + offset + rand() * 0.5, t + rand() * 0.6);
    }
  }
  return trees;
})();

// ───────────────────────────── Drawing helpers ─────────────────────────────

interface Drawable {
  readonly depth: number;
  draw(): void;
}

function drawSprite(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, height: number, flip = false, alpha = 1): { w: number; h: number } | null {
  const art = sprite(key);
  if (!art) return null;
  const h = height;
  const w = (art.w / art.h) * h;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(art.img, -w / 2, -h, w, h);
  ctx.restore();
  return { w, h };
}

function placeholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, label: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - h / 2 + 3);
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, zoom: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y, radius * zoom, radius * 0.45 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
}

function diamond(ctx: CanvasRenderingContext2D, view: View, gx: number, gy: number, inset = 0): void {
  const a = project(view, gx + inset, gy + inset);
  const b = project(view, gx + 1 - inset, gy + inset);
  const c = project(view, gx + 1 - inset, gy + 1 - inset);
  const d = project(view, gx + inset, gy + 1 - inset);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

/** A circle on the ground plane (an ellipse on screen). */
function groundRing(ctx: CanvasRenderingContext2D, view: View, gx: number, gy: number, radiusCells: number): void {
  const p = project(view, gx, gy);
  ctx.beginPath();
  // A ground circle of r cells is r·√2·(TW/2) wide and half as tall on screen.
  ctx.ellipse(p.x, p.y, radiusCells * Math.SQRT2 * (TW / 2) * view.zoom, radiusCells * Math.SQRT2 * (TH / 2) * view.zoom, 0, 0, Math.PI * 2);
}

function deviceSpriteState(device: DeviceVisual): DeviceSpriteState {
  if (device.state === 'broken') return 'broken';
  if (device.type === 'fence') return device.hpRatio > 0.5 ? 'resting' : 'triggered';
  if (device.state === 'active') return 'triggered';
  if (device.state === 'armed') return 'armed';
  return 'resting';
}

// ───────────────────────────── Main entry ─────────────────────────────

export function drawWorld(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame): void {
  const z = view.zoom;
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();
  ctx.fillStyle = '#17120c';
  ctx.fillRect(view.x, view.y, view.w, view.h);
  // Sprites are drawn at a third of their size or less: plain bilinear filtering turns their ink lines to mush.
  ctx.imageSmoothingQuality = 'high';

  // Ground.
  const c = world(view.rot, view.cx, view.cy);
  const gx0 = view.x + view.w / 2 + (GROUND_X0 - c.x) * z;
  const gy0 = view.y + view.h / 2 + (GROUND_Y0 - c.y) * z;
  ctx.drawImage(ground(view.rot), gx0, gy0, GROUND_W * z, GROUND_H * z);

  drawDecals(ctx, view, frame);
  drawGroundOverlays(ctx, view, frame);

  const drawables: Drawable[] = [];

  // Tree line: only the far sides, so the forest never hides the action.
  for (const tree of TREES) {
    const vx = viewX(view.rot, tree.gx);
    const vy = viewY(view.rot, tree.gy);
    const far = vx < 0 || vy < 0;
    const p = project(view, tree.gx, tree.gy);
    if (p.x < view.x - 120 * z || p.x > view.x + view.w + 120 * z || p.y < view.y - 20 || p.y > view.y + view.h + 220 * z) continue;
    if (far) {
      drawables.push({ depth: vx + vy, draw: () => void drawSprite(ctx, tree.key, p.x, p.y + 6 * z, tree.h * z, tree.flip) });
    } else if (Math.round(tree.h * 7) % 4 === 0) {
      // Near side: undergrowth only, low enough to hide nothing.
      const low = tree.flip ? 'obj_props2_bush' : 'obj_props2_rock';
      drawables.push({ depth: vx + vy, draw: () => void drawSprite(ctx, low, p.x, p.y + 8 * z, (tree.flip ? 40 : 30) * z, tree.h > 190) });
    }
  }

  // House.
  {
    const corner = project(view, view.rot === 0 ? HOUSE.x1 + 1 : HOUSE.x0, view.rot === 0 ? HOUSE.y1 + 1 : HOUSE.y0);
    const key = view.rot === 0 ? 'obj_house_front' : 'obj_house_back';
    const art = sprite(key);
    const depth = depthOf(view.rot, HOUSE_CENTER.x, HOUSE_CENTER.y) + 1.2;
    drawables.push({
      depth,
      draw: () => {
        if (art) {
          const w = HOUSE_DRAW_WIDTH * z;
          const h = (art.h / art.w) * w;
          ctx.drawImage(art.img, corner.x - w / 2, corner.y + HOUSE_LIFT * z - h, w, h);
        } else {
          placeholder(ctx, corner.x, corner.y, 240 * z, 200 * z, '#8a6a47', 'house');
        }
      },
    });
    for (const sector of SECTOR_IDS) drawables.push(...barricadeDrawables(ctx, view, frame, sector, depth + 0.1));
  }

  // Scenery.
  for (const prop of PROPS) {
    if (prop.kind === 'car' && !frame.carPresent) continue;
    const art = PROP_ART[prop.kind];
    const nearX = view.rot === 0 ? prop.x + prop.w : prop.x;
    const nearY = view.rot === 0 ? prop.y + prop.h : prop.y;
    const p = project(view, nearX, nearY);
    const key = prop.kind === 'car' ? `${art.key}_${view.rot === 0 ? 'front' : 'back'}` : art.key;
    const centreDepth = depthOf(view.rot, prop.x + prop.w / 2, prop.y + prop.h / 2) + 0.4;
    drawables.push({
      depth: centreDepth,
      draw: () => {
        const drawn = drawSprite(ctx, key, p.x, p.y + art.lift * z, art.h * z);
        if (!drawn) placeholder(ctx, p.x, p.y, 40 * z, 40 * z, '#5a6a4a', prop.kind);
      },
    });
  }

  // Devices.
  for (const device of frame.devices) {
    const p = project(view, device.x + 0.5, device.y + 0.5);
    drawables.push({ depth: depthOf(view.rot, device.x + 0.5, device.y + 0.5) + 0.3, draw: () => drawDevice(ctx, view, frame, device, p) });
  }

  // Placement ghost.
  if (frame.ghost) {
    const ghost = frame.ghost;
    const p = project(view, ghost.x + 0.5, ghost.y + 0.5);
    drawables.push({
      depth: depthOf(view.rot, ghost.x + 0.5, ghost.y + 0.5) + 0.31,
      draw: () => {
        const art = deviceArt(ghost.type, ghost.facing, 'resting');
        drawSprite(ctx, art.key, p.x, p.y + art.lift * z, art.h * z, art.flip, ghost.ok ? 0.75 : 0.4);
      },
    });
  }

  // Infected.
  for (const enemy of frame.enemies) {
    if (!enemy.alive) continue;
    drawables.push({ depth: depthOf(view.rot, enemy.x, enemy.y), draw: () => drawEnemy(ctx, view, frame, enemy) });
  }

  for (const fallen of frame.fallen ?? []) {
    drawables.push({ depth: depthOf(view.rot, fallen.x, fallen.y) - 0.05, draw: () => drawFallen(ctx, view, frame, fallen) });
  }

  // Particles that stand up from the ground.
  for (const particle of frame.particles) {
    if (particle.kind === 'ring' || particle.kind === 'splat') continue;
    drawables.push({ depth: depthOf(view.rot, particle.x, particle.y) + 0.6, draw: () => drawParticle(ctx, view, particle) });
  }

  drawables.sort((a, b) => a.depth - b.depth);
  for (const drawable of drawables) drawable.draw();

  drawTopOverlays(ctx, view, frame);
  ctx.restore();
}

function drawDecals(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame): void {
  for (const decal of frame.decals) {
    if (decal.kind === 'mown') {
      // The one immaculate thing in the garden.
      diamond(ctx, view, decal.x, decal.y, 0.04);
      ctx.fillStyle = 'rgba(142,178,72,0.62)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(196,222,120,0.5)';
      ctx.lineWidth = 1.2 * view.zoom;
      ctx.stroke();
    } else if (decal.kind === 'splat') {
      const p = project(view, decal.x + 0.5, decal.y + 0.5);
      const art = sprite('fx_splat');
      if (art) {
        const w = 40 * view.zoom;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(art.img, p.x - w / 2, p.y - w / 4, w, w / 2);
        ctx.globalAlpha = 1;
      }
    } else {
      const p = project(view, decal.x + 0.5, decal.y + 0.5);
      ctx.fillStyle = 'rgba(70,46,24,0.75)';
      for (let i = 0; i < 4; i++) {
        const angle = (decal.x * 7 + decal.y * 13 + i * 2.1) % Math.PI;
        ctx.save();
        ctx.translate(p.x + Math.cos(i * 2.4) * 10 * view.zoom, p.y + Math.sin(i * 1.7) * 5 * view.zoom);
        ctx.rotate(angle);
        ctx.fillRect(-7 * view.zoom, -1.5 * view.zoom, 14 * view.zoom, 3 * view.zoom);
        ctx.restore();
      }
    }
  }
}

function drawGroundOverlays(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame): void {
  const z = view.zoom;

  if (frame.showBuildable && frame.hoverCell) {
    diamond(ctx, view, frame.hoverCell.x, frame.hoverCell.y, 0.03);
    const tone = !frame.ghost ? 'none' : !frame.ghost.ok ? 'bad' : frame.ghost.idle ? 'idle' : 'good';
    ctx.fillStyle = { none: 'rgba(255,240,200,0.22)', bad: 'rgba(220,70,50,0.45)', idle: 'rgba(240,180,60,0.4)', good: 'rgba(160,220,110,0.4)' }[tone];
    ctx.fill();
    ctx.strokeStyle = { none: 'rgba(255,240,200,0.6)', bad: '#ff6a50', idle: '#ffc24a', good: '#c8f08a' }[tone];
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  if (frame.hoverCell && frame.hoverRadius && frame.hoverRadius > 0) {
    groundRing(ctx, view, frame.hoverCell.x + 0.5, frame.hoverCell.y + 0.5, frame.hoverRadius);
    ctx.fillStyle = 'rgba(242,165,49,0.13)';
    ctx.fill();
    ctx.setLineDash([6 * z, 5 * z]);
    ctx.strokeStyle = 'rgba(242,165,49,0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Where they are predicted to walk: every cell some route steps on, darker where more of them do.
  if (frame.traffic) {
    for (const [cellIndex, count] of frame.traffic) {
      diamond(ctx, view, cellIndex % GRID_W, Math.floor(cellIndex / GRID_W), 0.06);
      ctx.fillStyle = `rgba(255,96,64,${Math.min(0.34, 0.07 + count * 0.022)})`;
      ctx.fill();
    }
  }

  // Predicted walking routes: the visible half of the placement rule.
  if (frame.routes) {
    ctx.lineWidth = 3 * z;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([8 * z, 7 * z]);
    ctx.lineDashOffset = -frame.time * 22 * z;
    ctx.strokeStyle = 'rgba(255,96,64,0.9)';
    for (const route of frame.routes) {
      ctx.beginPath();
      route.forEach((cell, i) => {
        const p = project(view, cell.x + 0.5, cell.y + 0.5);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Mower lanes: telegraphed before the charge.
  for (const lane of frame.lanes ?? []) {
    const pulse = 0.45 + 0.35 * Math.sin(frame.time * 14);
    for (const cell of lane.cells) {
      diamond(ctx, view, cell.x, cell.y, 0.08);
      ctx.fillStyle = `rgba(242,165,49,${(lane.seconds > 0 ? pulse : 0.25) * 0.55})`;
      ctx.fill();
    }
    const first = lane.cells[0];
    const last = lane.cells[lane.cells.length - 1];
    if (first && last) {
      const a = project(view, first.x + 0.5, first.y + 0.5);
      const b = project(view, last.x + 0.5, last.y + 0.5);
      ctx.setLineDash([10 * z, 8 * z]);
      ctx.lineDashOffset = -frame.time * 60 * z;
      ctx.strokeStyle = 'rgba(255,205,90,0.9)';
      ctx.lineWidth = 2.5 * z;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const particle of frame.particles) {
    if (particle.kind === 'ring') {
      const t = particle.age / particle.life;
      groundRing(ctx, view, particle.x, particle.y, (particle.radius ?? 1) * (0.25 + 0.75 * Math.min(1, t * 2.2)));
      ctx.strokeStyle = particle.color ?? '#f2a531';
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 3 * z;
      ctx.stroke();
      ctx.globalAlpha = (1 - t) * 0.18;
      ctx.fillStyle = particle.color ?? '#f2a531';
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (particle.kind === 'splat') {
      const p = project(view, particle.x, particle.y);
      const art = sprite('fx_splat');
      if (art) {
        const w = 44 * z * Math.min(1, particle.age / 0.12);
        ctx.globalAlpha = 0.8 * (1 - particle.age / particle.life);
        ctx.drawImage(art.img, p.x - w / 2, p.y - w / 4, w, w / 2);
        ctx.globalAlpha = 1;
      }
    }
  }
}

function barricadeDrawables(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame, sector: SectorId, depth: number): Drawable[] {
  // Only the two doors on the faces this rotation can see.
  const visible: readonly SectorId[] = view.rot === 0 ? ['portail', 'grange'] : ['arriere', 'verger'];
  if (!visible.includes(sector)) return [];
  const barricade = frame.barricades[sector];
  const max = BARRICADE.maxHp[barricade.level];
  const ratio = barricade.hp / max;
  const state = barricade.hp <= 0 ? 'broken' : ratio <= 0.5 ? 'triggered' : barricade.level === 1 ? 'armed' : 'resting';
  // Door positions on the house art: centre of each visible wall.
  const onLeftFace = sector === 'portail' || sector === 'arriere';
  const mid = (HOUSE.x0 + HOUSE.x1 + 1) / 2;
  const anchor: Record<SectorId, { x: number; y: number }> = {
    portail: { x: mid - 0.25, y: HOUSE.y1 + 1.12 },
    grange: { x: HOUSE.x1 + 1.12, y: mid - 0.05 },
    arriere: { x: mid + 0.25, y: HOUSE.y0 - 0.12 },
    verger: { x: HOUSE.x0 - 0.12, y: mid + 0.05 },
  };
  const p = project(view, anchor[sector].x, anchor[sector].y);
  const z = view.zoom;
  return [
    {
      depth,
      draw: () => {
        const drawn = drawSprite(ctx, `dev_barricade_${state}`, p.x, p.y + 12 * z, 70 * z, !onLeftFace);
        if (!drawn) placeholder(ctx, p.x, p.y, 30 * z, 50 * z, '#7a5a35', 'door');
        if (frame.doorHighlight === sector) {
          ctx.strokeStyle = '#f2a531';
          ctx.lineWidth = 2;
          ctx.strokeRect(p.x - 26 * z, p.y - 62 * z, 52 * z, 74 * z);
        }
        // Door health: always visible, it is the thing being defended.
        const barW = 46 * z;
        const barY = p.y - 66 * z;
        ctx.fillStyle = 'rgba(10,8,6,0.8)';
        ctx.fillRect(p.x - barW / 2 - 1, barY - 1, barW + 2, 6 * z + 2);
        ctx.fillStyle = ratio > 0.5 ? '#9fcf5a' : ratio > 0.2 ? '#f2a531' : '#e0432e';
        ctx.fillRect(p.x - barW / 2, barY, barW * Math.max(0, ratio), 6 * z);
      },
    },
  ];
}

function drawDevice(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame, device: DeviceVisual, p: { x: number; y: number }): void {
  const z = view.zoom;
  const state = deviceSpriteState(device);
  const art = deviceArt(device.type, device.facing, state);

  if (device.highlight) {
    diamond(ctx, view, device.x, device.y, 0.02);
    ctx.fillStyle = 'rgba(242,165,49,0.3)';
    ctx.fill();
    ctx.strokeStyle = '#f2a531';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  let jitterX = 0;
  if (device.state === 'active' && (device.type === 'horn' || device.type === 'log')) jitterX = Math.sin(frame.time * 70) * 1.5 * z;
  const drawn = drawSprite(ctx, art.key, p.x + jitterX, p.y + art.lift * z, art.h * z, art.flip);
  if (!drawn) placeholder(ctx, p.x, p.y, 34 * z, 34 * z, state === 'broken' ? '#4a3a2a' : '#b98a3a', device.type);

  if (device.type !== 'fence' && device.hpRatio < 0.999 && state !== 'broken') {
    const barW = 28 * z;
    ctx.fillStyle = 'rgba(10,8,6,0.75)';
    ctx.fillRect(p.x - barW / 2, p.y + (art.lift + 3) * z, barW, 3 * z);
    ctx.fillStyle = '#d98f3a';
    ctx.fillRect(p.x - barW / 2, p.y + (art.lift + 3) * z, barW * device.hpRatio, 3 * z);
  }

  if (!frame.night) return;
  const mode = DEVICES[device.type].mode;
  if (mode === 'passive') return;
  const top = p.y + art.lift * z - art.h * z;
  const pipY = top - 9 * z;

  if (mode === 'auto') {
    // Automatic traps look after themselves: a small cool-coloured dot, never a key.
    if (device.state === 'broken') cross(ctx, p.x, pipY, 4 * z);
    else {
      ctx.fillStyle = device.state === 'armed' ? 'rgba(150,220,235,0.9)' : 'rgba(90,100,104,0.9)';
      ctx.beginPath();
      ctx.arc(p.x, pipY, 3 * z, 0, Math.PI * 2);
      ctx.fill();
      if (device.state === 'rearming') {
        ctx.strokeStyle = '#cfd6d0';
        ctx.lineWidth = 1.6 * z;
        ctx.beginPath();
        ctx.arc(p.x, pipY, 5 * z, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (device.rearm ?? 0));
        ctx.stroke();
      }
    }
    return;
  }

  if (device.cue) {
    // "Now": a beating ring on the ground and a bigger key.
    const beat = 0.5 + 0.5 * Math.sin(frame.time * 12);
    groundRing(ctx, view, device.x + 0.5, device.y + 0.5, DEVICES[device.type].radius > 0 ? DEVICES[device.type].radius : 0.9);
    ctx.fillStyle = `rgba(255,200,60,${0.1 + beat * 0.14})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,214,90,${0.65 + beat * 0.35})`;
    ctx.lineWidth = (2 + beat * 1.5) * z;
    ctx.stroke();
  }

  // Readiness: a pip above every manual trap — amber ready, grey ring filling while re-arming, red cross broken.
  if (device.state === 'armed') {
    const pulse = 0.75 + 0.25 * Math.sin(frame.time * 6 + device.id);
    ctx.fillStyle = `rgba(255,190,60,${pulse})`;
    ctx.beginPath();
    ctx.arc(p.x, pipY, 5 * z, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,20,0,0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (device.state === 'rearming') {
    ctx.strokeStyle = 'rgba(15,15,15,0.8)';
    ctx.lineWidth = 4 * z;
    ctx.beginPath();
    ctx.arc(p.x, pipY, 5.5 * z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#cfd6d0';
    ctx.lineWidth = 2.5 * z;
    ctx.beginPath();
    ctx.arc(p.x, pipY, 5.5 * z, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (device.rearm ?? 0));
    ctx.stroke();
  } else if (device.state === 'broken') {
    cross(ctx, p.x, pipY, 5 * z);
  }

  if (device.label && device.state !== 'broken') {
    const grow = device.cue ? 1.45 + 0.15 * Math.sin(frame.time * 12) : 1;
    const w = 18 * z * grow;
    const lx = p.x + 12 * z;
    const ly = pipY - 9 * z * grow;
    ctx.fillStyle = device.cue ? '#ffd23c' : device.state === 'armed' ? '#f2a531' : '#3a3a3a';
    ctx.strokeStyle = '#0c0a08';
    ctx.lineWidth = device.cue ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.roundRect(lx - w / 2, ly - w / 2, w, w, 3 * z);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = device.state === 'armed' ? '#1a1206' : '#b9b9b9';
    ctx.font = `700 ${13 * z * grow}px "DIN Condensed","Arial Narrow",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(device.label, lx, ly + 1);
    ctx.textBaseline = 'alphabetic';
  }
}

function cross(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.strokeStyle = '#e0432e';
  ctx.lineWidth = r * 0.5;
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
}

/** Which way a figure faces on screen, from its movement in the grid: right from either side of the house. */
function facingOf(view: View, fx: number, fy: number): { front: boolean; flip: boolean; dirX: number; dirY: number } {
  const sign = view.rot === 0 ? 1 : -1;
  const sdx = (fx - fy) * sign;
  const sdy = (fx + fy) * sign;
  const front = sdy >= -0.05;
  const flip = front ? sdx > 0.05 : sdx < -0.05;
  // The front sprite walks toward the lower-left, the back sprite toward the upper-right.
  const dirX = (front ? -1 : 1) * (flip ? -1 : 1);
  return { front, flip, dirX, dirY: front ? 0.5 : -0.5 };
}

/** The sprite for a pose, with the factor that keeps every pose of a character at the same scale. */
function poseSprite(artKey: string, front: boolean, pose: Pose): { image: Sprite; scale: number } | null {
  const base = `${artKey}_${front ? 'front' : 'back'}`;
  const posed = sprite(`${base}_${pose}`);
  const reference = sprite(`${base}_a`);
  if (posed && reference) return { image: posed, scale: posed.h / reference.h };
  // No animation sheet for this character (or still loading): the single turnaround sprite.
  const single = sprite(base);
  return single ? { image: single, scale: 1 } : null;
}

function drawEnemy(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame, enemy: Enemy): void {
  const z = view.zoom;
  const art = ENEMY_ART[enemy.type];
  const gait = GAIT[enemy.type];
  const p = project(view, enemy.x, enemy.y);
  if (p.x < view.x - 80 * z || p.x > view.x + view.w + 80 * z || p.y < view.y - 20 * z || p.y > view.y + view.h + 110 * z) return;

  const { front, flip, dirX, dirY } = facingOf(view, enemy.fx, enemy.fy);
  const held = enemy.nettedFor > 0 || enemy.stunnedFor > 0;
  const moving = !held && (enemy.action === 'walk' || enemy.action === 'charge');
  const telegraphing = enemy.action === 'windup' || enemy.action === 'rev' || enemy.action === 'speech';

  // Steps: `phase` counts them, bent so that a limping walker takes one long and one short.
  const cadence = ((4 + enemy.def.speed * 5) / Math.PI) * (gait.pace ?? 1) * (0.88 + 0.24 * trait(enemy.id, 1)) * (enemy.hasteFor > 0 ? 1.3 : 1);
  const steps = frame.time * cadence + trait(enemy.id, 2) * 4;
  const phase = steps + (gait.limp / Math.PI) * Math.sin(Math.PI * steps);
  const within = phase - Math.floor(phase);

  let pose: Pose = 'p';
  let bob = 0;
  let tilt = 0;
  let pushX = 0;
  let pushY = 0;
  let shakeX = 0;
  if (moving) {
    pose = WALK_CYCLE[Math.floor(phase * 2) % 4] as Pose;
    // Walkers are lowest on the contact pose and tallest on the passing one; gallopers rise once per bound.
    bob = gait.bob * z * (gait.gallop ? 0.5 + 0.5 * Math.cos(Math.PI * (phase - 0.25)) : 0.5 - 0.5 * Math.cos(2 * Math.PI * (within - 0.25)));
    tilt = gait.rock * Math.sin(Math.PI * phase) + (front ? -1 : 1) * gait.lean * (enemy.action === 'charge' ? 1.8 : 1);
  } else if (enemy.action === 'attack' && !held) {
    // Arms up, then down on the door with the whole body behind them.
    const beat = Math.sin(frame.time * 8 + enemy.id);
    pose = beat > 0 ? 'x' : 'a';
    const strike = Math.max(0, -beat);
    pushX = dirX * strike * 5 * z;
    pushY = dirY * strike * 5 * z;
    tilt = (front ? -1 : 1) * strike * 0.1;
  } else if (telegraphing) {
    pose = 'x';
    shakeX = Math.sin(frame.time * 55 + enemy.id) * 1.6 * z;
  } else if (enemy.action === 'jam') {
    tilt = Math.sin(frame.time * 30) * 0.05;
  }
  if (held) tilt = Math.sin(frame.time * 18 + enemy.id) * 0.05;

  // Taking a blow knocks the figure back for an instant.
  const recoil = Math.min(1, enemy.hitFlash / 0.18);
  pushX -= dirX * recoil * 3.5 * z;
  pushY -= dirY * recoil * 3.5 * z;
  tilt += (front ? 1 : -1) * recoil * 0.12;

  shadow(ctx, p.x, p.y, 15 * enemy.def.size, z);
  if (moving && gait.dust && within < 0.3) {
    // Footfall.
    const t = within / 0.3;
    ctx.fillStyle = `rgba(200,186,150,${0.32 * (1 - t)})`;
    ctx.beginPath();
    ctx.ellipse(p.x - dirX * 6 * z, p.y + 2 * z, (7 + t * 9) * enemy.def.size * z, (3 + t * 3) * enemy.def.size * z, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const stature = enemy.def.boss ? 1 : 0.95 + 0.1 * trait(enemy.id, 3);
  const figure = poseSprite(art.key, front, pose);
  const h = art.h * z * stature;
  ctx.save();
  ctx.translate(p.x + shakeX + pushX, p.y + 4 * z - bob + pushY);
  // Mirror first, so that leaning "forward" needs no second sign for the flipped sprite.
  if (flip) ctx.scale(-1, 1);
  ctx.rotate(tilt);
  if (figure) {
    const fh = h * figure.scale;
    const fw = (figure.image.w / figure.image.h) * fh;
    // A pose much shorter than the stride is a tuck in mid-air (sprinters, anything galloping): it is
    // drawn off the ground rather than squatting on it.
    const air = moving ? Math.max(0, h - fh) * 0.6 : 0;
    ctx.translate(0, -air);
    ctx.drawImage(figure.image.img, -fw / 2, -fh, fw, fh);
    // The cameras' infrared lifts anything warm off the dark ground; a blow flashes brighter still.
    const lift = Math.max(frame.night ? NIGHT_LIFT : 0, Math.min(1, enemy.hitFlash * 6));
    if (lift > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = lift;
      ctx.drawImage(figure.image.img, -fw / 2, -fh, fw, fh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  } else {
    placeholder(ctx, 0, 0, 22 * enemy.def.size * z, h, enemy.def.boss ? '#a8433a' : '#7d9a58', enemy.type);
  }
  ctx.restore();

  const top = p.y - h;

  if (enemy.nettedFor > 0) {
    // A sagging net over the catch.
    ctx.strokeStyle = 'rgba(226,202,150,0.9)';
    ctx.lineWidth = 1.2 * z;
    const rw = 20 * enemy.def.size * z;
    const rh = h * 0.72;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(p.x + i * rw * 0.45, p.y - rh);
      ctx.quadraticCurveTo(p.x + i * rw * 0.6, p.y - rh * 0.4, p.x + i * rw * 0.5, p.y);
      ctx.stroke();
    }
    for (let j = 1; j <= 3; j++) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - (rh * j) / 3.4, rw * (0.75 + j * 0.1), 4 * z, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (enemy.stunnedFor > 0) {
    for (let i = 0; i < 3; i++) {
      const a = frame.time * 6 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = '#ffe58a';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * 11 * z, top - 4 * z + Math.sin(a) * 4 * z, 2.4 * z, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Telegraphs: anything about to hit hard says so first.
  if (enemy.action === 'windup' || enemy.action === 'rev' || enemy.action === 'speech') {
    const blink = Math.sin(frame.time * 16) > 0;
    ctx.fillStyle = blink ? '#ffd23a' : '#e0432e';
    ctx.strokeStyle = '#1a1206';
    ctx.lineWidth = 1.5;
    const s = 11 * z;
    ctx.save();
    ctx.translate(p.x, top - 16 * z);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.fillStyle = '#1a1206';
    ctx.font = `700 ${12 * z}px "DIN Condensed","Arial Narrow",sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('!', p.x, top - 12 * z);
  }
  if (enemy.hasteFor > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2 * z;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(p.x - 14 * z, p.y - (10 + i * 12) * z);
      ctx.lineTo(p.x - 24 * z, p.y - (10 + i * 12) * z);
      ctx.stroke();
    }
  }
  if (enemy.shielded) {
    ctx.strokeStyle = 'rgba(120,150,255,0.75)';
    ctx.lineWidth = 1.5 * z;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 13 * z, 6 * z, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Health: bosses always, others once hurt.
  const ratio = enemy.hp / enemy.def.hp;
  if (enemy.def.boss || ratio < 0.999) {
    const barW = (enemy.def.boss ? 54 : 24) * z;
    const barH = (enemy.def.boss ? 5 : 3) * z;
    const by = top - (enemy.def.boss ? 8 : 5) * z;
    ctx.fillStyle = 'rgba(10,8,6,0.85)';
    ctx.fillRect(p.x - barW / 2 - 1, by - 1, barW + 2, barH + 2);
    ctx.fillStyle = enemy.def.boss ? '#d8483a' : '#c9d36a';
    ctx.fillRect(p.x - barW / 2, by, barW * Math.max(0, ratio), barH);
  }
}

/** Someone who has just been put down: topples backward, then fades into the splat left on the ground. */
function drawFallen(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame, fallen: Fallen): void {
  const z = view.zoom;
  const art = ENEMY_ART[fallen.type];
  const p = project(view, fallen.x, fallen.y);
  const { front, flip } = facingOf(view, fallen.fx, fallen.fy);
  const figure = poseSprite(art.key, front, 'p');
  if (!figure) return;
  const t = Math.min(1, fallen.age / FALL_SECONDS);
  // Falls fast, with a small bounce as it lands.
  const drop = Math.min(1, t / 0.38);
  const eased = drop * drop * (3 - 2 * drop);
  const bounce = t > 0.38 && t < 0.6 ? Math.sin(((t - 0.38) / 0.22) * Math.PI) * 0.07 : 0;
  const angle = (front ? 1 : -1) * (eased * 1.42 - bounce);
  const h = art.h * z * (0.95 + 0.1 * trait(fallen.id, 3)) * figure.scale;
  const w = (figure.image.w / figure.image.h) * h;
  ctx.save();
  ctx.globalAlpha *= t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
  ctx.translate(p.x, p.y + 4 * z);
  if (flip) ctx.scale(-1, 1);
  ctx.rotate(angle);
  ctx.drawImage(figure.image.img, -w / 2, -h, w, h);
  if (frame.night) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= NIGHT_LIFT;
    ctx.drawImage(figure.image.img, -w / 2, -h, w, h);
  }
  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, view: View, particle: Particle): void {
  const z = view.zoom;
  const t = particle.age / particle.life;
  const p = project(view, particle.x, particle.y);
  if (particle.kind === 'text') {
    ctx.globalAlpha = 1 - t * t;
    ctx.font = `700 ${15 * z}px "DIN Condensed","Arial Narrow",sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(12,8,4,0.9)';
    ctx.fillStyle = particle.color ?? '#ffe9b0';
    const y = p.y - (34 + t * 26) * z;
    ctx.strokeText(particle.text ?? '', p.x, y);
    ctx.fillText(particle.text ?? '', p.x, y);
    ctx.globalAlpha = 1;
    return;
  }
  const key = particle.kind === 'burst' ? 'fx_burst' : particle.kind === 'dust' ? 'fx_dust' : 'fx_smoke';
  const art = sprite(key);
  if (!art) return;
  const grow = particle.kind === 'burst' ? 0.5 + t * 0.9 : 0.6 + t * 0.8;
  const size = (particle.radius ?? 1) * 46 * z * grow;
  ctx.globalAlpha = particle.kind === 'burst' ? 1 - t * t : (1 - t) * 0.85;
  ctx.drawImage(art.img, p.x - size / 2, p.y - size * 0.75 - (particle.kind === 'burst' ? 0 : t * 16 * z), size, size * (art.h / art.w));
  ctx.globalAlpha = 1;
}

function drawTopOverlays(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame): void {
  if (!frame.focusSector) return;
  // The lot is split along the grid diagonals, which are the screen's horizontal and vertical
  // through the house: each camera owns one screen quadrant. Shade the rest, softly.
  const pc = project(view, HOUSE_CENTER.x, HOUSE_CENTER.y);
  const axis: Record<SectorId, Cell> = { portail: { x: 0, y: 1 }, grange: { x: 1, y: 0 }, arriere: { x: 0, y: -1 }, verger: { x: -1, y: 0 } };
  const toward = project(view, HOUSE_CENTER.x + axis[frame.focusSector].x, HOUSE_CENTER.y + axis[frame.focusSector].y);
  const sx = Math.sign(toward.x - pc.x) || 1;
  const sy = Math.sign(toward.y - pc.y) || 1;
  const feather = 110 * view.zoom;
  const shadeAlpha = 0.34;

  const horizontal = ctx.createLinearGradient(pc.x, 0, pc.x - sx * feather, 0);
  horizontal.addColorStop(0, 'rgba(4,8,12,0)');
  horizontal.addColorStop(1, `rgba(4,8,12,${shadeAlpha})`);
  ctx.fillStyle = horizontal;
  if (sx > 0) ctx.fillRect(view.x, view.y, Math.max(0, pc.x - view.x), view.h);
  else ctx.fillRect(pc.x, view.y, Math.max(0, view.x + view.w - pc.x), view.h);

  const vertical = ctx.createLinearGradient(0, pc.y, 0, pc.y - sy * feather);
  vertical.addColorStop(0, 'rgba(4,8,12,0)');
  vertical.addColorStop(1, `rgba(4,8,12,${shadeAlpha})`);
  ctx.fillStyle = vertical;
  if (sy > 0) ctx.fillRect(view.x, view.y, view.w, Math.max(0, pc.y - view.y));
  else ctx.fillRect(view.x, pc.y, view.w, Math.max(0, view.y + view.h - pc.y));
}

// ───────────────────────────── Picking ─────────────────────────────

/** The device under the pointer, judged on its drawn sprite (traps are taller than their tile). */
export function pickDevice(view: View, devices: readonly DeviceVisual[], sx: number, sy: number): DeviceVisual | null {
  if (!inView(view, sx, sy)) return null;
  let best: DeviceVisual | null = null;
  let bestDepth = -Infinity;
  for (const device of devices) {
    const art = DEVICE_ART[device.type];
    const p = project(view, device.x + 0.5, device.y + 0.5);
    const h = art.h * view.zoom;
    const w = h * 0.95;
    const bottom = p.y + art.lift * view.zoom;
    if (sx < p.x - w / 2 || sx > p.x + w / 2 || sy < bottom - h - 14 * view.zoom || sy > bottom + 4) continue;
    const depth = depthOf(view.rot, device.x, device.y);
    if (depth > bestDepth) {
      bestDepth = depth;
      best = device;
    }
  }
  if (best) return best;
  const g = unproject(view, sx, sy);
  return devices.find((d) => d.x === Math.floor(g.gx) && d.y === Math.floor(g.gy)) ?? null;
}

/** Which door, if any, is under the pointer (for daytime repairs). */
export function pickDoor(view: View, sx: number, sy: number): SectorId | null {
  const visible: readonly SectorId[] = view.rot === 0 ? ['portail', 'grange'] : ['arriere', 'verger'];
  const g = unproject(view, sx, sy);
  for (const sector of visible) {
    const entry = ENTRIES[sector];
    if (Math.hypot(g.gx - (entry.x + 0.5), g.gy - (entry.y + 0.5)) < 1.1) return sector;
  }
  return null;
}

export { sectorOf };

// ───────────────────────────── Night & CCTV ─────────────────────────────

const lightCanvas = document.createElement('canvas');

export interface Light {
  readonly gx: number;
  readonly gy: number;
  /** Radius on the ground, in cells. */
  readonly radius: number;
  readonly color: string;
  /** Screen-space lift, for lights that hang above the ground (lanterns). */
  readonly lift?: number;
}

/** Multiplies a light map over a view that has just been drawn: dark teal night, warm pools of light. */
export function applyNight(ctx: CanvasRenderingContext2D, view: View, lights: readonly Light[], ambient = '#6d86b4'): void {
  const scale = 0.5;
  const w = Math.ceil(view.w * scale);
  const h = Math.ceil(view.h * scale);
  if (lightCanvas.width !== w || lightCanvas.height !== h) {
    lightCanvas.width = w;
    lightCanvas.height = h;
  }
  const lctx = lightCanvas.getContext('2d') as CanvasRenderingContext2D;
  lctx.globalCompositeOperation = 'source-over';
  lctx.fillStyle = ambient;
  lctx.fillRect(0, 0, w, h);
  lctx.globalCompositeOperation = 'lighter';
  for (const light of lights) {
    const p = project(view, light.gx, light.gy);
    const x = (p.x - view.x) * scale;
    const y = (p.y - view.y - (light.lift ?? 0) * view.zoom) * scale;
    const rx = light.radius * Math.SQRT2 * (TW / 2) * view.zoom * scale;
    lctx.save();
    lctx.translate(x, y);
    lctx.scale(1, 0.62);
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
  ctx.restore();
}

let scanlines: CanvasPattern | null = null;

/** The monitor look: teal cast, scanlines, vignette, a little roll and noise. */
export function applyCctv(ctx: CanvasRenderingContext2D, view: View, time: number, strength = 1): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();

  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle = `rgba(86,140,150,${0.2 * strength})`;
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.globalCompositeOperation = 'source-over';

  if (!scanlines) {
    const tile = document.createElement('canvas');
    tile.width = 4;
    tile.height = 3;
    const tctx = tile.getContext('2d') as CanvasRenderingContext2D;
    tctx.fillStyle = 'rgba(0,0,0,0.22)';
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
  const band = view.y + ((time * 46) % (view.h + 120)) - 60;
  const roll = ctx.createLinearGradient(0, band - 40, 0, band + 40);
  roll.addColorStop(0, 'rgba(255,255,255,0)');
  roll.addColorStop(0.5, `rgba(255,255,255,${0.045 * strength})`);
  roll.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = roll;
  ctx.fillRect(view.x, band - 40, view.w, 80);

  const vignette = ctx.createRadialGradient(view.x + view.w / 2, view.y + view.h / 2, view.h * 0.35, view.x + view.w / 2, view.y + view.h / 2, view.w * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(0,0,0,${0.5 * strength})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.restore();
}

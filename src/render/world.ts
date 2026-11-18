// Isometric renderer for the homestead. It draws whatever state it is handed; it owns no game logic.
// One renderer serves the daytime yard and all four night cameras, so the views cannot disagree.

import { BARRICADE, DEVICES } from '../core/data/devices';
import { ENTRIES, GRID_W, HOUSE, HOUSE_CENTER, PROPS, propAt, sectorOf, type PropKind } from '../core/map';
import type { DeviceRuntimeState, Enemy } from '../core/night';
import type { Cell, Decal, DeviceTypeId, Facing, SectorId } from '../core/types';
import { SECTOR_IDS } from '../core/types';
import { sprite } from '../engine/assets';
import { deviceArt, devicePose, doorPose, drawDefense, type DefenseMotion } from './defenses';
import { drawDecals } from './aftermath';
import { drawEnemy, drawFallen, type Fallen } from './infected';
import { drawGround, prepareGround, setGroundDresser } from './ground';
import { houseDamageStage, paintHouse } from './house';
import { drawHouseDebris, type HouseBreak } from './house-debris';
import { calmMotion, drawCloudShadows, drawMist, type Light } from './lighting';
import { hash2, smoothstep } from './noise';
import { TH, TW, depthOf, groundMatrix, inView, project, unproject, viewX, viewY, type Rot, type View } from './projection';
import { TREES, type Tree } from './scenery';
import { castShadow, contactShadow, groundPatch } from './shadows';

export { TH, TW, cameraView, inView, project, unproject, type Rot, type View } from './projection';
export { applyCctv, applyDaylight, applyNight, type Light } from './lighting';

export interface DeviceVisual {
  readonly id: number;
  readonly type: DeviceTypeId;
  readonly x: number;
  readonly y: number;
  /** How the piece is turned on its cell (see Facing). */
  readonly facing?: Facing;
  readonly state: DeviceRuntimeState | 'idle';
  readonly hpRatio: number;
  readonly activeAge?: number;
  /** 0..1 progress of the re-arm, when rearming. */
  readonly rearm?: number;
  readonly label?: string;
  readonly highlight?: boolean;
  /** Manual trap with enough under it to be worth firing now: drawn so it cannot be missed. */
  readonly cue?: boolean;
  /** By day: a working trap that never went off last night. Marked, so the yard says which ones to move. */
  readonly silent?: boolean;
}

export interface Particle {
  kind: 'burst' | 'dust' | 'ring' | 'text';
  x: number;
  y: number;
  age: number;
  life: number;
  radius?: number;
  text?: string;
  color?: string;
}

export { FALL_SECONDS, type Fallen } from './infected';

export interface Ghost {
  readonly type: DeviceTypeId;
  readonly x: number;
  readonly y: number;
  readonly facing?: Facing;
  readonly ok: boolean;
  /** Allowed, but nobody is predicted to walk within reach of it. */
  readonly idle?: boolean;
}

export const WELL_CLINK_AT = 0.9;
export interface SceneryAction {
  readonly kind: 'car' | 'well';
  readonly startedAt: number;
}

export interface WorldFrame {
  readonly time: number;
  readonly night: boolean;
  readonly houseHpRatio: number;
  readonly houseBreaks?: readonly HouseBreak[];
  readonly carPresent: boolean;
  readonly sceneryAction?: SceneryAction | null;
  readonly devices: readonly DeviceVisual[];
  readonly defenseMotion?: DefenseMotion;
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

// ───────────────────────────── Sprite tables ─────────────────────────────

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
/** Width of the house paintings, in their own pixels: lamp and chimney positions below are given in them. */
const HOUSE_ART_WIDTH = 760;
const HOUSE_ART_HEIGHT: Record<Rot, number> = { 0: 749, 1: 739 };

interface HouseLamp {
  /** Where it is on the painting. */
  readonly x: number;
  readonly y: number;
  /** How far its light reaches, in cells. */
  readonly radius: number;
  readonly strength: number;
  readonly glow: number;
  readonly flicker: number;
  readonly glazedDoor?: SectorId;
  readonly atticWindow?: boolean;
}

/** What is painted on each side of the house that gives light or smoke. */
const HOUSE_ART: Readonly<Record<Rot, { readonly key: string; readonly chimney: { readonly x: number; readonly y: number }; readonly lamps: readonly HouseLamp[] }>> = {
  0: {
    key: 'obj_house_front',
    chimney: { x: 567, y: 18 },
    lamps: [
      { x: 242, y: 321, radius: 1.5, strength: 0.5, glow: 0.45, flicker: 0.25, atticWindow: true },
      { x: 533, y: 364, radius: 1.5, strength: 0.5, glow: 0.45, flicker: 0.25 },
      // The lantern by the barn door.
      { x: 472, y: 562, radius: 2.3, strength: 0.85, glow: 0.9, flicker: 0.55 },
    ],
  },
  1: {
    key: 'obj_house_back',
    chimney: { x: 302, y: 20 },
    lamps: [
      { x: 224, y: 330, radius: 1.3, strength: 0.4, glow: 0.3, flicker: 0.25, atticWindow: true },
      // The glazed doors of the kitchen.
      { x: 563, y: 550, radius: 2.2, strength: 0.6, glow: 0.6, flicker: 0.2, glazedDoor: 'verger' },
    ],
  },
};

/** The grid corner the house painting is hung from, for a side. */
const houseCorner = (rot: Rot): Cell => ({ x: rot === 0 ? HOUSE.x1 + 1 : HOUSE.x0, y: rot === 0 ? HOUSE.y1 + 1 : HOUSE.y0 });

/** A point of the house painting as an offset from that corner, in stage units at zoom 1 (x to the right, y up). */
function housePoint(rot: Rot, x: number, y: number): { dx: number; lift: number } {
  const k = HOUSE_DRAW_WIDTH / HOUSE_ART_WIDTH;
  return { dx: (x - HOUSE_ART_WIDTH / 2) * k, lift: (HOUSE_ART_HEIGHT[rot] - y) * k - HOUSE_LIFT };
}

/** The lit windows and the lantern of the house, for the side a view looks from. */
export function houseLights(rot: Rot, barricades: WorldFrame['barricades'], houseHpRatio = 1): readonly Light[] {
  const corner = houseCorner(rot);
  const stage = houseDamageStage(houseHpRatio);
  const lights: Light[] = [];
  for (const lamp of HOUSE_ART[rot].lamps) {
    if ((lamp.glazedDoor && barricades[lamp.glazedDoor].hp <= 0) || (lamp.atticWindow && stage === 5)) continue;
    const halfPane = lamp.atticWindow && stage === 4;
    lights.push({
      gx: corner.x,
      gy: corner.y,
      ...housePoint(rot, lamp.x, lamp.y + (halfPane ? 16 : 0)),
      radius: lamp.radius * (halfPane ? 0.8 : 1),
      color: `rgba(255, 198, 118, ${lamp.strength * (halfPane ? 0.6 : 1)})`,
      glow: lamp.glow * (halfPane ? 0.55 : 1),
      flicker: lamp.flicker,
      round: true,
    });
  }
  return lights;
}

/** How each fixed thing meets the ground: a soft patch under it and, if it stands tall, the shadow it throws. */
const PROP_SHADOW: Readonly<Record<PropKind, { readonly rx: number; readonly ry: number; readonly contact: number; readonly cast: number }>> = {
  car: { rx: 1.3, ry: 1.8, contact: 0.5, cast: 0 },
  well: { rx: 0.62, ry: 0.62, contact: 0.46, cast: 0.2 },
  woodpile: { rx: 0.7, ry: 0.7, contact: 0.46, cast: 0 },
  veg: { rx: 1.1, ry: 0.62, contact: 0.42, cast: 0 },
  apple: { rx: 0.6, ry: 0.6, contact: 0.42, cast: 0.26 },
  oak: { rx: 0.66, ry: 0.66, contact: 0.44, cast: 0.28 },
  rock: { rx: 0.58, ry: 0.58, contact: 0.42, cast: 0 },
  barrel: { rx: 0.46, ry: 0.46, contact: 0.46, cast: 0.16 },
  mailbox: { rx: 0.3, ry: 0.3, contact: 0.4, cast: 0.24 },
  bush: { rx: 0.62, ry: 0.62, contact: 0.4, cast: 0 },
};

/** Devices tall enough to throw a shadow of their own. */
const DEVICE_CAST: Readonly<Partial<Record<DeviceTypeId, number>>> = { log: 0.2, net: 0.18, floodlight: 0.24, horn: 0.16 };

/** Things with leaves, which the wind moves. */
const SWAYS: ReadonlySet<PropKind> = new Set<PropKind>(['apple', 'oak', 'bush']);

// ───────────────────────────── Drawing helpers ─────────────────────────────

interface Drawable {
  readonly depth: number;
  draw(): void;
}

/** Anything `drawImage` takes, with the size it is meant to be read at. */
interface Picture {
  readonly img: CanvasImageSource;
  readonly w: number;
  readonly h: number;
}

/** `lean` shears the picture about its foot (the wind in a tree): its top moves by `lean` times its height. */
function drawPicture(ctx: CanvasRenderingContext2D, art: Picture, x: number, y: number, height: number, flip = false, alpha = 1, lean = 0): { w: number; h: number } {
  const h = height;
  const w = (art.w / art.h) * h;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (lean !== 0) ctx.transform(1, 0, -lean, 1, x, y);
  else ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(art.img, -w / 2, -h, w, h);
  ctx.restore();
  return { w, h };
}

function drawSprite(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, height: number, flip = false, alpha = 1, lean = 0): { w: number; h: number } | null {
  const art = sprite(key);
  return art ? drawPicture(ctx, art, x, y, height, flip, alpha, lean) : null;
}

/** Coordinates are relative to the top left of the painted prop, before camera zoom. */
function drawSceneryAction(ctx: CanvasRenderingContext2D, kind: SceneryAction['kind'], w: number, h: number, age: number, rot: Rot): void {
  const still = calmMotion();
  ctx.lineCap = 'round';
  if (kind === 'car') {
    if (age >= 0.75) return;
    // The bonnet faces the opposite corner in the reverse painting.
    ctx.translate(w * (rot === 0 ? 0.13 : 0.92), h * (rot === 0 ? 0.79 : 0.32));
    ctx.rotate(rot === 0 ? 2.85 : -0.38);
    for (let i = 0; i < 2; i++) {
      const t = (age - i * 0.13) / 0.62;
      if (t < 0 || t >= 1) continue;
      const radius = 7 + (still ? 7 + 6 * i : 23 * t);
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, radius, -0.56, 0.56);
      ctx.lineWidth = 3.8;
      ctx.strokeStyle = '#392d23';
      ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#f3d898';
      ctx.stroke();
    }
    return;
  }

  const mouthX = w * 0.47;
  const mouthY = h * 0.65;
  if (age < 0.48) {
    const t = age / 0.48;
    // The washer comes in under the roof and passes behind the near lip of the masonry.
    ctx.beginPath();
    ctx.rect(-w, -h, 3 * w, h + mouthY + h * 0.036);
    ctx.clip();
    ctx.translate(mouthX - (1 - t) ** 2 * w * (still ? 0.13 : 0.69), mouthY + h * (0.12 * t * t - (still ? 0.09 : 0.25) * 4 * t * (1 - t)));
    ctx.rotate(still ? 0 : t * 3.8);
    ctx.scale(1, still ? 0.8 : 0.5 + 0.5 * Math.abs(Math.cos(t * 5)));
    ctx.beginPath();
    ctx.arc(0, 0, 3.1, 0, Math.PI * 2);
    ctx.lineWidth = 3.1;
    ctx.strokeStyle = '#382a1e';
    ctx.stroke();
    ctx.lineWidth = 1.65;
    ctx.strokeStyle = '#efdba9';
    ctx.stroke();
  } else if (age >= WELL_CLINK_AT && age < WELL_CLINK_AT + 0.36) {
    const t = (age - WELL_CLINK_AT) / 0.36;
    const r = still ? 6 : 3 + 8 * t;
    ctx.globalAlpha = 0.85 * (1 - t);
    ctx.strokeStyle = '#e7d7b2';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY, r, r * 0.34, 0, 0.1, Math.PI * 1.84);
    ctx.stroke();
  }
}

const recessed = new Map<string, Picture>();
/** How much of the wood's darkness each row of trees has taken on. */
const ROW_DIM = [0, 0.15, 0.29, 0.42] as const;

/**
 * A tree as it looks from the lot when it stands `row` rows back: the same painting with the
 * shade of the wood over it. The rows behind the first sink into the dark instead of standing
 * out as a wall of equally bright trees.
 */
function recessedSprite(key: string, row: number): Picture | undefined {
  const art = sprite(key);
  const dim = ROW_DIM[Math.min(row, ROW_DIM.length - 1)] ?? 0;
  if (!art || dim <= 0) return art;
  const id = `${key}:${row}`;
  const known = recessed.get(id);
  if (known) return known;
  const canvas = document.createElement('canvas');
  canvas.width = art.w;
  canvas.height = art.h;
  const cctx = canvas.getContext('2d');
  if (!cctx) return art;
  cctx.drawImage(art.img, 0, 0, art.w, art.h);
  cctx.globalCompositeOperation = 'source-atop';
  cctx.fillStyle = `rgba(14, 18, 26, ${dim})`;
  cctx.fillRect(0, 0, art.w, art.h);
  const picture: Picture = { img: canvas, w: art.w, h: art.h };
  recessed.set(id, picture);
  return picture;
}

/** How far the wind leans something with leaves, right now. Each thing has its own beat. */
function swayOf(time: number, beat: number): number {
  if (calmMotion()) return 0;
  // A slow swell that comes and goes, with a quicker shiver on top.
  const swell = 0.55 + 0.45 * Math.sin(time * 0.23 + beat * 2.1);
  return (Math.sin(time * 0.9 + beat * 6.283) * 0.011 + Math.sin(time * 2.3 + beat * 11.7) * 0.004) * swell;
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

/** A status bar over something in the world: dark seat, rounded ends, a thin highlight so it reads on any ground. */
function meter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ratio: number, color: string): void {
  const r = h / 2;
  ctx.fillStyle = 'rgba(12, 9, 6, 0.86)';
  ctx.beginPath();
  ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, r + 1.5);
  ctx.fill();
  const filled = w * Math.max(0, Math.min(1, ratio));
  if (filled > 0.5) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, filled, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(x, y, filled, h * 0.38);
    ctx.restore();
  }
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

// ───────────────────────────── Fixed scenery ─────────────────────────────

/** On a side of the lot the view looks across to: its trees stand behind everything. */
const standsFar = (rot: Rot, tree: Tree): boolean => viewX(rot, tree.gx) < 0 || viewY(rot, tree.gy) < 0;

/** On the near sides only some of the trees are shown, and as something low. */
const isUndergrowth = (tree: Tree): boolean => tree.trait < 0.27;

function undergrowthOf(tree: Tree): { key: string; h: number; flip: boolean; sways: boolean } {
  const bush = tree.flip;
  return { key: bush ? 'obj_props2_bush' : 'obj_props2_rock', h: bush ? 40 : 30, flip: tree.trait < 0.12, sways: bush };
}

/**
 * Painted into the ground once, per side of the house: the shadow of everything that never moves,
 * and the rows of trees behind the first. Those rows are behind anything that can happen on the
 * lot, so nothing is lost by not sorting them every frame, and a camera has a third as much to draw.
 */
function dressGround(ctx: CanvasRenderingContext2D, view: View): void {
  const z = view.zoom;
  const trees = TREES.filter((tree) => standsFar(view.rot, tree) || isUndergrowth(tree));

  ctx.save();
  ctx.transform(...groundMatrix(view));
  for (const tree of trees) {
    if (standsFar(view.rot, tree)) {
      if (tree.row === 0) contactShadow(ctx, tree.gx, tree.gy, 0.6, 0.6, 0.4);
    } else contactShadow(ctx, tree.gx, tree.gy, 0.5, 0.5, 0.36);
  }
  for (const prop of PROPS) {
    if (prop.kind === 'car') continue;
    const ground = PROP_SHADOW[prop.kind];
    contactShadow(ctx, prop.x + prop.w / 2, prop.y + prop.h / 2, ground.rx, ground.ry, ground.contact);
  }
  ctx.restore();

  for (const tree of trees) {
    if (!standsFar(view.rot, tree) || tree.row !== 0) continue;
    const p = project(view, tree.gx, tree.gy);
    castShadow(ctx, tree.key, p.x, p.y + 2 * z, tree.h * z, tree.flip, 0.2, 0.8);
  }
  for (const prop of PROPS) {
    const ground = PROP_SHADOW[prop.kind];
    if (ground.cast <= 0) continue;
    const art = PROP_ART[prop.kind];
    const p = project(view, view.rot === 0 ? prop.x + prop.w : prop.x, view.rot === 0 ? prop.y + prop.h : prop.y);
    castShadow(ctx, art.key, p.x, p.y + (art.lift - 6) * z, art.h * z, false, ground.cast);
  }

  // The wood behind the first row, furthest first.
  const back = trees.filter((tree) => standsFar(view.rot, tree) && tree.row > 0).sort((a, b) => depthOf(view.rot, a.gx, a.gy) - depthOf(view.rot, b.gx, b.gy));
  for (const tree of back) {
    const art = recessedSprite(tree.key, tree.row);
    const p = project(view, tree.gx, tree.gy);
    if (art) drawPicture(ctx, art, p.x, p.y + 6 * z, tree.h * z, tree.flip);
  }
}

setGroundDresser(dressGround);

// ───────────────────────────── Main entry ─────────────────────────────

/** Paints whatever is painted once (the ground of both sides of the house), ahead of the first frame. */
export function prepareWorld(): void {
  prepareGround();
}

export function drawWorld(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame): void {
  const z = view.zoom;
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x, view.y, view.w, view.h);
  ctx.clip();
  ctx.fillStyle = '#0c0906';
  ctx.fillRect(view.x, view.y, view.w, view.h);
  // Preserve ink lines at camera scale without doing the terrain bake's expensive filtering every frame.
  ctx.imageSmoothingQuality = 'medium';

  drawGround(ctx, view);

  const drawables: Drawable[] = [];
  /** Shadows go down before anything stands on them; they are collected as the scene is. */
  const contacts: { gx: number; gy: number; rx: number; ry: number; alpha: number }[] = [];
  const casts: (() => void)[] = [];
  // By night the only shadows left are what the moon gives.
  const shade = frame.night ? 0.6 : 1;
  // Thin foreground foliage where it would conceal a fighting figure or one of this side's
  // doorways. The overlap is measured in the current projection, including painter's depth.
  const sightlines: { x: number; y: number; depth: number }[] = [];
  if (frame.night) {
    for (const sector of VISIBLE_DOORS[view.rot]) {
      const sill = doorSill(view, sector);
      sightlines.push({ x: sill.x, y: sill.y - 25 * z, depth: depthOf(view.rot, HOUSE_CENTER.x, HOUSE_CENTER.y) + 1.3 });
    }
    for (const enemy of frame.enemies) {
      if (!enemy.alive) continue;
      const p = project(view, enemy.x, enemy.y);
      sightlines.push({ x: p.x, y: p.y - 27 * z * enemy.def.size, depth: depthOf(view.rot, enemy.x, enemy.y) });
    }
    for (const body of frame.fallen ?? []) {
      const p = project(view, body.x, body.y);
      sightlines.push({ x: p.x, y: p.y - 8 * z, depth: depthOf(view.rot, body.x, body.y) });
    }
  }
  const onScreen = (p: { x: number; y: number }, reach: number): boolean => p.x > view.x - reach * z && p.x < view.x + view.w + reach * z && p.y > view.y - 40 * z && p.y < view.y + view.h + reach * 1.9 * z;

  // Tree line: only the far sides, so the forest never hides the action. The row that borders the
  // lot is drawn here, where the wind can move it and the infected can walk out from behind it; the
  // rows behind it are part of the ground.
  for (const tree of TREES) {
    const far = standsFar(view.rot, tree);
    if (far ? tree.row > 0 : !isUndergrowth(tree)) continue;
    const p = project(view, tree.gx, tree.gy);
    if (!onScreen(p, 120)) continue;
    const depth = depthOf(view.rot, tree.gx, tree.gy);
    if (far) {
      const lean = swayOf(frame.time, tree.trait) * (tree.key === 'obj_trees_pine' ? 0.7 : 1);
      drawables.push({ depth, draw: () => void drawSprite(ctx, tree.key, p.x, p.y + 6 * z, tree.h * z, tree.flip, 1, lean) });
    } else {
      // Near side: undergrowth only, low enough to hide nothing.
      const growth = undergrowthOf(tree);
      const art = recessedSprite(growth.key, tree.row);
      const lean = growth.sways ? swayOf(frame.time, tree.trait) * 1.4 : 0;
      if (art) drawables.push({ depth, draw: () => void drawPicture(ctx, art, p.x, p.y + 8 * z, growth.h * z, growth.flip, 1, lean) });
    }
  }

  // House.
  {
    const side = HOUSE_ART[view.rot];
    const corner = project(view, houseCorner(view.rot).x, houseCorner(view.rot).y);
    const art = sprite(side.key);
    const depth = depthOf(view.rot, HOUSE_CENTER.x, HOUSE_CENTER.y) + 1.2;
    drawables.push({
      depth,
      draw: () => {
        if (art) {
          const w = HOUSE_DRAW_WIDTH * z;
          const h = (art.h / art.w) * w;
          const left = corner.x - w / 2;
          const top = corner.y + HOUSE_LIFT * z - h;
          paintHouse(ctx, view.rot, side.key, art, left, top, w, frame.houseHpRatio, frame.barricades);
          if (frame.houseBreaks?.length) drawHouseDebris(ctx, frame.houseBreaks, view.rot, side.key, art, left, top, w);
          const chimney = housePoint(view.rot, side.chimney.x, side.chimney.y);
          drawChimneySmoke(ctx, corner.x + chimney.dx * z, corner.y - chimney.lift * z, z, frame.time);
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
    const lean = SWAYS.has(prop.kind) ? swayOf(frame.time, hash2(prop.x, prop.y, 3)) : 0;
    let opacity = 1;
    if (SWAYS.has(prop.kind) && sightlines.length) {
      const height = art.h * z;
      const canopyY = p.y + art.lift * z - height * 0.62;
      for (const target of sightlines) {
        if (centreDepth < target.depth) continue;
        const distance = Math.hypot((target.x - p.x) / (height * 0.53), (target.y - canopyY) / (height * 0.45));
        opacity = Math.min(opacity, 0.31 + 0.69 * smoothstep(0.22, 1.15, distance));
      }
    }
    drawables.push({
      depth: centreDepth,
      draw: () => {
        const drawn = drawSprite(ctx, key, p.x, p.y + art.lift * z, art.h * z, false, opacity, lean);
        if (!drawn) placeholder(ctx, p.x, p.y, 40 * z, 40 * z, '#5a6a4a', prop.kind);
        const action = frame.sceneryAction;
        if (drawn && action?.kind === prop.kind) {
          ctx.save();
          ctx.translate(p.x - drawn.w / 2, p.y + art.lift * z - drawn.h);
          ctx.scale(z, z);
          drawSceneryAction(ctx, action.kind, drawn.w / z, art.h, frame.time - action.startedAt, view.rot);
          ctx.restore();
        }
      },
    });
    // The car comes and goes; everything else that is fixed has its shadow in the ground already.
    if (prop.kind === 'car') {
      const ground = PROP_SHADOW.car;
      contacts.push({ gx: prop.x + prop.w / 2, gy: prop.y + prop.h / 2, rx: ground.rx, ry: ground.ry, alpha: ground.contact });
    }
  }

  // Devices.
  for (const device of frame.devices) {
    const p = project(view, device.x + 0.5, device.y + 0.5);
    if (!onScreen(p, 125)) continue;
    drawables.push({ depth: depthOf(view.rot, device.x + 0.5, device.y + 0.5) + 0.3, draw: () => drawDevice(ctx, view, frame, device, p) });
    const broken = device.state === 'broken';
    contacts.push({ gx: device.x + 0.5, gy: device.y + 0.5, rx: 0.56, ry: 0.56, alpha: device.type === 'fence' ? 0.3 : broken ? 0.3 : 0.42 });
    const wear = broken ? frame.defenseMotion?.at(device.id) : undefined;
    const remaining = wear && !calmMotion() ? Math.max(0, 1 - (frame.time - wear.brokeAt) / 0.52) : 0;
    const cast = (DEVICE_CAST[device.type] ?? 0) * (broken ? remaining : 1);
    if (cast > 0) {
      const art = deviceArt(device.type, device.facing, wear?.beforeBreak ?? devicePose(device));
      casts.push(() => castShadow(ctx, art.key, p.x, p.y + (art.lift - 6) * z, art.h * z, art.flip, cast * shade, 0.85));
    }
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
    let depth = depthOf(view.rot, enemy.x, enemy.y);
    const log = enemy.crawlLog;
    if (log && enemy.crawlDepth > 0.6 && Math.floor(enemy.x) === log.x && Math.floor(enemy.y) === log.y) {
      depth = Math.min(depth, depthOf(view.rot, log.x + 0.5, log.y + 0.5));
    }
    drawables.push({ depth, draw: () => drawEnemy(ctx, view, frame, enemy) });
  }

  for (const fallen of frame.fallen ?? []) {
    drawables.push({ depth: depthOf(view.rot, fallen.x, fallen.y) - 0.05, draw: () => drawFallen(ctx, view, frame, fallen) });
  }

  // Particles that stand up from the ground.
  for (const particle of frame.particles) {
    if (particle.kind === 'ring') continue;
    drawables.push({ depth: depthOf(view.rot, particle.x, particle.y) + 0.6, draw: () => drawParticle(ctx, view, particle) });
  }

  // Shadows first, on the bare ground: what is painted over it afterwards (routes, rings) stays legible.
  ctx.save();
  ctx.transform(...groundMatrix(view));
  for (const patch of contacts) contactShadow(ctx, patch.gx, patch.gy, patch.rx, patch.ry, patch.alpha * shade);
  ctx.restore();
  for (const cast of casts) cast();

  drawDecals(ctx, view, frame.decals);
  drawGroundOverlays(ctx, view, frame);

  drawables.sort((a, b) => a.depth - b.depth);
  for (const drawable of drawables) drawable.draw();

  // What is in the air over all of it.
  if (frame.night) drawMist(ctx, view, frame.time);
  else {
    drawCloudShadows(ctx, view, frame.time);
    drawLeaves(ctx, view, frame.time);
  }
  drawTopOverlays(ctx, view, frame);
  ctx.restore();
}

let puff: HTMLCanvasElement | null = null;

function softPuff(): HTMLCanvasElement {
  if (puff) return puff;
  puff = document.createElement('canvas');
  puff.width = 64;
  puff.height = 64;
  const pctx = puff.getContext('2d');
  if (pctx) {
    const gradient = pctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(232, 226, 214, 1)');
    gradient.addColorStop(0.5, 'rgba(226, 220, 208, 0.5)');
    gradient.addColorStop(1, 'rgba(220, 214, 204, 0)');
    pctx.fillStyle = gradient;
    pctx.fillRect(0, 0, 64, 64);
  }
  return puff;
}

const SMOKE_PUFFS = 7;

/**
 * Someone lives here: a thin smoke from the chimney, leaning with the wind. Each puff is a
 * function of the time alone, so every camera sees the same smoke and a paused night holds it still.
 */
function drawChimneySmoke(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, time: number): void {
  const blob = softPuff();
  const t = calmMotion() ? 0 : time;
  for (let i = 0; i < SMOKE_PUFFS; i++) {
    const age = (t * 0.075 + i / SMOKE_PUFFS) % 1;
    const size = (9 + age * 34) * z;
    const px = x + (age * age * 58 + Math.sin(age * 5.2 + i * 1.9) * 4) * z;
    const py = y - (4 + age * 92) * z;
    ctx.globalAlpha = Math.min(1, age / 0.1) * Math.pow(1 - age, 1.4) * 0.5;
    ctx.drawImage(blob, px - size, py - size, size * 2, size * 2);
  }
  ctx.globalAlpha = 1;
}

const LEAF_COLORS = ['#d98a2b', '#c9561f', '#e0b23a', '#a8662a', '#8f3b1c'] as const;
const LEAVES = 18;

/**
 * Autumn: a few leaves coming down over the lot. Each one falls onto a point of the ground, so it
 * drifts with the view when the yard is panned instead of sliding over the picture.
 */
function drawLeaves(ctx: CanvasRenderingContext2D, view: View, time: number): void {
  if (calmMotion()) return;
  const z = view.zoom;
  for (let i = 0; i < LEAVES; i++) {
    const period = 7 + hash2(i, 1, 9) * 6;
    const t = time / period + hash2(i, 2, 9) * 10;
    const fallIndex = Math.floor(t);
    const fall = t - fallIndex;
    const gx = -3 + hash2(i, fallIndex, 11) * (GRID_W + 6);
    const gy = -3 + hash2(i, fallIndex, 12) * (GRID_W + 6);
    const landing = project(view, gx, gy);
    const up = 1 - fall;
    const x = landing.x - up * 54 * z + Math.sin(fall * 9 + i) * 9 * z * up;
    const y = landing.y - up * 190 * z;
    if (x < view.x - 10 || x > view.x + view.w + 10 || y < view.y - 10 || y > view.y + view.h + 10) continue;
    const size = (2.2 + hash2(i, 3, 9) * 1.8) * z;
    ctx.save();
    ctx.globalAlpha = Math.min(1, fall / 0.08) * Math.min(1, up / 0.1) * 0.9;
    ctx.translate(x, y);
    ctx.rotate(fall * (5 + hash2(i, 4, 9) * 9) + i);
    // Seen edge-on half the time, as a tumbling leaf is.
    ctx.scale(1, 0.35 + Math.abs(Math.sin(fall * 13 + i)) * 0.65);
    ctx.fillStyle = LEAF_COLORS[i % LEAF_COLORS.length] as string;
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.quadraticCurveTo(0, -size * 0.75, size, 0);
    ctx.quadraticCurveTo(0, size * 0.75, -size, 0);
    ctx.fill();
    ctx.restore();
  }
}

function drawGroundOverlays(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame): void {
  const z = view.zoom;
  // A cue identifies the trigger's footprint. The hovered trap still shows its full area of effect.
  for (const d of frame.devices) {
    if (!d.cue) continue;
    diamond(ctx, view, d.x, d.y, 0.035);
    ctx.fillStyle = 'rgba(247, 179, 75, 0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 201, 116, 0.74)';
    ctx.lineWidth = 1.4 * z;
    ctx.stroke();
  }

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
    // Laid as soft patches that run into each other: trodden ground, not a grid of red tiles.
    ctx.save();
    ctx.transform(...groundMatrix(view));
    for (const [cellIndex, count] of frame.traffic) {
      groundPatch(ctx, '255, 86, 56', (cellIndex % GRID_W) + 0.5, Math.floor(cellIndex / GRID_W) + 0.5, 0.86, 0.86, Math.min(0.5, 0.12 + count * 0.034));
    }
    ctx.restore();
  }

  // Predicted walking routes: the visible half of the placement rule.
  if (frame.routes) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash([8 * z, 7 * z]);
    ctx.lineDashOffset = calmMotion() ? 0 : -frame.time * 22 * z;
    for (const route of frame.routes) {
      ctx.beginPath();
      route.forEach((cell, i) => {
        const p = project(view, cell.x + 0.5, cell.y + 0.5);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      // A dark seat under the dashes keeps them legible on pale gravel as on dark earth.
      ctx.lineWidth = 5.5 * z;
      ctx.strokeStyle = 'rgba(46, 12, 6, 0.42)';
      ctx.stroke();
      ctx.lineWidth = 2.8 * z;
      ctx.strokeStyle = 'rgba(255, 108, 72, 0.95)';
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
      ctx.lineWidth = 1.6 * z;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// Door sill centres measured on the two original 760px paintings.
const DOOR_SILLS: Record<SectorId, readonly [x: number, y: number, height: number]> = {
  portail: [235, 680, 65], grange: [620, 694, 76], arriere: [227, 669, 64], verger: [566, 657, 73],
};
const VISIBLE_DOORS: Record<Rot, readonly SectorId[]> = { 0: ['portail', 'grange'], 1: ['arriere', 'verger'] };

function doorSill(view: View, sector: SectorId): { x: number; y: number } {
  const corner = houseCorner(view.rot);
  const p = project(view, corner.x, corner.y);
  const [x, y] = DOOR_SILLS[sector];
  const offset = housePoint(view.rot, x, y);
  return { x: p.x + offset.dx * view.zoom, y: p.y - offset.lift * view.zoom };
}

function barricadeDrawables(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame, sector: SectorId, depth: number): Drawable[] {
  if (!VISIBLE_DOORS[view.rot].includes(sector)) return [];
  const barricade = frame.barricades[sector];
  const max = BARRICADE.maxHp[barricade.level];
  const ratio = barricade.hp / max;
  const state = doorPose(ratio, barricade.level);
  const onLeftFace = sector === 'portail' || sector === 'arriere';
  const p = doorSill(view, sector);
  const h = DOOR_SILLS[sector][2];
  const z = view.zoom;
  return [
    {
      depth,
      draw: () => {
        const previous = (pose: ReturnType<typeof doorPose>) => ({ key: `dev_barricade_${pose}`, h, lift: h * 0.09, flip: onLeftFace });
        ctx.save();
        // The brace spans the two barn leaves; the three single doors use the narrower panel.
        if (sector === 'grange') { ctx.translate(p.x, 0); ctx.scale(1.48, 1); ctx.translate(-p.x, 0); }
        const drawn = drawDefense(ctx, p.x, p.y, z, { kind: 'barricade', art: previous(state), previous, hpRatio: ratio, maxHp: max, id: sector, time: frame.time, motion: frame.defenseMotion });
        ctx.restore();
        if (!drawn) placeholder(ctx, p.x, p.y, 30 * z, 50 * z, '#7a5a35', 'door');
        if (frame.doorHighlight === sector) {
          ctx.strokeStyle = '#f2a531';
          ctx.lineWidth = 2;
          const width = sector === 'grange' ? 76 : 46;
          ctx.strokeRect(p.x - width * z / 2, p.y - (h - 4) * z, width * z, h * z);
        }
        // Door health: always in sight by night, it is the thing being defended. By day a sound
        // door needs no bar; the panel has the figures.
        if (frame.night || ratio < 0.999 || frame.doorHighlight === sector) {
          const barW = 46 * z;
          meter(ctx, p.x - barW / 2, p.y - (h + 3) * z, barW, 4 * z, ratio, ratio > 0.5 ? '#9fcf5a' : ratio > 0.2 ? '#f2a531' : '#e0432e');
        }
      },
    },
  ];
}

function drawDevice(ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame, device: DeviceVisual, p: { x: number; y: number }): void {
  const z = view.zoom;
  const state = devicePose(device);
  const art = deviceArt(device.type, device.facing, state);

  if (device.highlight) {
    diamond(ctx, view, device.x, device.y, 0.02);
    ctx.fillStyle = 'rgba(242,165,49,0.3)';
    ctx.fill();
    ctx.strokeStyle = '#f2a531';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const drawn = drawDefense(ctx, p.x, p.y, z, {
    kind: device.type, art, previous: (pose) => deviceArt(device.type, device.facing, pose), id: device.id,
    hpRatio: device.hpRatio, state: device.state, activeAge: device.activeAge ?? 0, rearm: device.rearm ?? 0,
    time: frame.time, motion: frame.defenseMotion,
  });
  if (!drawn) placeholder(ctx, p.x, p.y, 34 * z, 34 * z, state === 'broken' ? '#4a3a2a' : '#b98a3a', device.type);

  if (device.type !== 'fence' && device.hpRatio < 0.999 && state !== 'broken') {
    const barW = 28 * z;
    meter(ctx, p.x - barW / 2, p.y + (art.lift + 3) * z, barW, 3 * z, device.hpRatio, '#d98f3a');
  }

  if (!frame.night) {
    // Never smaller than it reads at: the tag keeps its size when the view is pulled back.
    if (device.silent && state !== 'broken') asleep(ctx, p.x, p.y + art.lift * z - art.h * z - 8 * z, Math.max(1, z), frame.time + device.id);
    return;
  }
  const mode = DEVICES[device.type].mode;
  if (mode === 'passive') return;
  const top = p.y + art.lift * z - art.h * z;
  const pipY = top - 9 * z;

  if (device.state === 'active') {
    // The solid centre covers the instant of release; the outer arc runs down while deployed.
    const left = Math.max(0, 1 - (device.activeAge ?? 0) / DEVICES[device.type].activeSeconds);
    ctx.beginPath(); ctx.arc(p.x, pipY, 3 * z, 0, Math.PI * 2);
    ctx.fillStyle = '#e5f5cd'; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, pipY, 5.5 * z, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    ctx.strokeStyle = '#cde8b8'; ctx.lineWidth = 1.4 * z; ctx.stroke();
  }
  if (mode === 'auto') {
    // Automatic traps look after themselves: a small cool-coloured dot, never a key.
    if (device.state === 'broken') cross(ctx, p.x, pipY, 4 * z);
    else if (device.state !== 'active') {
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

  // Readiness: a pip above every manual trap — amber ready, grey ring filling while re-arming, red cross broken.
  if (device.state === 'armed') {
    const pulse = calmMotion() ? 1 : 0.75 + 0.25 * Math.sin(frame.time * 6 + device.id);
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
    const grow = device.cue ? 1.10 : 1;
    const w = 16 * z * grow;
    const lx = p.x + 12 * z;
    const ly = pipY - 9 * z * grow;
    ctx.fillStyle = device.cue ? '#ffd23c' : device.state === 'armed' ? '#f2a531' : '#3a3a3a';
    ctx.strokeStyle = '#0c0a08';
    ctx.lineWidth = (device.cue ? 1.8 : 1.2) * z;
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

/** "Slept through the night": a small dark tag with two z's drifting up, over a trap nobody walked into. */
function asleep(ctx: CanvasRenderingContext2D, x: number, y: number, z: number, time: number): void {
  const w = 22 * z;
  const h = 13 * z;
  ctx.fillStyle = 'rgba(12, 9, 6, 0.82)';
  ctx.strokeStyle = 'rgba(255, 194, 74, 0.75)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffc24a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const bob = Math.sin(time * 1.6) * 0.8 * z;
  ctx.font = `italic 700 ${9 * z}px "DIN Condensed","Arial Narrow",sans-serif`;
  ctx.fillText('z', x - 4 * z, y + 1.5 * z + bob);
  ctx.font = `italic 700 ${11 * z}px "DIN Condensed","Arial Narrow",sans-serif`;
  ctx.fillText('z', x + 3.5 * z, y - 0.5 * z - bob);
  ctx.textBaseline = 'alphabetic';
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
  // Dust leaves the point of contact along the ground. Heavier grains arc up, land, and settle.
  const force = particle.radius ?? 1;
  const rotation = view.rot === 0 ? 1 : -1;
  const seed = Math.floor(particle.x * 37 + particle.y * 101);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(rotation * z, z);
  const dust = sprite('fx_dust');
  if (dust) {
    for (const side of [-1, 1]) {
      const width = force * (10 + t * 21);
      const height = width * (side < 0 ? 0.33 : 0.44);
      const spread = side * force * (3 + 13 * Math.sin(t * Math.PI / 2));
      ctx.globalAlpha = Math.min(1, t * 14) * (1 - t) ** 1.6 * 0.62;
      ctx.drawImage(dust.img, spread - width / 2, -height - 3 * t, width, height);
    }
  }
  if (particle.kind === 'burst') {
    for (let i = 0; i < 7; i++) {
      const angle = (i + hash2(i, seed, 21) * 0.7) * Math.PI * 2 / 7;
      const travel = force * (12 + hash2(i, seed, 22) * 11) * t;
      const lift = force * (9 + hash2(i, seed, 23) * 12) * 4 * t * (1 - t);
      ctx.save();
      ctx.translate(Math.cos(angle) * travel, Math.sin(angle) * travel * 0.5 - lift);
      ctx.rotate(angle + t * 3);
      ctx.globalAlpha = Math.min(1, (1 - t) * 4);
      ctx.fillStyle = i % 2 === 0 ? '#d3ba87' : '#978260';
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(1, -1.3);
      ctx.lineTo(2.6, 0.4);
      ctx.lineTo(0, 1.2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
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
  const shadeAlpha = 0.22;

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
    const art = deviceArt(device.type, device.facing, devicePose(device));
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

/** The piece of scenery of one of `kinds` whose footprint is under the pointer, if any. */
export function pickProp(view: View, kinds: readonly PropKind[], sx: number, sy: number): PropKind | null {
  if (!inView(view, sx, sy)) return null;
  const g = unproject(view, sx, sy);
  return propAt(g.gx, g.gy, kinds);
}

/** Which door, if any, is under the pointer (for daytime repairs). */
export function pickDoor(view: View, sx: number, sy: number): SectorId | null {
  const g = unproject(view, sx, sy);
  for (const sector of VISIBLE_DOORS[view.rot]) {
    const p = doorSill(view, sector);
    const halfWidth = (sector === 'grange' ? 39 : 24) * view.zoom;
    if (Math.abs(sx - p.x) < halfWidth && sy > p.y - DOOR_SILLS[sector][2] * view.zoom && sy < p.y + 5 * view.zoom) return sector;
    const entry = ENTRIES[sector];
    if (Math.hypot(g.gx - (entry.x + 0.5), g.gy - (entry.y + 0.5)) < 1.1) return sector;
  }
  return null;
}

export { sectorOf };

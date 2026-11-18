// Directional character cels share a foot anchor across all four cameras. The combat simulation
// owns travel and action time, so a paused, obstructed or restrained character cannot tread air.

import { BOSS } from '../core/data/enemies';
import { BLOW_RECOVERY_SECONDS, HIT_REACTION_SECONDS, type Enemy } from '../core/night';
import type { EnemyTypeId } from '../core/types';
import { sprite, type Sprite } from '../engine/assets';
import { calmMotion } from './lighting';
import { smoothstep } from './noise';
import { project, type View } from './projection';
import { contactShadow } from './shadows';

export interface Fallen {
  readonly id: number;
  readonly type: EnemyTypeId;
  readonly x: number;
  readonly y: number;
  readonly fx: number;
  readonly fy: number;
  age: number;
}

export const FALL_SECONDS = 2.6;

interface CharacterArt {
  readonly key: string;
  readonly row: number;
  readonly height: number;
  /** Grid cells travelled in a complete two-step gait cycle. */
  readonly stride: number;
  readonly bounce: number;
  readonly animal?: boolean;
  readonly wheels?: boolean;
  readonly heavy?: boolean;
  /** The artist drew these original front stride cels facing screen right. */
  readonly reverseFrontStride?: boolean;
}

const ART: Readonly<Record<EnemyTypeId, CharacterArt>> = {
  shambler: { key: 'en_shambler', row: 0, height: 64, stride: 0.85, bounce: 0.026 },
  runner: { key: 'en_runner', row: 1, height: 64, stride: 1.19, bounce: 0.045 },
  brute: { key: 'en_brute', row: 2, height: 84, stride: 0.76, bounce: 0.024, heavy: true },
  dog: { key: 'en_dog', row: 3, height: 40, stride: 1.18, bounce: 0.066, animal: true },
  boar: { key: 'en_boar', row: 4, height: 54, stride: 1.08, bounce: 0.052, animal: true, heavy: true },
  deer: { key: 'en_deer', row: 5, height: 74, stride: 1.52, bounce: 0.058, animal: true, reverseFrontStride: true },
  mower: { key: 'boss_mower', row: 6, height: 82, stride: 1.35, bounce: 0.009, wheels: true },
  mechanic: { key: 'boss_mechanic', row: 7, height: 92, stride: 0.92, bounce: 0.009, wheels: true, heavy: true, reverseFrontStride: true },
  mail: { key: 'boss_mail', row: 8, height: 76, stride: 1.37, bounce: 0.046 },
  chief: { key: 'boss_chief', row: 9, height: 86, stride: 0.88, bounce: 0.021, heavy: true },
  mayor: { key: 'boss_mayor', row: 10, height: 96, stride: 2.0, bounce: 0.006, wheels: true, heavy: true },
};

const CLIPS = ['walk', 'run', 'grip', 'hit', 'fall', 'dead'] as const;
const CRAWL_CLIPS = ['kneel', 'crawlLeft', 'crawlGather', 'crawlRight'] as const;
const CRAWL_CYCLE = ['crawlLeft', 'crawlGather', 'crawlRight', 'crawlGather'] as const;
type Clip = (typeof CLIPS)[number];
type CrawlClip = (typeof CRAWL_CLIPS)[number];
type Pose = Clip | CrawlClip | 'a' | 'p' | 'b' | 'x';
interface Figure {
  readonly source: Sprite;
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  /** Dimensions in multiples of the standing character height. */
  readonly width: number;
  readonly height: number;
  readonly reverse: boolean;
}

const figures = new Map<string, Figure>();
function figureFor(art: CharacterArt, front: boolean, pose: Pose): Figure | null {
  const base = art.key + (front ? '_front' : '_back');
  const key = base + '_' + pose;
  const known = figures.get(key);
  if (known) return known;
  let figure: Figure;
  const clip = CLIPS.indexOf(pose as Clip);
  const crawl = CRAWL_CLIPS.indexOf(pose as CrawlClip);
  const atlas = clip >= 0 ? sprite('defense_mob_poses') : undefined;
  if (crawl >= 0) {
    const sheet = sprite('defense_crawl');
    if (!sheet) return figureFor(art, front, 'fall');
    const cw = sheet.w / CRAWL_CLIPS.length;
    const ch = sheet.h / 4;
    const row = (art.key === 'en_dog' ? 2 : 0) + (front ? 0 : 1);
    // In this atlas 128 source pixels are one standing character height.
    figure = { source: sheet, sx: crawl * cw, sy: row * ch, sw: cw, sh: ch, width: cw / 128, height: ch / 128, reverse: false };
  } else if (atlas) {
    const cw = atlas.w / (CLIPS.length * 2);
    const ch = atlas.h / 11;
    figure = { source: atlas, sx: (clip * 2 + (front ? 0 : 1)) * cw, sy: art.row * ch, sw: cw, sh: ch, width: 2, height: 2 * ch / cw, reverse: false };
  } else {
    const reference = sprite(base + '_a') ?? sprite(base);
    const source = sprite(key) ?? (pose === 'grip' ? sprite(base + '_x') : undefined) ?? reference;
    if (!source || !reference) return null;
    const reverse = front && art.reverseFrontStride === true && (pose === 'a' || pose === 'p' || pose === 'b');
    figure = { source, sx: 0, sy: 0, sw: source.w, sh: source.h, width: source.w / reference.h, height: source.h / reference.h, reverse };
  }
  figures.set(key, figure);
  return figure;
}

const TAU = Math.PI * 2;
const NIGHT_LIFT = 0.32;
const trait = (id: number): number => {
  const a = Math.sin(id * 12.9898 + 9.127) * 43758.5453;
  return a - Math.floor(a);
};
const stature = (art: CharacterArt, id: number): number => art.row >= 6 ? 1 : 0.965 + 0.07 * trait(id);

function facing(view: View, fx: number, fy: number) {
  const sign = view.rot === 0 ? 1 : -1;
  const dx = (fx - fy) * sign;
  const dy = (fx + fy) * sign;
  const front = Math.abs(dy) < 0.08 ? view.rot === 0 : dy > 0;
  const dir = Math.abs(dx) < 0.04 ? (front ? -1 : 1) : Math.sign(dx);
  return { front, dir, flip: front ? dir > 0 : dir < 0, depth: front ? 0.38 : -0.38 };
}

interface Movement {
  pose: Pose;
  /** Displacement and squash use standing height as unit; forward is movement towards the target. */
  forward: number;
  up: number;
  lean: number;
  squash: number;
  flash: number;
  step: number;
}

const grounded: Movement = { pose: 'p', forward: 0, up: 0, lean: 0, squash: 1, flash: 0, step: 1 };

function motion(e: Enemy, art: CharacterArt, reduced: boolean): Movement {
  const m = { ...grounded };
  if (e.hitFlash > 0) {
    const t = 1 - e.hitFlash / HIT_REACTION_SECONDS;
    const recoil = (1 - smoothstep(0.24, 1, t)) * (0.65 + 0.35 * smoothstep(0, 0.15, t));
    m.pose = 'hit';
    m.forward = -0.065 * recoil;
    m.lean = -0.09 * recoil;
    m.squash = 1 - 0.045 * recoil;
    m.flash = 0.4 * (1 - smoothstep(0, 0.3, t));
  } else if (e.nettedFor > 0 || e.stunnedFor > 0 || e.action === 'jam') {
    m.pose = e.crawlDepth > 0.5 ? 'crawlGather' : 'p';
    m.squash = 0.96;
  } else if (e.action === 'crawl' || (e.action === 'walk' && e.crawlDepth > 0)) {
    const phase = (e.travel / (art.animal ? 0.83 : 0.68) + trait(e.id)) % 1;
    m.pose = e.crawlDepth < 0.6 ? 'kneel' : CRAWL_CYCLE[Math.floor(phase * 4)]!;
    m.squash = e.crawlDepth < 0.6 ? 1 - 0.14 * e.crawlDepth : 1 - 0.025 * Math.sin(TAU * phase);
    m.forward = 0.023 * Math.sin(TAU * phase);
    m.lean = 0.022 * Math.cos(TAU * phase);
  } else if (e.blowRecovery > 0 || e.action === 'attack') {
    // A discrete blow starts at contact. Continuous attackers reach, keep their grip, tug and release.
    const impact = e.blowRecovery > 0;
    const cycle = art.animal ? 0.71 : 0.92;
    const t = impact ? 0.29 + (1 - e.blowRecovery / BLOW_RECOVERY_SECONDS) * 0.68 : (e.actionSeconds / (cycle * (0.94 + 0.12 * trait(e.id)))) % 1;
    const reach = smoothstep(0.1, 0.3, t) * (1 - smoothstep(0.7, 1, t));
    const raisedFists = e.type === 'shambler' || e.type === 'brute';
    m.pose = t < 0.1 || t > 0.94 ? 'p' : t < 0.23 && raisedFists ? 'x' : 'grip';
    m.forward = 0.095 * reach;
    m.lean = reach * 0.07;
    m.squash = 1 - 0.038 * reach;
  } else if (e.action === 'windup' || e.action === 'rev' || e.action === 'speech') {
    const build = Math.min(1, e.actionSeconds / e.def.windupSeconds);
    m.pose = 'x';
    m.forward = -0.035 * build;
    m.lean = -0.07 * build;
    m.squash = 1 - 0.045 * build;
  } else if (e.type === 'chief' && e.boss && e.boss.ability > BOSS.chief.whistleEvery - 0.42) {
    m.pose = 'x';
  } else if (e.action === 'walk' || e.action === 'charge') {
    const run = e.action === 'charge' || e.hasteFor > 0 || e.moveSpeed >= 1.45;
    const cycle = e.travel / art.stride + trait(e.id);
    const phase = cycle - Math.floor(cycle);
    const segment = Math.floor(phase * 4);
    m.pose = segment === 0 ? 'a' : segment === 1 ? (run ? 'run' : 'walk') : segment === 2 ? 'b' : 'p';
    const stride = art.animal && run ? phase : (phase * 2) % 1;
    const lift = 0.5 - 0.5 * Math.cos(TAU * stride);
    m.up = lift * art.bounce * (run ? 1.1 : 0.75);
    if (m.pose === 'run' && !art.wheels) m.up += 0.08;
    m.lean = (run && !art.wheels ? 0.065 : 0.014) + Math.sin(TAU * phase) * (art.wheels ? 0.008 : 0.022);
    m.squash = 1 - (1 - lift) * (run && !art.wheels ? 0.022 : 0.009);
    m.step = stride;
  }
  if (reduced) {
    m.lean = 0;
    m.up = 0;
    m.forward *= 0.35;
    m.flash = 0;
  }
  return m;
}

function paintCel(ctx: CanvasRenderingContext2D, f: Figure, x: number, y: number, w: number, h: number): void {
  ctx.drawImage(f.source.img, f.sx, f.sy, f.sw, f.sh, x, y, w, h);
}

/** Rope lies on the cutout under the head. Pre-mask it per cel so a crowd never becomes a stack of cages. */
const netOverlays = new WeakMap<Figure, HTMLCanvasElement>();
function netOverlay(f: Figure): HTMLCanvasElement {
  const known = netOverlays.get(f);
  if (known) return known;
  const base = 110;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(base * f.width);
  canvas.height = Math.ceil(base * f.height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const bottom = canvas.height - base * 0.12;
    const top = Math.max(0, canvas.height - base * 0.72);
    ctx.beginPath();
    ctx.rect(0, top, canvas.width, bottom - top);
    ctx.clip();
    ctx.beginPath();
    for (let x = -base; x < canvas.width + base; x += base * 0.23) {
      for (const side of [-1, 1]) {
        ctx.moveTo(x, top);
        ctx.quadraticCurveTo(x + side * base * 0.13, top + base * 0.32, x + side * base * 0.46, bottom);
      }
    }
    ctx.strokeStyle = '#3e301b';
    ctx.lineWidth = 3.3;
    ctx.stroke();
    ctx.strokeStyle = '#c6ab72';
    ctx.lineWidth = 1.55;
    ctx.stroke();
    ctx.globalCompositeOperation = 'destination-in';
    paintCel(ctx, f, 0, 0, canvas.width, canvas.height);
  }
  netOverlays.set(f, canvas);
  return canvas;
}

// The infrared exposure is fixed for a live or fallen character. Bake the small source
// rectangle once, so each camera can blit the figure with one ordinary source-over draw.
type Exposure = 'live' | 'net' | 'fallen';
const cameraCels = new WeakMap<Figure, Partial<Record<Exposure, HTMLCanvasElement>>>();
function cameraCel(f: Figure, exposure: Exposure): HTMLCanvasElement | undefined {
  let cels = cameraCels.get(f);
  if (!cels) {
    cels = {};
    cameraCels.set(f, cels);
  }
  if (cels[exposure]) return cels[exposure];
  const canvas = document.createElement('canvas');
  canvas.width = f.sw;
  canvas.height = f.sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  const lift = exposure === 'fallen' ? NIGHT_LIFT * 0.55 : NIGHT_LIFT;
  if (typeof ctx.filter === 'string') {
    ctx.filter = `brightness(${1 + lift})`;
    paintCel(ctx, f, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
  } else {
    paintCel(ctx, f, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = lift;
    paintCel(ctx, f, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  if (exposure === 'net') ctx.drawImage(netOverlay(f), 0, 0, canvas.width, canvas.height);
  cels[exposure] = canvas;
  return canvas;
}

function drawFigure(ctx: CanvasRenderingContext2D, f: Figure, height: number, exposure: Exposure, night: boolean, flash = 0): void {
  const w = f.width * height;
  const h = f.height * height;
  ctx.save();
  if (f.reverse) ctx.scale(-1, 1);
  const baked = night ? cameraCel(f, exposure) : undefined;
  if (baked) ctx.drawImage(baked, -w / 2, -h, w, h);
  else {
    paintCel(ctx, f, -w / 2, -h, w, h);
    if (exposure === 'net') ctx.drawImage(netOverlay(f), -w / 2, -h, w, h);
  }
  if (flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= flash;
    paintCel(ctx, f, -w / 2, -h, w, h);
  }
  ctx.restore();
}

interface Moment { readonly time: number; readonly night: boolean }

export function drawEnemy(ctx: CanvasRenderingContext2D, view: View, frame: Moment, enemy: Enemy): void {
  const z = view.zoom;
  const art = ART[enemy.type];
  const p = project(view, enemy.x, enemy.y);
  if (p.x < view.x - 110 * z || p.x > view.x + view.w + 110 * z || p.y < view.y - 25 * z || p.y > view.y + view.h + 125 * z) return;
  const { front, dir, flip, depth } = facing(view, enemy.fx, enemy.fy);
  const h = art.height * z * stature(art, enemy.id);
  const reduced = calmMotion();
  const movement = motion(enemy, art, reduced);
  const f = figureFor(art, front, movement.pose);
  if (f && !reduced && movement.step < 1 && movement.pose === 'p' && !art.wheels) {
    // With legs tucked, the bottom of the cel is the lifted foot. Keep the chest
    // near the stride's shoulder line while a grounded walker retains a little dip.
    const flight = art.animal || enemy.type === 'runner' || enemy.type === 'mail';
    movement.up += Math.max(0, 1 - f.height) * (flight ? 0.8 : 0.45);
  }

  contactShadow(ctx, p.x, p.y + z, 18 * enemy.def.size * z, 7 * enemy.def.size * z, 0.58 - movement.up);
  if (art.heavy && movement.step < 0.24 && !reduced) {
    const t = movement.step / 0.24;
    ctx.fillStyle = 'rgba(172,154,121,' + (0.19 * (1 - t)) + ')';
    ctx.beginPath();
    ctx.ellipse(p.x - dir * h * 0.06, p.y + z, h * (0.08 + t * 0.12), h * (0.025 + t * 0.032), 0, 0, TAU);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(p.x + dir * movement.forward * h, p.y + 3 * z + h * (movement.forward * depth - movement.up));
  ctx.rotate(dir * movement.lean);
  ctx.scale(flip ? -1 : 1, movement.squash);
  if (f) drawFigure(ctx, f, h, enemy.nettedFor > 0 ? 'net' : 'live', frame.night, movement.flash);
  else {
    ctx.fillStyle = enemy.def.boss ? '#a8433a' : '#7d9a58';
    ctx.beginPath();
    ctx.ellipse(0, -h / 2, h * 0.22, h / 2, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  const top = p.y - h;
  if (enemy.stunnedFor > 0) {
    for (let i = 0; i < 3; i++) {
      const a = (reduced ? 0 : frame.time * 6) + (i * Math.PI * 2) / 3;
      ctx.fillStyle = '#ffe58a';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * 11 * z, top - 4 * z + Math.sin(a) * 4 * z, 2.4 * z, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Telegraphs: anything about to hit hard says so first.
  if (enemy.action === 'windup' || enemy.action === 'rev' || enemy.action === 'speech') {
    const blink = reduced || Math.sin(frame.time * 10) > 0;
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
      ctx.moveTo(p.x - dir * 14 * z, p.y - (10 + i * 12) * z);
      ctx.lineTo(p.x - dir * 24 * z, p.y - (10 + i * 12) * z);
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

// Each cel has its own silhouette: recoil, knees buckling, then a fully prone resting pose.
// Changes of drawing coincide with the fastest movement, followed by a long still hold.
export function drawFallen(ctx: CanvasRenderingContext2D, view: View, frame: Moment, body: Fallen): void {
  const art = ART[body.type];
  const h = art.height * view.zoom * stature(art, body.id);
  const age = body.age;
  const opacity = 1 - smoothstep(FALL_SECONDS - 0.62, FALL_SECONDS, age);
  if (opacity <= 0) return;
  const { front, flip, dir, depth } = facing(view, body.fx, body.fy);
  const pose: Pose = age < 0.12 ? 'hit' : age < 0.39 ? 'fall' : 'dead';
  const cel = figureFor(art, front, pose);
  if (!cel) return;
  const p = project(view, body.x, body.y);
  const reduced = calmMotion();
  const collapse = smoothstep(0.04, 0.45, age);
  const buckle = smoothstep(0.12, 0.39, age);
  const settle = age >= 0.39 && age < 0.55 ? Math.sin((age - 0.39) / 0.16 * Math.PI) : 0;
  const x = p.x - dir * h * collapse * (reduced ? 0.03 : 0.115);
  const y = p.y + view.zoom * 3 - depth * h * collapse * 0.07;
  contactShadow(ctx, x, y - h * collapse * 0.075, h * (0.22 + 0.15 * collapse), h * (0.075 + 0.03 * collapse), 0.51 * opacity);
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.translate(x, y);
  if (!sprite('defense_mob_poses')) ctx.rotate(-dir * collapse * 1.35);
  else if (!reduced && pose !== 'dead') ctx.rotate(dir * (pose === 'hit' ? -0.08 : -buckle * 0.13));
  const squash = pose === 'fall' ? 1 - 0.22 * buckle : 1 - 0.045 * settle;
  ctx.scale(flip ? -1 : 1, reduced ? 1 : squash);
  drawFigure(ctx, cel, h, 'fallen', frame.night);
  ctx.restore();
}

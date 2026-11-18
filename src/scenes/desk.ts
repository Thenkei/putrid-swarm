// The protagonist's desk, as seen from the chair: the picture behind the title menu and the news.
// Nothing here is needed to play. The mug and the joint are drawn over the plate rather than painted
// into it, so a hand — the player's, seen from the player's eyes — can pick them up; every wisp of
// smoke is drawn too, so it moves and parts around the pointer; the lamp's filament is tired.

import { STAGE_H, STAGE_W } from '../engine/app';
import { assetUrl, sprite, type Sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { Decks } from '../engine/deck';
import { el } from '../engine/dom';
import { haze } from '../engine/haze';
import { S } from '../engine/i18n';
import { say, sayAny, type VoiceId } from '../engine/voice';
import { drawPlate } from './common';

/** Vertical framing of the desk plate; the `.crt` overlay in styles.css is aligned to it. */
export const DESK_FOCUS_Y = 0.3;
const PLATE = 'plate_title_desk';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

export const inside = (r: Rect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// ───────────────────────────── Where things are on the plate ─────────────────────────────
// Stage coordinates, for the framing DESK_FOCUS_Y.

const SCREEN: Rect = { x: 327, y: 58, w: 553, h: 399 };
export const POWER: Rect = { x: 760, y: 470, w: 126, h: 30 };
export const SPEAKER: Rect = { x: 128, y: 334, w: 138, h: 208 };
export const JOINT: Rect = { x: 1072, y: 492, w: 122, h: 78 };
export const MUG: Rect = { x: 936, y: 378, w: 152, h: 146 };
const POWER_LED: Point = { x: 867, y: 484 };
const SPEAKER_CONE: Point = { x: 196, y: 440 };
const BULB: Point = { x: 1183, y: 210 };
/** Centre of the pool of light the lamp throws on the desk. */
const LAMP_POOL: Point = { x: 1130, y: 430 };
/** The sticky note on the monitor's casing, outline included. */
const NOTE: readonly Point[] = [
  { x: 190, y: 0 },
  { x: 355, y: 0 },
  { x: 371, y: 85 },
  { x: 206, y: 135 },
];

// ───────────────────────────── Things that can be picked up ─────────────────────────────

type Item = 'joint' | 'mug';

/**
 * Heights the sprites are drawn at. They keep the proportions they have on their sheet (0.8 stage
 * pixel per sheet pixel), so the mug in the hand is the size of the mug on the desk.
 */
const HEIGHT = { mug: 146, joint: 86, handOpen: 590, handJoint: 604, handMug: 555 } as const;

interface Anchor {
  /** Fractions of the sprite's width and height. */
  readonly fx: number;
  readonly fy: number;
}

const PALM_OPEN: Anchor = { fx: 0.51, fy: 0.19 };

interface Holding {
  readonly key: string;
  readonly height: number;
  /** Centre of the thing held, and of the palm holding it. */
  readonly grip: Anchor;
  readonly palm: Anchor;
}

const HOLDING: Readonly<Record<Item, Holding>> = {
  joint: { key: 'desk_hand_joint', height: HEIGHT.handJoint, grip: { fx: 0.14, fy: 0.056 }, palm: { fx: 0.465, fy: 0.21 } },
  mug: { key: 'desk_hand_mug', height: HEIGHT.handMug, grip: { fx: 0.22, fy: 0.128 }, palm: { fx: 0.64, fy: 0.123 } },
};
/** The lit end of the joint, in the sprite of the hand holding it and in the joint's own. */
const EMBER_HELD: Anchor = { fx: 0.064, fy: 0.012 };
const EMBER_LYING: Anchor = { fx: 0.88, fy: 0.1 };

interface Pose {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  /** Radians, clockwise. Negative: the forearm leaves toward the lower right, where the player sits. */
  readonly angle: number;
}

/** Where each thing rests, and where it ends up: right under the camera, which is the player's face. */
const REST: Readonly<Record<Item, Pose>> = {
  joint: { x: 1128, y: 532, scale: 1, angle: 0.42 },
  mug: { x: 1012, y: 451, scale: 1, angle: 0 },
};
const ARM_REST: Readonly<Record<Item, number>> = { joint: -0.3, mug: -0.36 };
const MOUTH: Readonly<Record<Item, Pose>> = {
  joint: { x: 650, y: 585, scale: 2.1, angle: -0.1 },
  mug: { x: 640, y: 690, scale: 2.2, angle: -0.34 },
};
const OFFSTAGE: Pose = { x: 1380, y: 900, scale: 1, angle: -0.55 };

/** Seconds of each part of the gesture: reach, lift to the mouth, stay, put back, withdraw. */
const REACH = 0.42;
const LIFT = 0.62;
const STAY: Readonly<Record<Item, number>> = { joint: 1.7, mug: 1.3 };
const BACK = 0.6;
const LEAVE = 0.42;

const REMARK_CHANCE_LATER = 0.4;
const MEME_SECONDS = 3.2;
/** Seconds the coffee steams harder after it has been put down. */
const SIP_STEAM_SECONDS = 2.6;

/** The pointer pushes smoke aside within this many pixels. */
const WISP_REACH = 52;
const WISP_PUSH = 26;

/** The bulb falters once per period, at a moment that differs from one period to the next. */
const BULB_PERIOD = 7.5;
const BULB_DIP_SECONDS = 0.45;

export const VOLUME_STEP_CLICK = 0.25;
export const VOLUME_STEP_WHEEL = 0.05;
const VOLUME_SHOWN_SECONDS = 1.8;

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  age: number;
  life: number;
  rotation: number;
}

interface Gesture {
  readonly item: Item;
  readonly at: number;
  /** Moments of the gesture that have already had their effect (a sound, the smoke). */
  readonly done: Set<string>;
}

/** What the title and the news share: one desk, drawn by both. */
const state = {
  powered: true,
  /** Scene time until which the volume read-out stays up. */
  volumeUntil: -1,
  gesture: null as Gesture | null,
  drags: 0,
  /** Scene time the mug was last put down, or -1. */
  sippedAt: -1,
  puffs: [] as Puff[],
  lastTime: 0,
  pointer: { x: -999, y: -999 },
  /** Index of the last bulb falter that was heard. */
  bulbHeard: -1,
  meme: null as HTMLElement | null,
  memeTimer: null as number | null,
};

const memes = new Decks<number>();

export const desk = {
  get powered(): boolean {
    return state.powered;
  },
  set powered(on: boolean) {
    state.powered = on;
  },
  /** True while the hand is busy. */
  get busy(): boolean {
    return state.gesture !== null;
  },
  /** Back to how the desk is found: called when a scene that shows it starts. */
  reset(): void {
    state.powered = true;
    state.volumeUntil = -1;
    state.gesture = null;
    state.sippedAt = -1;
    state.lastTime = 0;
    state.bulbHeard = -1;
    state.pointer.x = -999;
    state.pointer.y = -999;
    hideMeme();
  },
  pointerAt(x: number, y: number): void {
    state.pointer.x = x;
    state.pointer.y = y;
  },
  showVolume(time: number, seconds = VOLUME_SHOWN_SECONDS): void {
    state.volumeUntil = Math.max(state.volumeUntil, time + seconds);
  },
  /** Starts the hand toward the joint or the mug. Ignored while it is already doing something. */
  take(item: Item, time: number): void {
    if (state.gesture) return;
    if (item === 'joint') state.drags++;
    state.gesture = { item, at: time, done: new Set() };
  },
  update: updateDesk,
  draw: drawDesk,
  mount: mountDesk,
  mountNote: mountDeskNote,
};

// ───────────────────────────── DOM pieces ─────────────────────────────

/** Mount after the CRT so the corner of the note hangs over the glass. */
function mountDeskNote(ui: HTMLElement): void {
  const plate = sprite(PLATE);
  const url = assetUrl(PLATE);
  if (plate && url) {
    const scale = Math.max(STAGE_W / plate.w, STAGE_H / plate.h);
    const left = Math.min(...NOTE.map((p) => p.x));
    const top = Math.min(...NOTE.map((p) => p.y));
    const width = Math.max(...NOTE.map((p) => p.x)) - left;
    const height = Math.max(...NOTE.map((p) => p.y)) - top;
    // The same pixels as the plate underneath, cut to the note's outline and laid over everything.
    const note = el('div', { class: 'desk-note' });
    Object.assign(note.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      backgroundImage: `url(${url})`,
      backgroundSize: `${plate.w * scale}px ${plate.h * scale}px`,
      backgroundPosition: `${(STAGE_W - plate.w * scale) / 2 - left}px ${(STAGE_H - plate.h * scale) * DESK_FOCUS_Y - top}px`,
      clipPath: `polygon(${NOTE.map((p) => `${p.x - left}px ${p.y - top}px`).join(', ')})`,
    });
    // The shadow goes on a wrapper: a clipped element cannot cast one outside its own outline.
    ui.append(el('div', { class: 'desk-note-shadow' }, [note]));
  }
}

function mountDesk(ui: HTMLElement): void {
  mountDeskNote(ui);
  state.meme = el('div', { class: 'meme' }, [el('span', { class: 'meme-top' }), el('span', { class: 'meme-bottom' })]);
  ui.append(state.meme);
}

function showMeme(index: number): void {
  const node = state.meme;
  const lines = S().title.memes[index];
  if (!node || !lines) return;
  (node.children[0] as HTMLElement).textContent = lines.top;
  (node.children[1] as HTMLElement).textContent = lines.bottom;
  node.classList.add('on');
  if (state.memeTimer !== null) window.clearTimeout(state.memeTimer);
  state.memeTimer = window.setTimeout(hideMeme, MEME_SECONDS * 1000);
}

function hideMeme(): void {
  state.meme?.classList.remove('on');
  if (state.memeTimer !== null) window.clearTimeout(state.memeTimer);
  state.memeTimer = null;
}

// ───────────────────────────── The gesture ─────────────────────────────

const ease = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const mix = (a: Pose, b: Pose, t: number): Pose => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  scale: a.scale + (b.scale - a.scale) * t,
  angle: a.angle + (b.angle - a.angle) * t,
});

interface GestureFrame {
  /** Whether the hand has the thing (drawn as one sprite) or reaches empty-handed. */
  readonly holding: boolean;
  /** Where the thing is (holding), or where the empty palm is. */
  readonly pose: Pose;
  /** 0..1 while at the mouth. */
  readonly atMouth: number;
}

function gestureFrame(gesture: Gesture, time: number): GestureFrame | null {
  const t = time - gesture.at;
  const { item } = gesture;
  const stay = STAY[item];
  const atDesk: Pose = { ...REST[item], angle: ARM_REST[item] };
  // The empty hand goes where the palm will be once it holds the thing.
  const holding = HOLDING[item];
  const art = sprite(holding.key);
  const width = art ? (art.w / art.h) * holding.height : 0;
  const dx = (holding.palm.fx - holding.grip.fx) * width;
  const dy = (holding.palm.fy - holding.grip.fy) * holding.height;
  const cos = Math.cos(atDesk.angle);
  const sin = Math.sin(atDesk.angle);
  const palmAtDesk: Pose = { ...atDesk, x: atDesk.x + dx * cos - dy * sin, y: atDesk.y + dx * sin + dy * cos };

  if (t < REACH) return { holding: false, pose: mix(OFFSTAGE, palmAtDesk, ease(t / REACH)), atMouth: 0 };
  if (t < REACH + LIFT) return { holding: true, pose: mix(atDesk, MOUTH[item], ease((t - REACH) / LIFT)), atMouth: 0 };
  if (t < REACH + LIFT + stay) {
    const into = (t - REACH - LIFT) / stay;
    // The mug tips a little further as it is drunk from; the joint barely moves.
    const tip = item === 'mug' ? Math.sin(into * Math.PI) * -0.16 : Math.sin(into * Math.PI * 2) * 0.015;
    return { holding: true, pose: { ...MOUTH[item], angle: MOUTH[item].angle + tip, y: MOUTH[item].y + Math.sin(into * Math.PI) * 6 }, atMouth: Math.sin(into * Math.PI) };
  }
  if (t < REACH + LIFT + stay + BACK) return { holding: true, pose: mix(MOUTH[item], atDesk, ease((t - REACH - LIFT - stay) / BACK)), atMouth: 0 };
  if (t < REACH + LIFT + stay + BACK + LEAVE) return { holding: false, pose: mix(palmAtDesk, OFFSTAGE, ease((t - REACH - LIFT - stay - BACK) / LEAVE)), atMouth: 0 };
  return null;
}

/** Runs `effect` once when the gesture reaches `seconds`. */
function at(gesture: Gesture, time: number, seconds: number, name: string, effect: () => void): void {
  if (time - gesture.at < seconds || gesture.done.has(name)) return;
  gesture.done.add(name);
  effect();
}

/** Advances the hand and gives each moment of a gesture its sound, its smoke, its word. */
function updateDesk(time: number): void {
  const gesture = state.gesture;
  if (!gesture) return;
  const mouth = REACH + LIFT;
  const down = mouth + STAY[gesture.item] + BACK;
  if (gesture.item === 'joint') {
    // The recording is one long drag, then the breath out.
    at(gesture, time, mouth - 0.1, 'drag', () => audio.play('exhale'));
    at(gesture, time, mouth + STAY.joint + BACK * 0.4, 'smoke', () => {
      exhale();
      haze.puff();
    });
    at(gesture, time, down + 0.5, 'remark', () => {
      if (state.drags <= 3 || Math.random() < REMARK_CHANCE_LATER) sayAny('smoke');
    });
  } else {
    at(gesture, time, mouth, 'sip', () => audio.play('sip'));
    at(gesture, time, mouth + 0.75, 'meme', () => {
      const index = memes.next('coffee', [0, 1, 2, 3]) ?? 0;
      showMeme(index);
      // The caption carries the words.
      say(`vo_coffee_${index + 1}` as VoiceId, { subtitle: false });
    });
    at(gesture, time, down, 'down', () => {
      state.sippedAt = time;
    });
  }
  if (time - gesture.at >= down + LEAVE + 0.55) state.gesture = null;
}

/** The smoke of a drag, breathed out from where the player sits toward the screen. */
function exhale(): void {
  for (let i = 0; i < 16; i++) {
    state.puffs.push({
      x: STAGE_W * (0.5 + Math.random() * 0.2),
      y: STAGE_H + 30 + Math.random() * 40,
      vx: -40 + Math.random() * 80,
      vy: -(70 + Math.random() * 80),
      size: 90 + Math.random() * 110,
      age: -i * 0.07,
      life: 3.6 + Math.random() * 1.6,
      rotation: Math.random() * Math.PI * 2,
    });
  }
}

// ───────────────────────────── Drawing ─────────────────────────────

const fraction = (v: number): number => v - Math.floor(v);

/**
 * How bright the desk lamp is at `time`, 0..1: a filament that never quite holds still, and now and
 * then sags for a moment. A pure function of time, so it needs no state to stay continuous.
 */
function bulbLevel(time: number): { level: number; dip: number; faltering: boolean } {
  const shimmer = 0.985 + 0.009 * Math.sin(time * 13.7) + 0.006 * Math.sin(time * 31.1 + 1.7);
  const dip = Math.floor(time / BULB_PERIOD);
  const start = dip * BULB_PERIOD + fraction(Math.sin(dip * 91.7) * 43758.5) * (BULB_PERIOD - BULB_DIP_SECONDS);
  const into = time - start;
  if (into < 0 || into > BULB_DIP_SECONDS) return { level: shimmer, dip, faltering: false };
  // Two quick sags that die away.
  const depth = 0.1 + 0.1 * fraction(Math.sin(dip * 33.3) * 9631.7);
  const sag = Math.abs(Math.sin((into / BULB_DIP_SECONDS) * Math.PI * 2)) * (1 - into / BULB_DIP_SECONDS);
  return { level: shimmer * (1 - depth * sag), dip, faltering: true };
}

/** Draws a sprite so that `anchor` lands on the pose's point, turned and scaled about it. */
function drawAnchored(ctx: CanvasRenderingContext2D, art: Sprite, height: number, anchor: Anchor, pose: Pose): void {
  const width = (art.w / art.h) * height;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  ctx.scale(pose.scale, pose.scale);
  ctx.drawImage(art.img, -anchor.fx * width, -anchor.fy * height, width, height);
  ctx.restore();
}

/** Where a point of an anchored sprite ends up on the stage. */
function anchoredPoint(art: Sprite, height: number, anchor: Anchor, pose: Pose, point: Anchor): Point {
  const width = (art.w / art.h) * height;
  const dx = (point.fx - anchor.fx) * width * pose.scale;
  const dy = (point.fy - anchor.fy) * height * pose.scale;
  const cos = Math.cos(pose.angle);
  const sin = Math.sin(pose.angle);
  return { x: pose.x + dx * cos - dy * sin, y: pose.y + dx * sin + dy * cos };
}

function drawEmber(ctx: CanvasRenderingContext2D, at: Point, strength: number, radius: number): void {
  const glow = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
  glow.addColorStop(0, `rgba(255, 150, 60, ${strength})`);
  glow.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
}

/**
 * The smoke is drawn small and stretched back over the stage: the stretch is what softens its edges.
 * A canvas `filter` would do it too, but the browser blurs every stroke as a layer of its own — a
 * hundred of them a frame, which alone took the title from 60 frames a second down to 6.
 */
const SOFT_SCALE = 1 / 3;
let softCtx: CanvasRenderingContext2D | null | undefined;

function softLayer(): CanvasRenderingContext2D | null {
  if (softCtx === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(STAGE_W * SOFT_SCALE);
    canvas.height = Math.ceil(STAGE_H * SOFT_SCALE);
    softCtx = canvas.getContext('2d');
  }
  return softCtx;
}

/** One ribbon of smoke rising from a point, swaying more the higher it gets and parting around the pointer. */
function drawWisp(ctx: CanvasRenderingContext2D, time: number, x: number, y: number, seed: number, height: number, alpha: number, drift = -14): void {
  const segments = 20;
  let px = x;
  let py = y;
  ctx.lineCap = 'round';
  for (let i = 1; i <= segments; i++) {
    const k = i / segments;
    const sway = Math.sin(time * 0.9 + k * 5 + seed) * 15 * k + Math.sin(time * 0.43 + k * 9 + seed * 2.1) * 11 * k * k;
    let nx = x + sway + k * drift;
    const ny = y - k * height;
    // A hand waved through smoke: the ribbon bows away from the pointer, most where it is closest.
    const dx = nx - state.pointer.x;
    const dy = ny - state.pointer.y;
    const near = Math.exp(-(dx * dx + dy * dy) / (WISP_REACH * WISP_REACH));
    nx += (dx >= 0 ? 1 : -1) * WISP_PUSH * near * Math.min(1, k * 4);
    ctx.strokeStyle = `rgba(232, 226, 210, ${alpha * (1 - k) * Math.min(1, k * 5)})`;
    ctx.lineWidth = 1.5 + k * 10;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    px = nx;
    py = ny;
  }
}

function drawVolume(ctx: CanvasRenderingContext2D): void {
  const bars = 8;
  const lit = Math.round(audio.volume * bars);
  const x = SPEAKER.x + 6;
  const y = SPEAKER.y - 46;
  ctx.fillStyle = 'rgba(14, 11, 8, 0.88)';
  ctx.strokeStyle = 'rgba(232, 210, 160, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, 126, 38, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8d8b0';
  ctx.font = '600 11px "DIN Condensed","Arial Narrow",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${S().title.volume.toUpperCase()}  ${audio.enabled ? `${Math.round(audio.volume * 100)} %` : S().title.off.toUpperCase()}`, x + 10, y + 14);
  for (let i = 0; i < bars; i++) {
    ctx.fillStyle = audio.enabled && i < lit ? '#f2a531' : 'rgba(232, 216, 176, 0.18)';
    ctx.fillRect(x + 10 + i * 13.5, y + 30 - (4 + i * 1.3), 10, 4 + i * 1.3);
  }
}

function drawLamp(ctx: CanvasRenderingContext2D, time: number): void {
  // Only what the lamp lights follows it, and barely: more felt than seen.
  const bulb = bulbLevel(time);
  if (bulb.faltering && bulb.dip !== state.bulbHeard) {
    state.bulbHeard = bulb.dip;
    audio.play('bulb', 0.35);
  }
  const sag = 1 - bulb.level;
  const pool = ctx.createRadialGradient(LAMP_POOL.x, LAMP_POOL.y, 30, LAMP_POOL.x, LAMP_POOL.y, 290);
  pool.addColorStop(0, `rgba(14, 9, 16, ${sag * 0.95})`);
  pool.addColorStop(0.6, `rgba(14, 9, 16, ${sag * 0.5})`);
  pool.addColorStop(1, 'rgba(14, 9, 16, 0)');
  ctx.fillStyle = pool;
  ctx.fillRect(LAMP_POOL.x - 290, LAMP_POOL.y - 290, 580, 580);
  const halo = ctx.createRadialGradient(BULB.x, BULB.y, 4, BULB.x, BULB.y, 120);
  halo.addColorStop(0, `rgba(255, 214, 150, ${0.2 * bulb.level * bulb.level})`);
  halo.addColorStop(1, 'rgba(255, 170, 90, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(BULB.x - 120, BULB.y - 120, 240, 240);
  ctx.restore();
}

function drawDesk(ctx: CanvasRenderingContext2D, time: number): void {
  const dt = Math.min(0.1, Math.max(0, time - state.lastTime));
  state.lastTime = time;
  drawPlate(ctx, PLATE, { focusY: DESK_FOCUS_Y });
  drawLamp(ctx, time);

  if (state.powered) {
    // The tube breathes a little.
    const flicker = 0.05 + 0.02 * Math.sin(time * 9) + 0.015 * Math.sin(time * 23);
    ctx.fillStyle = `rgba(120, 220, 200, ${flicker})`;
    ctx.fillRect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h);
    if (audio.enabled && audio.volume > 0) {
      // The speaker cone moves with whatever is playing.
      const thump = 0.5 + 0.5 * Math.sin(time * 7.3) * Math.sin(time * 1.9);
      ctx.strokeStyle = `rgba(255, 236, 190, ${0.05 + 0.1 * thump * audio.volume})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(SPEAKER_CONE.x, SPEAKER_CONE.y, 30 + thump * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    // Power light out.
    ctx.fillStyle = '#2b2a20';
    ctx.beginPath();
    ctx.arc(POWER_LED.x, POWER_LED.y, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  const gesture = state.gesture;
  const frame = gesture ? gestureFrame(gesture, time) : null;
  const inHand = frame?.holding ? gesture?.item : undefined;
  const mug = sprite('desk_mug');
  const joint = sprite('desk_joint');

  // The mug where it stands, its shadow and its steam.
  if (mug && inHand !== 'mug') {
    ctx.fillStyle = 'rgba(20, 10, 6, 0.38)';
    ctx.beginPath();
    ctx.ellipse(REST.mug.x + 8, REST.mug.y + HEIGHT.mug / 2 - 3, 68, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    drawAnchored(ctx, mug, HEIGHT.mug, { fx: 0.5, fy: 0.5 }, REST.mug);
  }
  // The joint on the rim of the ashtray, its ember breathing.
  let ember: Point | null = null;
  if (joint && inHand !== 'joint') {
    drawAnchored(ctx, joint, HEIGHT.joint, { fx: 0.5, fy: 0.5 }, REST.joint);
    ember = anchoredPoint(joint, HEIGHT.joint, { fx: 0.5, fy: 0.5 }, REST.joint, EMBER_LYING);
    drawEmber(ctx, ember, 0.28 + 0.12 * Math.sin(time * 2.3), 14);
  }

  const steaming = mug !== undefined && inHand !== 'mug';
  const soft = ember || steaming ? softLayer() : null;
  // Without a buffer the ribbons go straight on the stage: sharper, but still there.
  const air = soft ?? ctx;
  air.save();
  if (soft) {
    soft.setTransform(1, 0, 0, 1, 0, 0);
    soft.clearRect(0, 0, soft.canvas.width, soft.canvas.height);
    soft.scale(SOFT_SCALE, SOFT_SCALE);
  }
  if (ember) {
    drawWisp(air, time, ember.x - 1, ember.y - 4, 0.3, 200, 0.52);
    drawWisp(air, time * 1.13, ember.x - 4, ember.y - 2, 2.9, 160, 0.4);
  }
  if (steaming) {
    // Coffee steam: paler, lower, and livelier for a moment after a sip.
    const sipped = state.sippedAt >= 0 ? Math.max(0, 1 - (time - state.sippedAt) / SIP_STEAM_SECONDS) : 0;
    const top = REST.mug.y - HEIGHT.mug / 2 + 12;
    for (const [offset, seed, height] of [
      [-10, 5.1, 120],
      [14, 7.7, 145],
      [36, 9.4, 105],
    ] as const) {
      drawWisp(air, time * (0.8 + sipped * 0.9), REST.mug.x + offset, top, seed, height * (1 + sipped * 0.35), 0.3 + sipped * 0.24, 10);
    }
  }
  air.restore();
  if (soft) ctx.drawImage(soft.canvas, 0, 0, STAGE_W, STAGE_H);

  // What was breathed out drifts between the desk and the hand.
  const smoke = sprite('fx_smoke');
  for (let i = state.puffs.length - 1; i >= 0; i--) {
    const puff = state.puffs[i] as Puff;
    puff.age += dt;
    if (puff.age >= puff.life) {
      state.puffs.splice(i, 1);
      continue;
    }
    if (puff.age < 0) continue;
    puff.x += puff.vx * dt;
    puff.y += puff.vy * dt;
    puff.size += 55 * dt;
    const t = puff.age / puff.life;
    ctx.save();
    ctx.globalAlpha = 0.42 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    ctx.translate(puff.x, puff.y);
    ctx.rotate(puff.rotation + t * 0.6);
    if (smoke) ctx.drawImage(smoke.img, -puff.size / 2, -puff.size / 2, puff.size, puff.size);
    else {
      ctx.fillStyle = '#d8d2c6';
      ctx.beginPath();
      ctx.arc(0, 0, puff.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // The hand, last: it is the nearest thing to the eyes.
  if (gesture && frame) {
    if (frame.holding) {
      const holding = HOLDING[gesture.item];
      const art = sprite(holding.key);
      if (art) {
        drawAnchored(ctx, art, holding.height, holding.grip, frame.pose);
        if (gesture.item === 'joint') {
          const lit = anchoredPoint(art, holding.height, holding.grip, frame.pose, EMBER_HELD);
          // It flares while it is drawn on.
          drawEmber(ctx, lit, 0.35 + 0.6 * frame.atMouth * (0.75 + 0.25 * Math.sin(time * 9)), (14 + 16 * frame.atMouth) * frame.pose.scale);
        }
      }
    } else {
      const art = sprite('desk_hand_open');
      if (art) drawAnchored(ctx, art, HEIGHT.handOpen, PALM_OPEN, frame.pose);
    }
  }

  if (time < state.volumeUntil) drawVolume(ctx);
}

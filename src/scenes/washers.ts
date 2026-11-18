// The washers plank: three washers each, thrown at a biscuit tin. This is only the table —
// where a washer lands is decided by the core from the position handed to `onThrow`.

import { ENCOUNTER, WASHERS } from '../core/data/rivals';
import { washerScore } from '../core/encounters';
import { sprite } from '../engine/assets';
import { calmMotion } from '../render/lighting';

export const BOARD_W = 860;
export const BOARD_H = 252;

// The painted plank is drawn at this offset and scale; the chalk line and the tin were measured on it.
const ART = { x: 10, y: 4, scale: 0.92, lineX: 80, tinX: 700, tinY: 112, tinR: 78 } as const;
const LINE_X = ART.x + ART.lineX * ART.scale;
const TIN_X = ART.x + ART.tinX * ART.scale;
const MID_Y = ART.y + ART.tinY * ART.scale;
/** Stage pixels per throw length. */
const UNIT = (TIN_X - LINE_X) / WASHERS.tin;
const TRACK_Y = BOARD_H - 14;

/** The cursor sweeps this stretch of the plank and a little beyond its end; it quickens with each throw. */
const SWEEP = { from: 0.3, to: 0.93 } as const;
const SWEEP_SPEED = [0.85, 1.05, 1.3] as const;
const FLIGHT_SECONDS = 0.55;
const LANDING_SECONDS = 0.22;
const PAUSE_SECONDS = 0.55;
const SETTLE_SECONDS = 0.9;
const WASHER_R = 13;

export type Side = 'theirs' | 'yours';
export type Landing = 'tin' | 'ring' | 'plank' | 'off';

export const landingOf = (position: number): Landing => {
  const score = washerScore(position);
  return score === 2 ? 'tin' : score === 1 ? 'ring' : position > WASHERS.end ? 'off' : 'plank';
};

interface Washer {
  readonly side: Side;
  readonly position: number;
  /** Sideways scatter on the plank, in pixels: cosmetic. */
  readonly drift: number;
}

export interface WashersCallbacks {
  /** The player let go: the position is final and must be recorded at once. */
  onThrow(position: number): void;
  onLanded(side: Side, landing: Landing): void;
  onTurn(side: Side): void;
  /** Every washer has landed and been looked at. */
  onOver(): void;
}

const xOf = (position: number): number => LINE_X + position * UNIT;

/** Scatter that depends only on which washer it is, so a reload lays the table the same way. */
const driftOf = (side: Side, index: number, position: number): number => {
  const spread = landingOf(position) === 'tin' ? 20 : 54;
  const seed = Math.sin((index + 1) * (side === 'theirs' ? 12.9898 : 78.233)) * 43758.5453;
  return (seed - Math.floor(seed) - 0.5) * 2 * spread;
};

export class WashersBoard {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly landed: Washer[] = [];
  private flying: { readonly washer: Washer; age: number } | null = null;
  private phase: 'pause' | 'flight' | 'aim' | 'settle' | 'over' = 'pause';
  private timer = PAUSE_SECONDS;
  private round: number;
  private cursor: number = SWEEP.from;
  private direction = 1;
  private time = 0;

  constructor(
    private readonly theirs: readonly number[],
    yours: readonly number[],
    private readonly callbacks: WashersCallbacks,
    pixelRatio: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(BOARD_W * pixelRatio);
    this.canvas.height = Math.round(BOARD_H * pixelRatio);
    this.canvas.style.width = `${BOARD_W}px`;
    this.canvas.style.height = `${BOARD_H}px`;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    // Rounds already played (a game resumed after a reload) are laid on the table as they fell.
    this.round = yours.length;
    for (let i = 0; i < this.round; i++) {
      this.landed.push(this.washer('theirs', i, theirs[i] ?? 0), this.washer('yours', i, yours[i] ?? 0));
    }
    this.draw();
  }

  private washer(side: Side, index: number, position: number): Washer {
    return { side, position, drift: driftOf(side, index, position) };
  }

  private restingPoint(washer: Washer): { x: number; y: number } {
    const dx = xOf(washer.position) - TIN_X;
    const radius = Math.hypot(dx, washer.drift);
    // The score is along one axis. Keep the cosmetic scatter on the painted scoring surface.
    const tinR = ART.tinR * ART.scale;
    let distance = radius;
    switch (landingOf(washer.position)) {
      case 'tin': distance = Math.min(radius, tinR - WASHER_R - 3); break;
      case 'ring': distance = Math.max(tinR + 7, Math.min(radius, WASHERS.ringHalf * UNIT - 5)); break;
    }
    const scale = radius > 0 ? distance / radius : 1;
    return { x: TIN_X + dx * scale, y: MID_Y + washer.drift * scale };
  }

  /** True while the cursor is running and a throw is expected. */
  get aiming(): boolean {
    return this.phase === 'aim';
  }

  get roundIndex(): number {
    return Math.min(this.round, ENCOUNTER.throws - 1);
  }

  /** The player lets go of the washer where the cursor is. */
  throw(): void {
    if (this.phase !== 'aim') return;
    const position = this.cursor;
    this.callbacks.onThrow(position);
    this.launch(this.washer('yours', this.round, position));
  }

  private launch(washer: Washer): void {
    this.flying = { washer, age: 0 };
    this.phase = 'flight';
  }

  update(dt: number): void {
    this.time += dt;
    switch (this.phase) {
      case 'pause':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.callbacks.onTurn('theirs');
          this.launch(this.washer('theirs', this.round, this.theirs[this.round] ?? 0));
        }
        break;
      case 'flight': {
        const flying = this.flying;
        if (!flying) break;
        const before = flying.age;
        flying.age += dt;
        if (before < FLIGHT_SECONDS && flying.age >= FLIGHT_SECONDS) {
          this.callbacks.onLanded(flying.washer.side, landingOf(flying.washer.position));
        }
        if (flying.age < FLIGHT_SECONDS + LANDING_SECONDS) break;
        this.flying = null;
        this.landed.push(flying.washer);
        if (flying.washer.side === 'theirs') {
          this.phase = 'aim';
          this.cursor = SWEEP.from;
          this.direction = 1;
          this.callbacks.onTurn('yours');
        } else if (++this.round >= ENCOUNTER.throws) {
          this.phase = 'settle';
          this.timer = SETTLE_SECONDS;
        } else {
          this.phase = 'pause';
          this.timer = PAUSE_SECONDS;
        }
        break;
      }
      case 'aim': {
        const speed = SWEEP_SPEED[Math.min(this.round, SWEEP_SPEED.length - 1)] ?? 1;
        this.cursor += this.direction * speed * dt;
        if (this.cursor >= SWEEP.to) {
          this.cursor = SWEEP.to;
          this.direction = -1;
        } else if (this.cursor <= SWEEP.from) {
          this.cursor = SWEEP.from;
          this.direction = 1;
        }
        break;
      }
      case 'settle':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = 'over';
          this.callbacks.onOver();
        }
        break;
      case 'over':
        break;
    }
    this.draw();
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);
    this.drawPlank(ctx);

    for (const washer of this.landed) {
      const landing = landingOf(washer.position);
      if (landing === 'off') continue;
      // In the tin a washer lies lower and in its shadow.
      const { x, y } = this.restingPoint(washer);
      this.drawWasher(ctx, x, y, landing === 'tin' ? 0.86 : 1, washer.side, landing === 'tin' ? 0.82 : 1);
    }

    if (this.phase === 'aim') this.drawCursor(ctx);

    const flying = this.flying;
    if (flying) this.drawThrow(ctx, flying.washer, flying.age);
  }

  private drawThrow(ctx: CanvasRenderingContext2D, washer: Washer, age: number): void {
    const landing = landingOf(washer.position);
    const rest = this.restingPoint(washer);
    const t = Math.min(1, age / FLIGHT_SECONDS);
    const settle = Math.max(0, Math.min(1, (age - FLIGHT_SECONDS) / LANDING_SECONDS));
    const still = calmMotion();
    const arc = 4 * t * (1 - t);
    const skid = landing === 'tin' ? 5 : 14;
    const fromX = LINE_X - 46;
    const x = fromX + (rest.x - skid - fromX) * t + skid * (1 - (1 - settle) ** 2);
    const y = MID_Y + (rest.y - MID_Y) * t;
    const rebound = still || landing === 'off' ? 0 : Math.sin(Math.PI * settle) * (1 - settle);
    const lift = arc * (still ? 10 : 54) + rebound * (landing === 'tin' ? 8 : 16);
    const depthScale = landing === 'tin' ? 1 - 0.14 * settle : 1;
    ctx.save();
    if (landing === 'off') ctx.globalAlpha *= 1 - settle;
    const shadowR = WASHER_R * depthScale * (1 + arc * 0.16);
    ctx.strokeStyle = `rgba(25, 16, 7, ${(0.26 - 0.16 * arc) * (1 - settle)})`;
    ctx.lineWidth = shadowR * 0.54;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, shadowR * 0.72, shadowR * 0.52, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.translate(x, y - lift + (landing === 'off' ? 26 * settle * settle : 0));
    if (!still) {
      ctx.rotate((washer.side === 'yours' ? 1 : -1) * (arc * 0.45 + rebound * 0.24));
      ctx.scale(1, 1 - arc * (0.38 + 0.4 * Math.sin(t * Math.PI * 2) ** 2) - rebound * 0.32);
    }
    this.drawWasher(ctx, 0, 0, depthScale + arc * 0.12, washer.side, landing === 'tin' ? 1 - 0.18 * settle : 1);
    ctx.restore();
  }

  private drawPlank(ctx: CanvasRenderingContext2D): void {
    const art = sprite('washers_board');
    if (art) {
      ctx.drawImage(art.img, ART.x, ART.y, art.w * ART.scale, art.h * ART.scale);
      return;
    }
    // No art: a bare plank, a chalk ring and a tin, at the same places.
    ctx.fillStyle = '#9a6a34';
    ctx.fillRect(ART.x, ART.y + 8, xOf(WASHERS.end) - ART.x, 204);
    ctx.strokeStyle = 'rgba(255, 250, 235, 0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(LINE_X, ART.y + 8);
    ctx.lineTo(LINE_X, ART.y + 212);
    ctx.stroke();
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(TIN_X, MID_Y, WASHERS.ringHalf * UNIT, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#3a342c';
    ctx.beginPath();
    ctx.arc(TIN_X, MID_Y, ART.tinR * ART.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawWasher(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, side: Side, light: number): void {
    const r = WASHER_R * scale;
    const [bright, dark] = side === 'yours' ? ['#f0c462', '#8a611a'] : ['#d5d9dc', '#666c72'];
    const fill = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    fill.addColorStop(0, bright);
    fill.addColorStop(1, dark);
    ctx.save();
    ctx.globalAlpha *= light;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2, true);
    ctx.fillStyle = fill;
    ctx.fill('evenodd');
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#1f150a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.74, Math.PI * 1.05, Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
  }

  /** Where the washer would land if it were let go now: a ghost on the plank and a marker under it. */
  private drawCursor(ctx: CanvasRenderingContext2D): void {
    const x = xOf(this.cursor);
    const pulse = calmMotion() ? 0.55 : 0.55 + 0.2 * Math.sin(this.time * 9);
    ctx.save();
    ctx.globalAlpha = pulse;
    this.drawWasher(ctx, x, MID_Y, 1.15, 'yours', 1);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(20, 12, 4, 0.55)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(xOf(SWEEP.from), TRACK_Y);
    ctx.lineTo(xOf(SWEEP.to), TRACK_Y);
    ctx.stroke();
    // The stretch of the track that scores, so the marker can be read without looking up.
    ctx.strokeStyle = 'rgba(255, 250, 235, 0.75)';
    ctx.beginPath();
    ctx.moveTo(xOf(WASHERS.tin - WASHERS.ringHalf), TRACK_Y);
    ctx.lineTo(xOf(WASHERS.tin + WASHERS.ringHalf), TRACK_Y);
    ctx.stroke();
    ctx.strokeStyle = '#f2a531';
    ctx.beginPath();
    ctx.moveTo(xOf(WASHERS.tin - WASHERS.tinHalf), TRACK_Y);
    ctx.lineTo(xOf(WASHERS.tin + WASHERS.tinHalf), TRACK_Y);
    ctx.stroke();

    ctx.fillStyle = '#fff3d6';
    ctx.strokeStyle = '#1f150a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, TRACK_Y - 13);
    ctx.lineTo(x - 9, TRACK_Y + 9);
    ctx.lineTo(x + 9, TRACK_Y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

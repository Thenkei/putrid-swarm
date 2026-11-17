// What moves in a picture that does not: mist, falling leaves, dust in the light, breath, embers, and
// the small things thrown about by whatever just happened. Everything here is drawn in stage units,
// on top of a painted plate, and is purely decorative: no rule ever reads it.

import { STAGE_H, STAGE_W } from '../engine/app';

export interface AtmosphereOptions {
  /** Drifting bands of mist. */
  readonly mist?: number;
  /** Leaves coming down. */
  readonly leaves?: number;
  /** Dust or pollen hanging in the light. */
  readonly motes?: number;
  /** Sparks rising from a fire. */
  readonly embers?: number;
}

interface Drifter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  spin: number;
  hue: number;
}

/** A short-lived thing thrown into the air: a drop, a spark, a clod, a puff. */
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  readonly life: number;
  readonly size: number;
  readonly color: string;
  readonly gravity: number;
  /** Puffs grow and fade; the rest keep their size and fall. */
  readonly soft: boolean;
}

const LEAF_COLORS = ['#d98a2b', '#c9561f', '#e0b23a', '#a8662a', '#8f3b1c'] as const;
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/** One soft round blob, drawn once and stretched wherever something misty is needed. */
function softBlob(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 128, 128);
  }
  return canvas;
}

export class Atmosphere {
  private readonly blob = softBlob();
  private readonly mist: Drifter[] = [];
  private readonly leaves: Drifter[] = [];
  private readonly motes: Drifter[] = [];
  private readonly embers: Drifter[] = [];
  private readonly bits: Bit[] = [];
  private time = 0;
  /** Extra wind for a moment: a clap, a saw stroke, a door. */
  private gusting = 0;

  constructor(options: AtmosphereOptions = {}) {
    for (let i = 0; i < (options.mist ?? 0); i++) this.mist.push({ x: rand(-200, STAGE_W), y: rand(STAGE_H * 0.3, STAGE_H * 0.78), vx: rand(6, 20), vy: 0, size: rand(360, 720), phase: rand(0, 6), spin: 0, hue: rand(0.09, 0.17) });
    for (let i = 0; i < (options.leaves ?? 0); i++) this.leaves.push(this.newLeaf(rand(-STAGE_H, STAGE_H)));
    for (let i = 0; i < (options.motes ?? 0); i++) this.motes.push({ x: rand(0, STAGE_W), y: rand(0, STAGE_H), vx: rand(-6, 6), vy: rand(-10, -2), size: rand(1, 2.6), phase: rand(0, 6), spin: rand(0.6, 1.8), hue: 0 });
    for (let i = 0; i < (options.embers ?? 0); i++) this.embers.push(this.newEmber(rand(0, STAGE_H)));
  }

  private newLeaf(y: number): Drifter {
    // Near leaves are bigger and faster: that is all the depth a falling leaf needs.
    const near = Math.random();
    return { x: rand(-100, STAGE_W + 100), y, vx: rand(8, 34) * (0.6 + near), vy: rand(26, 54) * (0.6 + near), size: 5 + near * 11, phase: rand(0, 6), spin: rand(-2.4, 2.4), hue: Math.floor(rand(0, LEAF_COLORS.length)) };
  }

  private newEmber(y: number): Drifter {
    return { x: rand(0, STAGE_W), y, vx: rand(-14, 26), vy: rand(-70, -24), size: rand(1.2, 3), phase: rand(0, 6), spin: rand(2, 6), hue: 0 };
  }

  /** A burst of wind: leaves come loose and everything in the air is pushed along. */
  gust(strength: number): void {
    this.gusting = Math.max(this.gusting, strength);
    for (let i = 0; i < Math.round(strength * 4); i++) this.leaves.push(this.newLeaf(rand(-60, 0)));
    if (this.leaves.length > 60) this.leaves.splice(0, this.leaves.length - 60);
  }

  /** A breath in cold air, or smoke: a soft puff that swells and goes. */
  puff(x: number, y: number, size = 60, color = 'rgba(236, 240, 244, 0.5)', vx = 0, vy = -26): void {
    this.bits.push({ x, y, vx: vx + rand(-8, 8), vy, age: 0, life: rand(1.1, 1.6), size, color, gravity: 0, soft: true });
  }

  /** Things thrown: `count` of them from a point, in a fan around `angle` (radians, 0 = right, -π/2 = up). */
  spray(x: number, y: number, count: number, color: string, options: { angle?: number; spread?: number; speed?: number; size?: number; gravity?: number; life?: number } = {}): void {
    const { angle = -Math.PI / 2, spread = 1.2, speed = 320, size = 3.5, gravity = 1300, life = 0.8 } = options;
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spread, spread) / 2;
      const v = speed * rand(0.4, 1);
      this.bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: life * rand(0.6, 1), size: size * rand(0.5, 1.2), color, gravity, soft: false });
    }
    if (this.bits.length > 400) this.bits.splice(0, this.bits.length - 400);
  }

  update(dt: number): void {
    this.time += dt;
    this.gusting = Math.max(0, this.gusting - dt * 1.4);
    const wind = 1 + this.gusting * 5;
    for (const band of this.mist) {
      band.x += band.vx * wind * dt;
      if (band.x - band.size > STAGE_W) band.x = -band.size;
    }
    for (const leaf of this.leaves) {
      leaf.phase += dt * 2.2;
      leaf.x += (leaf.vx * wind + Math.sin(leaf.phase) * 34) * dt;
      leaf.y += leaf.vy * (1 + this.gusting) * dt;
      if (leaf.y > STAGE_H + 30 || leaf.x > STAGE_W + 140) Object.assign(leaf, this.newLeaf(rand(-80, -20)));
    }
    for (const mote of this.motes) {
      mote.phase += dt * mote.spin;
      mote.x += (mote.vx + Math.sin(mote.phase) * 8) * wind * dt;
      mote.y += mote.vy * dt;
      if (mote.y < -10) mote.y = STAGE_H + 10;
      if (mote.x > STAGE_W + 10) mote.x = -10;
      if (mote.x < -10) mote.x = STAGE_W + 10;
    }
    for (const ember of this.embers) {
      ember.phase += dt * ember.spin;
      ember.x += (ember.vx + Math.sin(ember.phase) * 20) * dt;
      ember.y += ember.vy * dt;
      if (ember.y < -10) Object.assign(ember, this.newEmber(STAGE_H + 10));
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const bit = this.bits[i] as Bit;
      bit.age += dt;
      if (bit.age >= bit.life) {
        this.bits.splice(i, 1);
        continue;
      }
      bit.vy += bit.gravity * dt;
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
    }
  }

  /** Mist: behind anything that stands in front of the picture. `shift` slides it against a camera move. */
  drawBack(ctx: CanvasRenderingContext2D, shift = 0, alpha = 1): void {
    if (alpha <= 0) return;
    for (const band of this.mist) {
      ctx.globalAlpha = band.hue * alpha * (0.8 + Math.sin(this.time * 0.3 + band.phase) * 0.2);
      ctx.drawImage(this.blob, band.x - band.size + shift * 0.6, band.y - band.size * 0.16, band.size * 2, band.size * 0.32);
    }
    ctx.globalAlpha = 1;
  }

  /** Everything in the air between the eye and the picture. */
  drawFront(ctx: CanvasRenderingContext2D, shift = 0, alpha = 1): void {
    if (alpha <= 0) return;
    for (const mote of this.motes) {
      ctx.globalAlpha = alpha * (0.25 + (Math.sin(mote.phase * 2) + 1) * 0.25);
      ctx.fillStyle = '#fff3d0';
      ctx.fillRect(mote.x + shift * 0.8, mote.y, mote.size, mote.size);
    }
    for (const ember of this.embers) {
      ctx.globalAlpha = alpha * (0.4 + (Math.sin(ember.phase * 3) + 1) * 0.3);
      ctx.fillStyle = '#ffb04a';
      ctx.fillRect(ember.x, ember.y, ember.size, ember.size);
    }
    for (const leaf of this.leaves) {
      ctx.save();
      ctx.globalAlpha = alpha * Math.min(1, 0.45 + leaf.size / 20);
      ctx.translate(leaf.x + shift * (0.6 + leaf.size / 14), leaf.y);
      ctx.rotate(leaf.phase * leaf.spin * 0.5);
      // Seen edge-on half the time, as a tumbling leaf is.
      ctx.scale(1, 0.35 + Math.abs(Math.sin(leaf.phase * 1.3)) * 0.65);
      ctx.fillStyle = LEAF_COLORS[leaf.hue] ?? LEAF_COLORS[0];
      ctx.beginPath();
      ctx.moveTo(-leaf.size, 0);
      ctx.quadraticCurveTo(0, -leaf.size * 0.75, leaf.size, 0);
      ctx.quadraticCurveTo(0, leaf.size * 0.75, -leaf.size, 0);
      ctx.fill();
      ctx.restore();
    }
    for (const bit of this.bits) {
      const t = bit.age / bit.life;
      if (bit.soft) {
        const size = bit.size * (0.5 + t * 1.6);
        ctx.globalAlpha = alpha * (1 - t) * 0.5;
        ctx.drawImage(this.blob, bit.x - size, bit.y - size, size * 2, size * 2);
      } else {
        ctx.globalAlpha = alpha * (1 - t * t);
        ctx.fillStyle = bit.color;
        ctx.beginPath();
        ctx.arc(bit.x, bit.y, bit.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * A forearm reaching into the picture, seen by its owner or by whoever it is reaching for.
 * The sprite has its fingertips at the top and the sleeve running down: `tip` is where the fingers
 * are, `lean` turns the arm about them (0 = arm straight down, negative = arm coming from the right).
 */
export function drawArm(
  ctx: CanvasRenderingContext2D,
  art: { img: CanvasImageSource; w: number; h: number } | undefined,
  tip: { x: number; y: number },
  options: { height: number; lean?: number; reach?: number; mirror?: boolean; travel?: number; alpha?: number },
): void {
  if (!art) return;
  const { height, lean = 0, reach = 1, mirror = false, travel = 760, alpha = 1 } = options;
  if (reach <= 0 || alpha <= 0) return;
  const width = (art.w / art.h) * height;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(tip.x, tip.y);
  ctx.rotate(lean);
  // Pulled back along its own length when not reaching: it leaves the frame the way it came in.
  ctx.translate(0, (1 - reach) * travel);
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(art.img, -width / 2, -height * 0.04, width, height);
  ctx.restore();
}

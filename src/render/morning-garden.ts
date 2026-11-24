import { clamp01, hash2, smoothstep } from './noise';
import { dawnCel, flowerPose, gateHare } from './sunrise';
import type { PackTrail } from '../core/epics';
import { paintedPackTrail } from './pack-tracks';

type Point = { x: number; y: number };
type Bounds = Point & { w: number; h: number };
// Coordinates in the 690 × 460 reference painting. The registered one-arm plate shares these landmarks.
const PAPER_W = 690, PAPER_H = 460;
const PATCHES = [{ x: 272, y: 353, size: 42 }, { x: 316, y: 332, size: 34 }] as const;
const FIRST_LANDING = 7.75;
const SECOND_FLIGHT = 2.4;
const TAU = Math.PI * 2;

let vapour: HTMLCanvasElement | undefined;
function mistWisp(): HTMLCanvasElement {
  if (vapour) return vapour;
  const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 46;
  const c = canvas.getContext('2d')!;
  for (let i = 0; i < 26; i++) {
    const x = 19 + i * 5.6, y = 25 + 6 * Math.sin(i * .43) + 3 * hash2(i, 2, 9);
    c.save(); c.translate(x, y); c.scale(12 + 12 * hash2(i, 4, 9), 5 + 6 * hash2(i, 5, 9));
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(225,220,202,.32)'); g.addColorStop(.6, 'rgba(214,210,198,.14)'); g.addColorStop(1, 'rgba(203,206,200,0)');
    c.fillStyle = g; c.fillRect(-1, -1, 2, 2); c.restore();
  }
  vapour = canvas; return canvas;
}

function kitchenGardenMist(ctx: CanvasRenderingContext2D, time: number, still: boolean): void {
  const t = still ? 2 : time;
  for (let i = 0; i < 3; i++) {
    const lift = smoothstep(i * .6, 8.5 + i, t);
    if (lift >= 1) continue;
    ctx.save();
    ctx.globalAlpha *= .69 * (1 - lift);
    ctx.translate(137 + i * 56 + 18 * lift, 182 + i * 3 - (13 + i * 2) * lift);
    ctx.rotate(-.08 + .04 * i);
    ctx.drawImage(mistWisp(), -55, -13, 113 + 24 * lift, 19 + 14 * lift);
    ctx.restore();
  }
}

// The fence rail, upright and a blade at the foot hold an incomplete orb. Its bottom strand
// sags under one bead. The wet points follow the actual silk as it sways.
const SILK = [[229, 285], [245, 279], [262, 271], [261, 286], [254, 298], [241, 303], [231, 304], [228, 293]] as const;
function gateWeb(ctx: CanvasRenderingContext2D, time: number, still: boolean): void {
  const age = still ? 1.7 : time % 12;
  const fall = clamp01((age - 3.2) / .63);
  const sway = still ? 0 : .47 * Math.sin(time * 1.6) + (fall > 0 ? .38 * Math.sin(fall * 8) * (1 - fall) : 0);
  const cx = 246 + sway, cy = 289;
  const silk = (i: number, r: number) => {
    const [x, y] = SILK[i]!;
    return { x: cx + (x - cx) * r, y: cy + (y - cy) * r + Math.sin(Math.PI * r) * 1.5 };
  };
  ctx.save(); ctx.lineWidth = .48; ctx.strokeStyle = 'rgba(236,226,186,.66)';
  ctx.beginPath();
  for (const [x, y] of SILK) {ctx.moveTo(cx, cy);ctx.lineTo(x, y);}
  for (let j = 1; j <= 4; j++) {
    const r = j * .185;
    for (let i = 0; i < SILK.length; i++) {
      if (j === 4 && i > 5) continue;
      const a = silk(i, r), b = silk((i + 1) % SILK.length, r);
      ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + .74, b.x, b.y);
    }
  }
  ctx.stroke();
  const bead = (x: number, y: number, size: number) => {
    ctx.fillStyle = '#a4b4aa'; ctx.beginPath(); ctx.ellipse(x, y, size * .82, size, .14, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff3c9'; ctx.beginPath(); ctx.arc(x - size * .21, y - size * .28, size * .49, 0, TAU); ctx.fill();
  };
  for (let i = 0; i < 15; i++) {
    const p = silk(i % 8, (1 + i % 4) * .185);
    const shine = still ? .3 : Math.max(0, Math.cos(time * 1.2 - i * .55)) ** 8;
    bead(p.x, p.y, .55 + .58 * shine);
  }
  const run = smoothstep(1.25, 3.2, age);
  const tip = silk(5, .21 + .73 * run);
  if (fall < 1) bead(tip.x, tip.y + 17 * fall * fall, 1.05 + .37 * run);
  ctx.restore();
}

function hareAtGate(ctx: CanvasRenderingContext2D, time: number, still: boolean): void {
  const h = gateHare(time, still);
  if (!h || h.cover <= 0) return;
  ctx.save();
  ctx.globalAlpha *= h.cover;
  ctx.fillStyle = 'rgba(51,41,28,.31)';
  ctx.beginPath(); ctx.ellipse(h.x - 3, h.y - .3, 9 - .27 * h.lift, 2.7, -.07, 0, TAU); ctx.fill();
  dawnCel(ctx, 'hare', h.pose, h.x, h.y - h.lift, 54);
  ctx.restore();
}

function flowerHead(patch: number): Point {
  const p = PATCHES[patch]!;
  return { x: p.x, y: p.y - p.size * .56 };
}

export class MorningGarden {
  private bounds?: Bounds;
  private leftFlowerAt: number | null = null;
  private fromPatch: number;
  private readonly firstPatch: number;
  private readonly hareDelay: number;

  constructor(night: number, private readonly trail?: PackTrail) {
    this.firstPatch = (night - 1) % PATCHES.length;
    this.fromPatch = this.firstPatch;
    this.hareDelay = (night - 1) % 3 * .28;
  }

  disturb(x: number, y: number, time: number): void {
    if (!this.bounds || time < FIRST_LANDING) return;
    if (this.leftFlowerAt !== null && time < this.leftFlowerAt + SECOND_FLIGHT + .35) return;
    const patch = this.leftFlowerAt === null ? this.firstPatch : 1 - this.fromPatch;
    const head = flowerHead(patch), b = this.bounds;
    if (Math.hypot((x - b.x) * PAPER_W / b.w - head.x, (y - b.y) * PAPER_H / b.h - head.y) > 19) return;
    this.fromPatch = patch; this.leftFlowerAt = time;
  }

  draw(ctx: CanvasRenderingContext2D, bounds: Bounds, time: number, still: boolean): void {
    this.bounds = bounds;
    ctx.save();
    ctx.translate(bounds.x, bounds.y); ctx.scale(bounds.w / PAPER_W, bounds.h / PAPER_H);
    if (this.trail) paintedPackTrail(ctx, this.trail);
    kitchenGardenMist(ctx, time, still);
    gateWeb(ctx, time, still);
    hareAtGate(ctx, time - this.hareDelay, still);
    for (const [i, p] of PATCHES.entries()) {
      const local = time - i * .48;
      const pose = flowerPose(local, still);
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.rotate(still ? 0 : .027 * Math.sin(time * 1.6 + i));
      dawnCel(ctx, 'daisies', pose, 0, 0, p.size);
      ctx.restore();
    }
    this.butterfly(ctx, time, still);
    ctx.restore();
  }

  private butterfly(ctx: CanvasRenderingContext2D, time: number, still: boolean): void {
    if (!still && time < 4.75) return;
    const shooed = !still && this.leftFlowerAt !== null;
    const from = shooed ? flowerHead(this.fromPatch) : { x: 178, y: 277 };
    const to = flowerHead(shooed ? 1 - this.fromPatch : this.firstPatch);
    const t = still ? 1 : shooed ? clamp01((time - this.leftFlowerAt!) / SECOND_FLIGHT) : clamp01((time - 4.75) / (FIRST_LANDING - 4.75));
    const bend = Math.sin(t * Math.PI), f = smoothstep(0, 1, t);
    const x = from.x + (to.x - from.x) * f + 9 * bend * Math.sin(t * 11);
    const y = from.y + (to.y - from.y) * f - (shooed ? 32 : 21) * bend + 6 * bend * Math.cos(t * 15);
    const flapping = [0, 1, 2, 3][Math.floor(time * 10) % 4]!;
    const pose = still ? 1 : t < 1 ? flapping : Math.sin(time * 2.3) > .84 ? 1 : 2;
    ctx.save(); ctx.translate(x, y);
    if (!shooed && !still) ctx.globalAlpha *= smoothstep(0, .18, t);
    ctx.rotate(bend * Math.sin(10 * t) * .42);
    dawnCel(ctx, 'butterfly', pose, 0, 0, t < 1 ? 29 : 24, to.x < from.x);
    ctx.restore();
  }
}

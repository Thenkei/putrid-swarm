import type { LocationId } from '../core/types';
import type { Pointer } from '../engine/app';
import { audio } from '../engine/audio';
import { drawAnimal, drawSmallProp } from '../render/life-art';
import { clamp01, smoothstep } from '../render/noise';
import { platePoint } from './common';

const mouseNest = { x: .286, y: .846 };
const crumb = { x: .469, y: .766 };

/** Time in the room stops during close-up searches and conversations. */
export class ShopLife {
  private time = 0;
  private keySwing = 0;
  private mouseTime = 0;
  private escape: { at: number; from: number } | null = null;

  constructor(private readonly room: LocationId) {}

  private mouseDistance(): number {
    if (this.escape) return this.escape.from * (1 - smoothstep(0, .74, this.mouseTime - this.escape.at));
    const t = this.mouseTime % 15;
    return smoothstep(.7, 2.5, t) - smoothstep(8, 9.35, t);
  }

  private shooMouse(): void {
    const from = this.mouseDistance();
    if (!this.escape && from > .13) this.escape = { at: this.mouseTime, from };
  }

  disturbed(): void {
    if (this.room === 'hardware') this.keySwing = this.time;
    if (this.room === 'grocery') this.shooMouse();
  }

  update(dt: number, pointer: Pointer, still: boolean): void {
    const before = this.time;
    this.time += dt;
    if (this.room === 'hardware' && before < this.keySwing + .26 && this.time >= this.keySwing + .26 && !still) audio.play('shop_keys', .58);
    if (this.room !== 'grocery' || still) return;
    this.mouseTime += dt;
    if (this.escape && this.mouseTime - this.escape.at > 4.5) {
      this.escape = null;
      this.mouseTime = 0;
    }
    if (!pointer.overCanvas || this.escape) return;
    const d = this.mouseDistance();
    const p = platePoint('plate_loc_grocery', mouseNest.x + (crumb.x - mouseNest.x) * d, mouseNest.y + (crumb.y - mouseNest.y) * d);
    if (Math.hypot(pointer.x - p.x, pointer.y - p.y) < 75) this.shooMouse();
  }

  draw(ctx: CanvasRenderingContext2D, still: boolean): void {
    ctx.save();
    if (this.room === 'garage') this.oil(ctx, still);
    if (this.room === 'hardware') this.keys(ctx, still);
    if (this.room === 'grocery') this.mouse(ctx, still);
    if (this.room === 'post') this.letter(ctx, still);
    ctx.restore();
  }

  private oil(ctx: CanvasRenderingContext2D, still: boolean): void {
    const lip = platePoint('plate_loc_garage', .547, .653);
    const pan = platePoint('plate_loc_garage', .547, .783);
    const t = still ? 0 : (this.time + .55) % 3.2;
    ctx.fillStyle = 'rgba(45,27,18,.34)';
    ctx.beginPath(); ctx.ellipse(pan.x + 3, pan.y + 14, 37, 9, -.04, 0, Math.PI * 2); ctx.fill();
    drawSmallProp(ctx, 1, pan.x - 36, pan.y - 15, 72, 36);
    const fall = clamp01((t - 1.45) / .48);
    if (fall < 1) {
      const grow = smoothstep(.1, 1.45, t);
      const y = lip.y + (pan.y - lip.y) * fall * fall;
      ctx.fillStyle = '#332c26';
      ctx.beginPath(); ctx.ellipse(lip.x, y, 1.7 * grow + .2, 1.3 + 3.5 * grow, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b39f79'; ctx.fillRect(lip.x - .7, y - 1, 1, 1.7);
    } else if (t < 2.61) {
      const ripple = (t - 1.93) / .68;
      ctx.strokeStyle = `rgba(193,165,126,${.84 * (1 - ripple)})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(pan.x, pan.y + 1, 1 + 18 * ripple, 1 + 4.5 * ripple, -.04, 0, Math.PI * 2); ctx.stroke();
    }
  }

  private keys(ctx: CanvasRenderingContext2D, still: boolean): void {
    const hook = platePoint('plate_loc_hardware', .698, .235);
    const age = this.time - this.keySwing;
    ctx.translate(hook.x, hook.y);
    ctx.fillStyle = '#352d23'; ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(still ? -.06 : -.06 + .47 * Math.exp(-1.05 * age) * Math.sin(6.4 * age));
    drawSmallProp(ctx, 2, -17, -2, 34, 47);
    ctx.fillStyle = '#c0a178'; ctx.fillRect(-1.5, -.7, 3, 1.4);
  }

  private mouse(ctx: CanvasRenderingContext2D, still: boolean): void {
    const t = this.mouseTime % 15;
    const d = still ? 1 : this.mouseDistance();
    const at = platePoint('plate_loc_grocery', mouseNest.x + (crumb.x - mouseNest.x) * d, mouseNest.y + (crumb.y - mouseNest.y) * d);
    const meal = platePoint('plate_loc_grocery', crumb.x + .012, crumb.y);
    const fedUntil = this.escape ? this.escape.at % 15 : t;
    const eaten = still ? 0 : Math.min(2, Math.floor(Math.max(0, fedUntil - 2.5) / 2));
    for (let i = eaten; i < 3; i++) {
      ctx.fillStyle = i === 1 ? '#edd099' : '#bc8b52';
      ctx.fillRect(meal.x + i * 2.8, meal.y - i % 2 * 2, 2.8, 2);
    }
    if (d < .004) return;
    ctx.globalAlpha *= smoothstep(0, .14, d);
    ctx.fillStyle = 'rgba(46,30,23,.31)';
    ctx.beginPath(); ctx.ellipse(at.x, at.y, 12, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    const run = d < .985;
    const returning = this.escape !== null || t >= 8;
    const pose = run ? 1 + Math.floor(d * 18) % 2 : still || Math.sin(t * 4.2) > -.52 ? 3 : 0;
    drawAnimal(ctx, 3, pose, at.x, at.y - (run ? 1.7 * Math.sin(d * 56) ** 2 : 0), 74, !returning);
    if (run && returning && eaten > 0) {
      ctx.fillStyle = '#eed093'; ctx.fillRect(at.x - (pose === 1 ? 29 : 24), at.y - 14, 3.4, 2.5);
    }
  }

  private letter(ctx: CanvasRenderingContext2D, still: boolean): void {
    const ledge = platePoint('plate_loc_post', .203, .316);
    const parcel = platePoint('plate_loc_post', .310, .373);
    const t = still ? 1 : clamp01((this.time - 1.1) / 2.35);
    const drift = smoothstep(0, 1, t), wave = Math.sin(Math.PI * t);
    const x = ledge.x + (parcel.x - ledge.x) * drift + 22 * wave * Math.sin(8.7 * t);
    const y = ledge.y + (parcel.y - ledge.y) * t * t - 21 * wave;
    ctx.translate(x, y); ctx.rotate(-.19 + .27 * Math.sin(10 * t) * wave);
    const turn = 1 - .72 * wave * (.5 + .5 * Math.cos(17 * t));
    ctx.scale(1, turn);
    ctx.fillStyle = `rgba(65,43,25,${.22 * (1 - wave)})`;
    ctx.fillRect(-22, -5, 48, 15);
    drawSmallProp(ctx, 3, -25, -11, 50, 22);
  }
}

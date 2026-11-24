import type { Prop } from '../core/map';
import type { Enemy } from '../core/night';
import { drawAnimal, drawSmallProp } from './life-art';
import { clamp01, smoothstep } from './noise';
import { inView, project, type Rot, type View } from './projection';

export interface HomesteadLife {
  readonly day: number;
  readonly hornAge?: number;
  readonly wellAge?: number;
}

const DIVE_AT = .91;
export const FROG_SPLASH_AT = 1.34;
export const FROG_RETURNS_AT = 3.2;

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha = .25): void {
  ctx.fillStyle = `rgba(41,28,16,${alpha})`;
  ctx.beginPath(); ctx.ellipse(x, y, size, size * .29, 0, 0, Math.PI * 2); ctx.fill();
}

function robin(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, horn: number, still: boolean, rot: Rot): void {
  const x = w * (rot ? .52 : .48), y = h * .132;
  const beakSide = rot ? 1 : -1;
  ctx.fillStyle = '#d1b275';
  ctx.fillRect(x + beakSide * 4.5, y - .8, 1.4, .8);
  ctx.fillRect(x + beakSide * 6.2, y + .25, 1.2, .8);
  if (horn >= 1.0 && horn < 3.6) return;
  if (horn >= 0 && horn < 4.65 && !still) {
    const leaving = horn < 1;
    const t = leaving ? horn : (4.65 - horn) / 1.05;
    const f = smoothstep(0, .95, t);
    ctx.globalAlpha *= 1 - smoothstep(.65, .98, t);
    drawAnimal(ctx, 0, 2 + Math.floor(horn * 12) % 2, x - 75 * f, y - 36 * Math.sin(f * 1.45), 30, !leaving);
    return;
  }
  shadow(ctx, x, y, 3.7);
  const beat = time % 4.9;
  const peck = !still && ((beat > 1.5 && beat < 1.69) || (beat > 1.91 && beat < 2.08));
  drawAnimal(ctx, 0, peck ? 1 : 0, x, y, 30, !!rot);
}

function squirrel(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, rot: Rot): void {
  // From the corner of the timber stack to a cache in the loose earth and back again.
  const side = rot ? -1 : 1;
  const t = time % 16;
  const out = smoothstep(2.1, 3.2, t), back = smoothstep(7.65, 8.95, t);
  const trip = out - back;
  const x = w * (rot ? .22 : .78) + side * 27 * trip;
  const y = h * .94 + 10 * trip;
  const running = t > 2.1 && t < 3.2 || t > 7.65 && t < 8.95;
  const digging = t >= 3.2 && t < 6.15;
  const beat = Math.sin(t * (digging ? 13 : 15));
  const height = running ? 5 * Math.abs(beat) : 0;
  if (t >= 3.2) {
    const cacheX = w * (rot ? .22 : .78) + side * 35;
    const cacheY = h * .94 + 10;
    ctx.fillStyle = '#68472c';
    ctx.beginPath(); ctx.ellipse(cacheX, cacheY - 1, 2.7, 2.1, -.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c79857'; ctx.fillRect(cacheX - 1.2, cacheY - 2.2, 1.7, 1.2);
    const soil = smoothstep(3.65, 5.85, t);
    ctx.fillStyle = '#806244';
    ctx.beginPath(); ctx.ellipse(cacheX, cacheY, 4.7 * soil, 3.3 * soil, .06, 0, Math.PI * 2); ctx.fill();
  }
  shadow(ctx, x, y, 6);
  const pose = running ? (beat > 0 ? 2 : 1) : digging ? 1 : t < 2.1 ? 0 : 3;
  drawAnimal(ctx, 1, pose, x, y - height + (digging ? 1.1 * beat : 0), 34, (side < 0) !== (t > 7.6 && t < 11.5));
  if (digging) {
    for (let i = 0; i < 3; i++) {
      const f = (t * 2.7 + i / 3) % 1;
      ctx.fillStyle = i % 2 ? '#836446' : '#523d2c';
      ctx.fillRect(x - side * (4 + 10 * f), y - 4 * Math.sin(f * Math.PI), 1.7, 1.3);
    }
  }
}

function frog(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, time: number, rot: Rot, still: boolean): void {
  const lip = w * (rot ? .70 : .30), water = w * (rot ? .56 : .46);
  const y = h * .744, surface = y - 5;
  if (age >= FROG_SPLASH_AT && age < FROG_RETURNS_AT) {
    const t = clamp01((age - FROG_SPLASH_AT) / .7);
    if (t < 1 && !still) {
      ctx.strokeStyle = `rgba(190,218,183,${.85 * (1 - t)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(water, surface, 2 + 8 * t, 1 + 2.4 * t, 0, 0, 2 * Math.PI); ctx.stroke();
      for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillRect(water + i * t * 10, surface - (8 - 2 * Math.abs(i)) * Math.sin(t * Math.PI), 1.4, 1.6);
      }
    }
    return;
  }
  const outward = age >= DIVE_AT && age < FROG_SPLASH_AT;
  const returning = age >= FROG_RETURNS_AT && age < FROG_RETURNS_AT + .38;
  if (!still && (outward || returning)) {
    const t = outward ? (age - DIVE_AT) / (FROG_SPLASH_AT - DIVE_AT) : 1 - (age - FROG_RETURNS_AT) / .38;
    drawAnimal(ctx, 2, 2, lip + (water - lip) * t, y + (surface - y) * t - 16 * Math.sin(t * Math.PI), 28, returning === !!rot);
  } else {
    shadow(ctx, lip, y, 4);
    const settling = age >= FROG_RETURNS_AT + .38 && age < FROG_RETURNS_AT + .68;
    const pose = settling ? 3 : age >= 0 && age < DIVE_AT || time % 7 > 5.7 ? 1 : 0;
    drawAnimal(ctx, 2, pose, lip, y, 27, !rot);
  }
}

function windfall(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, rot: Rot): void {
  const t = time % 21, side = rot ? -1 : 1;
  const drop = clamp01((t - 3) / .76), bounce = clamp01((t - 3.76) / .82);
  const roll = smoothstep(3.76, 5.55, t);
  const x = w * (rot ? .25 : .77) + side * 23 * roll;
  const ground = h * .96 + 4 * roll;
  const lift = (1 - drop * drop) * h * .42 + 9 * Math.abs(Math.sin(2 * Math.PI * bounce)) * (1 - bounce);
  // The fallen fruit is still in the grass for most of the cycle.
  ctx.globalAlpha *= smoothstep(0, .9, t) * (1 - smoothstep(18.9, 20.8, t));
  shadow(ctx, x, ground, 4, .24 * (1 - lift / h));
  ctx.translate(x, ground - lift - 3.6); ctx.rotate(side * (1.8 * roll + .32 * drop));
  drawSmallProp(ctx, 0, -4.6, -5.3, 9.2, 10.6);
}

/** Called in the prop's own paint pass, after wind shear and before closer actors and scenery. */
export function drawPropLife(ctx: CanvasRenderingContext2D, prop: Prop, rect: { x: number; y: number; w: number }, h: number, view: View, life: HomesteadLife, clock: number, still: boolean): void {
  if (prop.kind !== 'woodpile' && prop.kind !== 'mailbox' && prop.kind !== 'well' && !(prop.kind === 'apple' && prop.x === 5)) return;
  const w = rect.w / view.zoom, rot = view.rot;
  const t = still ? 1 : clock + ((life.day - 1) % 5) * 1.6;
  ctx.save();
  ctx.translate(rect.x, rect.y); ctx.scale(view.zoom, view.zoom);
  if (prop.kind === 'woodpile') squirrel(ctx, w, h, t, rot);
  if (prop.kind === 'mailbox') robin(ctx, w, h, t, life.hornAge ?? -1, still, rot);
  if (prop.kind === 'well') frog(ctx, w, h, life.wellAge ?? -1, t, rot, still);
  if (prop.kind === 'apple') windfall(ctx, w, h, t, rot);
  ctx.restore();
}

/** Glowworms on the orchard verge extinguish locally as an infected passes them. */
const GLOWWORMS = [[3.55, 10.7], [3.80, 10.97], [4.68, 11.8], [4.48, 12.02], [4.72, 12.13],
  [5.19, 13.95], [5.47, 14.17], [5.68, 14.11], [6.05, 13.35]] as const;

export function drawGlowworms(ctx: CanvasRenderingContext2D, view: View, enemies: readonly Enemy[], time: number, still: boolean, darkness = 1): void {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [i, [x, y]] of GLOWWORMS.entries()) {
    const p = project(view, x, y), z = view.zoom, py = p.y - (1.8 + i % 3) * z;
    if (!inView(view, p.x, py)) continue;
    let clear = 1;
    for (const e of enemies) if (e.alive) clear = Math.min(clear, smoothstep(.65, 2.4, Math.hypot(x - e.x, y - e.y)));
    const pulse = still ? .72 : .28 + .72 * (.5 + .5 * Math.sin(time * 1.8 + i * 2.3)) ** 2;
    if (clear * pulse * darkness < .06) continue;
    const g = ctx.createRadialGradient(p.x, py, 0, p.x, py, 5.5 * z);
    g.addColorStop(0, '#e2ec82'); g.addColorStop(.20, '#bed558'); g.addColorStop(1, 'rgba(165,183,78,0)');
    ctx.globalAlpha = clear * pulse * darkness; ctx.fillStyle = g;
    ctx.fillRect(p.x - 5.5 * z, py - 5.5 * z, 11 * z, 11 * z);
    ctx.fillStyle = '#f2ffbb';
    ctx.beginPath(); ctx.ellipse(p.x, py, 1.65 * z, .88 * z, i * .7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

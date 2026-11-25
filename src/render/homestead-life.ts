import { isStaticBlocked, type Prop } from '../core/map';
import type { Enemy } from '../core/night';
import { sprite } from '../engine/assets';
import { deviceArt, logLayerDepth } from './defenses';
import { drawAnimal, drawSmallProp } from './life-art';
import { clamp01, smoothstep } from './noise';
import { depthOf, project, type Rot, type View } from './projection';
import type { DeviceVisual } from './world';

export interface HomesteadLife {
  readonly day: number;
  readonly hornAge?: number;
  readonly wellAge?: number;
  readonly squirrelMotion?: SquirrelMotion;
}

const DIVE_AT = .91;
export const FROG_SPLASH_AT = 1.34;
export const FROG_RETURNS_AT = 3.2;

// Landmarks on the front and reverse paintings. The far rim is visible
// behind the opening when looking back at the frog's perch.
export const MAILBOX_PERCH = [[.605,.035], [.43,.035]] as const;
const WELL_LIP = [[.30,.692], [.66,.555]] as const;
export const WELL_WATER = [[.455,.668], [.50,.665]] as const;

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha = .25): void {
  ctx.fillStyle = `rgba(41,28,16,${alpha})`;
  ctx.beginPath(); ctx.ellipse(x, y, size, size * .29, 0, 0, Math.PI * 2); ctx.fill();
}

function robin(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, horn: number, still: boolean, rot: Rot): void {
  const [u, v] = MAILBOX_PERCH[rot];
  const x = w * u, y = h * v;
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
    drawAnimal(ctx, 0, 2 + Math.floor(horn * 12) % 2, x + beakSide * 75 * f, y - 36 * Math.sin(f * 1.45), 30, !leaving !== !!rot);
    return;
  }
  shadow(ctx, x, y, 3.7);
  const beat = time % 4.9;
  const peck = !still && ((beat > 1.5 && beat < 1.69) || (beat > 1.91 && beat < 2.08));
  drawAnimal(ctx, 0, peck ? 1 : 0, x, y, 30, !!rot);
}

function lifeTime(life: HomesteadLife, clock: number, still: boolean): number {
  return still ? 1 : clock + ((life.day - 1) % 5) * 1.6;
}

type SquirrelObstacle = Pick<DeviceVisual, 'x' | 'y' | 'type' | 'state' | 'facing'>;

interface SquirrelRun {
  x: number; y: number; cacheX: number; cacheY: number;
  t: number; lift: number; canDig: boolean; obstacle: SquirrelObstacle | undefined;
}

// Paw clearance above the crossing in both views. Broken rigs still have posts and splintered boards.
const jumpHeight: Record<SquirrelObstacle['type'], { standing: number; broken: number }> = {
  spikes: { standing: 28, broken: 34 }, fence: { standing: 55, broken: 42 },
  barrier: { standing: 48, broken: 57 }, net: { standing: 75, broken: 68 },
  log: { standing: 78, broken: 73 }, horn: { standing: 57, broken: 52 },
  floodlight: { standing: 92, broken: 70 },
};

function clearance(obstacle: SquirrelObstacle): number {
  return jumpHeight[obstacle.type][obstacle.state === 'broken' ? 'broken' : 'standing'];
}

/** The cache lies in the tile beside the woodpile. If that tile is occupied, land on clear earth beyond it. */
export function squirrelRun(prop: Prop, life: HomesteadLife, clock: number, still: boolean, devices: readonly SquirrelObstacle[] = []): SquirrelRun {
  const homeX = prop.x + .89, homeY = prop.y + .42;
  const obstacle = devices.find(d => d.x === prop.x + 1 && d.y === prop.y);
  let endX = prop.x + 1.63, endY = prop.y + .31;
  let canDig = true;
  if (obstacle) {
    // Each segment crosses only the original obstacle on its way to the landing.
    const landings = [[2.36, .31], [1.78, -.35], [1.86, 1.26]] as const;
    const landing = landings.find(([dx, dy]) => {
      const x = prop.x + Math.floor(dx), y = prop.y + Math.floor(dy);
      return !isStaticBlocked(x, y) && !devices.some(d => d.x === x && d.y === y);
    });
    if (landing) { endX = prop.x + landing[0]; endY = prop.y + landing[1]; }
    else canDig = false;
  }
  const t = canDig ? lifeTime(life, clock, still) % 16 : 0;
  const progress = smoothstep(2.1, 3.2, t) - smoothstep(7.65, 8.95, t);
  const phase = t < 3.2 ? clamp01((t - 2.1) / 1.1) : clamp01((t - 7.65) / 1.3);
  const peak = obstacle ? clearance(obstacle) : 0;
  const run = { x: homeX + (endX - homeX) * progress, y: homeY + (endY - homeY) * progress,
    cacheX: endX + .12, cacheY: endY - .13, lift: peak * 4 * phase * (1 - phase), obstacle, t, canDig };
  return life.squirrelMotion?.follow(run, clock, still) ?? run;
}

/** Start from the visible paws when the player builds or removes an obstacle mid-run. */
export class SquirrelMotion {
  private previous?: SquirrelRun;
  private hop: { at: number; dx: number; dy: number; lift: number } | undefined;

  follow(run: SquirrelRun, clock: number, still: boolean): SquirrelRun {
    const previous = this.previous;
    if (still) this.hop = undefined;
    else if (previous && (run.cacheX !== previous.cacheX || run.cacheY !== previous.cacheY ||
      run.obstacle?.type !== previous.obstacle?.type || run.obstacle?.state !== previous.obstacle?.state)) {
      const dx = previous.x - run.x, dy = previous.y - run.y;
      this.hop = Math.hypot(dx, dy) > .025 || Math.abs(previous.lift - run.lift) > 1
        ? { at: clock, dx, dy, lift: previous.lift } : undefined;
    }
    let pose = run;
    if (this.hop) {
      const { at, dx, dy, lift } = this.hop;
      const phase = clamp01((clock - at) / .5);
      if (phase >= 1) this.hop = undefined;
      else {
        const remain = 1 - smoothstep(0, 1, phase);
        const peak = run.obstacle ? clearance(run.obstacle) : 18;
        pose = { ...run, x: run.x + dx * remain, y: run.y + dy * remain, canDig: false,
          lift: Math.max(lift * remain + run.lift * (1 - remain), 4 * phase * (1 - phase) * peak),
          t: dx > dy ? 8.95 : 2.1 };
      }
    }
    this.previous = pose;
    return pose;
  }
}

/** The cache is in the soil and stays behind standing scenery as the squirrel retreats. */
export function drawSquirrelCache(ctx: CanvasRenderingContext2D, prop: Prop, view: View, life: HomesteadLife, clock: number, still: boolean,
  run = squirrelRun(prop, life, clock, still)): void {
  const { t } = run;
  if (!run.canDig || t < 3.2) return;
  const p = project(view, run.cacheX, run.cacheY);
  ctx.save();
  ctx.translate(p.x, p.y); ctx.scale(view.zoom, view.zoom);
  ctx.fillStyle = '#68472c';
  ctx.beginPath(); ctx.ellipse(0, -1, 2.7, 2.1, -.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c79857'; ctx.fillRect(-1.2, -2.2, 1.7, 1.2);
  const soil = smoothstep(3.65, 5.85, t);
  ctx.fillStyle = '#806244';
  ctx.beginPath(); ctx.ellipse(0, 0, 4.7 * soil, 3.3 * soil, .06, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function squirrel(ctx: CanvasRenderingContext2D, t: number, rot: Rot, lift: number): void {
  const side = rot ? -1 : 1;
  const running = t > 2.1 && t < 3.2 || t > 7.65 && t < 8.95;
  const digging = t >= 3.2 && t < 6.15;
  const beat = Math.sin(t * (digging ? 13 : 15));
  const height = lift || (running ? 5 * Math.abs(beat) : 0);
  if (!lift) shadow(ctx, 0, 0, 6);
  const pose = lift > 5 ? 2 : running ? (beat > 0 ? 2 : 1) : digging ? 1 : t < 2.1 ? 0 : 3;
  drawAnimal(ctx, 1, pose, 0, -height + (digging ? 1.1 * beat : 0), 34, (side < 0) !== (t > 7.6 && t < 11.5));
  if (digging) {
    for (let i = 0; i < 3; i++) {
      const f = (t * 2.7 + i / 3) % 1;
      ctx.fillStyle = i % 2 ? '#836446' : '#523d2c';
      ctx.fillRect(-side * (4 + 10 * f), -4 * Math.sin(f * Math.PI), 1.7, 1.3);
    }
  }
}

function frog(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, time: number, rot: Rot, still: boolean): void {
  const lip = w * WELL_LIP[rot][0], y = h * WELL_LIP[rot][1];
  const water = w * WELL_WATER[rot][0], surface = h * WELL_WATER[rot][1];
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

let rearFrog: { layer: CanvasRenderingContext2D; cover: Path2D } | undefined;

/** The reverse perch is beyond the windlass. Its roof, axle and posts retain their painted transparency. */
function rearWellFrog(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, time: number, still: boolean): void {
  const well = sprite('yard_rear_well');
  if (!well) return frog(ctx, w, h, age, time, 1, still);
  if (age >= FROG_SPLASH_AT && age < FROG_RETURNS_AT && (still || age >= FROG_SPLASH_AT + .7)) return;
  // The foreground landmarks are in the 238 × 320 rear painting. Below the axle,
  // only the hanging rope, the near upright and the front arc of coping cross the frog.
  if (!rearFrog) {
    const surface = document.createElement('canvas');
    surface.width = 238; surface.height = 320;
    const layer = surface.getContext('2d');
    if (!layer) return;
    const cover = new Path2D(
      'M0 0H238V168H0Z M115 167H122V227H115Z M160.5 167H193V213L181 220L160.5 216Z '
      + 'M0 195H52Q62 215 94 222Q119 230 149 222Q180 217 195 197H238V320H0Z');
    rearFrog = { layer, cover };
  }
  const { layer, cover } = rearFrog;
  layer.clearRect(0, 0, 238, 320);
  layer.save();
  layer.scale(238 / w, 320 / h);
  frog(layer, w, h, age, time, 1, still);
  layer.restore();
  layer.save();
  layer.clip(cover);
  layer.globalCompositeOperation = 'destination-out';
  layer.drawImage(well.img, 0, 0, 238, 320);
  layer.restore();
  ctx.drawImage(layer.canvas, 0, 0, w, h);
}

function windfall(ctx: CanvasRenderingContext2D, t: number, roll: number, rot: Rot): void {
  const side = rot ? -1 : 1;
  const drop = clamp01((t - 3) / .76), bounce = clamp01((t - 3.76) / .82);
  const lift = (1 - drop * drop) * 63 + 9 * Math.abs(Math.sin(2 * Math.PI * bounce)) * (1 - bounce);
  // The fallen fruit is still in the grass for most of the cycle.
  ctx.globalAlpha *= smoothstep(0, .9, t) * (1 - smoothstep(18.9, 20.8, t));
  shadow(ctx, 0, 0, 4, .24 * (1 - lift / 150));
  ctx.translate(0, -lift - 3.6); ctx.rotate(side * (1.8 * roll + .32 * drop));
  drawSmallProp(ctx, 0, -4.6, -5.3, 9.2, 10.6);
}

/** The animal and fallen fruit occupy specific patches of soil. Enqueue them at
 * their own world depth so a tree or shelter can cross in front when turning. */
export function groundLifeDrawable(ctx: CanvasRenderingContext2D, prop: Prop, view: View, life: HomesteadLife, clock: number, still: boolean,
  run = prop.kind === 'woodpile' ? squirrelRun(prop, life, clock, still) : undefined) {
  const woodpile = prop.kind === 'woodpile';
  if (!woodpile && !(prop.kind === 'apple' && prop.x === 5)) return;
  const t = run?.t ?? lifeTime(life, clock, still) % 21;
  const travel = smoothstep(3.76, 5.55, t);
  const gx = run?.x ?? prop.x + 1.28 + .49 * travel;
  const gy = run?.y ?? prop.y - .02 - .23 * travel;
  const root = project(view, gx, gy);
  let depth = depthOf(view.rot, gx, gy) + .4;
  const over = run?.obstacle;
  if (over && run.lift > 0 && Math.floor(gx) === over.x && Math.floor(gy) === over.y) {
    const centre = depthOf(view.rot, over.x + .5, over.y + .5);
    const front = over.type === 'log' && over.state !== 'broken'
      ? logLayerDepth(centre, deviceArt('log', over.facing, 'resting', view.rot), 'near') : centre + .3;
    depth = Math.max(depth, front + .01);
  }
  const drawShadow = run && run.lift > 0 ? () => {
    ctx.save();
    ctx.translate(root.x, root.y); ctx.scale(view.zoom, view.zoom);
    shadow(ctx, 0, 0, 6, .25 / (1 + run.lift / 50));
    ctx.restore();
  } : undefined;
  return { depth, drawShadow, draw() {
    ctx.save();
    ctx.translate(root.x, root.y); ctx.scale(view.zoom, view.zoom);
    if (run) squirrel(ctx, t, view.rot, run.lift);
    else windfall(ctx, t, travel, view.rot);
    ctx.restore();
  } };
}

/** Perched creatures follow the actual surface of the selected painting. */
export function drawPropLife(ctx: CanvasRenderingContext2D, prop: Prop, rect: { x: number; y: number; w: number }, h: number, view: View, life: HomesteadLife, clock: number, still: boolean): void {
  if (prop.kind !== 'mailbox' && prop.kind !== 'well') return;
  const w = rect.w / view.zoom, rot = view.rot;
  const t = lifeTime(life, clock, still);
  ctx.save();
  ctx.translate(rect.x, rect.y); ctx.scale(view.zoom, view.zoom);
  if (prop.kind === 'mailbox') robin(ctx, w, h, t, life.hornAge ?? -1, still, rot);
  if (prop.kind === 'well') {
    const age = life.wellAge ?? -1;
    if (rot === 1) rearWellFrog(ctx, w, h, age, t, still);
    else frog(ctx, w, h, age, t, rot, still);
  }
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
    const radius = 5.5 * z;
    if (p.x + radius <= view.x || p.x - radius >= view.x + view.w ||
      py + radius <= view.y || py - radius >= view.y + view.h) continue;
    let clear = 1;
    for (const e of enemies) if (e.alive) clear = Math.min(clear, smoothstep(.65, 2.4, Math.hypot(x - e.x, y - e.y)));
    const pulse = still ? .72 : .28 + .72 * (.5 + .5 * Math.sin(time * 1.8 + i * 2.3)) ** 2;
    if (clear * pulse * darkness < .06) continue;
    const g = ctx.createRadialGradient(p.x, py, 0, p.x, py, radius);
    g.addColorStop(0, '#e2ec82'); g.addColorStop(.20, '#bed558'); g.addColorStop(1, 'rgba(165,183,78,0)');
    ctx.globalAlpha = clear * pulse * darkness; ctx.fillStyle = g;
    ctx.fillRect(p.x - radius, py - radius, 2 * radius, 2 * radius);
    ctx.fillStyle = '#f2ffbb';
    ctx.beginPath(); ctx.ellipse(p.x, py, 1.65 * z, .88 * z, i * .7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

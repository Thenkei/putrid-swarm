import { sprite } from '../engine/assets';
import { smoothstep } from './noise';
import type { Rot } from './projection';

const silhouettes = new Map<string, HTMLCanvasElement>();
function shadowSheet(oneArm: boolean) {
  const key = oneArm ? 'hero_departure_one_arm' : 'hero_departure';
  let mask = silhouettes.get(key);
  if (mask) return mask;
  const art = sprite(key);
  if (!art) return;
  mask = document.createElement('canvas');
  mask.width = art.w;
  mask.height = art.h;
  const g = mask.getContext('2d');
  if (!g) return;
  g.drawImage(art.img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#251c27';
  g.fillRect(0, 0, art.w, art.h);
  silhouettes.set(key, mask);
  return mask;
}

export interface IndoorPassage { age: number; remaining: number; oneArm: boolean }

/** Pane coordinates in the two painted facades. Clip each pane separately to keep its mullions. */
export function curtainShadow(ctx: CanvasRenderingContext2D, rot: Rot, passage: IndoorPassage,
  atticIntact: boolean, flash: number, still: boolean) {
  const mask = shadowSheet(passage.oneArm);
  if (!mask || (rot && !atticIntact)) return;
  const [x, y, w, h, slope] = !rot ? [513, 342, 42, 52, -.31] as const
    : [205, 289, 43, 72, .17] as const;
  const go = smoothstep(.05, 1.26, passage.age);
  const back = 1 - smoothstep(.02, .86, passage.remaining);
  const travel = go - back;
  const moving = go < 1 || back > 0;
  const frame = moving && !still ? Math.floor(passage.age * 7) % 4 : 1;
  const sw = mask.width / 4, sh = mask.height / 2;
  ctx.save();
  ctx.transform(1, slope, 0, 1, x, y);
  ctx.beginPath();
  const cols = 2, rows = 2;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++)
    ctx.rect(i * w / cols + 1, j * h / rows + 1, w / cols - 3, h / rows - 3);
  ctx.clip();
  if (rot) {
    // Keep the nailed diagonal board in front of both panes on the rear gable.
    ctx.beginPath();
    ctx.rect(-1, -1, w + 2, h + 2);
    ctx.moveTo(-1, 33);
    ctx.lineTo(w + 1, 13);
    ctx.lineTo(w + 1, 33);
    ctx.lineTo(-1, 53);
    ctx.closePath();
    ctx.clip('evenodd');
  }
  if (flash > 0) {
    ctx.fillStyle = 'rgba(255,222,159,' + (.63 * flash) + ')';
    ctx.fillRect(0, 0, w, h);
  }
  const width = h * 1.36, height = width * sh / sw;
  ctx.translate(w * (-.68 + 1.26 * travel), h * .015 + flash * 2);
  ctx.scale(back > 0 ? -1 : 1, 1);
  ctx.globalAlpha *= .84 + .16 * flash;
  ctx.drawImage(mask, frame * sw, 0, sw, sh, -width * .5, -height * .04, width, height);
  ctx.restore();
}

export const MOTH_CONTACT = 2.2;
/** A knock starts a single departure; successive knocks only postpone the return. */
export class BarnMoth {
  constructor(public start = 0) { }
  flight: number | null = null;
  lastKnock = -Infinity;
  private tapped = false;
  knock(now: number) {
    this.flight ??= now;
    this.lastKnock = now;
  }
  step(now: number): boolean {
    if (this.flight !== null && now - this.lastKnock > 15) {
      this.start = now;
      this.flight = null;
      this.tapped = false;
    }
    if (this.flight !== null || this.tapped || now - this.start < MOTH_CONTACT) return false;
    this.tapped = true;
    return true;
  }
}

// The lantern hanging below the fixed iron hook, in front-facade paint coordinates.
let lantern: Path2D | undefined;
const lanternOutline = 'M469 528 Q472 526 478 531 L479 535 Q485 538 490 544 Q492 550 485 553 L485 575 Q492 579 487 582 L477 587 L474 591 L469 588 L457 582 Q451 579 457 575 L457 553 Q448 551 452 545 Q457 539 466 535 Z';
export function barnLamp(ctx: CanvasRenderingContext2D, painted: CanvasImageSource, time: number, moth: BarnMoth, still: boolean) {
  const hit = time - moth.lastKnock;
  const swing = still || hit > 1.5 ? 0 : Math.sin(hit * 18) * Math.exp(-3 * hit) * .23;
  if (Math.abs(swing) > .002) {
    lantern ??= new Path2D(lanternOutline);
    ctx.save();
    ctx.clip(lantern);
    ctx.drawImage(painted, 444, 600, 37, 34, 448, 526, 45, 68);
    ctx.restore();
    ctx.save();
    ctx.translate(472, 528);
    ctx.rotate(swing);
    ctx.translate(-472, -528);
    ctx.clip(lantern);
    ctx.drawImage(painted, 0, 0);
    ctx.restore();
  }
  const age = (moth.flight ?? time) - moth.start, flight = moth.flight === null ? null : time - moth.flight;
  if (age < 0 || (flight !== null && flight >= 1.18)) return;
  const orbit = 1 - smoothstep(0, MOTH_CONTACT, age);
  const recoil = age > MOTH_CONTACT ? Math.max(0, 1 - (age - MOTH_CONTACT) / .76) : 0;
  const bounce = Math.sin(recoil * Math.PI);
  const side = 488 + (still ? 0 : (41 * Math.cos(age * 6) * orbit + 12 * bounce));
  const high = 557 + (still ? 0 : (27 * Math.sin(age * 6) * orbit - 9 * bounce));
  const f = flight ?? 0;
  ctx.save();
  ctx.translate(side + f * 114, high - f * 84 + (still ? 0 : Math.sin(f * 15) * 8));
  ctx.globalAlpha *= smoothstep(0, .36, age);
  if (f > .8) ctx.globalAlpha *= 1 - smoothstep(.8, 1.18, f);
  const moving = flight !== null || age < MOTH_CONTACT + .76;
  const spread = moving && !still ? .5 + .5 * Math.cos(time * 38) : .22;
  ctx.rotate(-.48 + f * .9);
  ctx.scale(1.03 + spread * .7, 1.13);
  ctx.fillStyle = '#453d35';
  ctx.strokeStyle = '#49382d';
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.quadraticCurveTo(2, -7, 7, -6);
    ctx.quadraticCurveTo(8, -2, 3, 3);
    ctx.closePath();
    ctx.fillStyle = '#d3c6a2';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#927957';
    ctx.fillRect(3, -4, 2, 1);
    ctx.restore();
  }
  ctx.fillStyle = '#392c28';
  ctx.fillRect(-1.1, -4, 2.2, 7);
  ctx.restore();
}

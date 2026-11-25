import { sprite } from '../engine/assets';
import { clamp01, smoothstep } from './noise';
import { project, type Point, type View } from './projection';
import { SHADOW_REACH } from './shadows';

/** The last CCTV shot of an ordinary night, before the morning report. */
export const SUNRISE_SECONDS = 4.8;
export const SWALLOW_CALL_AT = 2.25;
export const sunlight = (age: number | undefined): number => smoothstep(0, 4.3, age ?? 0);

const row = { hare: 0, swallow: 1, butterfly: 2, daisies: 3 } as const;

/** Cel registration is at the feet, except for the swallows, which pivot about the breast. */
export function dawnCel(ctx: CanvasRenderingContext2D, subject: keyof typeof row, pose: number, x: number, y: number, width: number, mirror = false): void {
  const art = sprite('dawn_wildlife');
  if (!art) return;
  const w = art.w / 4, h = art.h / 4, height = width * h / w;
  ctx.save();
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(art.img, pose * w, row[subject] * h, w, h, -width / 2, -(subject === 'swallow' ? 92 : 174) / 196 * height, width, height);
  ctx.restore();
}

/** A pair crosses the same patch of garden on all four feeds. */
export function* firstSwallows(age: number, still: boolean) {
  if (still) return;
  for (let i = 0; i < 2; i++) {
    const flight = (age - .42 - i * .46) / 3.4;
    if (flight <= 0 || flight >= 1) continue;
    const t = flight;
    const sweep = Math.sin(Math.PI * t);
    const wing = [0, 1, 2, 1][Math.floor(flight * 21 + i) % 4]!;
    yield { x: -2 + t * 28, y: 13.4 + i * 1.45 + sweep * 3.3 - 2 * t, height: 89 + 12 * i - 31 * sweep + 11 * Math.sin(t * 7),
      pose: t > .64 && t < .86 ? 3 : wing, alpha: smoothstep(0, .09, flight) * (1 - smoothstep(.9, 1, flight)) };
  }
}

export function projectSwallow(view: View, bird: Point & { height: number }) {
  const floor = project(view, bird.x, bird.y), height = bird.height * view.zoom;
  return {
    breast: { x: floor.x, y: floor.y - height },
    shadow: { x: floor.x + SHADOW_REACH.x * height, y: floor.y + SHADOW_REACH.y * height },
  };
}

/** Two short hops out of the gate, a long listen, then three bounds into the verge. */
export function gateHare(time: number, still: boolean) {
  if (still) return { x: 178, y: 339, lift: 0, pose: 1, cover: 1 };
  if (time < .58 || time > 7.5) return null;
  const entry = clamp01((time - .58) / 1.4), exit = clamp01((time - 4.35) / 2.95);
  const stride = entry < 1 ? entry * 2 : exit * 3;
  const phase = stride - Math.floor(stride);
  const moving = entry < 1 || exit > 0;
  const lift = moving ? Math.sin(Math.PI * phase) * (entry < 1 ? 5.2 : 10.5) : 0;
  const pose = moving ? phase < .18 || phase > .84 ? 2 : 3 : time < 2.35 || time > 4.06 ? 0 : 1;
  return { x: 124 + 54 * entry + 141 * exit, y: 332 + 7 * entry - 13 * exit, lift, pose,
    cover: smoothstep(0, .27, entry) * (1 - smoothstep(.82, 1, exit)) };
}

export function flowerPose(time: number, still: boolean): number {
  return still ? 3 : Math.min(3, Math.floor(4 * smoothstep(.35, 4.75, time)));
}

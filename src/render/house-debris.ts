import { type Sprite } from '../engine/assets';
import { facadeForStage } from './house';
import { calmMotion } from './lighting';
import { smoothstep } from './noise';
import type { Rot } from './projection';

export interface HouseBreak {
  readonly from: number;
  readonly to: number;
  age: number;
}

export const HOUSE_BREAK_SECONDS = 1.15;

// The contact points are on the registered facade paintings, from sill to roof.
// A shard takes its grain or glaze from the surface that was there before the blow.
const joints = [
  [[0.27, 0.76], [0.28, 0.74]],
  [[0.36, 0.59], [0.31, 0.60]],
  [[0.65, 0.29], [0.58, 0.33]],
  [[0.76, 0.57], [0.72, 0.50]],
  [[0.46, 0.30], [0.40, 0.29]],
] as const;

export function drawHouseDebris(
  ctx: CanvasRenderingContext2D, breaks: readonly HouseBreak[], rot: Rot, key: string,
  art: Sprite, left: number, top: number, width: number,
): void {
  if (!breaks.length || calmMotion()) return;
  ctx.save();
  ctx.translate(left, top);
  ctx.scale(width / art.w, width / art.w);
  for (const hit of breaks) {
    const joint = joints[hit.to - 1]?.[rot];
    if (!joint) continue;
    const source = facadeForStage(rot, key, art, hit.from);
    const cx = joint[0] * art.w;
    const cy = joint[1] * art.h;
    const direction = joint[0] < 0.5 ? -1 : 1;
    const count = 3 + hit.to;
    for (let i = 0; i < count; i++) {
      const t = hit.age - i * 0.018;
      if (t < 0) continue;
      const size = 11 + hit.to * 3 + (i * 17) % 29;
      const height = size * (i % 3 === 0 ? 0.65 : 0.32);
      const x = cx + (i % 3 - 1) * size * 0.7;
      const y = cy + (i % 4 - 1.5) * height;
      const floor = art.h * 0.96 - y;
      const drop = Math.min(floor, 570 * t * t - (45 + (i * 21) % 60) * t);
      ctx.save();
      ctx.globalAlpha *= 1 - smoothstep(0.81, HOUSE_BREAK_SECONDS, hit.age);
      ctx.translate(x + direction * (46 + i * 10) * t, y + drop);
      ctx.rotate(direction * (i % 2 ? 2.7 : -3.5) * Math.min(t, Math.sqrt(floor / 570)));
      ctx.beginPath();
      ctx.moveTo(-size / 2, -height * 0.22);
      ctx.lineTo(size * 0.12, -height / 2);
      ctx.lineTo(size / 2, -height * 0.3);
      ctx.lineTo(size * 0.29, height / 2);
      ctx.lineTo(-size * 0.4, height * 0.38);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(source, x - size / 2, y - height / 2, size, height, -size / 2, -height / 2, size, height);
      ctx.restore();
    }
  }
  ctx.restore();
}

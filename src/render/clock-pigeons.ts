import { smoothstep } from './noise';
import type { Point } from './projection';
import { drawAnimal } from './life-art';

/** The map is a painting of the village: the pigeons trade the mairie roof for the house across the square. */
export function drawClockPigeons(ctx: CanvasRenderingContext2D, source: Point, destination: Point, age: number, still: boolean): void {
  for (let i = 0; i < 6; i++) {
    const t = still ? 0 : smoothstep(.13 + i * .13, 3.25 + i * .18, age);
    const flight = t > 0 && t < 1;
    const x = source.x + i * 7 + (destination.x - source.x + i * 1.7) * t;
    const y = source.y - i * 1.8 + (destination.y - source.y + i * 4.1) * t - (19 + i * 3 + 6 * Math.sin(i * 2)) * Math.sin(Math.PI * t);
    const wing = Math.sin(age * (19 + i * .45) - i * .8);
    const pose = !flight ? 0 : t < .035 || t > .975 ? 1 : wing > 0 ? 2 : 3;
    drawAnimal(ctx, 4, pose, x, y, 23 + i % 3 * 2);
  }
}

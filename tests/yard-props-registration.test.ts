import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { propMount } from '../src/render/registration';
import { TH, TW, type Rot } from '../src/render/projection';
import { propSpriteKey } from '../src/render/world';

type Pixel = readonly [number, number];

async function contacts(kind: 'veg' | 'woodpile' | 'car', rot: Rot, samples: readonly Pixel[]) {
  const key = propSpriteKey(kind, rot);
  const { data, info } = await sharp(`public/assets/sprites/${key}.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mount = propMount(kind, rot, { veg: 84, woodpile: 74, car: 112 }[kind]);
  const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3] ?? 0;
  return samples.map(([x, nearY]) => {
    for (let y = nearY - 2; y <= nearY + 2; y++) {
      if (alpha(x, y) < 160 || alpha(x, y + 1) >= 160) continue;
      const dx = (x + .5 - mount.foot[0] * info.width) * mount.h / info.height;
      const dy = (y + 1 - mount.foot[1] * info.height) * mount.h / info.height;
      return { x: dx, y: dx * (mount.fit?.shearY ?? 0) + dy * (mount.fit?.scaleY ?? 1) };
    }
    throw new Error(`Missing painted contact at (${x}, ${nearY}) in ${key}`);
  });
}

describe('paired yard paintings', () => {
  it.each([
    ['veg', [[15,189], [165,226], [240,138]], [[20,274], [219,314], [316,205]], 2, 1],
    ['woodpile', [[22,206], [68,227], [204,183]], [[35,277], [88,315], [280,274]], 1, 1],
  ] as const)('keeps all three %s feet inside the same grid footprint when the camera turns', async (kind, frontPixels, rearPixels, cellsX, cellsY) => {
    const front = await contacts(kind, 0, frontPixels), rear = await contacts(kind, 1, rearPixels);
    for (const points of [front, rear]) {
      const left = points[0]!, near = points[1]!, right = points[2]!;
      expect(Math.hypot((left.x + right.x) / 2, (left.y + right.y) / 2)).toBeLessThan(1);
      for (const end of [left, right]) {
        expect(Math.abs(near.y - end.y - Math.abs(near.x - end.x) * TH / TW)).toBeLessThan(1);
      }
      for (const point of points) {
        expect(Math.abs(point.y / TH + point.x / TW)).toBeLessThan(cellsX / 2 + .01);
        expect(Math.abs(point.y / TH - point.x / TW)).toBeLessThan(cellsY / 2 + .01);
      }
    }
    for (let i = 0; i < front.length; i++) {
      expect(Math.hypot(front[i]!.x - rear[i]!.x, front[i]!.y - rear[i]!.y)).toBeLessThan(2);
    }
  });

  it('keeps the parked wagon on both axles relative to its parking spot', async () => {
    const front = await contacts('car', 0, [[137,239], [269,169]]);
    const rear = await contacts('car', 1, [[137,222], [269,148]]);
    for (let i = 0; i < front.length; i++) {
      expect(Math.hypot(front[i]!.x - rear[i]!.x, front[i]!.y - rear[i]!.y)).toBeLessThan(1.5);
    }
    // Boarding uses the original front sheet, drawn 112px tall about its wheelbase.
    expect(propMount('car', 0, 112)).toEqual({ h: 112, foot: [.5, .76] });
  });
});

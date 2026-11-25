import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import manifest from '../public/assets/manifest.json';
import { PROPS } from '../src/core/map';
import { depthOf, unproject, type Rot } from '../src/render/projection';
import { terrainField } from '../src/render/terrainfield';
import { drawWindPlants, drawYardPlants, vegetableRowDrawables } from '../src/render/yard-plants';
import { dressYardFloor } from '../src/render/yard-floor';
import * as wind from '../src/render/wind';

vi.mock('../src/engine/assets', () => ({
  sprite: (key: keyof typeof manifest) => ({ ...manifest[key], img: { key } }),
}));
vi.mock('../src/render/lighting', () => ({ calmMotion: () => false }));
vi.mock('../src/render/shadows', () => ({ castShadow: vi.fn(), contactShadow: vi.fn(), groundPatch: vi.fn() }));

function canvas() {
  return { save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate: vi.fn(), transform: vi.fn(), drawImage: vi.fn() };
}

describe('yard foliage', () => {
  it.each([
    ['yard_flora_bramble', 12, 25], ['yard_flora_back_bramble', 133, 156],
    ['yard_flora_hazel', 51, 76], ['yard_flora_back_hazel', 85, 106],
  ] as const)('places %s on its painted stem tip', async (key, left, right) => {
    const art = manifest[key];
    const { data, info } = await sharp(`public/assets/${art.file}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let y = info.height - 1; y >= 0; y--) {
      const stem = [];
      for (let x = left; x <= right; x++) if (data[(y * info.width + x) * 4 + 3]! > 145) stem.push(x + .5);
      if (stem.length === 0) continue;
      expect(Math.abs(art.footX * info.width - (stem[0]! + stem.at(-1)!) / 2)).toBeLessThan(3);
      expect(Math.abs(art.footY * info.height - y)).toBeLessThan(1.5);
      return;
    }
    throw new Error(`Missing stem in ${key}`);
  });

  it('keeps twenty vegetable roots on the same soil while wind, camera and planter occlusion change', () => {
    const positions = (rot: Rot, zoom: number, time: number) => {
      const view = { rot, zoom, cx: 11, cy: 5, x: 0, y: 0, w: 1200, h: 800 };
      const drawing = canvas(), ctx = drawing as unknown as CanvasRenderingContext2D;
      drawYardPlants(ctx, view, terrainField());
      drawWindPlants(ctx, view, time);
      expect(drawing.drawImage.mock.calls.some(([img]) => /cabbage|leeks/.test(img.key))).toBe(false);
      const roots = [];
      for (const item of vegetableRowDrawables(ctx, view, time)) {
        item.draw();
        const [image, , , , sourceHeight, dx, dy, width, height] = drawing.drawImage.mock.lastCall!;
        const key = image.key as `yard_flora_${'' | 'back_'}${'cabbage' | 'leeks'}`;
        const art = manifest[key];
        expect(sourceHeight).toBe(art.h);
        const [a, , shear, , tx, ty] = drawing.transform.mock.lastCall!;
        const x = dx + width * art.footX, y = dy + height * art.footY;
        const { gx, gy } = unproject(view, tx + a * x + shear * y, ty + y);
        const bed = PROPS.find(p => p.kind === 'veg' && gx > p.x - .2 && gx < p.x + 2.1)!;
        const cabbage = key.endsWith('cabbage');
        expect(gy - bed.y).toBeCloseTo(cabbage ? 1.38 : -.37, 1);
        const bedDepth = depthOf(rot, bed.x + bed.w / 2, bed.y + bed.h / 2) + .4;
        expect(item.depth > bedDepth).toBe(cabbage === (rot === 0));
        roots.push([cabbage, gx.toFixed(4), gy.toFixed(4)].join('/'));
      }
      expect(roots).toHaveLength(20);
      return roots.sort();
    };
    const roots = positions(0, .8, 0);
    expect(positions(1, 1.65, 0)).toEqual(roots);
    expect(positions(0, 1.65, 5.9)).toEqual(roots);
    expect(positions(1, .8, 5.9)).toEqual(roots);
  });

  it('paints the still west-hedge hazel in front of the moving bramble behind it', () => {
    const view = { rot: 1 as const, zoom: 1.5, cx: 2.2, cy: 17.5, x: 0, y: 0, w: 320, h: 200 };
    const paint = canvas(), ctx = paint as unknown as CanvasRenderingContext2D;
    drawYardPlants(ctx, view, terrainField());
    const calm = vi.spyOn(wind, 'windAt').mockReturnValue(0);
    const plants: string[] = [];
    try {
      paint.drawImage.mockImplementation((image, sx, sy, sw, sh, dx, dy, width, height) => {
        if (sy !== 0) return;
        const art = manifest[image.key as 'yard_flora_back_bramble' | 'yard_flora_back_hazel'];
        const [mirror, , , , tx, ty] = paint.transform.mock.lastCall!;
        const root = unproject(view, tx + mirror * (dx + (art.footX * art.w - sx) * width / sw),
          ty + dy + art.footY * art.h * height / sh);
        if (image.key === 'yard_flora_back_bramble' && Math.hypot(root.gx - 1.810, root.gy - 17.814) < .01) plants.push('bramble');
        if (image.key === 'yard_flora_back_hazel' && Math.hypot(root.gx - 1.355, root.gy - 17.655) < .01) plants.push('hazel');
      });
      drawWindPlants(ctx, view, 2.4);
    } finally {
      calm.mockRestore();
    }
    expect(plants).toEqual(['bramble', 'hazel']);
  });

  it('keeps each fallen oak leaf and twig on its patch of soil when changing cameras', () => {
    const landmarks = (rot: Rot, zoom: number) => {
      const view = { rot, zoom, cx: rot ? 6 : 17, cy: 12, x: 20, y: 30, w: 800, h: 600 };
      const paint = canvas(), points: string[] = [];
      const noop = () => {};
      const ctx = { ...paint, fillRect: noop, stroke: noop, beginPath: noop, moveTo: noop, lineTo: noop, rotate: noop,
        quadraticCurveTo: noop, fill: noop, createRadialGradient: () => ({ addColorStop: noop }) };
      paint.drawImage.mockImplementation((image, dx, dy, w, h) => {
        if (image.key !== 'yard_scatter_leaves' && image.key !== 'yard_scatter_back_leaves') return;
        const back = image.key === 'yard_scatter_back_leaves';
        const art = back ? manifest.yard_scatter_back_leaves : manifest.yard_scatter_leaves;
        const [x, y] = paint.translate.mock.lastCall!, [mx, my] = paint.scale.mock.lastCall!;
        // A point inside the rusty leaf and the end of the fallen twig on each painting.
        for (const [u, v] of (back ? [[102, 32], [87, 54]] : [[21, 32], [51, 54]]) as [number, number][]) {
          const point = unproject(view, x + mx * (dx + w * u / art.w), y + my * (dy + h * v / art.h));
          points.push([image.key, point.gx.toFixed(4), point.gy.toFixed(4)].join('/'));
        }
      });
      dressYardFloor(ctx as unknown as CanvasRenderingContext2D, view, terrainField());
      expect(points.length).toBeGreaterThan(100);
      return points;
    };
    expect(landmarks(1, 1.5)).toEqual(landmarks(0, .75));
  });
});

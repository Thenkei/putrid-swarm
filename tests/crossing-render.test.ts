import sharp from 'sharp';
import { expect, it, vi } from 'vitest';
import manifest from '../public/assets/manifest.json';
import type { App } from '../src/engine/app';
import { CrossingScene } from '../src/scenes/crossing';

vi.mock('../src/engine/app', () => ({ STAGE_W: 1280, STAGE_H: 720 }));
vi.mock('../src/engine/assets', () => ({
  sprite: (key: keyof typeof manifest) => manifest[key] && { ...manifest[key], img: { key } },
}));
vi.mock('../src/engine/audio', () => ({ audio: { play() {} } }));
vi.mock('../src/engine/dom', () => ({ el: () => ({}) }));
vi.mock('../src/render/lighting', () => ({ calmMotion: () => false, applyDayGrade() {} }));
vi.mock('../src/scenes/common', () => ({ drawPlate() {} }));
vi.mock('../src/scenes/flow', () => ({}));

it('keeps the crossing stag’s antlers at one scale while its gathered hooves clear the road', async () => {
  const antlerSpans: number[] = [], hoofHeights: number[] = [], shadows: number[] = [];
  const frames = ['en_deer_front_p', 'en_deer_front_a', 'en_deer_front_b', 'en_deer_front'] as const;
  for (const [i, key] of frames.entries()) {
    const scene = new CrossingScene({ state: null } as App, 'garage');
    scene.update(1.5 + (i + .5) / 7);
    const { data, info } = await sharp('public/assets/' + manifest[key].file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, right = 0, hoof = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3]! < 160) continue;
      if (y < info.height * .25) { left = Math.min(left, x); right = Math.max(right, x); }
      hoof = Math.max(hoof, y);
    }
    let road = 0, translateY = 0;
    const ctx = {
      save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {},
      ellipse(_x: number, y: number, radius: number) { if (road === 0) { road = y; shadows.push(radius); } },
      translate(_x: number, y: number) { translateY = y; },
      drawImage(img: { key: string }, x: number, top: number, w: number, h: number) {
        expect(img.key).toBe(key);
        // Every painting has its crown ahead of its rump as it runs to the right.
        expect(x + (left + right) / 2 * w / info.width).toBeGreaterThan(0);
        antlerSpans.push((right - left + 1) * w / info.width);
        hoofHeights.push(road - translateY - top - hoof * h / info.height);
      },
    };
    scene.render(ctx as unknown as CanvasRenderingContext2D);
  }
  expect(antlerSpans).toHaveLength(4);
  expect(Math.max(...antlerSpans) / Math.min(...antlerSpans)).toBeLessThan(1.08);
  expect(hoofHeights[0]! - hoofHeights[1]!).toBeGreaterThan(16);
  expect(new Set(shadows).size).toBe(1);
});

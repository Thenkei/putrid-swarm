import sharp from 'sharp';
import { afterAll, expect, it, vi } from 'vitest';
import * as assets from '../src/engine/assets';
import { drawPropLife } from '../src/render/homestead-life';
import { drawAnimal } from '../src/render/life-art';
import type { Rot } from '../src/render/projection';

vi.mock('../src/render/life-art', () => ({ drawAnimal: vi.fn(), drawSmallProp: vi.fn() }));

afterAll(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('leaves the rear frog visible through the openings and behind the painted timbers, rope and near stones', async () => {
  const well = { img: {} as HTMLImageElement, w: 238, h: 320 };
  vi.spyOn(assets, 'sprite').mockImplementation(key => key === 'yard_rear_well' ? well : undefined);
  class Path { constructor(readonly d: string) {} }
  vi.stubGlobal('Path2D', Path);
  const noop = () => {};
  const layer = { save: noop, restore: noop, clearRect: noop, scale: noop, beginPath: noop, fill: noop, stroke: noop,
    ellipse: noop, fillRect: noop, clip: vi.fn<(path: Path) => void>(), drawImage: vi.fn(), canvas: {} };
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => layer }) });
  const stage = { ...layer, translate: noop, drawImage: vi.fn() };
  const render = (rot: Rot, age: number, still = false) => drawPropLife(stage as unknown as CanvasRenderingContext2D,
    { kind: 'well', x: 15, y: 6, w: 1, h: 1 }, { x: 0, y: 0, w: 238 }, 86,
    { rot, cx: 0, cy: 0, x: 0, y: 0, w: 640, h: 480, zoom: 320 / 86 }, { day: 1, wellAge: age }, 0, still);
  render(0, -1);
  expect(vi.mocked(drawAnimal).mock.lastCall?.[0]).toBe(stage);
  expect(layer.clip).not.toHaveBeenCalled();

  for (const [age, still] of [[-1, false], [-1, true], [1.12, false], [1.65, false], [3.43, false], [3.6, false]] as const) {
    layer.drawImage.mockClear();
    render(1, age, still);
    expect(layer.drawImage).toHaveBeenCalledWith(well.img, 0, 0, 238, 320);
    expect(layer).toHaveProperty('globalCompositeOperation', 'destination-out');
    expect(stage.drawImage.mock.lastCall?.[0]).toBe(layer.canvas);
  }
  stage.drawImage.mockClear();
  render(1, 2.5);
  expect(stage.drawImage).not.toHaveBeenCalled();

  const path = layer.clip.mock.calls[0]![0].d;
  const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="238" height="320"><path d="${path}"/></svg>`);
  const foreground = await sharp(svg).png().toBuffer();
  const mask = await sharp('public/assets/sprites/yard_rear_well.webp')
    .composite([{ input: foreground, blend: 'dest-in' }]).raw().toBuffer();
  const alpha = (x: number, y: number) => mask[4 * (238 * y + x) + 3];
  for (const [x, y] of [[140, 95], [143, 148], [176, 185], [118, 209], [124, 236]] as const) {
    expect(alpha(x, y)).toBeGreaterThan(245); // Roof, axle, upright, rope and front coping.
  }
  for (const [x, y] of [[149, 128], [145, 165], [144, 174], [131, 204]] as const) {
    expect(alpha(x, y)).toBe(0); // Open air above and below the axle, the far perch and the shaft interior.
  }
});

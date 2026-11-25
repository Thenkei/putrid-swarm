import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as assets from '../src/engine/assets';
import { defensePaintMatrix, deviceArt } from '../src/render/defenses';
import { project, type Rot, type View } from '../src/render/projection';
import { pickDevice, type DeviceVisual } from '../src/render/world';

const sprites = new Map<string, assets.Sprite>();
const masks = new Map<HTMLImageElement, { width: number; height: number; data: Uint8Array }>();

beforeAll(async () => {
  const devices = ['', 'back_'].flatMap(side => ['spikes_resting', 'spikes_armed', 'net_resting', 'barrier_armed'].map(pose => `dev_${side}${pose}`));
  for (const key of [...devices, 'obj_car_front', 'obj_car_back', 'obj_house_front', 'obj_house_back']) {
    const file = sharp(`public/assets/sprites/${key}.webp`);
    const { width: w, height: h } = await file.metadata();
    if (!w || !h) throw new Error(`Missing dimensions for ${key}`);
    const img = {} as HTMLImageElement;
    const { info, data } = await file.resize(64, Math.round(64 * h / w)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    sprites.set(key, { img, w, h });
    masks.set(img, { width: info.width, height: info.height, data });
  }
  vi.spyOn(assets, 'sprite').mockImplementation(key => sprites.get(key));
  vi.stubGlobal('document', { createElement: () => {
    let image: HTMLImageElement;
    return { getContext: () => ({
      drawImage: (source: HTMLImageElement) => { image = source; },
      getImageData: () => masks.get(image),
    }) };
  } });
});

afterAll(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const yard = (rot: Rot, zoom: number): View => ({ rot, zoom, cx: 16.5, cy: 10.5, x: 0, y: 0, w: 640, h: 480 });

describe('yard pointer targets', () => {
  it.each([
    ['wagon and farmhouse', 15, 12, [false, false]],
    ['wagon', 17, 14, [true, false]],
    ['farmhouse', 10, 8, [false, true]], ['farmhouse', 11, 13, [true, false]],
  ] as const)('respects the %s silhouette over the spikes at (%i, %i)', (_scenery, x, y, visible) => {
    const spikes: DeviceVisual = { id: 1, type: 'spikes', x, y, state: 'idle', facing: 0, hpRatio: 1 };
    for (const rot of [0, 1] as const) for (const zoom of [.62, 1.5]) {
      const view = { ...yard(rot, zoom), cx: x + .5, cy: y + .5 };
      const p = project(view, view.cx, view.cy);
      expect(pickDevice(view, [spikes], p.x, p.y)).toBe(visible[rot] ? spikes : null);
    }
  });

  it('reaches the spike plank through an open net and still picks the planted net posts', () => {
    for (const rot of [0, 1] as const) for (const facing of [0, 1] as const) for (const zoom of [0.62, 1.5]) {
      const view = yard(rot, zoom);
      const spikes: DeviceVisual = { id: 1, type: 'spikes', x: 16, y: 10, state: 'idle', facing, hpRatio: 1 };
      const sign = rot === 0 ? 1 : -1;
      const net: DeviceVisual = { ...spikes, id: 2, type: 'net', x: spikes.x + sign, y: spikes.y + sign };
      const p = project(view, spikes.x + 0.5, spikes.y + 0.5);
      const pick = (dx: number, dy: number) => pickDevice(view, [spikes, net], p.x + dx * zoom, p.y + dy * zoom);
      expect(pick(0, 0)).toBe(spikes);
      expect(pick(facing ? 16 : -16, 29)).toBe(net);
      expect(pick(0, -18)).toBeNull();
      // Empty pixels inside the occupied tile still select it from the ground plan.
      expect(pick(25, 0)).toBe(spikes);
    }
  });

  it('picks the drawn manual key and readiness pip on a night feed', () => {
    for (const rot of [0, 1] as const) {
      const view = yard(rot, 1.22);
      const device: DeviceVisual = { id: 1, type: 'barrier', x: 16, y: 10, state: 'armed', hpRatio: 1, label: '2', cue: true };
      const p = project(view, device.x + 0.5, device.y + 0.5);
      const art = deviceArt(device.type, 0, 'armed', rot);
      const source = sprites.get(art.key)!;
      const [, b, , , , f] = defensePaintMatrix(art, source.w / source.h);
      const pipY = f + Math.min(0, b * 200) - 9;
      const at = (dx: number, dy: number, night: boolean) => pickDevice(view, [device], p.x + dx * view.zoom, p.y + dy * view.zoom, night);
      expect(at(0, pipY, true)).toBe(device);
      expect(at(18, pipY - 15, true)).toBe(device);
      expect(at(18, pipY - 15, false)).toBeNull();
      expect(at(-18, pipY - 15, true)).toBeNull();
    }
  });

  it('lets a foreground automatic readiness dot cover a manual trap behind it', () => {
    for (const rot of [0, 1] as const) {
      const view = yard(rot, 1.22), sign = rot === 0 ? 1 : -1;
      const manual: DeviceVisual = { id: 1, type: 'barrier', x: 16, y: 10, facing: 1, state: 'armed', hpRatio: 1 };
      const auto: DeviceVisual = { ...manual, id: 2, type: 'spikes', x: manual.x + sign, y: manual.y + sign, facing: 0 };
      const p = project(view, auto.x + 0.5, auto.y + 0.5);
      const art = deviceArt(auto.type, 0, 'armed', rot), source = sprites.get(art.key)!;
      const [, b, , , , f] = defensePaintMatrix(art, source.w / source.h);
      const y = p.y + (f + Math.min(0, 200 * b) - 9) * view.zoom;
      expect(pickDevice(view, [manual, auto], p.x, y, true)).toBe(auto);
      expect(pickDevice(view, [manual, auto], p.x, y, false)).toBe(manual);
    }
  });
});

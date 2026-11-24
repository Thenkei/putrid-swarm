import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as assets from '../src/engine/assets';
import { defensePaintMatrix, deviceArt } from '../src/render/defenses';
import { project, type Rot, type View } from '../src/render/projection';
import { pickDevice, type DeviceVisual } from '../src/render/world';

const sprites = new Map<string, assets.Sprite>();
const masks = new Map<HTMLImageElement, { width: number; height: number; data: Uint8Array }>();

beforeAll(async () => {
  for (const side of ['', 'back_']) for (const pose of ['spikes_resting', 'net_resting', 'barrier_armed']) {
    const key = `dev_${side}${pose}`;
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
});

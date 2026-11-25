import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as assets from '../src/engine/assets';
import { defensePaintMatrix, deviceArt } from '../src/render/defenses';
import { hitsWhistle } from '../src/render/fallen-whistle';
import { hitsInvoice, invoiceNail } from '../src/render/pinned-invoice';
import { depthOf, project, type Rot, type View } from '../src/render/projection';
import { pickDevice, pickDoor, yardItemVisible, type DeviceVisual } from '../src/render/world';
import { SECTOR_IDS } from '../src/core/types';
import { mopedPath } from '../src/core/epics';
import { VISIBLE_DOORS } from '../src/house-layout';

const sprites = new Map<string, assets.Sprite>();
const masks = new Map<HTMLImageElement, { width: number; height: number; data: Uint8Array }>();

beforeAll(async () => {
  const devices = ['', 'back_'].flatMap(side => ['spikes_resting', 'spikes_armed', 'net_resting', 'barrier_armed'].map(pose => `dev_${side}${pose}`));
  for (const key of [...devices, 'obj_car_front', 'obj_car_back', 'obj_house_front', 'obj_house_back', 'obj_trees_apple', 'yard_rear_apple', 'yard_rear_oak']) {
    const file = sharp(`public/assets/sprites/${key}.webp`);
    const { width: w, height: h } = await file.metadata();
    if (!w || !h) throw new Error(`Missing dimensions for ${key}`);
    const img = {} as HTMLImageElement;
    const width = key.startsWith('dev_') || key.startsWith('obj_house_') ? 64 : w;
    const { info, data } = await file.resize(width, Math.round(width * h / w)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  it('repairs exposed approaches while leaving the foreground wagon and trees selectable on their own', () => {
    const yard = { x: 292, y: 56, w: 976, h: 652, cx: 11, cy: 11, zoom: 1.35 };
    const front = { ...yard, rot: 0 as const }, rear = { ...yard, rot: 1 as const };
    // At the barn, the visible roofline crosses the edge of the entry target.
    expect(pickDoor(front, 874.5, 453.5, 1, 4)).toBeNull();
    expect(pickDoor(front, 842.5, 415.5, 1, 4)).toBe('grange');
    expect(pickDoor(front, 628.5, 393.5, 1, 4)).toBe('portail');
    expect(pickDoor(rear, 890.5, 421.5, 1, 4)).toBeNull();
    expect(pickDoor(rear, 704.5, 425.5, 1, 4)).toBeNull();
    expect(pickDoor(rear, 858.5, 413.5, 1, 4)).toBe('verger');
    expect(pickDoor(rear, 608.5, 399.5, 1, 4)).toBe('arriere');
  });

  it('only inspects the whistle from the side where the house exposes it', () => {
    const at = { x: 11.54, y: 8.54 };
    for (const rot of [0, 1] as const) for (const zoom of [.62, 1.5]) {
      const view = yard(rot, zoom), p = project(view, at.x, at.y);
      const x = p.x, y = p.y + (rot ? 1 : -1) * 2 * zoom;
      const visible = (depth: number) => yardItemVisible(view, x, y, depth, 1, 4, []);
      expect(hitsWhistle(view, at, x, y, visible)).toBe(rot === 1);
    }
  });

  it('uses the exposed paper on all four invoices, including the surviving jamb at a breach', () => {
    for (const rot of [0, 1] as const) for (const sector of SECTOR_IDS) for (const breached of [false, true]) {
      const view = yard(rot, 1.35), p = invoiceNail(view, sector, breached);
      expect(hitsInvoice(view, sector, breached, p.x, p.y + 5, 4)).toBe(VISIBLE_DOORS[rot].includes(sector));
      expect(hitsInvoice(view, sector, breached, p.x - 11 * view.zoom, p.y - 4 * view.zoom, 4)).toBe(false);
    }
  });

  it('keeps ground items selectable through the open net and blocks them behind its post', () => {
    for (const rot of [0, 1] as const) {
      const view = yard(rot, 1), sign = rot ? -1 : 1;
      const net: DeviceVisual = { id: 1, type: 'net', x: 16 + sign, y: 10 + sign, state: 'idle', facing: 0, hpRatio: 1 };
      const p = project(view, 16.5, 10.5), depth = depthOf(rot, 16.5, 10.5);
      expect(yardItemVisible(view, p.x, p.y, depth, 1, 4, [net])).toBe(true);
      expect(yardItemVisible(view, p.x - 16, p.y + 29, depth, 1, 4, [net])).toBe(false);
      const lifted = { ...net, placementLift: 32 };
      expect(yardItemVisible(view, p.x - 16, p.y + 29, depth, 1, 4, [lifted])).toBe(true);
      expect(yardItemVisible(view, p.x - 16, p.y - 3, depth, 1, 4, [lifted])).toBe(false);
    }
  });

  it('blocks the orchard wreck under the apple canopy while leaving its exposed paint selectable', () => {
    const [from, end] = mopedPath('verger'), length = Math.hypot(end.x - from.x, end.y - from.y);
    const gx = end.x + 1.05 * (end.x - from.x) / length, gy = end.y + 1.05 * (end.y - from.y) / length;
    for (const rot of [0, 1] as const) {
      const view = { rot, x: 292, y: 56, w: 976, h: 652, cx: 11, cy: 11, zoom: 1.35 };
      const visible = (x: number, y: number) => yardItemVisible(view, x, y, depthOf(rot, gx, gy) + .2, 1, 4, []);
      if (rot === 0) {
        expect(visible(428.5, 160.5)).toBe(false);
        expect(visible(369.5, 134.5)).toBe(true);
      } else expect(visible(1128.5, 560.5)).toBe(true);
    }
  });
  it.each([
    ['wagon and farmhouse', 15, 12, [false, false]],
    ['wagon', 17, 14, [true, false]],
    ['farmhouse and reverse oak', 10, 8, [false, false]], ['farmhouse', 11, 13, [true, false]],
  ] as const)('respects the %s silhouette over the spikes at (%i, %i)', (_scenery, x, y, visible) => {
    const spikes: DeviceVisual = { id: 1, type: 'spikes', x, y, state: 'idle', facing: 0, hpRatio: 1 };
    for (const rot of [0, 1] as const) for (const zoom of [.62, 1.5]) {
      const view = { ...yard(rot, zoom), cx: x + .5, cy: y + .5 };
      const p = project(view, view.cx, view.cy);
      expect(pickDevice(view, [spikes], p.x, p.y)).toBe(visible[rot] ? spikes : null);
    }
  });

  it.each([
    [0, .62, 777.5, 376.5, 774.5, 377.5], [0, 1, 778.5, 371.5, 771.5, 374.5],
    [0, 1.5, 777.5, 366.5, 766.5, 370.5], [1, .62, 775.5, 376.5, 785.5, 377.5],
    [1, 1, 773.5, 372.5, 788.5, 374.5], [1, 1.5, 777.5, 364.5, 792.5, 370.5],
  ] as const)('only reaches exposed spikes under the apple in view %i at zoom %f', (rot, zoom, hiddenX, hiddenY, exposedX, exposedY) => {
    const sign = rot === 0 ? 1 : -1;
    const spikes: DeviceVisual = { id: 43, type: 'spikes', x: 4 - sign, y: 8 - sign, facing: 0, state: 'idle', hpRatio: 1 };
    const view = { rot, zoom, cx: spikes.x + .5, cy: spikes.y + .5, x: 292, y: 56, w: 976, h: 652 };
    expect(pickDevice(view, [spikes], hiddenX, hiddenY, false, 1, { time: 4 })).toBeNull();
    expect(pickDevice(view, [spikes], exposedX, exposedY, false, 1, { time: 4 })).toBe(spikes);
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

import { afterEach, expect, it, vi } from 'vitest';
import { DEVICES } from '../src/core/data/devices';
import { SECTOR_IDS } from '../src/core/types';
import { THRESHOLDS, VISIBLE_DOORS } from '../src/house-layout';
import { applyNight } from '../src/render/lighting';
import { project } from '../src/render/projection';
import { indoorShotLights } from '../src/render/world';

afterEach(() => vi.unstubAllGlobals());

it('projects the floodlight pool out to the same world radius along both screen axes', () => {
  const gradient = () => ({ addColorStop: vi.fn() });
  const map = { createLinearGradient: gradient, createRadialGradient: gradient, fillRect: vi.fn(),
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn() };
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => map }) });
  const output = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), drawImage: vi.fn() };
  const light = { gx: 6.5, gy: 14.5, radius: DEVICES.floodlight.radius, color: 'white' };
  for (const rot of [0, 1] as const) for (const zoom of [.55, 1.25]) {
    const view = { rot, zoom, cx: 7, cy: 14, x: 12, y: 8, w: 640, h: 400 };
    applyNight(output as unknown as CanvasRenderingContext2D, view, [light]);
    const [lightMap] = output.drawImage.mock.lastCall!;
    const [, , r] = map.arc.mock.lastCall!;
    const [sx, sy] = map.scale.mock.lastCall!;
    const diagonal = light.radius / Math.SQRT2;
    const centre = project(view, light.gx, light.gy);
    const edgeX = project(view, light.gx + diagonal, light.gy - diagonal);
    const edgeY = project(view, light.gx + diagonal, light.gy + diagonal);
    expect(r * sx * view.w / lightMap.width).toBeCloseTo(Math.abs(edgeX.x - centre.x));
    expect(r * sy * view.h / lightMap.height).toBeCloseTo(Math.abs(edgeY.y - centre.y));
  }
});

it('lights an indoor shot at its own painted doorway on the feeds that can see it', () => {
  for (const sector of SECTOR_IDS) for (const rot of [0, 1] as const) {
    const lights = indoorShotLights(rot, sector, .10, false);
    if (VISIBLE_DOORS[rot].includes(sector)) {
      const sill = THRESHOLDS[sector];
      expect(lights.find(light => !light.round)).toMatchObject({ gx: sill.gx, gy: sill.gy });
      expect(lights.filter(light => light.glow)).toHaveLength(2);
    } else {
      expect(lights).toEqual([]);
    }
    expect(indoorShotLights(rot, sector, .7, true)).toEqual([]);
  }
});

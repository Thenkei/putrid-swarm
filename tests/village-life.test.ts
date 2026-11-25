import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROPS } from '../src/core/map';
import { DEVICE_TYPE_IDS, type DeviceTypeId } from '../src/core/types';
import { audio } from '../src/engine/audio';
import { drawAnimal } from '../src/render/life-art';
import { wagonLeaves } from '../src/render/car-departure';
import { drawClockPigeons } from '../src/render/clock-pigeons';
import { defenseTapeView } from '../src/render/cassette';
import { deviceArt, logLayerDepth } from '../src/render/defenses';
import { drawGlowworms, drawPropLife, drawSquirrelCache, FROG_SPLASH_AT, FROG_RETURNS_AT, groundLifeDrawable, SquirrelMotion, squirrelRun } from '../src/render/homestead-life';
import type { DeviceVisual } from '../src/render/world';
import { ShopLife } from '../src/scenes/shop-life';
import type { Enemy } from '../src/core/night';
import { cameraView, depthOf, project, unproject, type View } from '../src/render/projection';

vi.mock('../src/engine/audio', () => ({ audio: { play: vi.fn() } }));
vi.mock('../src/render/life-art', () => ({ drawAnimal: vi.fn(), drawSmallProp: vi.fn() }));
vi.mock('../src/scenes/common', () => ({ platePoint: (_: string, x: number, y: number) => ({ x: x * 1280, y: y * 853 - 66.5 }) }));

const view: View = { x: 0, y: 0, w: 900, h: 600, cx: 5, cy: 12, zoom: 1.5, rot: 0 };
const pointer = { x: 0, y: 0, down: false, overCanvas: false };
const woodpile = PROPS.find(p => p.kind === 'woodpile')!;
const squirrelDevice = (type: DeviceTypeId, x = 15, y = 8, broken = false): DeviceVisual =>
  ({ id: 100 * x + y, type, x, y, facing: 0, state: broken ? 'broken' : 'idle', hpRatio: broken ? 0 : 1 });
const squirrelAt = (time: number, devices: DeviceVisual[], still = false) => squirrelRun(woodpile, { day: 1 }, time, still, devices);
function canvas() {
  const noop = () => {};
  return { save: noop, restore: noop, translate: vi.fn(), rotate: noop, scale: noop, beginPath: noop, fill: noop, stroke: noop,
    ellipse: vi.fn(), fillRect: vi.fn(), globalAlpha: 1, createRadialGradient: () => ({ addColorStop: noop }) } as unknown as CanvasRenderingContext2D;
}
beforeEach(() => vi.clearAllMocks());

describe('life in the homestead and shops', () => {
  it('shows the pigeons on the opposite roof when the bell rings in reduced motion', () => {
    const positions = (age: number, still: boolean) => {
      vi.mocked(drawAnimal).mockClear();
      drawClockPigeons(canvas(), { x: 1000, y: 145 }, { x: 700, y: 265 }, age, still);
      return vi.mocked(drawAnimal).mock.calls.map(([, , pose, x, y]) => [pose, x, y]);
    };
    const settled = positions(6, false);
    expect(settled).toHaveLength(6);
    expect(positions(-1, true)).toEqual(positions(-1, false));
    expect(positions(-1, true)).not.toEqual(settled);
    expect(positions(0, true)).toEqual(settled);
  });

  it('keeps the squirrel, its buried cache, and the rolling apple at the same world positions in either camera', () => {
    for (const kind of ['woodpile', 'apple'] as const) for (const time of [1, 2.65, 4.35, 8.4, 13]) {
      const prop = { kind, x: kind === 'apple' ? 5 : 14, y: kind === 'apple' ? 12 : 8, w: 1, h: 1 };
      const positions = ([0, 1] as const).map(rot => {
        const v = { ...view, rot, cx: rot ? 9 : 15, cy: rot ? 14 : 7, zoom: rot ? .72 : 1.5 };
        const ctx = canvas(), drawable = groundLifeDrawable(ctx, prop, v, { day: 1 }, time, false)!;
        drawable.draw();
        const [x, y] = vi.mocked(ctx.translate).mock.calls[0]!;
        const point = unproject(v, x, y);
        expect(drawable.depth).toBeCloseTo(depthOf(rot, point.gx, point.gy) + .4, 8);
        if (kind === 'woodpile' && time >= 3.2) {
          const floor = canvas();
          drawSquirrelCache(floor, prop, v, { day: 1 }, time, false);
          const [cacheX, cacheY] = vi.mocked(floor.translate).mock.calls[0]!;
          const cache = unproject(v, cacheX, cacheY);
          expect(cache.gx).toBeCloseTo(prop.x + 1.75, 8);
          expect(cache.gy).toBeCloseTo(prop.y + .18, 8);
        }
        return point;
      });
      expect(positions[1]!.gx).toBeCloseTo(positions[0]!.gx, 8);
      expect(positions[1]!.gy).toBeCloseTo(positions[0]!.gy, 8);
    }
  });

  it.each(DEVICE_TYPE_IDS)('clears a %s on both trips and digs beyond it', type => {
    const device = squirrelDevice(type);
    for (const facing of [0, 1] as const) {
      const obstacles = [{ ...device, facing }];
      const nest = squirrelAt(1, obstacles), digging = squirrelAt(5, obstacles), home = squirrelAt(10, obstacles);
      expect([Math.floor(nest.x), Math.floor(nest.y)]).toEqual([14, 8]);
      expect([Math.floor(digging.x), Math.floor(digging.y)]).toEqual([16, 8]);
      expect([Math.floor(digging.cacheX), Math.floor(digging.cacheY)]).toEqual([16, 8]);
      expect(digging.lift).toBe(0);
      expect([home.x, home.y, home.lift]).toEqual([nest.x, nest.y, 0]);
      for (const [from, to] of [[2.1, 3.2], [7.65, 8.95]] as const) {
        const crossing = Array.from({ length: 49 }, (_, step) => squirrelAt(from + (to - from) * step / 48, obstacles))
          .filter(run => Math.floor(run.x) === device.x && Math.floor(run.y) === device.y);
        expect(crossing.length).toBeGreaterThan(1);
        expect(Math.max(...crossing.map(run => run.lift))).toBeGreaterThan(8);
      }
    }
  });

  it('jumps from its current position when a fence is built or removed while it is digging', () => {
    const life = { day: 1, squirrelMotion: new SquirrelMotion() };
    const at = (clock: number, devices: DeviceVisual[]) => squirrelRun(woodpile, life, clock, false, devices);
    const digging = at(4, []), fence = squirrelDevice('fence');
    const takeoff = at(4, [fence]);
    expect([takeoff.x, takeoff.y, takeoff.lift]).toEqual([digging.x, digging.y, 0]);
    const airborne = at(4.25, [fence]);
    expect(airborne.lift).toBeGreaterThan(20);
    const landing = at(4.5, [fence]);
    expect(Math.floor(landing.x)).toBe(16);
    expect(landing.lift).toBe(0);
    const removed = at(4.5, []);
    expect([removed.x, removed.y, removed.lift]).toEqual([landing.x, landing.y, 0]);
    expect(at(4.75, []).lift).toBeGreaterThan(0);
    expect(at(5, []).x).toBeCloseTo(digging.x);
  });

  it('chooses a free landing beside the trap and stays home if every landing is occupied', () => {
    const blocked = [squirrelDevice('fence'), squirrelDevice('log', 16, 8)];
    for (const [taken, free] of [[7, 9], [9, 7]] as const) {
      const obstacles = [...blocked, squirrelDevice('barrier', 15, taken)];
      const digging = squirrelAt(5, obstacles);
      expect([Math.floor(digging.x), Math.floor(digging.y)]).toEqual([15, free]);
      expect([Math.floor(digging.cacheX), Math.floor(digging.cacheY)]).toEqual([15, free]);
    }
    const crowded = [...blocked, squirrelDevice('barrier', 15, 7), squirrelDevice('spikes', 15, 9)];
    const nest = squirrelAt(1, crowded);
    for (const t of [2.6, 3.5, 5.1, 8.2, 10]) {
      const run = squirrelAt(t, crowded);
      expect([run.x, run.y, run.lift]).toEqual([nest.x, nest.y, 0]);
      expect(run.canDig).toBe(false);
      const soil = canvas();
      drawSquirrelCache(soil, woodpile, view, { day: 1 }, t, false, run);
      expect(soil.ellipse).not.toHaveBeenCalled();
    }
  });

  it('uses a lower arc over a wreck and keeps the usual run when construction is elsewhere', () => {
    const fence = squirrelDevice('fence'), wreck = squirrelDevice('fence', 15, 8, true);
    for (const start of [2.1, 7.65]) {
      const peak = (device: DeviceVisual) => Math.max(...Array.from({ length: 45 }, (_, step) => squirrelAt(start + step / 36, [device]).lift));
      expect(peak(wreck)).toBeGreaterThan(0);
      expect(peak(wreck)).toBeLessThan(peak(fence));
    }
    const offRoute = squirrelDevice('net', 13, 9);
    for (const t of [1, 2.65, 4.1, 8.3, 10]) {
      expect(squirrelAt(t, [offRoute])).toEqual(squirrelAt(t, []));
      const reduced = squirrelAt(t, [fence], true), nest = squirrelAt(1, [fence], true);
      expect([reduced.x, reduced.y, reduced.lift]).toEqual([nest.x, nest.y, 0]);
    }
  });

  it('draws the airborne squirrel over the log frame with its shadow on the moving ground point', () => {
    const log = squirrelDevice('log'), life = { day: 1 };
    for (const rot of [0, 1] as const) for (const time of [2.65, 8.3]) {
      const v = { ...view, cx: 15.25, cy: 8.62, zoom: rot ? .73 : 1.48, rot };
      const run = squirrelAt(time, [log]), base = project(v, run.x, run.y);
      const ctx = canvas(), drawable = groundLifeDrawable(ctx, woodpile, v, life, time, false, run)!;
      const logDepth = depthOf(rot, log.x + .5, log.y + .5);
      expect(drawable.depth).toBeGreaterThan(logLayerDepth(logDepth, deviceArt('log', 0, 'resting', rot), 'near'));
      vi.mocked(drawAnimal).mockClear();
      drawable.drawShadow!();
      expect(ctx.translate).toHaveBeenLastCalledWith(base.x, base.y);
      expect(vi.mocked(ctx.ellipse).mock.lastCall!.slice(0, 2)).toEqual([0, 0]);
      expect(drawAnimal).not.toHaveBeenCalled();
      drawable.draw();
      expect(ctx.translate).toHaveBeenLastCalledWith(base.x, base.y);
      expect(ctx.ellipse).toHaveBeenCalledTimes(1);
      const [, row, pose, x, y, , mirrored] = vi.mocked(drawAnimal).mock.lastCall!;
      expect([row, pose, x, y]).toEqual([1, 2, 0, -run.lift]);
      expect(mirrored).toBe(Boolean(rot) !== (time > 7));
      const soil = canvas(), onReturn = squirrelAt(8.3, [log]), cache = project(v, onReturn.cacheX, onReturn.cacheY);
      drawSquirrelCache(soil, woodpile, v, life, 8.3, false, onReturn);
      expect(soil.translate).toHaveBeenCalledWith(cache.x, cache.y);
    }
  });

  it('sends the startled robin along the same flight path after a camera turn', () => {
    const prop = { kind: 'mailbox', x: 12, y: 19, w: 1, h: 1 } as const;
    const flight = ([0, 1] as const).map(rot => {
      const draw = (hornAge: number) => {
        drawPropLife(canvas(), prop, { x: 0, y: 0, w: 40 }, 52, { ...view, rot }, { day: 1, hornAge }, 3, false);
        return vi.mocked(drawAnimal).mock.lastCall!;
      };
      const resting = draw(-1), flying = draw(.6);
      return { dx: flying[3] - resting[3], dy: flying[4] - resting[4], mirror: flying[6] };
    });
    expect(flight[0]!.dx).toBeLessThan(-35);
    expect(flight[1]!.dx).toBeCloseTo(-flight[0]!.dx);
    expect(flight[1]!.dy).toBeCloseTo(flight[0]!.dy);
    expect(flight[1]!.mirror).not.toBe(flight[0]!.mirror);
  });
  it('keeps leaves on the lane until the departing car passes, then settles them in new places', () => {
    const parked = [...wagonLeaves(-4)];
    expect([...wagonLeaves(0)]).toEqual(parked);
    const passing = [...wagonLeaves(2)];
    expect(passing.some(leaf => leaf.height > 4)).toBe(true);
    expect(passing.some(leaf => leaf.height === 0)).toBe(true);
    const settled = [...wagonLeaves(5)];
    expect(settled.every((leaf, i) => leaf.height === 0 && leaf.y > parked[i]!.y)).toBe(true);
    expect([...wagonLeaves(8)]).toEqual(settled);
  });

  it('keeps the frog under the water after the washer, then brings it back to the same lip in both views', () => {
    for (const rot of [0, 1] as const) {
      const draw = (wellAge: number) => {
        vi.mocked(drawAnimal).mockClear();
        drawPropLife(canvas(), { kind: 'well', x: 15, y: 6, w: 1, h: 1 }, { x: 240, y: 280, w: 110 }, 86,
          { ...view, rot }, { day: 1, wellAge }, 4, false);
        return vi.mocked(drawAnimal).mock.lastCall;
      };
      const resting = draw(-1)!;
      expect(draw(FROG_SPLASH_AT - .1)?.[2]).toBe(2);
      expect(draw(FROG_SPLASH_AT + .1)).toBeUndefined();
      expect(draw(FROG_RETURNS_AT + .1)?.[2]).toBe(2);
      expect(draw(FROG_RETURNS_AT + .5)?.slice(3, 5)).toEqual(resting.slice(3, 5));
    }
  });

  it('suppresses only the glowworms beside a living enemy and restores their light when it leaves', () => {
    const draw = (enemies: Enemy[]) => {
      const ctx = canvas(); drawGlowworms(ctx, view, enemies, 2, true);
      return vi.mocked(ctx.fillRect).mock.calls;
    };
    const orchard = draw([]);
    const visitor = { x: 3.55, y: 10.7, alive: true } as Enemy;
    const near = draw([visitor]);
    expect(near.length).toBeLessThan(orchard.length);
    expect(near.length).toBeGreaterThan(0);
    expect(draw([{ ...visitor, x: 16 }])).toEqual(orchard);
    expect(draw([{ ...visitor, alive: false }])).toEqual(orchard);
  });

  it('keeps the visible part of the orchard glow at the edges of the CCTV and defense replay', () => {
    const halos = (v: View) => {
      const ctx = canvas();
      drawGlowworms(ctx, v, [], 3.4, false);
      return vi.mocked(ctx.fillRect).mock.calls;
    };
    for (const v of [cameraView('portail', { x: 12, y: 54, w: 884, h: 497 }, 1.22),
      defenseTapeView('verger', .35, 1.22 * 320 / 884, false)]) {
      const wide = { ...v, x: v.x - 40, y: v.y - 40, w: v.w + 80, h: v.h + 80 };
      const clipped = halos(wide).filter(([x, y, w, h]) => x < v.x + v.w && x + w > v.x && y < v.y + v.h && y + h > v.y);
      expect(clipped.some(([x, y, w, h]) => x + w / 2 < v.x || x + w / 2 >= v.x + v.w ||
        y + h / 2 < v.y || y + h / 2 >= v.y + v.h)).toBe(true);
      expect(halos(v)).toEqual(clipped);
    }
  });

  it('jingles the hardware keys once per swing, including when the player closes a search', () => {
    const shop = new ShopLife('hardware');
    shop.update(.27, pointer, false); shop.update(2, pointer, false);
    expect(audio.play).toHaveBeenCalledTimes(1);
    shop.disturbed(); shop.update(.22, pointer, false);
    expect(audio.play).toHaveBeenCalledTimes(1);
    shop.update(.08, pointer, false);
    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('lets a startled mouse reach cover before starting its next foray', () => {
    const shop = new ShopLife('grocery');
    shop.update(4, pointer, false); shop.draw(canvas(), false);
    const [, , , x, y] = vi.mocked(drawAnimal).mock.lastCall!;
    shop.update(.01, { ...pointer, x, y, overCanvas: true }, false);
    shop.update(.3, pointer, false); shop.draw(canvas(), false);
    expect(vi.mocked(drawAnimal).mock.lastCall![3]).toBeLessThan(x);
    vi.mocked(drawAnimal).mockClear();
    shop.update(1, pointer, false); shop.draw(canvas(), false); expect(drawAnimal).not.toHaveBeenCalled();
    shop.update(4, pointer, false); shop.update(1.6, pointer, false); shop.draw(canvas(), false);
    expect(drawAnimal).toHaveBeenCalledOnce();
  });
});

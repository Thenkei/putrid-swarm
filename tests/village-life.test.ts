import { beforeEach, describe, expect, it, vi } from 'vitest';
import { audio } from '../src/engine/audio';
import { drawAnimal } from '../src/render/life-art';
import { wagonLeaves } from '../src/render/car-departure';
import { drawGlowworms, drawPropLife, FROG_SPLASH_AT, FROG_RETURNS_AT } from '../src/render/homestead-life';
import { ShopLife } from '../src/scenes/shop-life';
import type { Enemy } from '../src/core/night';
import type { View } from '../src/render/projection';

vi.mock('../src/engine/audio', () => ({ audio: { play: vi.fn() } }));
vi.mock('../src/render/life-art', () => ({ drawAnimal: vi.fn(), drawSmallProp: vi.fn() }));
vi.mock('../src/scenes/common', () => ({ platePoint: (_: string, x: number, y: number) => ({ x: x * 1280, y: y * 853 - 66.5 }) }));

const view: View = { x: 0, y: 0, w: 900, h: 600, cx: 5, cy: 12, zoom: 1.5, rot: 0 };
const pointer = { x: 0, y: 0, down: false, overCanvas: false };
function canvas() {
  const noop = () => {};
  return { save: noop, restore: noop, translate: noop, scale: noop, beginPath: noop, fill: noop, stroke: noop,
    ellipse: noop, fillRect: vi.fn(), globalAlpha: 1, createRadialGradient: () => ({ addColorStop: noop }) } as unknown as CanvasRenderingContext2D;
}
beforeEach(() => vi.clearAllMocks());

describe('life in the homestead and shops', () => {
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

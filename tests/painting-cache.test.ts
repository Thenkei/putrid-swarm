import { afterEach, expect, it, vi } from 'vitest';
import { paintingImage, preparePaintings, type Sprite } from '../src/engine/assets';

const painting = (): Sprite => ({
  img: { decode: () => Promise.resolve() } as HTMLImageElement,
  w: 1,
  h: 1,
});

afterEach(() => vi.unstubAllGlobals());

it('releases an obsolete facade even if its bitmap finishes after the replacement', async () => {
  vi.stubGlobal('requestAnimationFrame', (draw: FrameRequestCallback) => draw(0));
  const first = painting();
  const next = painting();
  const obsolete = { close: vi.fn() };
  const current = { close: vi.fn() };
  let finishFirst!: () => void;
  const decode = vi.fn()
    .mockImplementationOnce(() => new Promise(resolve => { finishFirst = () => resolve(obsolete); }))
    .mockResolvedValueOnce(current);
  vi.stubGlobal('createImageBitmap', decode);

  const pending = preparePaintings(new Set([first]));
  await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
  expect(paintingImage(first)).toBe(first.img);
  await preparePaintings(new Set([next]));
  finishFirst();
  await pending;
  expect(obsolete.close).toHaveBeenCalledOnce();
  expect(paintingImage(first)).toBe(first.img);
  expect(paintingImage(next)).toBe(current);

  await preparePaintings(new Set());
  expect(current.close).toHaveBeenCalledOnce();
});

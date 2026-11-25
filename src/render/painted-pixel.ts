import type { Sprite } from '../engine/assets';

const masks = new WeakMap<CanvasImageSource, ImageData>();

export function paintedSource(source: CanvasImageSource, u: number, v: number, aspect: number, width = 64): boolean {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
  let mask = masks.get(source);
  if (!mask) {
    const surface = document.createElement('canvas');
    surface.width = width;
    surface.height = Math.max(1, Math.round(width / aspect));
    const context = surface.getContext('2d');
    if (!context) return false;
    context.drawImage(source, 0, 0, surface.width, surface.height);
    mask = context.getImageData(0, 0, surface.width, surface.height);
    masks.set(source, mask);
  }
  const index = Math.floor(v * mask.height) * mask.width + Math.floor(u * mask.width);
  return mask.data[4 * index + 3]! > 64;
}

export function paintedPixel(art: Sprite, u: number, v: number, source: CanvasImageSource = art.img, width = 64): boolean {
  return paintedSource(source, u, v, art.w / art.h, width);
}

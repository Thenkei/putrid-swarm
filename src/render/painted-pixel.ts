import type { Sprite } from '../engine/assets';

const masks = new WeakMap<CanvasImageSource, Map<number, ImageData>>();

function sourceMask(source: CanvasImageSource, aspect: number, width: number): ImageData | undefined {
  let sizes = masks.get(source);
  let mask = sizes?.get(width);
  if (!mask) {
    const surface = document.createElement('canvas');
    surface.width = width;
    surface.height = Math.max(1, Math.round(width / aspect));
    const context = surface.getContext('2d');
    if (!context) return;
    context.drawImage(source, 0, 0, surface.width, surface.height);
    mask = context.getImageData(0, 0, surface.width, surface.height);
    if (!sizes) {
      sizes = new Map();
      masks.set(source, sizes);
    }
    sizes.set(width, mask);
  }
  return mask;
}

export function paintedSource(source: CanvasImageSource, u: number, v: number, aspect: number, width = 64): boolean {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
  const mask = sourceMask(source, aspect, width);
  if (!mask) return false;
  const index = Math.floor(v * mask.height) * mask.width + Math.floor(u * mask.width);
  return mask.data[4 * index + 3]! > 64;
}

/** Hit the outline of a crown, including gaps between leaves, and the narrower trunk below. */
const foliageRows = new WeakMap<ImageData, Int32Array>();
export function foliageAt(source: CanvasImageSource, u: number, v: number, aspect: number): boolean {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
  const mask = sourceMask(source, aspect, 64);
  if (!mask) return false;
  let bounds = foliageRows.get(mask);
  if (!bounds) {
    bounds = new Int32Array(mask.height * 2);
    for (let y = 0; y < mask.height; y++) {
      let left = mask.width, right = -1;
      for (let x = 0; x < mask.width; x++) {
        if (mask.data[(y * mask.width + x) * 4 + 3]! < 24) continue;
        left = Math.min(left, x);
        right = x;
      }
      bounds[y * 2] = left;
      bounds[y * 2 + 1] = right;
    }
    foliageRows.set(mask, bounds);
  }
  const x = Math.floor(u * mask.width), row = Math.floor(v * mask.height) * 2;
  return x >= bounds[row]! && x <= bounds[row + 1]!;
}

export function paintedPixel(art: Sprite, u: number, v: number, source: CanvasImageSource = art.img, width = 64): boolean {
  return paintedSource(source, u, v, art.w / art.h, width);
}

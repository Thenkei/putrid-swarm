// Shadows: what makes a sprite stand on the ground instead of floating over it.
//
// The art is lit from the upper left of the screen on both sides of the house, so shadows fall
// to the upper right of whatever casts them, along a grid axis: they read as lying on the ground.
// Two kinds: a soft blob where something touches the ground, and the thing's own outline laid
// flat for anything tall enough to throw one. Outlines are kept very small: stretched back to
// size they come out soft, with no blur filter anywhere.

import { sprite } from '../engine/assets';

/** Where the top of a sprite of height 1 lands, in screen units, relative to its foot. */
export const SHADOW_REACH = { x: 0.62, y: -0.31 } as const;
/** The ink of a shadow: never pure black, the ground shows its colour through it. */
export const SHADOW_RGB = '22, 14, 8';

const OUTLINE_HEIGHT = 40;
const outlines = new Map<string, HTMLCanvasElement | null>();

/** The outline of a sprite, small and filled with shadow ink. */
function outline(key: string): HTMLCanvasElement | null {
  const known = outlines.get(key);
  if (known !== undefined) return known;
  const art = sprite(key);
  if (!art) return null; // Not cached: the art may still be loading.
  const canvas = document.createElement('canvas');
  canvas.height = OUTLINE_HEIGHT;
  canvas.width = Math.max(1, Math.round((art.w / art.h) * OUTLINE_HEIGHT));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    outlines.set(key, null);
    return null;
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(art.img, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = `rgb(${SHADOW_RGB})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  outlines.set(key, canvas);
  return canvas;
}

/**
 * The shadow thrown by a standing sprite whose foot is at (x, y) and which is drawn `height` tall.
 * `length` scales how far it reaches (1 = as far as the thing is tall, along the light).
 */
export function castShadow(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, height: number, flip: boolean, alpha: number, length = 1): void {
  const shape = outline(key);
  if (!shape || alpha <= 0) return;
  const width = (shape.width / shape.height) * height;
  ctx.save();
  ctx.globalAlpha *= alpha;
  // Sprite space has y running up the figure as negative: its top (0, -height) lands on the tip.
  ctx.transform(flip ? -1 : 1, 0, -SHADOW_REACH.x * length, -SHADOW_REACH.y * length, x, y);
  ctx.drawImage(shape, -width / 2, -height, width, height);
  ctx.restore();
}

const blobs = new Map<string, HTMLCanvasElement>();

/** One soft round patch of a colour, drawn once and stretched wherever it is needed. */
function softBlob(rgb: string): HTMLCanvasElement {
  const known = blobs.get(rgb);
  if (known) return known;
  const blob = document.createElement('canvas');
  blob.width = 96;
  blob.height = 96;
  const ctx = blob.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
    gradient.addColorStop(0, `rgba(${rgb}, 1)`);
    gradient.addColorStop(0.55, `rgba(${rgb}, 0.62)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 96, 96);
  }
  blobs.set(rgb, blob);
  return blob;
}

/**
 * A soft patch of colour centred on (x, y), `rx` by `ry` across, in whatever coordinates the
 * context is in. In grid coordinates (see `groundMatrix`) it lies flat on the ground.
 */
export function groundPatch(ctx: CanvasRenderingContext2D, rgb: string, x: number, y: number, rx: number, ry: number, alpha: number): void {
  if (alpha <= 0) return;
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = previous * alpha;
  ctx.drawImage(softBlob(rgb), x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = previous;
}

/** The dark patch where something meets the ground. */
export function contactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha: number): void {
  groundPatch(ctx, SHADOW_RGB, x, y, rx, ry, alpha);
}

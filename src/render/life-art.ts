import { sprite } from '../engine/assets';

// The wildlife cells share one ground line; a crouch changes the silhouette without moving the paws.
export function drawAnimal(ctx: CanvasRenderingContext2D, row: number, pose: number, x: number, y: number, width: number, mirror = false): void {
  const art = sprite('village_wildlife');
  if (!art) return;
  const w = art.w / 4, h = art.h / 5, height = width * h / w;
  ctx.save();
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.drawImage(art.img, pose * w, row * h, w, h, -width / 2, -height * .89, width, height);
  ctx.restore();
}

/** Apple, enamel pan, hanging keys, letter. The prop cells have individually trimmed transparent margins. */
export function drawSmallProp(ctx: CanvasRenderingContext2D, index: number, x: number, y: number, w: number, h: number): void {
  const art = sprite('village_keepsakes');
  if (!art) return;
  const cw = art.w / 2, ch = art.h / 2;
  ctx.drawImage(art.img, index % 2 * cw, Math.floor(index / 2) * ch, cw, ch, x, y, w, h);
}

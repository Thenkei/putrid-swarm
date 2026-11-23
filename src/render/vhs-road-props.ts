import { sprite } from '../engine/assets';

/** Draw from the road contact. Phase is one full pedal revolution in [0, 1), or zero for reduced motion. */
export function drawVhsRoadProp(ctx: CanvasRenderingContext2D, kind: 'cart' | 'mail',
  x: number, y: number, size: number, phase: number): boolean {
  const sheet = sprite('epic_vhs_road_props');
  if (!sheet) return false;
  if (kind === 'cart') {
    const width = size * .93;
    const height = width * 182 / 248;
    ctx.drawImage(sheet.img, 516, 4, 248, 182, x - width / 2, y - height, width, height);
  } else {
    const frame = Math.floor((phase - Math.floor(phase)) * 4);
    const sx = (frame % 2) * 256, sy = Math.floor(frame / 2) * 256;
    ctx.drawImage(sheet.img, sx, sy, 256, 256, x - size * .5, y - size * 252 / 256, size, size);
  }
  return true;
}

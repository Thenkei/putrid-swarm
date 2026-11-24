import { coastVerge } from '../core/coast-home';
import { smoothstep } from '../core/math';

interface GroundCamera { x: number; z: number; centre: number; horizon: number }

/** The path first bends around the oaks, then straightens as it joins the barn entrance. */
export function coastLaneCentre(z: number): number {
  return -2.4 * smoothstep(3, 7.5, z) + 4 * smoothstep(7.5, 12, z) - 1.6 * smoothstep(12, 16, z);
}

/** Both panes look at the same strip of gravel. The mirror samples metres behind the car. */
export function drawCoastGround(
  ctx: CanvasRenderingContext2D, image: HTMLImageElement, camera: GroundCamera,
  focal: number, eye: number, bottom: number, direction: 1 | -1,
): void {
  if (!image.complete || !image.naturalWidth) return;
  const h = image.naturalHeight, w = image.naturalWidth;
  const fieldLength = 36, fieldWidth = 22.8;
  const strip = direction === 1 ? 1.35 : .85;
  for (let y = camera.horizon + eye * focal / 41; y < bottom; y += strip) {
    const near = focal * eye / (y + strip - camera.horizon);
    const far = focal * eye / (y - camera.horizon);
    const depth = (near + far) / 2;
    const z = camera.z + direction * depth;
    const repeat = Math.floor(z / fieldLength);
    const v = z / fieldLength - repeat;
    const sy = (repeat % 2 ? v : 1 - v) * (h - 1);
    const sh = Math.min(h, Math.max(1, h * (far - near) / fieldLength));
    const scale = focal / depth;
    const left = camera.centre + (coastLaneCentre(z) + 1.64 * coastVerge(z) - .52 * fieldWidth - camera.x) * scale;
    ctx.globalAlpha = 1 - smoothstep(19, 39, depth);
    ctx.drawImage(image, 0, Math.min(h - sh, Math.max(0, sy - sh / 2)), w, sh, left, y, fieldWidth * scale, strip + .22);
  }
  ctx.globalAlpha = 1;
}

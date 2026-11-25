import { sprite } from '../engine/assets';
import gait from './mob-gaits.json';

let nightPatrol: HTMLCanvasElement | undefined;

export function lightPool(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, color); g.addColorStop(1, 'transparent');
  ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

/** Reuse the same painted, foot-registered walk cycle as the desk view. */
export function patrolCel(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, facing: number, time: number) {
  const atlas = sprite('mob_gait_shambler');
  if (!atlas) return false;
  // The patrol is on the unlit side of the fence. Grade the sheet once so the
  // shambler's ochre jacket cannot be mistaken for the neighbour's yellow coat.
  if (!nightPatrol) {
    const graded = document.createElement('canvas');
    graded.width = atlas.img.naturalWidth;
    graded.height = atlas.img.naturalHeight;
    const ink = graded.getContext('2d');
    if (ink) {
      ink.filter = 'saturate(.23) brightness(.92)';
      ink.drawImage(atlas.img, 0, 0);
      ink.filter = 'none';
      ink.globalCompositeOperation = 'source-atop';
      ink.fillStyle = '#516b772e';
      ink.fillRect(0, 0, graded.width, graded.height);
      nightPatrol = graded;
    }
  }
  const frame = Math.floor(time * 14) % gait.frames;
  const scale = height / gait.inkHeight;
  ctx.save();
  // The front shambler painting steps to screen left.
  ctx.translate(x, y); ctx.scale(-facing * scale, scale);
  ctx.drawImage(nightPatrol ?? atlas.img, (frame % gait.columns) * gait.cellWidth, Math.floor(frame / gait.columns) * gait.cellHeight,
    gait.cellWidth, gait.cellHeight, -gait.cellWidth / 2, -gait.cellHeight + 11, gait.cellWidth, gait.cellHeight);
  ctx.restore();
  return true;
}

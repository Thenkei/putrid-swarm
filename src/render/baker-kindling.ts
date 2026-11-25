import kindlingUrl from '../assets/baker-kindling.webp';
import { MAILBOX } from '../core/map';
import { depthOf, project, type View } from './projection';
import { paintedSource } from './painted-pixel';

let painting: HTMLImageElement | undefined;
export function bakerKindling() {
  if (!painting) {
    painting = new Image();
    painting.src = kindlingUrl;
  }
  return painting;
}

// Inside the gate, against the mailbox post, in both yard orientations.
const gx = MAILBOX.x - .35, gy = MAILBOX.y + .78;

export function hitsKindling(view: View, x: number, y: number, visible?: (depth: number) => boolean) {
  const p = project(view, gx, gy);
  const u = ((x - p.x) / view.zoom + 27) / 54, v = ((y - p.y) / view.zoom + 32) / 34;
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
  const art = bakerKindling();
  return art.complete && art.naturalWidth > 0 && paintedSource(art, u, v, 54 / 34) && (visible?.(depthOf(view.rot, gx, gy)) ?? true);
}

export function kindlingDrawable(ctx: CanvasRenderingContext2D, view: View) {
  const p = project(view, gx, gy);
  return { depth: depthOf(view.rot, gx, gy), draw: () => {
    const art = bakerKindling();
    if (!art.complete || !art.naturalWidth) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(view.zoom, view.zoom);
    ctx.fillStyle = '#2f221982';
    ctx.beginPath(); ctx.ellipse(-1, 0, 23, 7, -.11, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(art, -27, -32, 54, 34);
    ctx.restore();
  } };
}

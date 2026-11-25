import type { GroundContact } from '../core/types';
import { outsideSillDepth, VISIBLE_DOORS } from './house';
import { calmMotion } from './lighting';
import { depthOf, project, type View } from './projection';

// The whistle and cord lie flat. A half-turn reverses both ground axes.
const bearing = -.32;
const cos = Math.cos(bearing), sin = Math.sin(bearing);
const groundScale = (view: View) => view.rot === 0 ? view.zoom : -view.zoom;

function whistleDepth(view: View, at: GroundContact): number {
  const depth = depthOf(view.rot, at.x, at.y) + .08;
  return at.threshold && VISIBLE_DOORS[view.rot].includes(at.threshold) ? outsideSillDepth(view.rot, depth) : depth;
}

export function hitsWhistle(view: View, at: GroundContact, x: number, y: number, visible?: (depth: number) => boolean): boolean {
  const p = project(view, at.x, at.y);
  const scale = groundScale(view);
  const dx = (x - p.x) / scale, dy = (y - p.y) / scale;
  const localX = dx * cos + dy * sin, localY = -dx * sin + dy * cos;
  const pad = Math.max(1, 1.4 / view.zoom);
  const body = Math.hypot((localX - 2) / (5.8 + pad), (localY + 3) / (4.2 + pad)) <= 1;
  const mouth = localX >= -10 - pad && localX <= 0 && localY >= -4 - (localX + 10) * .27 - pad && localY <= -.8 - (localX + 10) * .12 + pad;
  const t = Math.max(0, Math.min(1, (localX - 5) / 17));
  const cordY = -2 + t * (1 - t) * (15 - 24 * t);
  const cord = localX >= 5 && localX <= 22 + pad && Math.abs(localY - cordY) <= .85 + pad;
  return (body || mouth || cord) && (visible?.(whistleDepth(view, at)) ?? true);
}

/** The leather cord and brass barrel lie on the ground at the last position of the Chief. */
export function whistleDrawable(ctx: CanvasRenderingContext2D, view: View, at: GroundContact, time: number) {
  const p = project(view, at.x, at.y);
  return { depth: whistleDepth(view, at), draw: () => {
    ctx.save();
    ctx.translate(p.x, p.y);
    const scale = groundScale(view);
    ctx.scale(scale, scale);
    ctx.rotate(bearing);
    ctx.fillStyle = '#2b201e86';
    ctx.beginPath(); ctx.ellipse(1, 1, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#513a27'; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(5, -2); ctx.bezierCurveTo(12, 3, 16, -5, 22, -2); ctx.stroke();
    ctx.fillStyle = '#8e602c'; ctx.strokeStyle = '#493723'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(2, -3, 5.8, 4.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d5ae5b';
    ctx.beginPath(); ctx.moveTo(-1, -6.5); ctx.lineTo(-10, -4); ctx.lineTo(-10, -.8); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#503a28'; ctx.fillRect(-5.9, -4.6, 3, 1.6);
    const gleam = calmMotion() ? .6 : .48 + .5 * Math.max(0, Math.cos(time * 2.1)) ** 14;
    ctx.strokeStyle = `rgba(255,232,163,${gleam})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(2, -3.5, 4.5, 2.7, 0, Math.PI * 1.12, Math.PI * 1.86); ctx.stroke();
    ctx.restore();
  } };
}

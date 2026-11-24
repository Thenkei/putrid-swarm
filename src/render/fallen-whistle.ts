import type { Cell } from '../core/types';
import { calmMotion } from './lighting';
import { depthOf, project, type View } from './projection';

export function hitsWhistle(view: View, at: Cell, x: number, y: number): boolean {
  const p = project(view, at.x, at.y);
  return Math.hypot((x - p.x) / 15, (y - p.y + 3 * view.zoom) / 9) <= Math.max(view.zoom, .85);
}

/** The leather cord and brass barrel lie on the ground at the last position of the Chief. */
export function whistleDrawable(ctx: CanvasRenderingContext2D, view: View, at: Cell, time: number) {
  const p = project(view, at.x, at.y);
  return { depth: depthOf(view.rot, at.x, at.y) + .08, draw: () => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(view.zoom, view.zoom);
    ctx.rotate(view.rot === 0 ? -.32 : .24);
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

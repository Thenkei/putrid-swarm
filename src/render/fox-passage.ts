import { sprite } from '../engine/assets';
import { smoothstep } from './noise';
import { project, depthOf, type View } from './projection';
import { GATE_HEDGE, type GateHedge } from './gate-hedge';

/** The fox slips across the outer two shrubs. The rest of the hedge follows the path to the house. */
export function foxHedge(ctx: CanvasRenderingContext2D, view: View, age: number | null, still: boolean, passage?: GateHedge) {
  const z = view.zoom;
  const items = GATE_HEDGE.map(({ x, y, foxAt, species, height }, index) => ({
    depth: depthOf(view.rot, x, y) + .06,
    draw() {
      const a = sprite('yard_flora_' + (view.rot ? 'back_' : '') + species);
      if (!a) return;
      const p = project(view, x, y);
      const t = age !== null && foxAt !== null ? age - foxAt : -1;
      const flick = t > 0 && t < 1 ? Math.sin(t * 15) * Math.exp(-3.8 * t) : 0;
      const press = passage?.bend(index) ?? 0;
      const shear = flick * (still ? .04 : .35) - press * (still ? .22 : .68);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(z, z);
      ctx.transform(1, 0, (view.rot ? -1 : 1) * shear, 1, 0, 0);
      const h = height, w = h * a.w / a.h;
      ctx.drawImage(a.img, -w * (a.footX ?? .5), -h * (a.footY ?? 1), w, h);
      ctx.restore();
    }
  }));
  if (age === null || age < .77 || age > 1.87) return items;
  const u = smoothstep(.77, 1.87, age), x = 7.73 + .65 * u, y = 17.20 - 1.34 * u;
  items.push({
    depth: depthOf(view.rot, x, y), draw() {
      const p = project(view, x, y);
      ctx.save();
      ctx.globalAlpha *= smoothstep(.77, .90, age) * (1 - smoothstep(1.65, 1.87, age));
      ctx.translate(p.x, p.y);
      ctx.scale(view.rot ? -z : z, z);
      // It slips below the bottom rail: expose the tail between two rooted clumps.
      ctx.beginPath();
      ctx.rect(-30, -21, 48, 21);
      ctx.clip();
      ctx.translate(0, 6 - 10 * Math.sin(u * Math.PI));
      ctx.rotate(still ? -.12 : -.12 + .16 * Math.sin(u * 7));
      ctx.fillStyle = '#6c3822';
      ctx.beginPath();
      ctx.moveTo(6, -6);
      ctx.quadraticCurveTo(0, -14, -8, -8);
      ctx.quadraticCurveTo(-15, -4, -23, -7);
      ctx.quadraticCurveTo(-17, 1, -8, 1);
      ctx.quadraticCurveTo(1, 1, 6, -6);
      ctx.fill();
      ctx.fillStyle = '#c3723c';
      ctx.beginPath();
      ctx.moveTo(4, -7);
      ctx.quadraticCurveTo(-3, -11, -10, -5);
      ctx.lineTo(-16, -3);
      ctx.quadraticCurveTo(-6, 0, 4, -7);
      ctx.fill();
      ctx.strokeStyle = '#945632';
      ctx.lineWidth = .65;
      ctx.beginPath();
      ctx.moveTo(-12, -5);
      ctx.quadraticCurveTo(-5, -8, 2, -8);
      ctx.moveTo(-12, -3);
      ctx.quadraticCurveTo(-5, -3, 0, -6);
      ctx.stroke();
      ctx.fillStyle = '#dcc8a3';
      ctx.beginPath();
      ctx.moveTo(-15, -5);
      ctx.lineTo(-23, -7);
      ctx.quadraticCurveTo(-20, -2, -13, 0);
      ctx.lineTo(-15, -3);
      ctx.lineTo(-12, -3);
      ctx.fill();
      ctx.restore();
    }
  });
  return items;
}

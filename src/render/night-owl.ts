import { sprite } from '../engine/assets';
import type { NightOwl } from '../scenes/night-wildlife';
import { depthOf, project, type View } from './projection';

// Breast registration in each painting: the feathers move around the torso.
const BREAST = [[.46, .60], [.46, .49], [.45, .44], [.46, .43]] as const;
const WINGBEAT = [0, 3, 1, 2, 1, 3] as const;
const PUSH_OFF = .17;

export function owlDrawable(ctx: CanvasRenderingContext2D, view: View, owl: NightOwl,
  gx: number, gy: number, perchX: number, perchY: number, still: boolean) {
  const age = owl.flightAge;
  const t = Math.max(0, (age ?? 0) - PUSH_OFF);
  // Accelerate away from the post and cross the hedge on a single world-space path.
  const travel = t - (1 - Math.exp(-3.8 * t)) / 3.8;
  const x = gx - 8.4 * travel, y = gy + 4.6 * travel;
  const root = project(view, gx, gy), ground = project(view, x, y);
  const lift = 78 * (1 - Math.exp(-1.7 * t)) + 13 * t;
  return {
    depth: depthOf(view.rot, x, y) + .42,
    draw() {
      const perched = sprite('night_owl');
      if (!perched) return;
      const flight = t > 0 ? sprite('night_owl_flight') : undefined;
      ctx.save();
      ctx.translate(perchX + ground.x - root.x, perchY + ground.y - root.y - lift * view.zoom);
      ctx.scale(view.rot ? -view.zoom : view.zoom, view.zoom);
      ctx.globalAlpha *= owl.opacity;
      if (flight) {
        const beat = Math.max(0, t - .09) / .43;
        const cel = still || t > 1.55 ? 3 : WINGBEAT[Math.floor(beat * WINGBEAT.length) % WINGBEAT.length]!;
        const width = 88 - 5 * Math.min(t, 2);
        const sw = flight.w / 2, sh = flight.h / 2, height = width * sh / sw;
        const [ax, ay] = BREAST[cel];
        const bob = still || t > 1.55 ? 0 : 1.6 * Math.sin(beat * 2 * Math.PI);
        ctx.drawImage(flight.img, cel % 2 * sw, Math.floor(cel / 2) * sh, sw, sh,
          -width * ax, -14 - height * ay + bob, width, height);
      } else {
        const crouch = age === null || still ? 0 : Math.sin(Math.min(1, age / PUSH_OFF) * Math.PI);
        const breath = still ? 0 : .014 * Math.sin(owl.age * 4);
        ctx.scale(1 + .08 * crouch, 1 + breath - .22 * crouch);
        if (!still) ctx.rotate(.035 * Math.sin(owl.age * 2.7) - .12 * crouch);
        ctx.drawImage(perched.img, -12.5, -34.2, 26.5, 40);
      }
      ctx.restore();
    },
  };
}

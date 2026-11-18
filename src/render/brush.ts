import { GRID_H, GRID_W } from '../core/map';
import type { Enemy } from '../core/night';
import { smoothstep } from './noise';
import type { Rot } from './projection';

const SETTLED = 0.82;
const edgeDistance = (x: number, y: number) => Math.min(x, y, GRID_W - x, GRID_H - y);

interface BrushContact {
  x: number;
  y: number;
  at: number;
  direction: number;
  radius: number;
}

/** Footfalls at the woodland edge belong to the night. All four cameras sample the same
 * contacts, including a branch still settling after the last infected has gone. */
export class BrushPassage {
  private readonly walkers = new WeakMap<Enemy, { entered: number; lastStep: number }>();
  private readonly contacts: BrushContact[] = [];

  update(time: number, enemies: readonly Enemy[]): void {
    while (this.contacts.length && time - this.contacts[0]!.at >= SETTLED) this.contacts.shift();
    for (const e of enemies) {
      if (!e.alive || edgeDistance(e.x, e.y) > 3.1) continue;
      let walker = this.walkers.get(e);
      const arrival = !walker;
      if (!walker) {
        walker = { entered: time, lastStep: e.travel };
        this.walkers.set(e, walker);
      }
      // Sample by distance. A creature held in a net never shakes the same branch in place.
      if (!arrival && e.travel - walker.lastStep < 0.38) continue;
      walker.lastStep = e.travel;
      const radius = 1.46 + e.def.size * 0.45;
      if (arrival) {
        // The simulation starts at the first walkable cell. Its outer shoulder has
        // just pushed through the hedge on that side, even if the path now turns.
        const edge = edgeDistance(e.x, e.y);
        const dx = edge === e.x ? 1 : edge === GRID_W - e.x ? -1 : 0;
        const dy = edge === e.y ? 1 : edge === GRID_H - e.y ? -1 : 0;
        this.contacts.push({ x: e.x - dx * 0.85, y: e.y - dy * 0.85, at: time, direction: dx - dy, radius });
      } else {
        this.contacts.push({ x: e.x, y: e.y, at: time, direction: e.fx - e.fy, radius });
      }
    }
  }

  /** Open a sightline over several frames when a new actor first appears behind a crown. */
  presence(e: Enemy, time: number): number {
    const walker = this.walkers.get(e);
    return walker ? smoothstep(0, 0.19, time - walker.entered) : 1;
  }

  bend(gx: number, gy: number, rot: Rot, time: number): number {
    if (!this.contacts.length || edgeDistance(gx, gy) > 5.4) return 0;
    let weighted = 0, weight = 0;
    for (const hit of this.contacts) {
      const dx = gx - hit.x;
      const dy = gy - hit.y;
      const distance2 = dx * dx + dy * dy;
      if (distance2 >= hit.radius * hit.radius) continue;
      const age = time - hit.at;
      const push = smoothstep(0, 0.11, age) * (1 - smoothstep(0.16, 0.49, age));
      const rebound = 0.23 * smoothstep(0.32, 0.55, age) * (1 - smoothstep(0.55, SETTLED, age));
      const strength = 1 - smoothstep(0.05, hit.radius * hit.radius, distance2);
      const side = Math.max(-1, Math.min(1, (dx - dy) * 1.55 + hit.direction * 0.65));
      const displacement = side * strength * (push - rebound);
      // Opposing shoulders can meet the same stem. Blending avoids a snap as one passes the other.
      const influence = Math.abs(displacement);
      weighted += displacement * influence;
      weight += influence;
    }
    const bend = weight > 0 ? weighted / weight : 0;
    return rot === 0 ? bend : -bend;
  }
}

import { GRID_H, GRID_W } from '../core/map';
import type { Enemy } from '../core/night';
import { hash2, smoothstep } from './noise';
import type { Rot } from './projection';

const SETTLED = 0.82;
const LEAF_LIFE = 1.18;
const edgeDistance = (x: number, y: number) => Math.min(x, y, GRID_W - x, GRID_H - y);

interface BrushContact {
  x: number;
  y: number;
  at: number;
  direction: number;
  radius: number;
}

interface LeafBurst {
  readonly id: number;
  readonly at: number;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}

/** Footfalls at the woodland edge belong to the night. All four cameras sample the same
 * contacts, including a branch still settling after the last infected has gone. */
export class BrushPassage {
  private readonly walkers = new Map<number, { entered: number; lastStep: number }>();
  private readonly contacts: BrushContact[] = [];
  private readonly bursts: LeafBurst[] = [];

  update(time: number, enemies: readonly Enemy[]): void {
    while (this.contacts.length && time - this.contacts[0]!.at >= SETTLED) this.contacts.shift();
    while (this.bursts.length && time - this.bursts[0]!.at >= LEAF_LIFE) this.bursts.shift();
    for (const e of enemies) {
      if (!e.alive || edgeDistance(e.x, e.y) > 3.1) continue;
      let walker = this.walkers.get(e.id);
      const arrival = !walker;
      if (!walker) {
        walker = { entered: time, lastStep: e.travel };
        this.walkers.set(e.id, walker);
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
        if (e.def.tramples || e.def.size >= 1.35) {
          this.bursts.push({ id: e.id, at: time, x: e.x - dx * 0.45, y: e.y - dy * 0.45, dx, dy });
        }
      } else {
        this.contacts.push({ x: e.x, y: e.y, at: time, direction: e.fx - e.fy, radius });
      }
    }
  }

  *leaves(time: number) {
    for (const burst of this.bursts) {
      for (let i = 0; i < 7; i++) {
        const t = (time - burst.at - 0.07 - i * 0.018) / (0.72 + hash2(burst.id, i, 2) * 0.27);
        if (t <= 0 || t >= 1) continue;
        const drift = ((i - 3) * 0.43 + hash2(burst.id, i, 3) * 0.3) * t + Math.sin(t * 9 + i) * 0.18 * t;
        const inward = (1.75 + hash2(burst.id, i, 4) * 1.65) * (1 - (1 - t) ** 2);
        yield {
          x: burst.x + burst.dx * inward - burst.dy * drift,
          y: burst.y + burst.dy * inward + burst.dx * drift,
          height: (1 - t) * (27 + hash2(burst.id, i, 5) * 21 + 45 * t),
          size: 2.4 + hash2(burst.id, i, 6) * 1.7,
          angle: i + t * (7 + hash2(burst.id, i, 7) * 8),
          turning: 0.35 + Math.abs(Math.sin(t * 12 + i)) * 0.65,
          alpha: smoothstep(0, 0.09, t) * (1 - smoothstep(0.73, 1, t)),
          colour: i,
        };
      }
    }
  }

  /** Open a sightline over several frames when a new actor first appears behind a crown. */
  presence(e: Pick<Enemy, 'id'>, time: number): number {
    const walker = this.walkers.get(e.id);
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

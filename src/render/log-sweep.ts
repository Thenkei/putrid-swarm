import { HIT_REACTION_SECONDS, type Enemy, type LogSweep } from '../core/night';
import type { Fallen } from './infected';
import { smoothstep } from './noise';

// A rope release commits the hit immediately. All four cameras show the short interval
// between that input, the painted timber reaching the shoulder, and the feet leaving it.
const FEET_LEAVE = 0.035;
const LAND = 0.23;

interface Flight extends LogSweep { readonly contactAt: number }

function position(flights: readonly Flight[], time: number, x: number, y: number) {
  for (const flight of flights) {
    const age = time - flight.contactAt;
    if (age < 0) break;
    const remaining = 1 - smoothstep(FEET_LEAVE, LAND, age);
    x += (flight.before.x - flight.landingX) * remaining;
    y += (flight.before.y - flight.landingY) * remaining;
  }
  return { x, y };
}

export class LogReactions {
  private readonly flights = new Map<number, Flight[]>();

  release(contactAt: number, sweeps: readonly LogSweep[], now: number): void {
    this.advance(now);
    for (const sweep of sweeps) {
      const flight = { ...sweep, contactAt };
      const queue = this.flights.get(sweep.before.id);
      if (queue) queue.push(flight);
      else this.flights.set(sweep.before.id, [flight]);
    }
  }

  advance(now: number): void {
    for (const [id, queue] of this.flights) {
      while (queue[0] && now - queue[0].contactAt >= HIT_REACTION_SECONDS) queue.shift();
      if (!queue.length) this.flights.delete(id);
    }
  }

  cancel(id: number): void {
    this.flights.delete(id);
  }

  private actor(queue: readonly Flight[], enemy: Enemy | undefined, now: number): Enemy | undefined {
    // The next unplayed blow captured exactly what the previous blows left behind:
    // health, posture and position. A later lethal press cannot hide their reactions.
    const pending = queue.findIndex(flight => flight.contactAt > now);
    const source = pending < 0 ? enemy : queue[pending]!.before;
    const last = queue[(pending < 0 ? queue.length : pending) - 1];
    if (!source || !last) return source;
    return {
      ...source, ...position(queue, now, source.x, source.y),
      hitFlash: Math.max(source.hitFlash, HIT_REACTION_SECONDS - (now - last.contactAt)),
      hitCrawlDepth: Math.max(source.hitCrawlDepth ?? 0, last.before.crawlDepth),
    };
  }

  enemies(enemies: readonly Enemy[], now: number): readonly Enemy[] {
    if (!this.flights.size) return enemies;
    const visible = enemies.filter(e => e.alive);
    for (const [id, queue] of this.flights) {
      const index = visible.findIndex(e => e.id === id);
      const actor = this.actor(queue, visible[index], now);
      if (!actor) continue;
      if (index >= 0) visible[index] = actor;
      else visible.push(actor);
    }
    return visible;
  }

  bodies(bodies: readonly Fallen[], now: number): readonly Fallen[] {
    if (!this.flights.size) return bodies;
    return bodies.map(body => {
      const queue = this.flights.get(body.id);
      return queue ? { ...body, ...position(queue, now, body.x, body.y) } : body;
    });
  }
}

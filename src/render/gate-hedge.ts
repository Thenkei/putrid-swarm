import type { Enemy } from '../core/night';
import { smoothstep } from './noise';

export const GATE_HEDGE = [
  { x: 7.57, y: 17.39, species: 'bramble', height: 19, foxAt: .22 },
  { x: 8.02, y: 16.70, species: 'hazel', height: 27, foxAt: .68 },
  { x: 9.13, y: 17.18, species: 'bramble', height: 23, foxAt: null },
  { x: 9.92, y: 16.40, species: 'hazel', height: 29, foxAt: null },
  { x: 9.98, y: 15.26, species: 'bramble', height: 23, foxAt: null },
] as const;

type HedgeCue = 'hedge_twig' | 'hedge_leaves';

/** Actual footsteps press into the verge. Stopping, dying or turning away lets each stem spring back. */
export class GateHedge {
  private readonly travel = new WeakMap<Enemy, number>();
  private readonly stems = GATE_HEDGE.map(() => ({ bend: 0, velocity: 0, pressure: 0 }));
  private lastContact = -Infinity;
  private nextSound = 0;
  private cue: HedgeCue | undefined;

  update(time: number, dt: number, enemies: readonly Enemy[]): void {
    for (const stem of this.stems) stem.pressure = 0;
    let touching = false;
    for (const enemy of enemies) {
      if (!enemy.alive || enemy.x < 6 || enemy.x > 11.5 || enemy.y < 14 || enemy.y > 19) continue;
      const previous = this.travel.get(enemy);
      this.travel.set(enemy, enemy.travel);
      if (previous === undefined || enemy.travel <= previous) continue;
      for (let i = 0; i < GATE_HEDGE.length; i++) {
        const plant = GATE_HEDGE[i]!;
        const distance = Math.hypot(plant.x - enemy.x, plant.y - enemy.y);
        const reach = .78 + Math.min(1.4, enemy.def.size) * .38;
        if (distance >= reach) continue;
        const strength = 1 - smoothstep(.14, reach, distance);
        if (strength < .06) continue;
        const stem = this.stems[i]!;
        const across = Math.max(-1, Math.min(1, enemy.fx - enemy.fy));
        // When the path runs straight towards the camera, each shoulder parts its own side of the hedge.
        const offset = ((plant.x - enemy.x) - (plant.y - enemy.y)) / reach;
        const side = Math.max(-1, Math.min(1, offset));
        const pressure = strength * (across + (1 - Math.abs(across)) * side);
        if (Math.abs(pressure) > Math.abs(stem.pressure)) stem.pressure = pressure;
        touching = true;
      }
    }
    // A short attack and a slower, slightly underdamped release leave a readable trail.
    for (const stem of this.stems) {
      const stiffness = stem.pressure === 0 ? 43 : 95;
      stem.velocity += ((stem.pressure - stem.bend) * stiffness - stem.velocity * 9) * dt;
      stem.bend += stem.velocity * dt;
    }
    if (touching) {
      if (time >= this.nextSound) {
        this.cue = time - this.lastContact > 1.8 ? 'hedge_twig' : 'hedge_leaves';
        this.nextSound = time + 1.65;
      }
      this.lastContact = time;
    }
  }

  bend(index: number): number { return this.stems[index]!.bend; }

  disturbed(time: number): boolean { return time - this.lastContact < .9; }

  takeSound(): HedgeCue | undefined {
    const cue = this.cue;
    this.cue = undefined;
    return cue;
  }
}

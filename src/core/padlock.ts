import type { Rng } from './rng';

// Degrees clockwise from twelve. The brass guide on the face uses this same angle.
export const GATE_HALF_ANGLE = 18;
const RING_SPEEDS = [94, -116, 142] as const;

export class Padlock {
  readonly angles: number[];
  setRings = 0;

  constructor(rng: Rng) {
    // Every ring starts away from the gate so each catch needs a deliberate turn.
    this.angles = RING_SPEEDS.map(() => rng.int(65, 295));
  }

  get open(): boolean {
    return this.setRings === this.angles.length;
  }

  get aligned(): boolean {
    const angle = this.angles[this.setRings];
    return angle !== undefined && Math.min(angle, 360 - angle) <= GATE_HALF_ANGLE;
  }

  advance(seconds: number): void {
    if (this.open) return;
    const index = this.setRings;
    const angle = this.angles[index]! + RING_SPEEDS[index]! * seconds;
    this.angles[index] = ((angle % 360) + 360) % 360;
  }

  catchRing(): boolean {
    if (!this.aligned) return false;
    this.angles[this.setRings] = 0;
    this.setRings++;
    return true;
  }
}

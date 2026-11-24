import { PARKED } from './car-path';
import { GRID_W, roadCentre } from './map';
import { smoothstep } from './math';

const TRACK_Y = roadCentre('barn', PARKED.x);
const START_X = GRID_W - .15;
const STOP_SECONDS = .52;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The break comes from the barn side facing -x. A left turn points the nose toward +y. */
export class YardParking {
  x = START_X;
  y = TRACK_Y;
  heading = 0;
  speed = 0;
  distance = 0;
  phase: 'driving' | 'settling' | 'parked' = 'driving';
  private settleProgress = 0;
  private approach = { x: 0, y: 0, heading: 0 };

  get atTurn(): boolean { return this.x <= PARKED.x + 2.35; }

  update(dt: number, throttle: number, steer: number): void {
    if (this.phase === 'parked') return;
    if (this.phase === 'settling') {
      this.settleProgress = Math.min(1, this.settleProgress + dt / STOP_SECONDS);
      const rest = (1 - this.settleProgress) ** 2;
      this.x = PARKED.x + (this.approach.x - PARKED.x) * rest;
      this.y = PARKED.y + (this.approach.y - PARKED.y) * rest;
      this.heading = Math.PI / 2 + (this.approach.heading - Math.PI / 2) * rest;
      if (this.settleProgress === 1) this.phase = 'parked';
      return;
    }

    const target = throttle * (throttle < 0 ? 1.55 : 2.55);
    const acceleration = throttle && this.speed * throttle >= 0 ? 3.7 : 8.5;
    this.speed += clamp(target - this.speed, -acceleration * dt, acceleration * dt);
    // The verge guides the wheels until the gravel apron opens beside the house.
    const apron = smoothstep(PARKED.x + 2.7, PARKED.x + .9, this.x);
    const steeringLimit = .10 + (Math.PI / 2 - .10) * smoothstep(PARKED.x + 2.4, PARKED.x + .12, this.x);
    this.heading = clamp(this.heading + steer * this.speed * dt * .98, 0, steeringLimit);
    const x = clamp(this.x - Math.cos(this.heading) * this.speed * dt, PARKED.x - .46, START_X);
    const y = clamp(this.y + Math.sin(this.heading) * this.speed * dt, TRACK_Y - .30, TRACK_Y + .30 + 2.84 * apron);
    this.distance += Math.hypot(x - this.x, y - this.y);
    this.x = x;
    this.y = y;
    if (this.heading > .79 && Math.hypot(x - PARKED.x, y - PARKED.y) <= .62) {
      this.approach = { x, y, heading: this.heading };
      this.speed = 0;
      this.phase = 'settling';
    }
  }
}

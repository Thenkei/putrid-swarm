import { PARKED } from './car-path';
import type { CoastArrival } from './coast-home';
import { GRID_H, GRID_W, HOUSE, PROPS, roadCentre, terrainAt } from './map';

const TRACK_Y = roadCentre('barn', GRID_W);
const CELL_METRES = 1.55;
const STOP_SECONDS = .26;
const WHEELBASE = 1.72;
const TYRE_RADIUS = .49;
const TAU = 2 * Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const approach = (from: number, to: number, step: number) => from + clamp(to - from, -step, step);
const angleError = (target: number, angle: number) => Math.atan2(Math.sin(target - angle), Math.cos(target - angle));

const obstacles = [
  { x: HOUSE.x0, y: HOUSE.y0, w: HOUSE.x1 - HOUSE.x0 + 1, h: HOUSE.y1 - HOUSE.y0 + 1 },
  ...PROPS.filter(p => p.kind !== 'car'),
];

/** Two broad tyre tracks and the middle of the chassis sweep the solid scenery. */
function canOccupy(x: number, y: number, heading: number): boolean {
  const dx = -Math.cos(heading), dy = Math.sin(heading);
  for (const length of [-.97, 0, 1.03]) {
    const px = x + dx * length, py = y + dy * length;
    // The entrance also admits an angled wagon on either grass verge.
    const barnRoad = Math.abs(py - TRACK_Y) <= 2.65 && px > GRID_W - 2;
    if (px < 1.35 || py < 1.35 || py > GRID_H - 1.35 || px > (barnRoad ? GRID_W + 1.25 : GRID_W - 1.35)) return false;
    for (const p of obstacles) {
      const ox = px - clamp(px, p.x, p.x + p.w), oy = py - clamp(py, p.y, p.y + p.h);
      if (ox * ox + oy * oy < TYRE_RADIUS ** 2) return false;
    }
  }
  return true;
}

/** The centre is between the axles. A positive heading turns the nose from -x toward +y. */
export class YardParking {
  x = GRID_W - .15;
  y: number;
  heading: number;
  wheel: number;
  speed: number;
  distance = 0;
  wheelRoll = 0;
  phase: 'driving' | 'settling' | 'parked' = 'driving';
  private settleProgress = 0;

  constructor(entry?: CoastArrival) {
    this.y = TRACK_Y - clamp(entry?.offset ?? 0, -1.3, 1.3) / CELL_METRES;
    this.heading = -(entry?.heading ?? 0);
    this.wheel = -(entry?.wheel ?? 0);
    this.speed = (entry?.speed ?? 0) / CELL_METRES;
  }

  get atTurn(): boolean { return this.x < PARKED.x + 2.15; }
  get bayBehind(): boolean {
    return -(PARKED.x - this.x) * Math.cos(this.heading) + (PARKED.y - this.y) * Math.sin(this.heading) < -.7;
  }
  get bayToLeft(): boolean {
    return (PARKED.x - this.x) * Math.sin(this.heading) + (PARKED.y - this.y) * Math.cos(this.heading) > 0;
  }
  get onGrass(): boolean { return terrainAt(Math.floor(this.x), Math.floor(this.y)) === 'grass'; }
  get inBay(): boolean {
    return Math.abs(this.x - PARKED.x) < .64 && Math.abs(this.y - PARKED.y) < .83
      && Math.abs(angleError(Math.PI / 2, this.heading)) < .46;
  }

  update(dt: number, throttle: number, steer: number, brake = false): void {
    while (dt > .000001 && this.phase !== 'parked') {
      const step = Math.min(dt, 1 / 100);
      dt -= step;
      if (this.phase === 'settling') {
        this.settleProgress = Math.min(1, this.settleProgress + step / STOP_SECONDS);
        if (this.settleProgress === 1) this.phase = 'parked';
        continue;
      }
      this.drive(step, throttle, steer, brake);
    }
  }

  private drive(dt: number, throttle: number, steer: number, brake: boolean): void {
    // Rack travel and caster return have separate rates. The rolling rear tyres
    // turn about the instantaneous centre of the front wheels, including in reverse.
    this.wheel = approach(this.wheel, steer, dt * (steer ? 3.7 : 4.3));
    const grass = this.onGrass;
    const limit = throttle < 0 ? 1.6 : grass ? 2.0 : 3.15;
    const drag = (grass ? 1.28 : .72) + .12 * this.speed ** 2;
    const stopping = brake || throttle * this.speed < -.015;
    const previousSpeed = this.speed;
    if (stopping) this.speed = approach(this.speed, 0, dt * (brake ? 6.1 : 4.7));
    else if (!throttle) this.speed = approach(this.speed, 0, dt * drag);
    else this.speed += (throttle * (throttle > 0 ? 3.1 : 2.3) - this.speed * (throttle > 0 ? 3.1 : 2.3) / limit) * dt;
    const travel = (previousSpeed + this.speed) * .5 * dt;
    const lock = .75 - .07 * Math.min(1, Math.abs(this.speed) / 3);
    const tangent = Math.tan(this.wheel * lock), slip = Math.atan(.47 * tangent);
    const yaw = travel * Math.cos(slip) * tangent / WHEELBASE;
    const nextX = this.x - Math.cos(this.heading + .5 * yaw + slip) * travel;
    const nextY = this.y + Math.sin(this.heading + .5 * yaw + slip) * travel;
    if (travel && canOccupy(nextX, nextY, this.heading + yaw)) {
      this.x = nextX; this.y = nextY;
      this.heading = (this.heading + yaw) % TAU;
      this.distance += Math.abs(travel);
      this.wheelRoll = (this.wheelRoll - travel / .29) % TAU;
    } else if (travel) this.speed = 0;

    if (this.inBay && Math.abs(this.speed) < .32 && (brake || !throttle)) {
      this.speed = 0;
      this.phase = 'settling';
    }
  }
}

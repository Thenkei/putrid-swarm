/** Positions are metres along the neighbour's route. Each camera watches one garden. */
export const GARDENS = [
  { length: 18, shelter: [7.2, 10.1], patrols: [{ from: 3.8, to: 15.6, period: 6.5, phase: 0.13, width: 3.6 }] },
  { length: 22, shelter: [10, 13], patrols: [{ from: 4, to: 10.5, period: 5.6, phase: 0.73, width: 3.1 }, { from: 14.8, to: 19.6, period: 4.9, phase: 0.28, width: 2.8 }] },
  { length: 24, shelter: [9.3, 12.2], patrols: [{ from: 4.4, to: 17.5, period: 7, phase: 0.15, width: 3.8 }, { from: 15, to: 21, period: 5.5, phase: 0.55, width: 3.1 }] },
] as const;

export type GardenEvent = 'moving' | 'caught' | 'next' | 'home' | 'fled';
const WALK_SPEED = 2.9;
export class GardenEscort {
  garden = 0;
  position = 0;
  time = 0;
  alert = 0;
  strikes = 0;
  advance = false;
  walking = false;
  signalTime = -Infinity;
  signalPosition = 0;
  outcome: 'playing' | 'home' | 'fled' = 'playing';
  private delay = 0;
  private checkpoint = 0;

  constructor(readonly lamp: boolean, private readonly seed: number) {}
  get layout() { return GARDENS[this.garden]!; }
  get hidden() { return this.position >= this.layout.shelter[0] && this.position <= this.layout.shelter[1]; }
  patrolAt(index: number, ahead = 0) {
    const p = this.layout.patrols[index]!;
    const phase = (this.time + ahead) / p.period + p.phase + (this.seed >>> 0) % 13 / 26;
    return (p.from + p.to) / 2 + (p.to - p.from) / 2 * Math.sin(2 * Math.PI * phase);
  }
  get watched() {
    return !this.hidden && this.layout.patrols.some((p, i) => Math.abs(this.position - this.patrolAt(i)) <= p.width / 2);
  }
  get closingIn() {
    // The curtain has a visible response delay. Give the operator time to read an incoming gaze.
    const ahead = .55;
    const reaction = Math.max(0, Math.min(ahead, this.delay));
    const movingTime = (this.walking ? reaction : 0) + (this.advance ? ahead - reaction : 0);
    const projected = this.position + WALK_SPEED * movingTime;
    const [start, end] = this.layout.shelter;
    return !(projected >= start && projected <= end) &&
      this.layout.patrols.some((p, i) => Math.abs(projected - this.patrolAt(i, ahead)) <= p.width / 2);
  }

  signal() {
    if (this.outcome !== 'playing') return;
    this.advance = !this.advance;
    this.signalTime = this.time;
    this.signalPosition = this.position;
    this.delay = this.lamp ? 0 : 0.4;
  }

  step(dt: number): GardenEvent {
    if (this.outcome !== 'playing') return this.outcome;
    this.time += dt;
    this.delay -= dt;
    if (this.delay <= 0) this.walking = this.advance;
    if (this.walking) this.position += WALK_SPEED * dt;
    if (this.hidden) this.checkpoint = (this.layout.shelter[0] + this.layout.shelter[1]) / 2;
    this.alert = Math.max(0, this.alert + ((this.walking && this.watched) ? 1 : -0.68) * dt);
    if (this.alert >= 0.93) {
      this.strikes++;
      this.position = this.checkpoint;
      this.alert = 0;
      this.walking = this.advance = false;
      this.signalTime = -Infinity;
      if (this.strikes === 2) return this.outcome = 'fled';
      return 'caught';
    }
    if (this.position < this.layout.length) return 'moving';
    this.position = this.layout.length;
    this.walking = this.advance = false;
    this.signalTime = -Infinity;
    if (this.garden === GARDENS.length - 1) return this.outcome = 'home';
    this.garden++;
    this.position = this.checkpoint = this.time = this.alert = 0;
    return 'next';
  }
}

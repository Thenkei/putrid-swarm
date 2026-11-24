import { ROAD_DUSK_HOURS } from './crossbow-road';
import { smoothstep } from './math';
import type { GameState } from './types';

export const COAST_METRES = 15;
export const COAST_RUT = 7.4;
const LOOSE_STONES = [2.7, 10.8] as const;
const HALF_WIDTH = 1.64;
const WHEELBASE = 2.33;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Lateral position of the gravel centreline, in metres. The barn track starts due ahead. */
export function coastLaneCentre(z: number): number {
  return -1.9 * smoothstep(2.4, 7.4, z) + 2.55 * smoothstep(7.4, 12.65, z) - .65 * smoothstep(12.65, COAST_METRES, z);
}

export const coastVerge = (metres: number): number => .35 + .19 * Math.sin(metres * .36);
export interface CoastArrival { speed: number; heading: number; offset: number; wheel: number; powered: boolean }
export type CoastOutcome = 'quiet' | 'followed';
export type CoastPhase = 'ready' | 'rolling' | 'stopped' | 'powered' | 'arrived';

export function shouldCoastHome(state: GameState): boolean {
  return state.phase === 'day' && state.where === 'road' && !!state.outing &&
    !state.encounter && !state.outing.crossbowStop && state.day >= 2 &&
    state.hoursLeft <= ROAD_DUSK_HOURS && !state.flags['coast.day'];
}

export function finishCoastHome(state: GameState, outcome: CoastOutcome): GameState {
  if (!state.outing || !shouldCoastHome(state)) return state;
  return {
    ...state,
    outing: { ...state.outing, coastParking: true },
    flags: { ...state.flags, 'coast.day': state.day, 'coast.followed': Number(outcome === 'followed') },
  };
}

export function finishCoastParking(state: GameState): GameState {
  if (state.where !== 'road' || !state.outing?.coastParking) return state;
  const { coastParking: _coastParking, ...outing } = state.outing;
  return { ...state, outing: { ...outing, coastParked: true } };
}

export function coastForNight(state: GameState): CoastOutcome | null {
  if (state.flags['coast.day'] !== state.day) return null;
  return state.flags['coast.followed'] ? 'followed' : 'quiet';
}

export class CoastDrive {
  phase: CoastPhase = 'ready';
  metres = 0;
  speed = 0;
  lane = 0;
  heading = 0;
  wheel = 0;
  edgeContact = 0;
  acceleration = 0;
  brakePressure = 0;
  losingMomentum = false;
  jolt = 0;
  jarRattle = 0;
  rootCrossing: 'quiet' | 'hit' | null = null;
  noise = 0;
  listening = false;
  walkerTravel = 0;
  heard = false;
  private nextStone = 0;
  private engineRunning = false;

  get bumped(): boolean { return this.rootCrossing === 'hit'; }

  get worldX(): number { return coastLaneCentre(this.metres) + this.lane * HALF_WIDTH; }

  get arrival(): CoastArrival {
    return { speed: this.speed, heading: this.heading, offset: this.worldX, wheel: this.wheel, powered: this.engineRunning };
  }

  get tyreLoad(): number { return Math.min(1, Math.max(0, (this.speed - .25) / 1.1)); }

  get grass(): boolean {
    return this.lane > coastVerge(this.metres);
  }

  ignition(): void {
    if (this.phase === 'ready') {
      this.phase = 'rolling';
      this.speed = 1.90;
    } else if (this.phase === 'stopped') {
      this.phase = 'powered';
      this.engineRunning = true;
      this.listening = false;
      this.heard = true;
      this.noise = 1;
      this.jarRattle = .46;
      this.speed = .68;
    }
  }

  update(dt: number, steering: number, brake: boolean, forward = false): void {
    this.jolt = Math.max(0, this.jolt - dt * 1.6);
    this.jarRattle *= Math.exp(-5 * dt);
    if (this.phase !== 'rolling' && this.phase !== 'powered') return;
    const powered = this.phase === 'powered';
    const pedal = brake ? 1 : 0;
    this.brakePressure += (pedal - this.brakePressure) * (1 - Math.exp(-dt * (pedal ? 9 : 16)));
    // With the ignition off, opening the clutch lets gravity carry the wagon.
    const target = powered ? (forward ? 3.1 : 1.25) : (forward ? 2.65 : 1.48);
    const surfaceDrag = this.grass ? .38 : 0;
    const freeRoll = (target - surfaceDrag - this.speed) * (powered ? 1.15 : .66) - this.edgeContact * .76;
    const stopping = .32 + .87 * this.speed;
    this.acceleration = freeRoll * (1 - this.brakePressure) - stopping * this.brakePressure;
    this.speed = Math.max(0, this.speed + this.acceleration * dt);
    this.losingMomentum = !powered && this.speed < (this.losingMomentum ? .67 : .55);
    if (!powered && this.speed <= .07) {
      this.speed = 0;
      this.brakePressure = 0;
      this.losingMomentum = false;
      this.phase = 'stopped';
      return;
    }
    const previous = this.metres;
    this.steer(dt, steering);
    const stone = LOOSE_STONES[this.nextStone];
    if (stone !== undefined && this.metres >= stone) {
      if (previous < stone) this.jarRattle = (this.grass ? .36 : .72) * (.25 + .75 * this.tyreLoad);
      this.nextStone++;
    }
    if (previous < COAST_RUT && this.metres >= COAST_RUT && this.lane >= .52) {
      this.rootCrossing = this.speed > .80 ? 'hit' : 'quiet';
      if (this.bumped) {
        this.jolt = 1;
        this.jarRattle = .87;
        this.noise = Math.min(1, this.noise + .72);
        this.heard = this.heard || this.noise >= 1;
      }
    }
    if (this.metres > 1.5 && this.metres < 12 && !this.heard) {
      // A careful driver can feather the brake over the stones as well as take the verge.
      const exposure = (this.grass ? -.32 : (this.speed - .76) * .55) + this.edgeContact * .32;
      this.noise = Math.min(1, Math.max(0, this.noise + exposure * dt));
      this.heard = this.noise >= 1;
    }
    this.listening = !this.heard && this.metres < 12 && this.noise >= (this.listening ? .32 : .52);
    if (!this.listening && !this.heard) this.walkerTravel = Math.min(2.1, this.walkerTravel + .32 * dt);
    if (this.metres >= COAST_METRES) {
      this.phase = 'arrived';
    }
  }

  private steer(dt: number, steering: number): void {
    // Self-centring unwinds the front wheels. It does not undo the turn already made.
    const rate = steering === 0 ? 3.1 : 2.45;
    this.wheel += clamp(steering - this.wheel, -rate * dt, rate * dt);
    const distance = this.speed * dt;
    const yaw = distance / WHEELBASE * Math.tan(this.wheel * .68);
    const heading = clamp(this.heading + yaw, -.70, .70);
    const midHeading = (this.heading + heading) / 2;
    const travel = Math.min(distance, (COAST_METRES - this.metres) / Math.cos(midHeading));
    const x = this.worldX + Math.sin(midHeading) * travel;
    this.metres = Math.min(COAST_METRES, this.metres + Math.cos(midHeading) * travel);
    const offset = x - coastLaneCentre(this.metres);
    this.heading = heading;
    this.lane = clamp(offset / HALF_WIDTH, -1, 1);
    this.edgeContact *= Math.exp(-5 * dt);
    if (Math.abs(offset) > HALF_WIDTH && travel > 0) {
      // At the bank the loaded sidewall scrubs speed and progressively deflects
      // the nose along the hedge. On the open track the tyres keep their heading.
      const tangent = Math.atan((coastLaneCentre(this.metres + .10) - coastLaneCentre(this.metres - .10)) / .20);
      const intoBank = (heading - tangent) * Math.sign(offset);
      if (intoBank > 0) {
        this.edgeContact = Math.max(this.edgeContact, Math.min(1, intoBank * 2 + .14));
        this.heading += (tangent - heading) * (1 - Math.exp(-3.4 * dt * this.speed));
      }
    }
  }
}

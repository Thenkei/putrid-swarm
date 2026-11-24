import { ROAD_DUSK_HOURS } from './crossbow-road';
import type { GameState } from './types';

export const COAST_METRES = 15;
export const COAST_RUT = 7.4;
const LOOSE_STONES = [2.7, 10.8] as const;
export const coastVerge = (metres: number): number => .35 + .19 * Math.sin(metres * .36);
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
  wheel = 0;
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

  get bumped(): boolean { return this.rootCrossing === 'hit'; }

  get tyreLoad(): number { return Math.min(1, Math.max(0, (this.speed - .25) / 1.1)); }

  get grass(): boolean {
    return this.lane > coastVerge(this.metres);
  }

  ignition(): void {
    if (this.phase === 'ready') {
      this.phase = 'rolling';
      this.speed = 1.32;
    } else if (this.phase === 'stopped') {
      this.phase = 'powered';
      this.listening = false;
      this.heard = true;
      this.noise = 1;
      this.jarRattle = .46;
      this.speed = .72;
    }
  }

  update(dt: number, steering: number, brake: boolean): void {
    this.jolt = Math.max(0, this.jolt - dt * 1.6);
    this.jarRattle *= Math.exp(-5 * dt);
    if (this.phase !== 'rolling' && this.phase !== 'powered') return;
    this.wheel += (steering - this.wheel) * (1 - Math.exp(-8 * dt));
    this.lane = Math.min(1, Math.max(-1, this.lane + this.wheel * dt * Math.min(1.25, this.speed + .15)));
    const powered = this.phase === 'powered';
    const target = powered ? 1.55 : this.grass ? .96 : 1.36;
    const pedal = brake && !powered ? 1 : 0;
    this.brakePressure += (pedal - this.brakePressure) * (1 - Math.exp(-dt * (pedal ? 9 : 16)));
    const freeRoll = (target - this.speed) * .82;
    const stopping = .32 + .80 * this.speed;
    this.speed += (freeRoll * (1 - this.brakePressure) - stopping * this.brakePressure) * dt;
    this.losingMomentum = !powered && this.speed < (this.losingMomentum ? .67 : .55);
    if (this.speed <= .07) {
      this.speed = 0;
      this.brakePressure = 0;
      this.losingMomentum = false;
      this.phase = 'stopped';
      return;
    }
    const previous = this.metres;
    this.metres = Math.min(COAST_METRES, this.metres + this.speed * dt);
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
      const exposure = this.grass ? -.32 : (this.speed - .76) * .47;
      this.noise = Math.min(1, Math.max(0, this.noise + exposure * dt));
      this.heard = this.noise >= 1;
    }
    this.listening = !this.heard && this.metres < 12 && this.noise >= (this.listening ? .32 : .52);
    if (!this.listening && !this.heard) this.walkerTravel = Math.min(2.1, this.walkerTravel + .32 * dt);
    if (this.metres >= COAST_METRES) {
      this.speed = 0;
      this.phase = 'arrived';
    }
  }
}

import { ROAD_DUSK_HOURS } from './crossbow-road';
import type { GameState } from './types';

export const COAST_METRES = 15;
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
    outing: { ...state.outing, coastParked: true },
    flags: { ...state.flags, 'coast.day': state.day, 'coast.followed': Number(outcome === 'followed') },
  };
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
  noise = 0;
  heard = false;

  get grass(): boolean {
    return this.lane > .35 + .19 * Math.sin(this.metres * .36);
  }

  ignition(): void {
    if (this.phase === 'ready') {
      this.phase = 'rolling';
      this.speed = 1.32;
    } else if (this.phase === 'stopped') {
      this.phase = 'powered';
      this.heard = true;
      this.noise = 1;
      this.speed = .72;
    }
  }

  update(dt: number, steering: number, brake: boolean): void {
    if (this.phase !== 'rolling' && this.phase !== 'powered') return;
    this.wheel += (steering - this.wheel) * (1 - Math.exp(-8 * dt));
    this.lane = Math.min(1, Math.max(-1, this.lane + steering * dt * Math.min(1.4, this.speed + .25)));
    const powered = this.phase === 'powered';
    const target = powered ? 1.55 : this.grass ? .96 : 1.36;
    this.speed += ((target - this.speed) * .82 - (brake && !powered ? 1.45 : 0)) * dt;
    if (this.speed <= .07) {
      this.speed = 0;
      this.phase = 'stopped';
      return;
    }
    this.metres = Math.min(COAST_METRES, this.metres + this.speed * dt);
    if (this.metres > 1.5 && this.metres < 12 && !this.heard) {
      // A careful driver can feather the brake over the stones as well as take the verge.
      const exposure = this.grass ? -.32 : (this.speed - .76) * .47;
      this.noise = Math.min(1, Math.max(0, this.noise + exposure * dt));
      this.heard = this.noise >= 1;
    }
    if (this.metres >= COAST_METRES) {
      this.speed = 0;
      this.phase = 'arrived';
    }
  }
}

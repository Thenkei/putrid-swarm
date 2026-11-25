import { BOSS_NIGHT } from './data/locations';
import { GRID_H, GRID_W } from './map';
import type { GameState, GroundContact, NightReport } from './types';

/** Old reports record a defeat but have no reliable place to put the whistle. */
export function chiefFall(report: NightReport | null): GroundContact | null {
  const p = report?.chiefFellAt;
  if (report?.night !== BOSS_NIGHT.chief || report.bossDefeated !== 'chief' || !p ||
      !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x >= GRID_W || p.y < 0 || p.y >= GRID_H) return null;
  return p;
}

export function whistleInGrass(state: GameState): GroundContact | null {
  if (!state.lastNight?.survived || state.flags.chiefWhistleBlown) return null;
  const morning = state.phase === 'morning' && state.day === BOSS_NIGHT.chief;
  const afterRadio = state.phase === 'day' && state.day === BOSS_NIGHT.chief + 1 && state.where === 'home' && state.radio.stage === 'done';
  return morning || afterRadio ? chiefFall(state.lastNight) : null;
}

export function blowChiefWhistle(state: GameState): GameState {
  if (state.phase !== 'day' || !whistleInGrass(state)) return state;
  return { ...state, flags: { ...state.flags, chiefWhistleBlown: 1 } };
}

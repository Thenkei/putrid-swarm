// Save-game (de)serialisation. Parsing is defensive: a corrupt or foreign blob yields null,
// never a half-valid GameState.

import type { DeviceInstance, GameState, Phase } from './types';
import { facingsOf } from './data/devices';
import { LOCATION_IDS, RESOURCE_IDS, SECTOR_IDS } from './types';

export const SAVE_VERSION = 1;
const PHASES: readonly Phase[] = ['day', 'night', 'morning', 'lost', 'won'];

export const serialize = (state: GameState): string => JSON.stringify(state);

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Devices saved before they could be turned have no facing. Palisades then followed their
 * neighbours (a run along y was drawn turned); everything else faced the default way.
 */
function withFacing(devices: readonly DeviceInstance[]): DeviceInstance[] {
  const fenceAt = (x: number, y: number): boolean => devices.some((d) => d.type === 'fence' && d.x === x && d.y === y);
  return devices.map((d) => {
    if (Number.isInteger(d.facing) && d.facing >= 0 && d.facing < facingsOf(d.type)) return d;
    const alongY = d.type === 'fence' && (fenceAt(d.x, d.y - 1) || fenceAt(d.x, d.y + 1)) && !(fenceAt(d.x - 1, d.y) || fenceAt(d.x + 1, d.y));
    return { ...d, facing: alongY ? 1 : 0 };
  });
}

export function deserialize(raw: string): GameState | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || data['version'] !== SAVE_VERSION) return null;
  if (!isNumber(data['seed']) || !isNumber(data['rng']) || !isNumber(data['day']) || !isNumber(data['hoursLeft'])) return null;
  if (!PHASES.includes(data['phase'] as Phase)) return null;
  if (data['where'] !== 'home' && !LOCATION_IDS.includes(data['where'] as (typeof LOCATION_IDS)[number])) return null;

  const inventory = data['inventory'];
  if (!isRecord(inventory) || !RESOURCE_IDS.every((id) => isNumber(inventory[id]) && (inventory[id] as number) >= 0)) return null;

  const yard = data['yard'];
  if (!isRecord(yard) || !Array.isArray(yard['devices']) || !Array.isArray(yard['decals'])) return null;
  if (!isNumber(yard['houseHp']) || !isNumber(yard['nextDeviceId'])) return null;
  const barricades = yard['barricades'];
  if (!isRecord(barricades) || !SECTOR_IDS.every((s) => isRecord(barricades[s]) && isNumber((barricades[s] as Record<string, unknown>)['hp']))) return null;

  const locations = data['locations'];
  if (!isRecord(locations) || !LOCATION_IDS.every((id) => isRecord(locations[id]) && Array.isArray((locations[id] as Record<string, unknown>)['searched']))) {
    return null;
  }
  if (!isRecord(data['flags']) || !isRecord(data['totals'])) return null;

  // A night in progress is not resumable: restart that night from the evening.
  const parsed = data as unknown as GameState;
  // Reports saved before automatic traps existed have no count for them.
  const reported: GameState = parsed.lastNight && !isNumber(parsed.lastNight.autoTriggers) ? { ...parsed, lastNight: { ...parsed.lastNight, autoTriggers: 0 } } : parsed;
  const state: GameState = { ...reported, yard: { ...reported.yard, devices: withFacing(reported.yard.devices) } };
  return state.phase === 'night' ? { ...state, phase: 'day', where: 'home', hoursLeft: 0 } : state;
}

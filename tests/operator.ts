// A simple automatic camera operator and a few reference layouts, shared by tests and the balance tool.
// It plays like an attentive but not clairvoyant player: it reacts to what is inside a trap's reach.

import { BARRICADE, DEVICES, isManual } from '../src/core/data/devices';
import { ENTRIES, LANES, isBuildable } from '../src/core/map';
import type { NightSim } from '../src/core/night';
import type { DeviceTypeId, GameState, SectorId } from '../src/core/types';
import { SECTOR_IDS } from '../src/core/types';
import { build } from '../src/core/yard';

/**
 * Call once per tick. Plays like a player who follows the desk: it fires a manual trap when the
 * simulation flags it as worth firing, and leaves the automatic ones alone. `reaction` throttles
 * decisions to mimic a human looking at one camera at a time.
 */
export function operate(sim: NightSim, reaction = 0.15): void {
  if (Math.floor(sim.time / reaction) === Math.floor((sim.time - 1 / 60) / reaction)) return;
  for (const d of sim.devices) {
    if (d.state === 'armed' && isManual(d.type) && sim.opportunity(d.id).now) sim.trigger(d.id);
  }
}

/** Places `type` on the door lane of `sector`, `back` cells out from the door and `side` cells off the lane. */
function place(state: GameState, sector: SectorId, type: DeviceTypeId, back: number, side: number): GameState {
  const lane = LANES[sector];
  const cell = lane[lane.length - 1 - back];
  if (!cell) return state;
  const vertical = sector === 'portail' || sector === 'arriere';
  const x = cell.x + (vertical ? side : 0);
  const y = cell.y + (vertical ? 0 : side);
  if (!isBuildable(x, y)) return state;
  const result = build(state, type, x, y);
  return result.ok ? result.value : state;
}

export type Tier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Reference layouts of increasing investment. Tier 0 is the starting yard; each tier adds roughly
 * one good day of scavenging.
 */
export function layout(base: GameState, tier: Tier): GameState {
  let s: GameState = { ...base, inventory: { wood: 999, scrap: 999, springs: 999, wire: 999, battery: 999 }, hoursLeft: 999 };
  const all = (type: DeviceTypeId, back: number, side: number) => {
    for (const sector of SECTOR_IDS) s = place(s, sector, type, back, side);
  };
  if (tier >= 1) {
    s = place(s, 'portail', 'log', 2, 1);
    s = place(s, 'grange', 'spikes', 3, 0);
    s = place(s, 'arriere', 'spikes', 3, 0);
  }
  if (tier >= 2) {
    s = place(s, 'verger', 'spikes', 3, 0);
    s = place(s, 'grange', 'log', 2, 1);
    s = place(s, 'portail', 'net', 5, 0);
    s = place(s, 'arriere', 'log', 2, 1);
  }
  if (tier >= 3) {
    s = place(s, 'verger', 'log', 2, 1);
    all('spikes', 1, 0);
    s = place(s, 'grange', 'net', 5, 0);
    s = place(s, 'arriere', 'net', 5, 0);
    s = place(s, 'portail', 'barrier', 4, 0);
  }
  if (tier >= 4) {
    s = place(s, 'verger', 'net', 5, 0);
    all('floodlight', 3, -1);
    all('log', 4, -1);
    s = place(s, 'portail', 'horn', 6, 2);
    s = place(s, 'grange', 'barrier', 4, 0);
  }
  if (tier >= 3) {
    const door = { hp: BARRICADE.maxHp[1], level: 1 } as const;
    s = { ...s, yard: { ...s.yard, barricades: { portail: door, grange: door, arriere: door, verger: door } } };
  }
  if (tier >= 5) {
    all('spikes', 5, 1);
    all('net', 3, 1);
    s = place(s, 'arriere', 'barrier', 4, 0);
    s = place(s, 'verger', 'barrier', 4, 0);
    s = place(s, 'grange', 'horn', 6, 2);
  }
  if (tier >= 6) {
    all('log', 6, 1);
    all('spikes', 7, 0);
    all('floodlight', 6, -2);
    s = place(s, 'arriere', 'horn', 6, 2);
    s = place(s, 'verger', 'horn', 6, 2);
  }
  return { ...s, inventory: base.inventory, hoursLeft: base.hoursLeft };
}

export const layoutCost = (state: GameState): Record<string, number> => {
  const total: Record<string, number> = {};
  for (const d of state.yard.devices) for (const [k, v] of Object.entries(DEVICES[d.type].cost)) total[k] = (total[k] ?? 0) + (v ?? 0);
  return total;
};

export const doors = ENTRIES;

// Daytime work on the homestead: build, repair, dismantle. Every operation is a pure
// GameState -> Result<GameState> function, so a rejected action can never half-spend resources.

import { BARRICADE, DEVICES, DISMANTLE_REFUND_FRACTION, HOUSE_MAX_HP, HOUSE_REPAIR, REPAIR_COST_FRACTION, facingsOf, turned } from './data/devices';
import { ENTRIES, idx, isBuildable } from './map';
import { auditRoutes } from './pathing';
import type { Cost, DeviceInstance, DeviceTypeId, Facing, GameState, Inventory, ResourceId, Result, SectorId, YardState } from './types';
import { RESOURCE_IDS, err, ok } from './types';

export type YardError =
  | { readonly code: 'wrong_phase' }
  | { readonly code: 'not_home' }
  | { readonly code: 'no_time'; readonly needed: number }
  | { readonly code: 'cannot_afford'; readonly missing: Cost }
  | { readonly code: 'not_buildable' }
  | { readonly code: 'occupied' }
  | { readonly code: 'seals_routes'; readonly sectors: readonly SectorId[] }
  | { readonly code: 'unknown_device' }
  | { readonly code: 'bad_facing' }
  | { readonly code: 'not_broken' }
  | { readonly code: 'nothing_to_repair' }
  | { readonly code: 'already_reinforced' };

export const missingFor = (inventory: Inventory, cost: Cost): Cost => {
  const missing: Partial<Record<ResourceId, number>> = {};
  for (const id of RESOURCE_IDS) {
    const short = (cost[id] ?? 0) - inventory[id];
    if (short > 0) missing[id] = short;
  }
  return missing;
};

export const canAfford = (inventory: Inventory, cost: Cost): boolean => Object.keys(missingFor(inventory, cost)).length === 0;

/** Spending is the only way inventory goes down; it refuses to go below zero. */
export function spend(inventory: Inventory, cost: Cost): Result<Inventory, YardError> {
  const missing = missingFor(inventory, cost);
  if (Object.keys(missing).length > 0) return err({ code: 'cannot_afford', missing });
  const next = { ...inventory };
  for (const id of RESOURCE_IDS) next[id] -= cost[id] ?? 0;
  return ok(next);
}

export function gain(inventory: Inventory, loot: Cost): Inventory {
  const next = { ...inventory };
  for (const id of RESOURCE_IDS) next[id] += loot[id] ?? 0;
  return next;
}

const scaleCost = (cost: Cost, fraction: number, round: (n: number) => number): Cost => {
  const out: Partial<Record<ResourceId, number>> = {};
  for (const id of RESOURCE_IDS) {
    const amount = round((cost[id] ?? 0) * fraction);
    if (amount > 0) out[id] = amount;
  }
  return out;
};

export const repairCostOf = (type: DeviceTypeId): Cost => scaleCost(DEVICES[type].cost, REPAIR_COST_FRACTION, Math.ceil);
export const refundOf = (device: DeviceInstance): Cost =>
  device.broken ? {} : scaleCost(DEVICES[device.type].cost, DISMANTLE_REFUND_FRACTION, Math.ceil);

export const deviceAt = (yard: YardState, x: number, y: number): DeviceInstance | undefined =>
  yard.devices.find((d) => d.x === x && d.y === y);

/** Cells that stop a walking villager: intact palisades. */
export const fenceCells = (devices: readonly DeviceInstance[]): Set<number> =>
  new Set(devices.filter((d) => DEVICES[d.type].blocks && !d.broken).map((d) => idx(d.x, d.y)));

function guardHome(state: GameState, hours: number): Result<null, YardError> {
  if (state.phase !== 'day') return err({ code: 'wrong_phase' });
  if (state.where !== 'home') return err({ code: 'not_home' });
  if (state.hoursLeft + 1e-9 < hours) return err({ code: 'no_time', needed: hours });
  return ok(null);
}

/** Why a device cannot go on this cell, ignoring cost and time (used for the placement ghost). */
export function placementProblem(yard: YardState, type: DeviceTypeId, x: number, y: number): YardError | null {
  if (!isBuildable(x, y)) return { code: 'not_buildable' };
  if (deviceAt(yard, x, y)) return { code: 'occupied' };
  if (DEVICES[type].blocks) {
    const fences = fenceCells(yard.devices);
    fences.add(idx(x, y));
    const audit = auditRoutes(fences, ENTRIES);
    if (audit.sealed.length > 0) return { code: 'seals_routes', sectors: audit.sealed };
  }
  return null;
}

export function build(state: GameState, type: DeviceTypeId, x: number, y: number, facing: Facing = 0): Result<GameState, YardError> {
  const def = DEVICES[type];
  if (facing >= facingsOf(type)) return err({ code: 'bad_facing' });
  const guard = guardHome(state, def.buildHours);
  if (!guard.ok) return guard;
  const problem = placementProblem(state.yard, type, x, y);
  if (problem) return err(problem);
  const paid = spend(state.inventory, def.cost);
  if (!paid.ok) return paid;

  const device: DeviceInstance = { id: state.yard.nextDeviceId, type, x, y, facing, hp: def.maxHp, broken: false };
  return ok({
    ...state,
    inventory: paid.value,
    hoursLeft: state.hoursLeft - def.buildHours,
    yard: { ...state.yard, devices: [...state.yard.devices, device], nextDeviceId: state.yard.nextDeviceId + 1 },
  });
}

/**
 * Turns a device on its cell: to `facing` when given, otherwise to its next facing.
 * Free: it is the same piece, facing another way.
 */
export function turnDevice(state: GameState, deviceId: number, facing?: Facing): Result<GameState, YardError> {
  const guard = guardHome(state, 0);
  if (!guard.ok) return guard;
  const device = state.yard.devices.find((d) => d.id === deviceId);
  if (!device) return err({ code: 'unknown_device' });
  if (facing !== undefined && facing >= facingsOf(device.type)) return err({ code: 'bad_facing' });
  const next = facing ?? turned(device.type, device.facing);
  return ok({
    ...state,
    yard: { ...state.yard, devices: state.yard.devices.map((d) => (d.id === deviceId ? { ...d, facing: next } : d)) },
  });
}

export function dismantle(state: GameState, deviceId: number): Result<GameState, YardError> {
  const guard = guardHome(state, 0);
  if (!guard.ok) return guard;
  const device = state.yard.devices.find((d) => d.id === deviceId);
  if (!device) return err({ code: 'unknown_device' });
  return ok({
    ...state,
    inventory: gain(state.inventory, refundOf(device)),
    yard: { ...state.yard, devices: state.yard.devices.filter((d) => d.id !== deviceId) },
  });
}

export function repairDevice(state: GameState, deviceId: number): Result<GameState, YardError> {
  const device = state.yard.devices.find((d) => d.id === deviceId);
  if (!device) return err({ code: 'unknown_device' });
  const def = DEVICES[device.type];
  if (!device.broken && device.hp >= def.maxHp) return err({ code: 'not_broken' });
  const hours = def.buildHours / 2;
  const guard = guardHome(state, hours);
  if (!guard.ok) return guard;
  const paid = spend(state.inventory, repairCostOf(device.type));
  if (!paid.ok) return paid;
  return ok({
    ...state,
    inventory: paid.value,
    hoursLeft: state.hoursLeft - hours,
    yard: {
      ...state.yard,
      devices: state.yard.devices.map((d) => (d.id === deviceId ? { ...d, hp: def.maxHp, broken: false } : d)),
    },
  });
}

export const barricadeMaxHp = (level: 0 | 1): number => BARRICADE.maxHp[level];

/** One plank of repair: +25 hp for 1 wood. */
export function repairBarricade(state: GameState, sector: SectorId): Result<GameState, YardError> {
  const barricade = state.yard.barricades[sector];
  const max = barricadeMaxHp(barricade.level);
  if (barricade.hp >= max) return err({ code: 'nothing_to_repair' });
  const guard = guardHome(state, BARRICADE.repairHours);
  if (!guard.ok) return guard;
  const paid = spend(state.inventory, { wood: 1 });
  if (!paid.ok) return paid;
  return ok({
    ...state,
    inventory: paid.value,
    hoursLeft: state.hoursLeft - BARRICADE.repairHours,
    yard: {
      ...state.yard,
      barricades: { ...state.yard.barricades, [sector]: { ...barricade, hp: Math.min(max, barricade.hp + BARRICADE.repairPerWood) } },
    },
  });
}

export function reinforceBarricade(state: GameState, sector: SectorId): Result<GameState, YardError> {
  const barricade = state.yard.barricades[sector];
  if (barricade.level === 1) return err({ code: 'already_reinforced' });
  const guard = guardHome(state, BARRICADE.reinforceHours);
  if (!guard.ok) return guard;
  const paid = spend(state.inventory, BARRICADE.reinforceCost);
  if (!paid.ok) return paid;
  return ok({
    ...state,
    inventory: paid.value,
    hoursLeft: state.hoursLeft - BARRICADE.reinforceHours,
    yard: {
      ...state.yard,
      barricades: { ...state.yard.barricades, [sector]: { level: 1, hp: barricade.hp + (BARRICADE.maxHp[1] - BARRICADE.maxHp[0]) } },
    },
  });
}

export function repairHouse(state: GameState): Result<GameState, YardError> {
  if (state.yard.houseHp >= HOUSE_MAX_HP) return err({ code: 'nothing_to_repair' });
  const guard = guardHome(state, HOUSE_REPAIR.hours);
  if (!guard.ok) return guard;
  const paid = spend(state.inventory, HOUSE_REPAIR.cost);
  if (!paid.ok) return paid;
  return ok({
    ...state,
    inventory: paid.value,
    hoursLeft: state.hoursLeft - HOUSE_REPAIR.hours,
    yard: { ...state.yard, houseHp: Math.min(HOUSE_MAX_HP, state.yard.houseHp + HOUSE_REPAIR.amount) },
  });
}

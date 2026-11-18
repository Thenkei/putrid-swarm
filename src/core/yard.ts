// Daytime work on the homestead: build, repair, dismantle. Every operation is a pure
// GameState -> Result<GameState> function, so a rejected action can never half-spend resources.

import { BARRICADE, DEVICES, DISMANTLE_REFUND_FRACTION, HOUSE_MAX_HP, HOUSE_REPAIR, REPAIR_COST_FRACTION, facingsOf, isTrap, turned } from './data/devices';
import { DAY_HOURS } from './data/locations';
import { ENTRIES, idx, isBuildable } from './map';
import { auditRoutes } from './pathing';
import type { Cost, DeviceInstance, DeviceTypeId, Facing, GameState, Inventory, ResourceId, Result, SectorId, TrapTally, YardState } from './types';
import { DEVICE_TYPE_IDS, RESOURCE_IDS, err, ok } from './types';

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
  | { readonly code: 'nothing_to_undo' }
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

/** What a stock plus a load still to unload would let the player set up in the daylight left, in build-menu order. */
export function affordableDevices(stock: Inventory, load: Cost, hoursLeft: number): DeviceTypeId[] {
  const total = gain(stock, load);
  return DEVICE_TYPE_IDS.filter((type) => canAfford(total, DEVICES[type].cost) && hoursLeft + 1e-9 >= DEVICES[type].buildHours);
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

/**
 * Laid today and not yet through a night: the piece can be taken back whole, materials and daylight,
 * so a misplaced trap costs nothing but the click. A night makes it part of the yard for good.
 */
export const isFresh = (device: DeviceInstance, day: number): boolean => device.builtDay === day && !device.broken && device.hp >= DEVICES[device.type].maxHp;

/** What dismantling gives back: everything for a piece laid today (pass `day`), otherwise a fraction; nothing for a wreck. */
export const refundOf = (device: DeviceInstance, day?: number): Cost =>
  device.broken ? {} : day !== undefined && isFresh(device, day) ? DEVICES[device.type].cost : scaleCost(DEVICES[device.type].cost, DISMANTLE_REFUND_FRACTION, Math.ceil);

export const daylightRefund = (device: DeviceInstance, state: GameState): number =>
  isFresh(device, state.day) ? Math.max(0, Math.min(DAY_HOURS - state.hoursLeft, DEVICES[device.type].buildHours)) : 0;

/** How many of a device the stock and the daylight left would pay for. */
export function affordableCount(inventory: Inventory, type: DeviceTypeId, hoursLeft: number): number {
  const def = DEVICES[type];
  let count = def.buildHours > 0 ? Math.floor((hoursLeft + 1e-9) / def.buildHours) : Infinity;
  for (const id of RESOURCE_IDS) {
    const each = def.cost[id] ?? 0;
    if (each > 0) count = Math.min(count, Math.floor(inventory[id] / each));
  }
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

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

  const device: DeviceInstance = { id: state.yard.nextDeviceId, type, x, y, facing, hp: def.maxHp, broken: false, builtDay: state.day };
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
  // A piece laid today comes back whole, and so does the time it took.
  return ok({
    ...state,
    inventory: gain(state.inventory, refundOf(device, state.day)),
    // Never more daylight than a day holds, and never less than there was.
    hoursLeft: state.hoursLeft + daylightRefund(device, state),
    yard: { ...state.yard, devices: state.yard.devices.filter((d) => d.id !== deviceId) },
  });
}

/** The last piece laid today that can still be taken back whole, if there is one. */
export const lastFresh = (state: Pick<GameState, 'yard' | 'day'>): DeviceInstance | undefined =>
  state.yard.devices.reduce<DeviceInstance | undefined>((last, d) => (isFresh(d, state.day) && (!last || d.id > last.id) ? d : last), undefined);

/** Takes back the last piece laid today: the same as dismantling it, which costs nothing while it is fresh. */
export function undoLastBuild(state: GameState): Result<{ readonly state: GameState; readonly device: DeviceInstance }, YardError> {
  const device = lastFresh(state);
  if (!device) return err({ code: 'nothing_to_undo' });
  const undone = dismantle(state, device.id);
  return undone.ok ? ok({ state: undone.value, device }) : undone;
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

/** Broken devices, in the order they were laid. */
export const brokenDevices = (yard: YardState): DeviceInstance[] => yard.devices.filter((d) => d.broken);

/** What putting every broken device back on its feet would take, whether or not the stock and the day allow it. */
export function repairAllCost(yard: YardState): { readonly cost: Cost; readonly hours: number; readonly count: number } {
  const total: Partial<Record<ResourceId, number>> = {};
  let hours = 0;
  const broken = brokenDevices(yard);
  for (const device of broken) {
    const cost = repairCostOf(device.type);
    for (const id of RESOURCE_IDS) if (cost[id]) total[id] = (total[id] ?? 0) + (cost[id] ?? 0);
    hours += DEVICES[device.type].buildHours / 2;
  }
  return { cost: total, hours, count: broken.length };
}

export interface RepairAll {
  readonly state: GameState;
  readonly repaired: number;
  /** Still broken afterwards: the stock or the daylight ran out. */
  readonly left: number;
}

/**
 * Repairs every broken device the stock and the daylight allow, oldest first. One it cannot pay for is
 * passed over, not the end of the round: a cheaper one further on may still fit. Refused only when
 * nothing is broken or nothing at all could be repaired, with the reason the first one was not.
 */
export function repairAll(state: GameState): Result<RepairAll, YardError> {
  const broken = brokenDevices(state.yard);
  if (broken.length === 0) return err({ code: 'nothing_to_repair' });
  let next = state;
  let repaired = 0;
  let firstError: YardError | null = null;
  for (const device of broken) {
    const result = repairDevice(next, device.id);
    if (result.ok) {
      next = result.value;
      repaired++;
    } else firstError ??= result.error;
  }
  if (repaired === 0) return err(firstError ?? { code: 'nothing_to_repair' });
  return ok({ state: next, repaired, left: broken.length - repaired });
}

// ───────────────────────────── What last night says about the yard ─────────────────────────────

/** What a trap standing in the yard did last night; undefined for one that was not there (laid since, or a palisade). */
export const tallyOf = (state: Pick<GameState, 'lastNight'>, device: DeviceInstance): TrapTally | undefined =>
  state.lastNight && isTrap(device.type) ? state.lastNight.traps[device.id] : undefined;

/** A working trap that stood there all of last night and never went off: nobody walked into it. */
export const wasSilent = (state: Pick<GameState, 'lastNight'>, device: DeviceInstance): boolean => !device.broken && tallyOf(state, device)?.fired === 0;

/** The working traps of the yard that never went off last night. */
export const silentTraps = (state: Pick<GameState, 'lastNight' | 'yard'>): DeviceInstance[] => state.yard.devices.filter((d) => wasSilent(state, d));

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

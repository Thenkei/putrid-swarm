import { describe, expect, it } from 'vitest';
import { COMBAT, DEVICES } from '../src/core/data/devices';
import { LOCATIONS } from '../src/core/data/locations';
import { NIGHTS } from '../src/core/data/waves';
import { arriveHome, concludeNight, leaveLocation, newGame, planVisit, prepareSearch, retryChapter, searchSpot, startNextDay, startNight, travelTo } from '../src/core/game';
import { ENTRIES, SPAWN_CELLS, idx, isBuildable } from '../src/core/map';
import { NightSim, type Enemy } from '../src/core/night';
import { auditRoutes, computeField } from '../src/core/pathing';
import { deserialize, serialize } from '../src/core/save';
import type { GameState } from '../src/core/types';
import { RESOURCE_IDS, SECTOR_IDS } from '../src/core/types';
import { affordableCount, build, dismantle, fenceCells, isFresh, lastFresh, placementProblem, refundOf, repairAll, repairAllCost, repairBarricade, repairDevice, silentTraps, tallyOf, turnDevice, undoLastBuild, wasSilent } from '../src/core/yard';
import { layout, operate, operateDesk } from './operator';

const rich = (state: GameState): GameState => ({ ...state, inventory: { wood: 99, scrap: 99, springs: 99, wire: 99, battery: 99 }, hoursLeft: 999 });
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
};
const run = (sim: NightSim, seconds: number, onTick?: (sim: NightSim) => void): void => {
  for (let t = 0; t < seconds * 60 && sim.outcome === 'ongoing'; t++) {
    onTick?.(sim);
    sim.step(1 / 60);
  }
};

describe('economy', () => {
  it('spends exactly the build cost and the build time', () => {
    const state = newGame(1);
    const next = unwrap(build(state, 'log', 6, 15));
    expect(next.inventory.wood).toBe(state.inventory.wood - 3);
    expect(next.inventory.wire).toBe(state.inventory.wire - 1);
    expect(next.inventory.scrap).toBe(state.inventory.scrap - 1);
    expect(next.hoursLeft).toBe(state.hoursLeft - DEVICES.log.buildHours);
    expect(next.yard.devices).toHaveLength(state.yard.devices.length + 1);
  });

  it('refuses to build what cannot be paid for and leaves the state untouched', () => {
    const state: GameState = { ...newGame(1), inventory: { wood: 1, scrap: 0, springs: 0, wire: 0, battery: 0 } };
    const result = build(state, 'horn', 6, 15);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ code: 'cannot_afford', missing: { battery: 1, scrap: 2 } });
    for (const id of RESOURCE_IDS) expect(state.inventory[id]).toBeGreaterThanOrEqual(0);
  });

  it('refuses to build without daylight left', () => {
    const state = { ...rich(newGame(1)), hoursLeft: 0.1 };
    const result = build(state, 'log', 6, 15);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('no_time');
  });

  it('refunds half (rounded up) when dismantling a piece that has been through a night, and charges half to repair', () => {
    let state = rich(newGame(1));
    state = unwrap(build(state, 'log', 6, 15));
    const device = state.yard.devices.at(-1)!;
    const before = state.inventory.wood;
    // The next day it is part of the yard: half comes back, and no daylight.
    const later: GameState = { ...state, day: state.day + 1 };
    const dismantled = unwrap(dismantle(later, device.id));
    expect(dismantled.inventory.wood).toBe(before + 2);
    expect(dismantled.hoursLeft).toBe(later.hoursLeft);

    const broken: GameState = { ...state, yard: { ...state.yard, devices: state.yard.devices.map((d) => (d.id === device.id ? { ...d, broken: true, hp: 0 } : d)) } };
    const repaired = unwrap(repairDevice(broken, device.id));
    expect(repaired.inventory.wood).toBe(before - 2);
    expect(repaired.yard.devices.find((d) => d.id === device.id)).toMatchObject({ broken: false, hp: DEVICES.log.maxHp });
  });

  it('repairs a barricade one plank at a time and never above its maximum', () => {
    const base = rich(newGame(1));
    const damaged: GameState = { ...base, yard: { ...base.yard, barricades: { ...base.yard.barricades, portail: { hp: 90, level: 0 } } } };
    const once = unwrap(repairBarricade(damaged, 'portail'));
    expect(once.yard.barricades.portail.hp).toBe(130);
    expect(once.inventory.wood).toBe(damaged.inventory.wood - 1);
    const twice = unwrap(repairBarricade(once, 'portail'));
    expect(twice.yard.barricades.portail.hp).toBe(160);
    expect(repairBarricade(twice, 'portail').ok).toBe(false);
  });
});

describe('taking back what was laid today', () => {
  it('gives a piece laid today back whole: every material and the daylight it took', () => {
    const start = newGame(1);
    const built = unwrap(build(start, 'log', 6, 15));
    const device = built.yard.devices.at(-1)!;
    expect(isFresh(device, built.day)).toBe(true);
    expect(refundOf(device, built.day)).toEqual(DEVICES.log.cost);
    const back = unwrap(dismantle(built, device.id));
    expect(back.inventory).toEqual(start.inventory);
    expect(back.hoursLeft).toBeCloseTo(start.hoursLeft, 9);
    expect(back.yard.devices).toEqual(start.yard.devices);
  });

  it('undoes the pieces of the day one by one, the last first, and nothing older', () => {
    const start = newGame(1);
    let state = unwrap(build(start, 'fence', 5, 18));
    state = unwrap(build(state, 'fence', 6, 18));
    state = unwrap(build(state, 'spikes', 6, 15));
    expect(lastFresh(state)?.type).toBe('spikes');
    const order: string[] = [];
    for (;;) {
      const undone = undoLastBuild(state);
      if (!undone.ok) {
        expect(undone.error.code).toBe('nothing_to_undo');
        break;
      }
      order.push(`${undone.value.device.type}@${undone.value.device.x}`);
      state = undone.value.state;
    }
    expect(order).toEqual(['spikes@6', 'fence@6', 'fence@5']);
    // The yard the run started with was never "laid today": it stays.
    expect(state.yard.devices).toEqual(start.yard.devices);
    expect(state.inventory).toEqual(start.inventory);
    expect(state.hoursLeft).toBeCloseTo(start.hoursLeft, 9);
  });

  it('is over once the piece has been through a night, was damaged, or broke', () => {
    const built = unwrap(build(newGame(1), 'log', 6, 15));
    const device = built.yard.devices.at(-1)!;
    expect(isFresh(device, built.day + 1)).toBe(false);
    expect(isFresh({ ...device, hp: device.hp - 1 }, built.day)).toBe(false);
    expect(isFresh({ ...device, broken: true, hp: 0 }, built.day)).toBe(false);
    // The night itself forgets the day: what it hands back is the yard, not today's work.
    const sim = new NightSim(1, built.yard, 7);
    expect(sim.toYard(built.yard).devices.every((d) => d.builtDay === undefined)).toBe(true);
  });

  it('never gives back more daylight than a day holds, and keeps the day it was laid through a save', () => {
    const built = unwrap(build(newGame(1), 'log', 6, 15));
    const device = built.yard.devices.at(-1)!;
    const loaded = deserialize(serialize(built));
    expect(loaded?.yard.devices.at(-1)?.builtDay).toBe(1);
    const forged = deserialize(serialize({ ...built, yard: { ...built.yard, devices: built.yard.devices.map((d) => ({ ...d, builtDay: 'today' })) } } as unknown as GameState));
    expect(forged?.yard.devices.every((d) => d.builtDay === undefined)).toBe(true);
    const back = unwrap(dismantle({ ...built, hoursLeft: 12 }, device.id));
    expect(back.hoursLeft).toBe(12);
  });

  it('says how many of a device the stock and the daylight pay for', () => {
    const state = newGame(1);
    expect(affordableCount(state.inventory, 'fence', state.hoursLeft)).toBe(state.inventory.wood);
    expect(affordableCount(state.inventory, 'log', state.hoursLeft)).toBe(Math.min(Math.floor(state.inventory.wood / 3), state.inventory.wire, state.inventory.scrap));
    expect(affordableCount(state.inventory, 'log', 1)).toBe(1);
    expect(affordableCount({ ...state.inventory, battery: 0 }, 'horn', state.hoursLeft)).toBe(0);
    expect(affordableCount(rich(state).inventory, 'spikes', 0.4)).toBe(0);
  });
});

describe('repairing everything the night broke', () => {
  const wreck = (state: GameState, ids: readonly number[]): GameState => ({
    ...state,
    yard: { ...state.yard, devices: state.yard.devices.map((d) => (ids.includes(d.id) ? { ...d, broken: true, hp: 0 } : d)) },
  });

  it('repairs every broken device for exactly what each repair costs', () => {
    const base = rich(newGame(1));
    const broken = wreck(base, base.yard.devices.filter((d) => d.type !== 'fence').map((d) => d.id));
    const bill = repairAllCost(broken.yard);
    expect(bill.count).toBe(3);
    const result = unwrap(repairAll(broken));
    expect(result).toMatchObject({ repaired: 3, left: 0 });
    expect(result.state.yard.devices.some((d) => d.broken)).toBe(false);
    for (const id of RESOURCE_IDS) expect(result.state.inventory[id]).toBe(broken.inventory[id] - (bill.cost[id] ?? 0));
    expect(result.state.hoursLeft).toBeCloseTo(broken.hoursLeft - bill.hours, 9);
  });

  it('passes over what the stock cannot pay for and still repairs the cheaper ones further on', () => {
    const base = newGame(1);
    const log = base.yard.devices.find((d) => d.type === 'log')!;
    const spikes = base.yard.devices.filter((d) => d.type === 'spikes');
    // Scrap for the stakes only: the log (wood, wire, scrap) comes first in the yard and cannot be paid.
    const broken = wreck({ ...base, inventory: { wood: 0, scrap: 2, springs: 2, wire: 0, battery: 0 } }, [log.id, ...spikes.map((d) => d.id)]);
    const result = unwrap(repairAll(broken));
    expect(result).toMatchObject({ repaired: 2, left: 1 });
    expect(result.state.yard.devices.find((d) => d.id === log.id)?.broken).toBe(true);
    for (const id of RESOURCE_IDS) expect(result.state.inventory[id]).toBeGreaterThanOrEqual(0);
  });

  it('is refused with the reason when nothing is broken, or nothing can be paid for', () => {
    const base = newGame(1);
    expect(repairAll(base)).toMatchObject({ ok: false, error: { code: 'nothing_to_repair' } });
    const log = base.yard.devices.find((d) => d.type === 'log')!;
    expect(repairAll(wreck({ ...base, inventory: { wood: 0, scrap: 0, springs: 0, wire: 0, battery: 0 } }, [log.id]))).toMatchObject({ ok: false, error: { code: 'cannot_afford' } });
    expect(repairAll(wreck({ ...rich(base), hoursLeft: 0 }, [log.id]))).toMatchObject({ ok: false, error: { code: 'no_time' } });
  });
});

describe('what each trap did last night', () => {
  it('tallies every trap of the yard, fired or not, and the tallies add up to the report', () => {
    const state = layout(newGame(3), 3);
    const sim = new NightSim(3, state.yard, 11);
    run(sim, 600, (s) => operate(s));
    const report = sim.report();
    const traps = state.yard.devices.filter((d) => d.type !== 'fence');
    expect(Object.keys(report.traps).map(Number).sort((a, b) => a - b)).toEqual(traps.map((d) => d.id).sort((a, b) => a - b));
    const fired = Object.values(report.traps).reduce((sum, t) => sum + t.fired, 0);
    expect(fired).toBe(report.triggers + report.autoTriggers);
    expect(fired).toBeGreaterThan(0);
    const kills = Object.values(report.kills).reduce((sum, n) => sum + (n ?? 0), 0);
    // Every kill is a trap's: nothing else hurts them.
    expect(Object.values(report.traps).reduce((sum, t) => sum + t.kills, 0)).toBe(kills);
  });

  it('marks a working trap nobody walked into as silent, and never one laid since or broken', () => {
    // Stakes in a far corner of the lot, off every route.
    let state = rich(newGame(1));
    state = unwrap(build(state, 'spikes', 3, 3));
    const lonely = state.yard.devices.at(-1)!;
    state = unwrap(startNight(state));
    const sim = new NightSim(1, state.yard, 5);
    run(sim, 600, (s) => operate(s));
    const morning = concludeNight(state, sim);
    expect(morning.phase).toBe('morning');
    const after = morning.yard.devices.find((d) => d.id === lonely.id)!;
    expect(tallyOf(morning, after)).toEqual({ fired: 0, hits: 0, kills: 0 });
    expect(wasSilent(morning, after)).toBe(true);
    expect(silentTraps(morning).map((d) => d.id)).toContain(lonely.id);
    // The gate's own stakes went off: not silent.
    const gate = morning.yard.devices.find((d) => d.type === 'spikes' && d.x === 10 && d.y === 16)!;
    expect(tallyOf(morning, gate)?.fired).toBeGreaterThan(0);
    expect(wasSilent(morning, gate)).toBe(false);

    const day = rich(startNextDay(morning));
    const laid = unwrap(build(day, 'spikes', 4, 4)).yard.devices.at(-1)!;
    expect(tallyOf(day, laid)).toBeUndefined();
    expect(wasSilent(day, laid)).toBe(false);
    expect(wasSilent(day, { ...after, broken: true })).toBe(false);
    // Palisades are not traps: they have no tally to be silent about.
    expect(silentTraps(day).every((d) => d.type !== 'fence')).toBe(true);
  });

  it('counts what stood at a barrier when it went up', () => {
    const state = layout(newGame(3), 4);
    const barrier = state.yard.devices.find((d) => d.type === 'barrier');
    expect(barrier).toBeDefined();
    const sim = new NightSim(3, state.yard, 11);
    run(sim, 600, (s) => operate(s));
    const tally = sim.report().traps[barrier!.id]!;
    if (tally.fired > 0) expect(tally.hits).toBeGreaterThanOrEqual(tally.fired);
    expect(tally.kills).toBe(0);
  });

  it('loads a report saved before traps were tallied as one with none, and drops a malformed tally', () => {
    const state = layout(newGame(3), 3);
    const night = unwrap(startNight(state));
    const sim = new NightSim(1, night.yard, 5);
    run(sim, 600, (s) => operate(s));
    const morning = concludeNight(night, sim);
    const { traps: _traps, ...old } = morning.lastNight!;
    expect(deserialize(JSON.stringify({ ...morning, lastNight: old }))?.lastNight?.traps).toEqual({});
    const id = Number(Object.keys(morning.lastNight!.traps)[0]);
    const forged = { ...morning, lastNight: { ...morning.lastNight, traps: { [id]: { fired: -1, hits: 0, kills: 0 }, nope: 3 } } };
    expect(deserialize(JSON.stringify(forged))?.lastNight?.traps).toEqual({});
    expect(deserialize(serialize(morning))?.lastNight?.traps).toEqual(morning.lastNight!.traps);
  });
});

describe('placement', () => {
  it('rejects walls, scenery, doorsteps, the tree line and occupied cells', () => {
    const state = rich(newGame(1));
    expect(placementProblem(state.yard, 'spikes', 10, 10)?.code).toBe('not_buildable'); // house
    expect(placementProblem(state.yard, 'spikes', 15, 13)?.code).toBe('not_buildable'); // the break
    expect(placementProblem(state.yard, 'spikes', ENTRIES.portail.x, ENTRIES.portail.y)?.code).toBe('not_buildable');
    expect(placementProblem(state.yard, 'spikes', 1, 10)?.code).toBe('not_buildable');
    expect(placementProblem(state.yard, 'spikes', 10, 16)?.code).toBe('occupied');
    expect(isBuildable(6, 15)).toBe(true);
  });

  it('refuses the palisade that would seal a stretch of tree line off from every door', () => {
    let state = rich(newGame(1));
    // Wall the lot off from the gate side: a full row, leaving one gap.
    for (let x = 2; x <= 19; x++) {
      if (x === 5) continue;
      if (state.yard.devices.some((d) => d.x === x && d.y === 18)) continue;
      state = unwrap(build(state, 'fence', x, 18));
    }
    // Side walls so the only way in from the gate is that gap.
    for (let y = 13; y <= 19; y++) {
      for (const x of [2, 19]) if (!state.yard.devices.some((d) => d.x === x && d.y === y) && y !== 18) state = unwrap(build(state, 'fence', x, y));
    }
    const audit = auditRoutes(fenceCells(state.yard.devices), ENTRIES);
    expect(audit.sealed).toEqual([]);
    // Still open elsewhere around the lot, so closing the gap is legal: routes go around.
    expect(placementProblem(state.yard, 'fence', 5, 18)).toBeNull();
  });

  it('detects a fully sealed sector', () => {
    const fences = new Set<number>();
    for (let x = 0; x < 22; x++) fences.add(idx(x, 19));
    for (let y = 2; y < 19; y++) {
      fences.add(idx(1, y));
      fences.add(idx(20, y));
    }
    for (let x = 1; x <= 20; x++) fences.add(idx(x, 2));
    const audit = auditRoutes(fences, ENTRIES);
    expect(audit.sealed).toEqual(expect.arrayContaining(['portail']));
  });
});

describe('turning a device', () => {
  it('builds a device the way it is held and keeps that through a night', () => {
    const state = unwrap(build(rich(newGame(1)), 'log', 6, 15, 1));
    const placed = state.yard.devices.at(-1);
    expect(placed?.facing).toBe(1);
    const sim = new NightSim(1, state.yard, 7);
    expect(sim.toYard(state.yard).devices.find((d) => d.id === placed?.id)?.facing).toBe(1);
  });

  it('turns a trap between two sides and a palisade through four, for free', () => {
    const start = rich(newGame(1));
    const withLog = unwrap(build(start, 'log', 6, 15));
    const log = withLog.yard.devices.at(-1)?.id as number;
    const once = unwrap(turnDevice(withLog, log));
    const twice = unwrap(turnDevice(once, log));
    expect([once, twice].map((s) => s.yard.devices.find((d) => d.id === log)?.facing)).toEqual([1, 0]);
    expect(twice.inventory).toEqual(withLog.inventory);
    expect(twice.hoursLeft).toBe(withLog.hoursLeft);

    let state = unwrap(build(start, 'fence', 6, 15));
    const fence = state.yard.devices.at(-1)?.id as number;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      state = unwrap(turnDevice(state, fence));
      seen.push(state.yard.devices.find((d) => d.id === fence)?.facing as number);
    }
    expect(seen).toEqual([1, 2, 3, 0]);
  });

  it('refuses a diagonal facing for anything but a palisade', () => {
    const state = rich(newGame(1));
    expect(build(state, 'log', 6, 15, 2)).toMatchObject({ ok: false, error: { code: 'bad_facing' } });
    expect(build(state, 'fence', 6, 15, 3).ok).toBe(true);
    const withLog = unwrap(build(state, 'log', 6, 15));
    expect(turnDevice(withLog, withLog.yard.devices.at(-1)?.id as number, 3)).toMatchObject({ ok: false, error: { code: 'bad_facing' } });
  });

  it('a palisade blocks its cell whichever way it faces, and a diagonal run lets nobody between two of them', () => {
    const state = rich(newGame(1));
    for (const facing of [0, 1, 2, 3] as const) {
      const built = unwrap(build(state, 'fence', 6, 15, facing));
      expect(fenceCells(built.yard.devices).has(idx(6, 15))).toBe(true);
    }
    // A cell walled in on every side but one corner, where two palisades meet corner to corner:
    // if the infected could slip between those two, the cell would be reachable.
    const ring = [
      [7, 14],
      [8, 14],
      [6, 15],
      [8, 15],
      [6, 16],
      [7, 16],
      [8, 16],
    ] as const;
    const walls = new Set(ring.map(([x, y]) => idx(x, y)));
    const field = computeField(ENTRIES.portail, { blocked: walls });
    expect(Number.isFinite(field[idx(6, 14)] as number)).toBe(true);
    expect(field[idx(7, 15)]).toBe(Infinity);
  });

  it('gives a facing to devices saved before they could be turned', () => {
    const state = unwrap(build(unwrap(build(rich(newGame(1)), 'fence', 3, 15)), 'fence', 3, 16));
    const legacy = JSON.parse(serialize(state)) as { yard: { devices: Record<string, unknown>[] } };
    for (const device of legacy.yard.devices) delete device['facing'];
    const loaded = deserialize(JSON.stringify(legacy));
    const facingAt = (x: number, y: number): number | undefined => loaded?.yard.devices.find((d) => d.x === x && d.y === y)?.facing;
    // A run along y used to be drawn turned; the starting wall runs along x.
    expect([facingAt(3, 15), facingAt(3, 16)]).toEqual([1, 1]);
    expect(facingAt(6, 16)).toBe(0);
    expect(loaded?.yard.devices.every((d) => d.facing === 0 || d.facing === 1)).toBe(true);
  });
});

describe('night simulation', () => {
  it.each([true, false])('keeps a real event in the morning save (desk operated: %s)', (active) => {
    const state = unwrap(startNight(newGame(11)));
    const sim = new NightSim(1, state.yard, 11);
    run(sim, 900, active ? operateDesk : undefined);
    const events = sim.drainEvents();
    const morning = deserialize(serialize(concludeNight(state, sim)));
    expect(morning?.phase).toBe('morning');
    if (active) {
      const shots = events.filter((event) => event.type === 'trigger').sort((a, b) => b.kills - a.kills);
      expect(shots[0]?.kills).toBeGreaterThan(0);
      expect(morning?.lastNight?.highlight).toEqual({ kind: 'catch', deviceId: shots[0]?.deviceId, kills: shots[0]?.kills });
    } else {
      const breach = events.find((event) => event.type === 'breach');
      expect(breach).toBeDefined();
      expect(morning?.lastNight?.highlight).toEqual({ kind: 'breach', sector: breach?.sector });
    }
  });

  // A door given way outranks a device lost, which outranks the best catch; within a kind the first
  // door, the first device and the biggest catch are the ones kept. `seen` is the order of events
  // that makes each night a test of that rule, so a rebalance that changes the night fails here by name.
  it.each([
    { why: 'nothing was lost', night: 1, tier: 0, kind: 'catch', seen: ['catch'], never: ['door', 'device'] },
    { why: 'a device was lost between two catches', night: 1, tier: 3, kind: 'broken', seen: ['catch', 'device', 'catch'], never: ['door'] },
    { why: 'a device was lost, then a door', night: 2, tier: 2, kind: 'breach', seen: ['catch', 'device', 'door'], never: [] },
    { why: 'two doors were lost, then a device', night: 2, tier: 0, kind: 'breach', seen: ['door', 'door', 'device'], never: [] },
  ] as const)('remembers a night for its $kind when $why', ({ night, tier, kind, seen, never }) => {
    const sim = new NightSim(night, layout(newGame(11), tier).yard, 11);
    run(sim, 900, operate);
    const events = sim.drainEvents();
    const order = events.flatMap((event) => (event.type === 'breach' ? ['door'] : event.type === 'device_broken' ? ['device'] : event.type === 'trigger' && event.kills > 0 ? ['catch'] : []));
    let matched = 0;
    for (const what of order) if (what === seen[matched]) matched++;
    expect(matched).toBe(seen.length);
    for (const what of never) expect(order).not.toContain(what);

    const door = events.find((event) => event.type === 'breach');
    const lost = events.find((event) => event.type === 'device_broken');
    const best = events.filter((event) => event.type === 'trigger').sort((a, b) => b.kills - a.kills)[0];
    const expected = door ? { kind: 'breach', sector: door.sector } : lost ? { kind: 'broken', deviceId: lost.deviceId } : { kind: 'catch', deviceId: best?.deviceId, kills: best?.kills };
    expect(expected.kind).toBe(kind);
    expect(sim.report().highlight).toEqual(expected);
  });

  it('loads every kind of highlight, and loads the morning without one it cannot read', () => {
    const state = unwrap(startNight(newGame(11)));
    const sim = new NightSim(1, state.yard, 11);
    run(sim, 900, operateDesk);
    const saved = JSON.parse(serialize(concludeNight(state, sim))) as { lastNight: Record<string, unknown> };
    const load = (highlight: unknown): GameState | null => deserialize(JSON.stringify({ ...saved, lastNight: { ...saved.lastNight, highlight } }));

    for (const sound of [{ kind: 'breach', sector: 'verger' }, { kind: 'broken', deviceId: 3 }, { kind: 'catch', deviceId: 3, kills: 2 }]) {
      expect(load(sound)?.lastNight?.highlight).toEqual(sound);
    }
    const unreadable = [
      'breach',
      null,
      { kind: 'breach', sector: 'cellar' },
      { kind: 'breach' },
      { kind: 'broken' },
      { kind: 'broken', deviceId: -1 },
      { kind: 'catch', deviceId: 3 },
      { kind: 'catch', deviceId: 3, kills: 0 },
      { kind: 'catch', deviceId: 3, kills: 1.5 },
      { kind: 'missed', deviceId: 3 },
    ];
    for (const highlight of unreadable) {
      const loaded = load(highlight);
      expect(loaded?.phase).toBe('morning');
      expect(loaded?.lastNight).toMatchObject({ night: 1, survived: true });
      expect(loaded?.lastNight).not.toHaveProperty('highlight');
    }
  });

  it('reports who fell, where, and which way they were facing', () => {
    const sim = new NightSim(1, layout(newGame(42), 2).yard, 42);
    const dead: { id: number; fx: number; fy: number }[] = [];
    run(sim, 200, (s) => {
      operate(s);
      for (const event of s.drainEvents()) if (event.type === 'enemy_dead') dead.push(event);
    });
    expect(dead.length).toBeGreaterThan(0);
    expect(new Set(dead.map((d) => d.id)).size).toBe(dead.length);
    expect(dead.every((d) => Number.isFinite(d.fx) && Number.isFinite(d.fy))).toBe(true);
  });

  it('is deterministic for a given seed and never depends on a camera', () => {
    const a = new NightSim(3, newGame(7).yard, 7);
    const b = new NightSim(3, newGame(7).yard, 7);
    run(a, 60);
    run(b, 60);
    expect(a.enemies.map((e) => [e.type, e.x.toFixed(4), e.y.toFixed(4), e.hp])).toEqual(b.enemies.map((e) => [e.type, e.x.toFixed(4), e.y.toFixed(4), e.hp]));
    expect(a.houseHp).toBe(b.houseHp);
  });

  it('fires a trap once per arming: repeated input is denied and spends nothing more', () => {
    let state = rich(newGame(1));
    state = unwrap(build(state, 'horn', 6, 15));
    const horn = state.yard.devices.at(-1)!;
    const sim = new NightSim(1, state.yard, 1);
    sim.step(1 / 60);

    expect(sim.trigger(horn.id).ok).toBe(true);
    const energyAfterFirst = sim.energy;
    expect(energyAfterFirst).toBe(100 - DEVICES.horn.energy);
    for (let i = 0; i < 10; i++) expect(sim.trigger(horn.id).ok).toBe(false);
    expect(sim.energy).toBe(energyAfterFirst);

    const events = sim.drainEvents();
    expect(events.filter((e) => e.type === 'trigger')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'trigger_denied')).toHaveLength(10);

    // It comes back after effect + re-arm, and only then.
    run(sim, DEVICES.horn.activeSeconds + DEVICES.horn.rearmSeconds - 0.5);
    expect(sim.device(horn.id)?.state).toBe('rearming');
    run(sim, 1);
    expect(sim.device(horn.id)?.state).toBe('armed');
    expect(sim.trigger(horn.id).ok).toBe(true);
  });

  it('refuses electric traps when the battery is flat', () => {
    let state = rich(newGame(1));
    state = unwrap(build(state, 'floodlight', 6, 15));
    const light = state.yard.devices.at(-1)!;
    const sim = new NightSim(1, state.yard, 1);
    sim.energy = DEVICES.floodlight.energy - 1;
    const result = sim.trigger(light.id);
    expect(result).toEqual({ ok: false, error: 'no_energy' });
    expect(sim.device(light.id)?.state).toBe('armed');
  });

  it('applies damage exactly once per trigger', () => {
    const state = newGame(1);
    const log = state.yard.devices.find((d) => d.type === 'log')!;
    const sim = new NightSim(1, state.yard, 1);
    let fired = false;
    run(sim, 90, (s) => {
      const victim = s.enemies.find((e) => Math.hypot(e.x - (log.x + 0.5), e.y - (log.y + 0.5)) < 1.2);
      if (victim && !fired) {
        const before = victim.hp;
        expect(s.trigger(log.id).ok).toBe(true);
        expect(s.trigger(log.id).ok).toBe(false);
        expect(victim.hp).toBe(Math.max(0, before - DEVICES.log.damage));
        fired = true;
      }
    });
    expect(fired).toBe(true);
  });

  it('automatic traps fire by themselves, once per arming, and refuse the desk', () => {
    const state = newGame(1);
    const spikes = state.yard.devices.find((d) => d.type === 'spikes')!;
    const sim = new NightSim(1, state.yard, 1);
    expect(sim.trigger(spikes.id)).toEqual({ ok: false, error: 'automatic' });
    expect(sim.device(spikes.id)?.state).toBe('armed');

    const autoFires: number[] = [];
    run(sim, 60, (s) => {
      for (const event of s.drainEvents()) if (event.type === 'trigger' && event.deviceId === spikes.id && event.auto) autoFires.push(s.time);
    });
    expect(autoFires.length).toBeGreaterThan(0);
    // Never faster than its own cycle: one effect per arming.
    const cycle = DEVICES.spikes.activeSeconds + DEVICES.spikes.rearmSeconds;
    for (let i = 1; i < autoFires.length; i++) expect(autoFires[i]! - autoFires[i - 1]!).toBeGreaterThanOrEqual(cycle - 0.05);
    expect(sim.report().autoTriggers).toBe(autoFires.length);
    expect(sim.report().triggers).toBe(0);
  });

  it('flags a manual trap only when what stands under it is worth it', () => {
    const state = newGame(1);
    const log = state.yard.devices.find((d) => d.type === 'log')!;
    const sim = new NightSim(1, state.yard, 1);
    expect(sim.opportunity(log.id)).toEqual({ targets: 0, now: false });
    let cued = false;
    run(sim, 120, (s) => {
      const opportunity = s.opportunity(log.id);
      const under = s.enemies.filter((e) => {
        const beneath = e.crawlLog?.id === log.id && e.crawlDepth === 1 && !e.nettedFor && !e.stunnedFor;
        return !beneath && Math.hypot(e.x - (log.x + 0.5), e.y - (log.y + 0.5)) <= DEVICES.log.reach;
      });
      if (s.device(log.id)?.state === 'armed') {
        expect(opportunity.targets).toBe(under.length);
        // Worth firing: a group, or a single one already gnawing at the door.
        expect(opportunity.now).toBe(under.length >= DEVICES.log.targets || under.some((e) => e.action === 'attack'));
        if (opportunity.now) cued = true;
      } else expect(opportunity.now).toBe(false);
    });
    expect(cued).toBe(true);
  });

  it('the first night is survivable with the starting yard even with nobody at the desk', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = new NightSim(1, newGame(seed).yard, seed);
      run(sim, 400);
      expect(sim.outcome).toBe('survived');
      expect(sim.report().autoTriggers).toBeGreaterThan(5);
    }
  });

  it('a destroyed palisade stops blocking', () => {
    const fences = new Set<number>([idx(10, 17), idx(11, 17), idx(9, 17), idx(12, 17)]);
    const blocked = computeField(ENTRIES.portail, { blocked: fences });
    const open = computeField(ENTRIES.portail, {});
    expect(blocked[idx(10, 18)]!).toBeGreaterThan(open[idx(10, 18)]!);
    expect(Number.isFinite(blocked[idx(10, 17)]!)).toBe(false);
    expect(Number.isFinite(open[idx(10, 17)]!)).toBe(true);
  });

  it('every tree-line cell can reach every door on the empty lot', () => {
    for (const sector of SECTOR_IDS) {
      const field = computeField(ENTRIES[sector], {});
      for (const s of SECTOR_IDS) for (const cell of SPAWN_CELLS[s]) expect(Number.isFinite(field[idx(cell.x, cell.y)]!)).toBe(true);
    }
  });

  it.each(NIGHTS.map((_, i) => i + 1))('night %i always ends, undefended, and never leaves the phase stuck', (night) => {
    const yard = { ...newGame(1).yard, devices: [] };
    const sim = new NightSim(night, yard, 1);
    run(sim, 900);
    expect(sim.outcome).not.toBe('ongoing');
    const outcomes = sim.drainEvents().filter((e) => e.type === 'outcome');
    expect(outcomes).toHaveLength(1);
    // From the third night on, an empty yard is not enough.
    if (night >= 3) expect(sim.outcome).toBe('overrun');
  });

  it('reaches morning when the configured waves are survived', () => {
    const sim = new NightSim(1, layout(newGame(1), 2).yard, 1);
    run(sim, 900, (s) => operate(s));
    expect(sim.outcome).toBe('survived');
    expect(sim.houseHp).toBeGreaterThan(0);
    expect(sim.drainEvents().some((e) => e.type === 'outcome' && e.survived)).toBe(true);
  });

  it('dawn ends the night even if something is still standing', () => {
    const yard = newGame(1).yard;
    const doors = { hp: 1e9, level: 1 } as const;
    const sim = new NightSim(2, { ...yard, devices: [], barricades: { portail: doors, grange: doors, arriere: doors, verger: doors } }, 1);
    run(sim, 900);
    expect(sim.outcome).toBe('survived');
    expect(sim.time).toBeGreaterThanOrEqual(sim.dawnAt);
    expect(sim.report().bossDefeated).toBeNull();
  });

  it('the mower flattens palisades in his lane and only mauls the traps', () => {
    let state = rich(newGame(1));
    state = unwrap(build(state, 'fence', 10, 19));
    state = unwrap(build(state, 'log', 10, 18));
    const fence = state.yard.devices.find((d) => d.x === 10 && d.y === 19)!;
    const log = state.yard.devices.find((d) => d.x === 10 && d.y === 18)!;
    const sim = new NightSim(2, state.yard, 1);
    let mown = false;
    run(sim, 200, (s) => {
      mown ||= s.decals.some((d) => d.kind === 'mown' && d.x === 10 && d.y === 17);
    });
    expect(mown).toBe(true);
    expect(sim.device(fence.id)?.state).toBe('broken');
    const mauled = sim.device(log.id)!;
    expect(mauled.hp).toBeLessThan(DEVICES.log.maxHp);
  });

  it('a raised barrier in the lane stops the charge', () => {
    let state = rich(newGame(1));
    state = unwrap(build(state, 'barrier', 10, 18));
    const barrier = state.yard.devices.at(-1)!;
    const sim = new NightSim(2, state.yard, 1);
    let jammed = false;
    run(sim, 200, (s) => {
      const mower = s.enemies.find((e) => e.type === 'mower');
      if (mower?.action === 'rev' && s.device(barrier.id)?.state === 'armed') s.trigger(barrier.id);
      if (mower?.action === 'jam' && mower.y > 14) jammed = true;
    });
    expect(jammed).toBe(true);
  });

  describe('trap effects', () => {
    /** A yard with one extra device, and the first villager of night 1 walked up to `reach` cells from it. */
    const scenario = (type: 'horn' | 'floodlight' | 'barrier' | 'log', x: number, y: number, reach: number) => {
      const state = unwrap(build(rich({ ...newGame(1), yard: { ...newGame(1).yard, devices: [] } }), type, x, y));
      const device = state.yard.devices.at(-1)!;
      const sim = new NightSim(1, state.yard, 1);
      let target = sim.enemies[0];
      run(sim, 120, (s) => {
        target = s.enemies.find((e) => Math.hypot(e.x - (x + 0.5), e.y - (y + 0.5)) <= reach);
        if (target) (s as unknown as { outcome: string }).outcome = 'paused';
      });
      (sim as unknown as { outcome: string }).outcome = 'ongoing';
      if (!target) throw new Error('no villager came within reach');
      return { sim, device, target };
    };

    it('the net closes by itself on a group, pins it, then lets go', () => {
      // The starting palisade funnels the gate crowd through one gap; the net waits just before it.
      const base = newGame(1);
      const funnel = base.yard.devices.filter((d) => d.type === 'fence');
      const state = unwrap(build(rich({ ...base, yard: { ...base.yard, devices: funnel } }), 'net', 10, 17));
      const net = state.yard.devices.at(-1)!;
      const sim = new NightSim(2, state.yard, 1);
      let closedAt = -1;
      let caught: { enemy: (typeof sim.enemies)[number]; x: number; y: number; travel: number }[] = [];
      let heldChecked = false;
      let released = false;
      run(sim, 200, (s) => {
        if (closedAt < 0) {
          if (s.device(net.id)?.state !== 'active') return;
          closedAt = s.time;
          caught = s.enemies.filter((e) => e.nettedFor > 0).map((enemy) => ({ enemy, x: enemy.x, y: enemy.y, travel: enemy.travel }));
          return;
        }
        if (!heldChecked && s.time >= closedAt + 3) {
          heldChecked = true;
          for (const c of caught) {
            expect(c.enemy.x).toBeCloseTo(c.x, 5);
            expect(c.enemy.y).toBeCloseTo(c.y, 5);
            expect(c.enemy.travel).toBe(c.travel);
          }
        }
        if (s.time >= closedAt + DEVICES.net.activeSeconds + 2) {
          released = caught.some((c) => c.enemy.alive && c.enemy.travel > c.travel + 0.5 && Math.hypot(c.enemy.x - c.x, c.enemy.y - c.y) > 0.5);
          (s as unknown as { outcome: string }).outcome = 'paused';
        }
      });
      expect(caught.length).toBeGreaterThanOrEqual(DEVICES.net.targets);
      expect(heldChecked).toBe(true);
      expect(released).toBe(true);
    });

    it('the horn pulls walkers off their route', () => {
      const { sim, device, target } = scenario('horn', 5, 17, 4.5);
      const before = Math.hypot(target.x - 5.5, target.y - 17.5);
      expect(sim.trigger(device.id).ok).toBe(true);
      run(sim, 3);
      expect(Math.hypot(target.x - 5.5, target.y - 17.5)).toBeLessThan(before - 1);
      expect(target.lureDevice).toBe(device.id);
    });

    it('the floodlight slows and weakens what it lights', () => {
      const { sim, device, target } = scenario('floodlight', 8, 18, 3);
      expect(sim.trigger(device.id).ok).toBe(true);
      sim.step(1 / 60);
      expect(target.lit).toBe(true);
      const from = { x: target.x, y: target.y };
      run(sim, 2);
      const litDistance = Math.hypot(target.x - from.x, target.y - from.y);
      expect(litDistance).toBeLessThan(target.def.speed * 2 * 0.7);
      expect(litDistance).toBeGreaterThan(0.2);
    });

    it('a raised barrier holds the queue, and only while it is up', () => {
      const { sim, device, target } = scenario('barrier', 10, 17, 1.6);
      expect(sim.trigger(device.id).ok).toBe(true);
      run(sim, DEVICES.barrier.activeSeconds - 0.5);
      expect(target.y).toBeGreaterThan(17.9);
      run(sim, 6);
      expect(target.alive ? target.y : 0).toBeLessThan(17.5);
    });

    it('the log hits an upright villager once and knocks it back', () => {
      const { sim, device, target } = scenario('log', 9, 17, 1.2);
      const hp = target.hp;
      const travel = target.travel;
      const before = Math.hypot(target.x - 9.5, target.y - 17.5);
      expect(sim.trigger(device.id).ok).toBe(true);
      expect(target.hp).toBeLessThan(hp);
      expect(target.hitFlash).toBeGreaterThan(0);
      expect(target.travel).toBe(travel);
      expect(Math.hypot(target.x - 9.5, target.y - 17.5)).toBeGreaterThan(before);
      const after = target.hp;
      sim.trigger(device.id);
      expect(target.hp).toBe(after);
    });

    describe('crawling under a log', () => {
      function crossing(animal = false, beside?: 'net' | 'log') {
        const game = rich(newGame(42));
        // Prowlers pick the weakest door. Give them the same gate approach as the runners.
        const strong = { level: 1, hp: 280 } as const;
        const barricades = animal ? { portail: { level: 0 as const, hp: 80 }, grange: strong, verger: strong, arriere: strong } : game.yard.barricades;
        let yard = unwrap(build({ ...game, yard: { ...game.yard, devices: [], barricades } }, 'log', 10, 17));
        if (beside) yard = unwrap(build(yard, beside, 9, 17));
        return new NightSim(animal ? 4 : 5, yard.yard, 42);
      }

      function until(sim: NightSim, matches: (enemy: Enemy) => boolean): Enemy {
        for (let step = 0; step < 1200; step++) {
          sim.step(1 / 60);
          const e = sim.enemies.find((enemy) => enemy.alive && matches(enemy));
          if (e) return e;
        }
        throw new Error('No infected reached the expected posture');
      }

      it.each(['runner', 'dog'] as const)('%s gets down, clears its rig, then stands and resumes its route', (type) => {
        const sim = crossing(type === 'dog');
        const log = sim.devices[0]!;
        const e = until(sim, (mob) => mob.type === type && mob.crawlDepth === 1);
        expect(e.crawlLog).toBe(log);
        expect(e.action).toBe('crawl');
        expect(e.moveSpeed).toBeCloseTo(e.def.speed * COMBAT.logCrawlSpeedMultiplier);
        expect(sim.opportunity(log.id).targets).toBe(0);
        const hp = e.hp;
        const travel = e.travel;
        expect(sim.trigger(log.id).ok).toBe(true);
        expect(e.hp).toBe(hp);
        expect(e.stunnedFor).toBe(0);
        expect(sim.report().traps[log.id]).toMatchObject({ fired: 1, hits: 0, kills: 0 });
        until(sim, (mob) => mob === e && mob.action === 'walk' && mob.crawlDepth === 0);
        expect(e.crawlLog).toBeNull();
        expect(e.travel).toBeGreaterThan(travel + 0.5);
        expect(e.moveSpeed).toBe(e.def.speed);
      });

      it.each(['approach', 'second log', 'net'] as const)('the %s leaves a runner exposed to the swing', (timing) => {
        const sim = crossing(false, timing === 'second log' ? 'log' : timing === 'net' ? 'net' : undefined);
        const log = sim.devices[timing === 'second log' ? 1 : 0]!;
        const e = until(sim, (mob) => {
          if (mob.type !== 'runner') return false;
          if (timing === 'net') return mob.nettedFor > 0 && mob.crawlDepth > 0.5;
          return timing === 'approach' ? mob.crawlDepth > 0 && mob.crawlDepth < 1 : mob.crawlDepth === 1;
        });
        expect(sim.opportunity(log.id).targets).toBeGreaterThan(0);
        expect(sim.trigger(log.id).ok).toBe(true);
        expect(e.alive).toBe(false);
        expect(sim.report().traps[log.id]?.kills).toBeGreaterThan(0);
      });
    });
  });
});

describe('campaign', () => {
  it('carries the simulated damage and the real inventory into the next day', () => {
    let state = newGame(3);
    state = unwrap(startNight(state));
    const sim = new NightSim(state.day, state.yard, state.seed);
    run(sim, 40);
    // Force a survive so we can inspect the morning hand-over.
    (sim as unknown as { outcome: string }).outcome = 'survived';
    const morning = concludeNight(state, sim);
    expect(morning.phase).toBe('morning');
    expect(morning.yard).toEqual(sim.toYard(state.yard));
    expect(morning.inventory).toEqual(state.inventory);
    expect(morning.lastNight?.night).toBe(1);
    const next = startNextDay(morning);
    expect(next).toMatchObject({ phase: 'day', day: 2, where: 'home', hoursLeft: 12 });
    expect(next.yard).toEqual(morning.yard);
  });

  it('a lost night is a clear loss and a new run starts clean', () => {
    let state = unwrap(startNight({ ...newGame(3), day: 5 }));
    const sim = new NightSim(state.day, { ...state.yard, devices: [] }, 3);
    run(sim, 900);
    state = concludeNight(state, sim);
    expect(state.phase).toBe('lost');
    const fresh = newGame(4);
    expect(fresh).toMatchObject({ day: 1, phase: 'day', lastNight: null });
    expect(fresh.yard.houseHp).toBe(100);
  });

  it('the last night held ends the campaign on the seventh dawn, not on a morning', () => {
    const state: GameState = { ...newGame(1), day: 7, phase: 'night' };
    const sim = new NightSim(7, state.yard, 1);
    (sim as unknown as { outcome: string }).outcome = 'survived';
    const held = concludeNight(state, sim);
    expect(held.phase).toBe('held');
    expect(held.lastNight?.survived).toBe(true);
    // Nothing follows it: there is no eighth day.
    expect(startNextDay(held)).toBe(held);
  });

  it('loads a run saved as won, from before nobody could win, as a run that held', () => {
    const won = { ...newGame(1), day: 7, phase: 'won' };
    expect(deserialize(JSON.stringify(won))).toMatchObject({ phase: 'held', day: 7 });
    expect(deserialize(JSON.stringify({ ...won, phase: 'victorious' }))).toBeNull();
  });

  it('outings cost daylight, loot comes home in the boot, and spots empty for good', () => {
    const state = newGame(5);
    const out = unwrap(travelTo(state, 'hardware'));
    expect(out.state.where).toBe('hardware');
    expect(out.state.hoursLeft).toBe(state.hoursLeft - LOCATIONS.hardware.travelHours);
    const searched = unwrap(searchSpot(out.state, 0));
    expect(searched.loot.wood).toBeGreaterThanOrEqual(5);
    expect(searched.state.outing?.trunk.wood).toBe(searched.loot.wood);
    expect(searchSpot(searched.state, 0).ok).toBe(false);
    const home = unwrap(arriveHome(unwrap(leaveLocation(searched.state)).state)).state;
    expect(home.where).toBe('home');
    expect(home.inventory.wood).toBe(state.inventory.wood + (searched.loot.wood ?? 0));
    expect(home.hoursLeft).toBe(state.hoursLeft - 2 * LOCATIONS.hardware.travelHours - 0.5);
  });

  it('discovers a stolen lot on return, persists it, and counts each discovery once', () => {
    const there = unwrap(travelTo(newGame(7), 'hardware')).state;
    const searched = unwrap(searchSpot(there, 0)).state;
    const home = unwrap(arriveHome(unwrap(leaveLocation(searched)).state)).state;
    const dayTwo = startNextDay({ ...home, phase: 'morning', rng: 7 });
    const back = unwrap(travelTo(dayTwo, 'hardware')).state;
    expect(back.outing?.lootNotice).toBe(1);
    expect(back.encounter).toBeNull();
    expect(back.totals).toEqual(dayTwo.totals);
    expect(back.inventory).toEqual(dayTwo.inventory);
    expect(Object.values(back.outing!.trunk)).toEqual([0, 0, 0, 0, 0]);

    const progress = back.locations.hardware;
    expect(progress.looted).toHaveLength(1);
    const stolen = progress.looted[0]!;
    expect(stolen).not.toBe(0);
    expect(progress.searched).toEqual([0, stolen]);
    const resumed = deserialize(serialize(back))!;
    expect(resumed).toEqual(back);
    expect(prepareSearch(resumed, stolen)).toMatchObject({ ok: false, error: { code: 'already_searched' } });
    const open = LOCATIONS.hardware.spots.findIndex((_, index) => !progress.searched.includes(index));
    expect(prepareSearch(resumed, open).ok).toBe(true);

    const returned = unwrap(arriveHome(unwrap(leaveLocation(resumed)).state)).state;
    expect(planVisit(returned, LOCATIONS.hardware).searches).toBe(3);
    expect(unwrap(travelTo({ ...returned, rng: 7 }, 'hardware')).state.outing?.lootNotice).toBeUndefined();
    const dayThree = startNextDay({ ...returned, phase: 'morning', rng: 7 });
    const repeat = unwrap(travelTo(dayThree, 'hardware')).state;
    expect(repeat.outing?.lootNotice).toBe(2);
    expect(repeat.locations.hardware.looted).toHaveLength(2);
  });

  it('rolls only for partially scavenged, unattended locations and raises the odds over time', () => {
    // Seed 0 starts with a roll between the one-day and two-day chances.
    const base = newGame(0);
    const partial = { ...base.locations.hardware, searched: [0], lootCheckedDay: 1 };
    const locations = { ...base.locations, hardware: partial, shed: partial };
    const returned = (state: GameState, id: 'hardware' | 'shed' | 'grocery' = 'hardware') => unwrap(travelTo(state, id)).state.outing?.lootNotice;
    expect(returned({ ...base, locations, day: 2 })).toBeUndefined();
    expect(returned({ ...base, locations, day: 3 })).toBe(1);
    expect(returned({ ...base, locations, day: 3, rng: 7 }, 'grocery')).toBeUndefined();
    expect(returned({ ...base, locations, day: 2, rng: 7 }, 'shed')).toBeUndefined();
    expect(returned({ ...base, locations, day: 3, rng: 7 }, 'shed')).toBe(1);
    const spent = { ...partial, searched: [0, 1, 2, 3, 4] };
    expect(returned({ ...base, locations: { ...locations, hardware: spent }, day: 3, rng: 7 })).toBeUndefined();
  });

  it('starts counting from the saved day for partially searched legacy locations', () => {
    const base = newGame(7);
    const save = { ...base, day: 2, locations: { ...base.locations, hardware: { visits: 1, searched: [0] } } };
    const upgraded = deserialize(JSON.stringify(save))!;
    expect(upgraded.locations.hardware).toEqual({ visits: 1, searched: [0], looted: [], lootCheckedDay: 2 });
    expect(unwrap(travelTo(upgraded, 'hardware')).state.outing?.lootNotice).toBeUndefined();
    const nextDay = startNextDay({ ...upgraded, phase: 'morning' });
    expect(unwrap(travelTo(nextDay, 'hardware')).state.outing?.lootNotice).toBe(1);
  });

  it('leaves the garage equipment case searchable when the material lots are gone', () => {
    const base = newGame(7);
    const caseIndex = LOCATIONS.garage.spots.findIndex((spot) => spot.key === 'crossbow');
    const searched = LOCATIONS.garage.spots.map((_, index) => index).filter((index) => index !== caseIndex);
    const garage = { ...base.locations.garage, searched, lootCheckedDay: 4 };
    const { state } = unwrap(travelTo({ ...base, day: 5, locations: { ...base.locations, garage } }, 'garage'));
    expect(state.outing?.lootNotice).toBeUndefined();
    expect(state.locations.garage.searched).not.toContain(caseIndex);
    expect(prepareSearch(state, caseIndex).ok).toBe(true);
  });

  it('keeps the price of a miss across reload and charges the next attempt once', () => {
    const start = unwrap(travelTo(newGame(5), 'garage')).state;
    const miss = unwrap(prepareSearch(start, 0)).failure;
    expect(miss.hoursLeft).toBe(start.hoursLeft - 0.5);
    expect(miss.outing).toBe(start.outing);
    expect(miss.locations).toBe(start.locations);
    expect(miss.totals).toBe(start.totals);
    expect(miss.rng).toBe(start.rng);
    const retry = unwrap(prepareSearch(deserialize(serialize(miss))!, 0));
    expect(retry.paid.hoursLeft).toBe(start.hoursLeft - 1);
    expect(retry.success.state.hoursLeft).toBe(retry.paid.hoursLeft);
    expect(retry.success.state.totals.searches).toBe(start.totals.searches + 1);
    const last = unwrap(prepareSearch({ ...start, hoursLeft: LOCATIONS.garage.travelHours + 0.5 }, 0)).failure;
    expect(prepareSearch(last, 0)).toMatchObject({ ok: false, error: { code: 'no_time' } });
    expect(leaveLocation(last).ok).toBe(true);
  });

  it('records a lift death only on a failed wreck search, including after repeated reloads', () => {
    const garage = unwrap(travelTo(newGame(5), 'garage')).state;
    const wreck = LOCATIONS.garage.spots.findIndex(spot => spot.key === 'wreck');
    const attempt = unwrap(prepareSearch(garage, wreck));
    expect(attempt.success.state.phase).toBe('day');
    expect(attempt.failure).toMatchObject({ phase: 'lost', fate: 'lift', hoursLeft: garage.hoursLeft - 0.5, outing: null });
    const reloaded = deserialize(serialize(attempt.failure))!;
    expect(deserialize(serialize(reloaded))).toEqual(reloaded);
    expect(reloaded.fate).toBe('lift');
    expect(retryChapter(reloaded).ok).toBe(false);
    expect(prepareSearch(reloaded, wreck).ok).toBe(false);
  });

  it('never lets an outing strand the player after dark', () => {
    const state = { ...newGame(5), hoursLeft: 1 };
    expect(travelTo(state, 'hardware').ok).toBe(false);
    const there = unwrap(travelTo({ ...newGame(5), hoursLeft: 1.6 }, 'hardware'));
    const result = searchSpot(there.state, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('no_time');
  });

  it('quotes a shed visit after the greeting and keeps the return drive affordable', () => {
    const home = { ...newGame(5), hoursLeft: 1 };
    const firstTrip = planVisit(home, LOCATIONS.shed);
    expect(firstTrip).toEqual({ searches: 0, hoursAfterReturn: 0.25 });
    const visit = unwrap(travelTo(home, 'shed')).state;
    expect(prepareSearch(visit, 0)).toMatchObject({ ok: false, error: { code: 'no_time' } });
    expect(unwrap(leaveLocation(visit)).state.hoursLeft).toBe(firstTrip.hoursAfterReturn);
    const later = { ...home, flags: visit.flags };
    const nextTrip = planVisit(later, LOCATIONS.shed);
    expect(nextTrip).toEqual({ searches: 1, hoursAfterReturn: 0 });
    const searched = unwrap(searchSpot(unwrap(travelTo(later, 'shed')).state, 0)).state;
    expect(unwrap(leaveLocation(searched)).state.hoursLeft).toBe(nextTrip.hoursAfterReturn);
  });

  it('caps the map estimate by the visit limit and the spots still stocked', () => {
    const home = { ...newGame(5), day: 3 };
    const station = LOCATIONS.police;
    expect(planVisit(home, station)).toEqual({ searches: 2, hoursAfterReturn: 9 });
    expect(planVisit({ ...home, day: 7 }, station)).toEqual({ searches: station.spots.length, hoursAfterReturn: 7.5 });
    const locations = { ...home.locations, police: { ...home.locations.police, searched: [0, 1, 2, 3] } };
    expect(planVisit({ ...home, locations }, station)).toEqual({ searches: 1, hoursAfterReturn: 9.5 });
  });

  it('keeps later destinations locked until their day', () => {
    const result = travelTo(newGame(1), 'townhall');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ code: 'locked', unlockDay: 4 });
  });

  it('round-trips a save and rejects garbage', () => {
    const state = unwrap(build(rich(newGame(9)), 'net', 6, 15));
    expect(deserialize(serialize(state))).toEqual(state);
    expect(deserialize('{"version":1}')).toBeNull();
    expect(deserialize('not json')).toBeNull();
    expect(deserialize(serialize({ ...state, inventory: { ...state.inventory, wood: -3 } }))).toBeNull();
  });
});

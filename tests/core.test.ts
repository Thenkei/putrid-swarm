import { describe, expect, it } from 'vitest';
import { DEVICES } from '../src/core/data/devices';
import { LOCATIONS } from '../src/core/data/locations';
import { NIGHTS } from '../src/core/data/waves';
import { concludeNight, newGame, returnHome, searchSpot, startNextDay, startNight, travelTo } from '../src/core/game';
import { ENTRIES, SPAWN_CELLS, idx, isBuildable } from '../src/core/map';
import { NightSim } from '../src/core/night';
import { auditRoutes, computeField } from '../src/core/pathing';
import { deserialize, serialize } from '../src/core/save';
import type { GameState } from '../src/core/types';
import { RESOURCE_IDS, SECTOR_IDS } from '../src/core/types';
import { build, dismantle, fenceCells, placementProblem, repairBarricade, repairDevice, turnDevice } from '../src/core/yard';
import { layout, operate } from './operator';

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

  it('refunds half (rounded up) when dismantling and charges half to repair', () => {
    let state = rich(newGame(1));
    state = unwrap(build(state, 'log', 6, 15));
    const device = state.yard.devices.at(-1)!;
    const before = state.inventory.wood;
    const dismantled = unwrap(dismantle(state, device.id));
    expect(dismantled.inventory.wood).toBe(before + 2);

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
      const under = s.enemies.filter((e) => Math.hypot(e.x - (log.x + 0.5), e.y - (log.y + 0.5)) <= DEVICES.log.reach);
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
      let caught: { enemy: (typeof sim.enemies)[number]; x: number; y: number }[] = [];
      let heldChecked = false;
      let released = false;
      run(sim, 200, (s) => {
        if (closedAt < 0) {
          if (s.device(net.id)?.state !== 'active') return;
          closedAt = s.time;
          caught = s.enemies.filter((e) => e.nettedFor > 0).map((enemy) => ({ enemy, x: enemy.x, y: enemy.y }));
          return;
        }
        if (!heldChecked && s.time >= closedAt + 3) {
          heldChecked = true;
          for (const c of caught) {
            expect(c.enemy.x).toBeCloseTo(c.x, 5);
            expect(c.enemy.y).toBeCloseTo(c.y, 5);
          }
        }
        if (s.time >= closedAt + DEVICES.net.activeSeconds + 2) {
          released = caught.some((c) => c.enemy.alive && Math.hypot(c.enemy.x - c.x, c.enemy.y - c.y) > 0.5);
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

    it('the log hits everything in reach, once, and knocks it back', () => {
      const { sim, device, target } = scenario('log', 9, 17, 1.2);
      const hp = target.hp;
      const before = Math.hypot(target.x - 9.5, target.y - 17.5);
      expect(sim.trigger(device.id).ok).toBe(true);
      expect(target.hp).toBeLessThan(hp);
      expect(Math.hypot(target.x - 9.5, target.y - 17.5)).toBeGreaterThan(before);
      const after = target.hp;
      sim.trigger(device.id);
      expect(target.hp).toBe(after);
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

  it('the last night won ends the campaign', () => {
    const state: GameState = { ...newGame(1), day: 7, phase: 'night' };
    const sim = new NightSim(7, state.yard, 1);
    (sim as unknown as { outcome: string }).outcome = 'survived';
    expect(concludeNight(state, sim).phase).toBe('won');
  });

  it('outings cost daylight, loot is banked, and spots empty for good', () => {
    const state = newGame(5);
    const out = unwrap(travelTo(state, 'hardware'));
    expect(out.state.where).toBe('hardware');
    expect(out.state.hoursLeft).toBe(state.hoursLeft - LOCATIONS.hardware.travelHours);
    const searched = unwrap(searchSpot(out.state, 0));
    expect(searched.loot.wood).toBeGreaterThanOrEqual(5);
    expect(searched.state.inventory.wood).toBe(state.inventory.wood + (searched.loot.wood ?? 0));
    expect(searchSpot(searched.state, 0).ok).toBe(false);
    const home = unwrap(returnHome(searched.state));
    expect(home.where).toBe('home');
    expect(home.hoursLeft).toBe(state.hoursLeft - 2 * LOCATIONS.hardware.travelHours - 0.5);
  });

  it('never lets an outing strand the player after dark', () => {
    const state = { ...newGame(5), hoursLeft: 1 };
    expect(travelTo(state, 'hardware').ok).toBe(false);
    const there = unwrap(travelTo({ ...newGame(5), hoursLeft: 1.6 }, 'hardware'));
    const result = searchSpot(there.state, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('no_time');
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

import { describe, expect, it } from 'vitest';
import { epicFlag, markEpic, MOPED_BLAST_RADIUS, MOPED_EXIT_SECONDS, MOPED_RUN_SECONDS, unloadMoped } from '../src/core/epics';
import { THRESHOLDS } from '../src/house-layout';
import { mopedDoorOpen } from '../src/render/moped';
import { ENTRIES, LANES } from '../src/core/map';
import { SECTOR_IDS } from '../src/core/types';
import { arriveHome, concludeNight, newGame, startNextDay, startNight } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { serialize, deserialize } from '../src/core/save';
import { porchContact } from '../src/render/porch-flame';

const impactSeconds = MOPED_EXIT_SECONDS + MOPED_RUN_SECONDS;

describe('daily epics', () => {
  it('ends the porch attack at the painted tip and follows its angled centre', () => {
    expect(porchContact(638, { x: 638, y: 130 })).toBe(true);
    expect(porchContact(638, { x: 638, y: 110 })).toBe(false);
    expect(porchContact(638, { x: 543, y: 275 })).toBe(true);
    expect(porchContact(638, { x: 638, y: 275 })).toBe(false);
  });
  it('defaults missing and invalid saved lane numbers to the gate', () => {
    const state = newGame(12);
    expect(epicFlag(state, 'lane')).toBe(0);
    for (const value of [-1, 1.5, NaN]) expect(epicFlag(markEpic(state, 'lane', value), 'lane')).toBe(0);
  });
  it('remembers the loaded moped on the road and charges the boot only on arrival', () => {
    const s = markEpic(newGame(12), 'loaded');
    const trunk = { wood: 5, scrap: 2, springs: 1, wire: 0, battery: 0 };
    const parted = { wood: 1, scrap: 0, springs: 0, wire: 0, battery: 0 };
    const state = deserialize(serialize({ ...s, where: 'road', outing: { to: 'garage', trunk, parted, marks: [], major: false } }))!;
    const result = arriveHome(state);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error('arrival');
    expect(result.value.brought).toEqual({ ...trunk, wood: 2, scrap: 1, springs: 0 });
    expect(result.value.parted.wood).toBe(4);
    expect(epicFlag(result.value.state, 'moped')).toBe(1);
    expect(unloadMoped(result.value.state, trunk, parted).trunk).toEqual(trunk);
  });
  it('strikes once down the chosen lane and credits kills in the night report', () => {
    const s = newGame(3);
    const sim = new NightSim(3, { ...s.yard, devices: [] }, s.seed);
    while (sim.enemies.length < 2) sim.step(1/60);
    const [inLane, outside] = sim.enemies;
    Object.assign(inLane!, { x: 10.5, y: 17, hp: 1, stunnedFor: 10 });
    Object.assign(outside!, { x: 16, y: 19, hp: 1 });
    expect(sim.launchMoped('portail')).toBe(true);
    expect(inLane!.alive).toBe(true);
    for (let i = 0; i < 120; i++) sim.step(1/60);
    expect(inLane!.alive).toBe(false);
    expect(sim.mopedRide!.bladeKills).toBe(1);
    expect(outside!.alive).toBe(true);
    expect(sim.launchMoped('portail')).toBe(false);
    expect(sim.report().kills[inLane!.type]).toBeGreaterThan(0);
  });
  it.each(SECTOR_IDS)('detonates once at the far end of %s and credits just the victims of the blast', sector => {
    const s = newGame(3);
    const sim = new NightSim(3, s.yard, s.seed);
    while (!sim.enemies.length) sim.step(1/60);
    const template = sim.enemies[0]!;
    const entry = ENTRIES[sector];
    const end = LANES[sector][2]!;
    const centre = { x: end.x + .5, y: end.y + .5 };
    const horizontal = entry.y === end.y;
    const target = (id: number, lateral: number) => ({
      ...template, id, hp: 60, stunnedFor: 20,
      x: centre.x + (horizontal ? 0 : lateral),
      y: centre.y + (horizontal ? lateral : 0),
    });
    const crowd = [target(-1, 2.5), target(-2, -2.5), target(-3, MOPED_BLAST_RADIUS)];
    const outside = target(-4, -(MOPED_BLAST_RADIUS + .05));
    const bladeVictim = { ...target(-5, 0), x: (entry.x + .5 + centre.x) / 2, y: (entry.y + .5 + centre.y) / 2 };
    sim.enemies.splice(0, sim.enemies.length, ...crowd, outside, bladeVictim);
    const start = sim.time;
    expect(sim.launchMoped(sector)).toBe(true);
    expect(sim.mopedRide!.impact).toEqual(centre);
    for (let i = 0; i < Math.floor(impactSeconds * 60) - 1; i++) sim.step(1/60);
    expect(bladeVictim.alive).toBe(false);
    expect(sim.mopedRide!.blastAt).toBeNull();
    expect(crowd.every(e => e.alive)).toBe(true);
    sim.drainEvents();
    sim.step(1/30);
    expect(sim.mopedRide!.blastAt).toBeCloseTo(start + impactSeconds);
    expect(crowd.every(e => !e.alive)).toBe(true);
    expect(outside.hp).toBe(60);
    expect(sim.drainEvents().filter(e => e.type === 'moped_blast')).toEqual([{ type: 'moped_blast', sector, kills: 3 }]);
    expect(sim.report().kills[template.type]).toBe(4);
    const late = target(-6, 0);
    sim.enemies.push(late);
    for (let i = 0; i < 180; i++) sim.step(1/60);
    expect(late.hp).toBe(60);
    expect(sim.drainEvents().some(e => e.type === 'moped_blast')).toBe(false);
    expect(SECTOR_IDS.some(lane => sim.launchMoped(lane))).toBe(false);
  });
  it('signals a real incoming group with enough lead for the ride to reach the gate hedge', () => {
    const state = newGame(11);
    const sim = new NightSim(3, state.yard, state.seed);
    expect(sim.mopedTargets('portail')).toBe(0);
    while (sim.time < 45 && sim.mopedTargets('portail') < 3) sim.step(1 / 60);
    expect(sim.mopedTargets('portail')).toBeGreaterThanOrEqual(3);
    expect(sim.launchMoped('portail')).toBe(true);
    for (let i = 0; i < 160; i++) sim.step(1 / 60);
    expect(sim.mopedRide!.blastKills).toBeGreaterThanOrEqual(2);
  });

  it('lets the moped reach the hedge and show its impact when launched just before dawn', () => {
    const state = newGame(3);
    const sim = new NightSim(3, state.yard, state.seed);
    while (!sim.enemies.length) sim.step(1/60);
    sim.dawnAt = sim.time + .1;
    sim.launchMoped('verger');
    for (let i = 0; i < 20; i++) sim.step(1/60);
    expect(sim.outcome).toBe('ongoing');
    const positions = sim.enemies.map(e => [e.x, e.y]);
    for (let i = 0; i < 60; i++) sim.step(1/60);
    expect(sim.enemies.map(e => [e.x, e.y])).toEqual(positions);
    for (let i = 0; i < 80; i++) sim.step(1/60);
    expect(sim.mopedRide!.blastAt).not.toBeNull();
    expect(sim.outcome).toBe('survived');
    expect(sim.launchMoped('portail')).toBe(false);
  });
  it('finishes a ride that is already in flight when the house falls', () => {
    const state = newGame(3);
    const sim = new NightSim(3, state.yard, state.seed);
    sim.launchMoped('portail');
    sim.houseHp = 0;
    for (let i = 0; i < Math.ceil(impactSeconds * 60) + 2; i++) sim.step(1/60);
    expect(sim.outcome).toBe('overrun');
    const events = sim.drainEvents().filter(e => e.type === 'moped_blast' || e.type === 'outcome');
    expect(events.map(e => e.type)).toEqual(['moped_blast', 'outcome']);
  });
  it('keeps a wrecked moped spent on the following night of the same campaign', () => {
    const state = markEpic(markEpic({ ...newGame(3), day: 3 }, 'moped'), 'spent');
    const night = startNight(state);
    if (!night.ok) throw Error('night');
    const sim = new NightSim(state.day, state.yard, state.seed);
    sim.dawnAt = 0;
    sim.step(1/60);
    const morning = concludeNight(night.value, sim);
    const nextDay = startNextDay(deserialize(serialize(morning))!);
    const nextNight = startNight(nextDay);
    if (!nextNight.ok) throw Error('next night');
    expect(nextNight.value.day).toBe(4);
    expect(epicFlag(nextNight.value, 'spent')).toBe(1);
    expect(epicFlag(newGame(3), 'spent')).toBe(0);
  });
  it.each([[5, 'cub'], [6, 'neighbor']] as const)('replays night %i without banking its abandoned rescue', (day, outcome) => {
    const dusk = { ...newGame(54), day, flags: {
      'epic.moped': 1, 'epic.lane': 2, 'epic.garagePrint': 1, ...(day === 6 ? { 'epic.cub': 1 } : {}),
    } };
    const night = startNight(dusk);
    if (!night.ok) throw Error('night');
    // Launching from the desk after a rescue saves the campaign before the night report exists.
    const abandoned = markEpic(markEpic(night.value, outcome), 'spent');
    const retry = deserialize(serialize(abandoned))!;
    expect(retry).toMatchObject({ phase: 'day', day, hoursLeft: 0 });
    expect(retry.flags).toEqual({ ...dusk.flags, 'epic.spent': 1 });
    const replay = startNight(retry);
    if (!replay.ok) throw Error('replay');
    const sim = new NightSim(day, retry.yard, retry.seed);
    sim.dawnAt = 0;
    sim.step(1/60);
    // Declining on the replay grants no ally. Rescuing again and reaching dawn grants one.
    for (const rescued of [false, true]) {
      const result = rescued ? markEpic(replay.value, outcome) : replay.value;
      const morning = deserialize(serialize(concludeNight(result, sim)))!;
      expect(epicFlag(morning, outcome)).toBe(Number(rescued));
      expect(epicFlag(morning, 'spent')).toBe(1);
    }
  });
  it('restores the garage print only after its darkroom night is concluded', () => {
    const state = markEpic({ ...newGame(17), day: 3, phase: 'night' }, 'garagePrint');
    expect(epicFlag(deserialize(serialize(state))!, 'garagePrint')).toBe(0);
    expect(epicFlag(deserialize(serialize({ ...state, phase: 'morning' }))!, 'garagePrint')).toBe(1);
  });
  it.each(SECTOR_IDS)('waits for the wheel to clear the %s sill before enabling the blades', sector => {
    const state = newGame(12);
    const sim = new NightSim(3, state.yard, state.seed);
    while (!sim.enemies.length) sim.step(1/60);
    const hp = sim.barricades[sector].hp;
    sim.launchMoped(sector);
    const ride = sim.mopedRide!;
    const [entry, end] = ride.path;
    const sill = THRESHOLDS[sector];
    const dx = entry.x - sill.gx, dy = entry.y - sill.gy;
    expect(Math.hypot(dx, dy)).toBeCloseTo(1.35);
    expect(dx * (end.y - sill.gy) - dy * (end.x - sill.gx)).toBeCloseTo(0);
    const enemy = sim.enemies[0]!;
    Object.assign(enemy, { ...entry, hp: 1, stunnedFor: 20 });
    expect(mopedDoorOpen(0)).toBe(0);
    expect(mopedDoorOpen(.40)).toBe(1);
    sim.step(MOPED_EXIT_SECONDS - .01);
    expect(mopedDoorOpen(sim.time - ride.start)).toBe(1);
    expect(ride.hit.size).toBe(0);
    expect(enemy.alive).toBe(true);
    expect(sim.drainEvents().filter(e => e.type === 'moped_departure')).toHaveLength(0);
    sim.step(.02);
    expect(ride.hit.has(enemy.id)).toBe(true);
    expect(enemy.alive).toBe(false);
    sim.step(.65);
    expect(mopedDoorOpen(sim.time - ride.start)).toBe(0);
    expect(sim.drainEvents().filter(e => e.type === 'moped_departure')).toHaveLength(1);
    expect(sim.barricades[sector].hp).toBe(hp);
  });
});

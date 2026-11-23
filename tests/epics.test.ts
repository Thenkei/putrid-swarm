import { describe, expect, it } from 'vitest';
import { epicFlag, markEpic, unloadMoped } from '../src/core/epics';
import { arriveHome, newGame } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { serialize, deserialize } from '../src/core/save';

describe('daily epics', () => {
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
    const sim = new NightSim(3, s.yard, s.seed);
    while (sim.enemies.length < 2) sim.step(1/60);
    const [inLane, outside] = sim.enemies;
    Object.assign(inLane!, { x: 10.5, y: 17, hp: 1 });
    Object.assign(outside!, { x: 16, y: 19, hp: 1 });
    expect(sim.launchMoped('portail')).toBe(true);
    expect(inLane!.alive).toBe(true);
    for (let i = 0; i < 72; i++) sim.step(1/60);
    expect(inLane!.alive).toBe(false);
    expect(outside!.alive).toBe(true);
    expect(sim.launchMoped('portail')).toBe(false);
    expect(sim.report().kills[inLane!.type]).toBeGreaterThan(0);
  });
});

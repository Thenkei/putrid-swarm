import { describe, expect, it } from 'vitest';
import { CoastDrive, coastForNight, finishCoastHome, shouldCoastHome } from '../src/core/coast-home';
import { arriveHome, leaveLocation, newGame, travelTo } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { deserialize, serialize } from '../src/core/save';
import type { Result } from '../src/core/types';

function ok<T>(r: Result<T, unknown>): T {
  if (!r.ok) throw Error('trip setup failed');
  return r.value;
}

function road() {
  const garage = ok(travelTo({ ...newGame(12), day: 2 }, 'garage')).state;
  return ok(leaveLocation({ ...garage, hoursLeft: 2.5 })).state;
}

describe('the last fifteen metres', () => {
  it('waits for the first late return after day one and for pending encounters', () => {
    const s = road();
    expect(shouldCoastHome(s)).toBe(true);
    expect(shouldCoastHome({ ...s, day: 1 })).toBe(false);
    expect(shouldCoastHome({ ...s, hoursLeft: 2.01 })).toBe(false);
    expect(shouldCoastHome({ ...s, where: 'garage' })).toBe(false);
    expect(shouldCoastHome({ ...s, outing: { ...s.outing!, crossbowStop: true } })).toBe(false);
    expect(shouldCoastHome(deserialize(serialize(s))!)).toBe(true);
  });

  it.each([[0, true], [1, false]] as const)('drives the whole approach with steering %i', (steer, heard) => {
    for (const hz of [30, 60, 120]) {
      const d = new CoastDrive();
      d.ignition();
      let frames = 0;
      while (frames++ < 22 * hz && d.phase !== 'arrived') d.update(1 / hz, steer, false);
      expect(d.phase).toBe('arrived');
      expect(d.heard).toBe(heard);
      expect(frames / hz).toBeGreaterThan(10);
    }
  });

  it('can creep over the gravel, or stop completely and wake both figures with the starter', () => {
    const slow = new CoastDrive();
    slow.ignition();
    for (let i = 0; i < 1800; i++) slow.update(1 / 60, 0, slow.speed > .73);
    expect(slow.phase).toBe('arrived');
    expect(slow.heard).toBe(false);
    const d = new CoastDrive();
    d.ignition();
    for (let i = 0; i < 180; i++) d.update(1 / 60, 1, true);
    expect(d.phase).toBe('stopped');
    expect(d.heard).toBe(false);
    d.ignition();
    for (let i = 0; i < 1200; i++) d.update(1 / 60, 0, true);
    expect(d.phase).toBe('arrived');
    expect(d.heard).toBe(true);
  });

  it('keeps the load for normal arrival and remembers the pair only on their own night', () => {
    const s = road();
    const loaded = { ...s, outing: { ...s.outing!, trunk: { ...s.outing!.trunk, wire: 2 } } };
    const done = deserialize(serialize(finishCoastHome(loaded, 'followed')))!;
    expect(coastForNight(done)).toBe('followed');
    expect(done.outing?.coastParked).toBe(true);
    expect(finishCoastHome(done, 'quiet')).toBe(done);
    const home = ok(arriveHome(done)).state;
    expect(home.inventory.wire).toBe(s.inventory.wire + 2);
    expect(arriveHome(home).ok).toBe(false);
    expect(coastForNight({ ...home, day: 3 })).toBeNull();
    expect(shouldCoastHome({ ...done, day: 3 })).toBe(false);
  });

  it.each([2, 3, 4, 5, 6, 7])('reuses two existing first-wave shamblers on night %i', day => {
    const yard = newGame(3).yard;
    const build = (outcome: 'quiet' | 'followed' | null) => new NightSim(day, yard, 3, null, null, null, null, null, outcome);
    const baseline = build(null), quiet = build('quiet'), followed = build('followed');
    const total = baseline.remainingSpawns();
    for (const sim of [quiet, followed]) expect(sim.remainingSpawns()).toBe(total);
    for (let i = 0; i < 375; i++) {
      quiet.step(1 / 60); followed.step(1 / 60);
    }
    expect(followed.enemies.filter(e => e.target === 'portail' && e.type === 'shambler').length).toBeGreaterThanOrEqual(2);
    expect(followed.enemies.filter(e => e.type === 'shambler').length - quiet.enemies.filter(e => e.type === 'shambler').length).toBe(2);
    for (const sim of [quiet, followed]) expect(sim.remainingSpawns() + sim.enemies.length).toBe(total);
  });
});

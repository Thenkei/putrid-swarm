import { expect, it } from 'vitest';
import { BOSS } from '../src/core/data/enemies';
import { newGame } from '../src/core/game';
import { NightSim, hoistAge, type Enemy } from '../src/core/night';
import { deserialize, serialize } from '../src/core/save';
import { layout } from './operator';

const STEP = 1 / 60;

function approach() {
  const state = layout(newGame(11), 3);
  const sim = new NightSim(4, state.yard, state.seed);
  const log = sim.manualDevicesIn('grange').find(d => d.type === 'log')!;
  return { sim, log, state };
}

function until(sim: NightSim, ready: (e: Enemy) => boolean): Enemy {
  while (sim.time < sim.dawnAt && sim.outcome === 'ongoing') {
    sim.step(STEP);
    const mechanic = sim.enemies.find(e => e.type === 'mechanic');
    if (mechanic && ready(mechanic)) return mechanic;
  }
  throw Error('The mechanic never reached the expected pose.');
}

it('catches the real grange approach after the chain falls silent and records the attacked sector', () => {
  const { sim, log, state } = approach();
  const mechanic = until(sim, e => hoistAge(e) !== null);
  const pullAt = sim.time;
  expect(sim.drainEvents().filter(e => e.type === 'telegraph' && e.kind === 'hoist')).toHaveLength(1);
  // The group cue is valid on this approach. Nearby spikes clear the walkers during the rattle.
  expect(sim.opportunity(log.id)).toEqual({ targets: 3, now: true, group: true });
  until(sim, e => (hoistAge(e) ?? 0) >= BOSS.mechanic.chainSeconds - 0.05);
  expect(sim.opportunity(log.id)).toEqual({ targets: 1, now: false });
  until(sim, e => (hoistAge(e) ?? 0) >= BOSS.mechanic.chainSeconds + 0.2);
  expect(sim.time - pullAt).toBeLessThan(mechanic.def.windupSeconds);
  expect(sim.opportunity(log.id)).toEqual({ targets: 1, now: true });
  sim.act({ kind: 'look', sector: 'grange' });
  sim.act({ kind: 'key', slot: sim.manualDevicesIn('grange').indexOf(log) });
  const events = sim.drainEvents();
  expect(events.filter(e => e.type === 'interrupt')).toHaveLength(1);
  expect(events.some(e => e.type === 'log_release' && e.sweeps.some(sweep => sweep.before.id === mechanic.id))).toBe(true);
  expect(hoistAge(mechanic)).toBeNull();
  expect(mechanic.stunnedFor).toBeGreaterThan(0);
  const report = sim.report();
  expect(report.mechanicStoppedAt).toBe('grange');
  expect(deserialize(serialize({ ...state, lastNight: report }))?.lastNight?.mechanicStoppedAt).toBe('grange');
  for (const bad of [{ ...report, mechanicStoppedAt: 'garage' }, { ...report, night: 3 }]) {
    expect(deserialize(JSON.stringify({ ...state, lastNight: bad }))?.lastNight?.mechanicStoppedAt).toBeUndefined();
  }
});

it('lets the operator interrupt early during the rattle before the solitary cue lights', () => {
  const { sim, log } = approach();
  until(sim, e => (hoistAge(e) ?? 0) >= 0.25);
  expect(sim.opportunity(log.id)).toEqual({ targets: 1, now: false });
  expect(sim.trigger(log.id).ok).toBe(true);
  expect(sim.report().mechanicStoppedAt).toBe('grange');
});

it.each(['walking', 'missed', 'landed'] as const)('does not write an invoice for a %s swing', when => {
  const { sim, log } = approach();
  if (when === 'walking') {
    until(sim, e => e.action === 'walk' && Math.hypot(e.x - log.x - 0.5, e.y - log.y - 0.5) < 1.8);
  } else if (when === 'missed') {
    until(sim, e => hoistAge(e) !== null);
  } else until(sim, e => e.blowRecovery > 0 && e.action === 'attack');
  const device = when === 'missed' ? sim.manualDevicesIn('portail').find(d => d.type === 'log')! : log;
  expect(sim.trigger(device.id).ok).toBe(true);
  expect(sim.report().mechanicStoppedAt).toBeUndefined();
});

import { expect, it } from 'vitest';
import { concludeNight, newGame } from '../src/core/game';
import { BOSS } from '../src/core/data/enemies';
import { NightSim } from '../src/core/night';
import { deserialize, serialize } from '../src/core/save';
import { sectorOf } from '../src/core/map';
import { layout, operate } from './operator';

it.each([false, true])('plays the night-five delivery with the gate log fired = %s', (fireAtPostman) => {
  const state = { ...layout(newGame(42), 5), day: 5, phase: 'night' as const };
  // Keep the gate clear and put one manual trap beside the doorstep.
  const log = { id: state.yard.nextDeviceId, type: 'log' as const, facing: 0 as const, x: 10, y: 15, hp: 130, broken: false };
  const yard = { ...state.yard, devices: [...state.yard.devices.filter(d => sectorOf(d.x, d.y) !== 'portail'), log], nextDeviceId: log.id + 1 };
  const sim = new NightSim(5, yard, state.seed);
  const stages: string[] = [];
  let waitedAt = 0;
  let elapsed = 0;
  let resumed = false;
  for (let tick = 0; tick < 180 * 60 && sim.outcome === 'ongoing'; tick++) {
    // Defend the other approaches while the postman has the gate.
    for (const device of sim.devices) {
      if (device.id !== log.id && sim.opportunity(device.id).now) sim.trigger(device.id);
    }
    if (sim.waveIndex < 3 || stages.includes('delivered') || stages.includes('missed')) operate(sim);
    sim.step(1 / 60);
    for (const event of sim.drainEvents()) {
      if (event.type === 'log_release' && fireAtPostman && stages.at(-1) === 'waiting') {
        expect(event.sweeps.map(s => s.before.type)).toEqual(expect.arrayContaining(['mail', 'shambler']));
      }
      if (event.type !== 'registered_letter') continue;
      stages.push(event.stage);
      if (event.stage === 'waiting') {
        waitedAt = sim.time;
        expect(sim.report().letterDelivered).toBeUndefined();
        if (fireAtPostman) expect(sim.trigger(log.id).ok).toBe(true);
      } else {
        elapsed = sim.time - waitedAt;
      }
    }
    resumed ||= sim.enemies.some(e => e.type === 'mail' && e.target === 'grange');
  }
  expect(stages).toEqual(['knock', 'knock', 'waiting', fireAtPostman ? 'missed' : 'delivered']);
  if (!fireAtPostman) expect(elapsed).toBeCloseTo(BOSS.mail.signatureSeconds, 1);
  expect(resumed).toBe(true);
  const morning = concludeNight({ ...state, yard }, sim);
  expect(morning.phase).toBe('morning');
  expect(deserialize(serialize(morning))?.lastNight?.letterDelivered).toBe(fireAtPostman ? undefined : true);
});

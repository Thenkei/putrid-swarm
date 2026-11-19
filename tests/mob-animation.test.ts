import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { NightSim } from '../src/core/night';

describe('the deer vault', () => {
  it('records a distance-driven arc when a deer reaches a fence and leaves the fence intact', () => {
    const yard = newGame(42).yard;
    const fence = yard.devices.find((device) => device.type === 'fence')!;
    const devices = Array.from({ length: 22 }, (_, y) => ({ ...fence, id: 100 + y, x: 3, y }));
    const sim = new NightSim(3, { ...yard, devices }, 42);
    for (let tick = 0; tick < 6000; tick++) {
      sim.step(1 / 60);
      const crossing = sim.drainEvents().find((event) => event.type === 'jump');
      if (!crossing) continue;
      const deer = sim.enemies.find((enemy) => enemy.type === 'deer' && enemy.vault);
      expect(deer?.vault).toBeDefined();
      const { start, length } = deer!.vault!;
      expect(start).toBeLessThan(deer!.travel);
      expect(start + length).toBeGreaterThan(deer!.travel);
      const vaulted = sim.devices.find((device) => device.x + 0.5 === crossing.x && device.y + 0.5 === crossing.y);
      expect(vaulted?.hp).toBe(fence.hp);
      return;
    }
    throw new Error('No deer reached the orchard fence');
  });
});

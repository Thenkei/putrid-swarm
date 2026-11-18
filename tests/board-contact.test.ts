import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { BLOW_RECOVERY_SECONDS, NightSim } from '../src/core/night';
import { DefenseMotion } from '../src/render/defenses';

const tick = 1 / 60;

describe('boards under attack', () => {
  it('follows a lone attacker through contact, tension and release while continuous damage keeps ticking', () => {
    const sim = new NightSim(1, { ...newGame(42).yard, devices: [] }, 42);
    const motion = new DefenseMotion();
    const loads: number[] = [];
    let hpAtGrip = 0;
    for (let i = 0; i < 1800 && loads.length < 64; i++) {
      sim.step(tick);
      motion.update(sim);
      const grips = sim.enemies.filter(e => e.gripTarget === 'portail' && e.alive);
      if (grips.length !== 1) continue;
      const board = motion.at('portail')!;
      if (!loads.length) hpAtGrip = board.hp;
      loads.push(board.pullY);
      expect(board.pullX).toBe(0);
      expect(motion.at('grange')!.pullY).toBe(0);
    }
    expect(loads).toHaveLength(64);
    expect(loads[0]).toBe(0);
    const peak = Math.max(...loads);
    expect(peak).toBeGreaterThan(0.95);
    expect(Math.min(...loads.slice(loads.indexOf(peak)))).toBeLessThan(-0.08);
    expect(sim.barricades.portail.hp).toBeLessThan(hpAtGrip);
  });

  it('moves the struck palisade inward on a boar’s impact and holds still during the wind-up', () => {
    const yard = newGame(42).yard;
    const fence = yard.devices.find(d => d.type === 'fence')!;
    const devices = Array.from({ length: 10 }, (_, index) => ({ ...fence, id: index + 1, x: 5, y: index + 5 }));
    const sim = new NightSim(7, { ...yard, devices }, 42);
    const motion = new DefenseMotion();
    let waited = false;
    for (let i = 0; i < 2400; i++) {
      sim.step(tick);
      motion.update(sim);
      const boar = sim.enemies.find(e => e.type === 'boar');
      if (!boar) continue;
      if (boar.action === 'windup') {
        waited = true;
        expect(boar.gripTarget).toBeNull();
      }
      if (boar.blowRecovery !== BLOW_RECOVERY_SECONDS || typeof boar.gripTarget !== 'number') continue;
      const board = motion.at(boar.gripTarget)!;
      expect(waited).toBe(true);
      expect(board.hp).toBeLessThan(fence.hp);
      expect(board.pullX * boar.fx + board.pullY * boar.fy).toBeGreaterThan(0.9);
      expect(motion.at('verger')!.pullX).toBe(0);
      return;
    }
    throw new Error('The boar never hit the orchard palisade');
  });

  it('lets a dog pull the low board while the upper brace stays in its nails', () => {
    const yard = newGame(42).yard;
    const sim = new NightSim(4, { ...yard, devices: [], barricades: { ...yard.barricades, verger: { level: 0, hp: 70 } } }, 42);
    const motion = new DefenseMotion();
    for (let i = 0; i < 3600; i++) {
      sim.step(tick);
      motion.update(sim);
      const attackers = sim.enemies.filter(e => e.alive && e.gripTarget === 'verger');
      if (!attackers.length || attackers.some(e => e.type !== 'dog')) continue;
      const board = motion.at('verger')!;
      if (board.lowPullX > -0.55) continue;
      expect(board.lowPullY).toBe(0);
      expect(board.pullX).toBe(0);
      return;
    }
    throw new Error('No dog pulled the low board on the orchard door');
  });
});

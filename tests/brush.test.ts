import { expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { BrushPassage } from '../src/render/brush';

it('opens the entry hedge locally, rebounds after a footfall and stays still for a stopped walker', () => {
  const game = newGame(42);
  const sim = new NightSim(1, game.yard, game.seed);
  while (!sim.enemies.length && sim.time < 20) sim.step(1 / 60);
  const walker = sim.enemies[0]!;
  expect(walker.target).toBe('portail');
  const brush = new BrushPassage();
  brush.update(0, [walker]);
  const atHedge = (time: number, rot: 0 | 1 = 0) => brush.bend(walker.x + 0.42, walker.y + 0.85, rot, time);
  expect(brush.presence(walker, 0)).toBe(0);
  expect(brush.presence(walker, 0.1)).toBeGreaterThan(0);
  expect(brush.presence(walker, 0.2)).toBe(1);
  expect(atHedge(0)).toBe(0);
  const pushed = atHedge(0.15);
  expect(pushed).toBeGreaterThan(0.5);
  expect(atHedge(0.15, 1)).toBe(-pushed);
  expect(brush.bend(2, 2, 0, 0.15)).toBe(0);
  expect(atHedge(0.56)).toBeLessThan(0);
  // The walker's feet have stopped. Repeated simulation steps must allow the stems to settle.
  brush.update(1, [walker]);
  expect(atHedge(1.15)).toBe(0);
});

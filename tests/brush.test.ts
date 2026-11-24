import { expect, it } from 'vitest';
import { ENEMIES } from '../src/core/data/enemies';
import { newGame } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { GateHedge, GATE_HEDGE } from '../src/render/gate-hedge';
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

it('scatters the same leaves into the lot once per heavy arrival, then lets them settle', () => {
  const game = newGame(42);
  const sim = new NightSim(1, game.yard, game.seed);
  while (!sim.enemies.length && sim.time < 20) sim.step(1 / 60);
  const walker = sim.enemies[0]!;
  const brute = { ...walker, id: walker.id + 1, type: 'brute' as const, def: ENEMIES.brute };
  const brush = new BrushPassage();
  brush.update(0, [walker]);
  expect([...brush.leaves(0.45)]).toEqual([]);
  brush.update(0, [brute]);
  expect([...brush.leaves(0)]).toEqual([]);
  const falling = [...brush.leaves(0.45)];
  expect(falling).toHaveLength(7);
  expect(falling.every(leaf => leaf.y < brute.y && leaf.height > 0 && leaf.alpha > 0)).toBe(true);
  brute.travel += 0.5;
  brush.update(0.45, [brute]);
  expect([...brush.leaves(0.45)]).toEqual(falling);
  brush.update(1.2, [brute]);
  expect([...brush.leaves(1.2)]).toEqual([]);
});

it('passes pressure inwards along the gate hedge only where a moving enemy brushes it', () => {
  const sim = new NightSim(1, newGame(42).yard, 42);
  while (!sim.enemies.length) sim.step(1 / 60);
  const walker = sim.enemies[0]!;
  const hedge = new GateHedge();
  let time = 0;
  const step = (travel: number) => {
    walker.travel += travel;
    hedge.update(time += 1/60, 1/60, [walker]);
  };
  walker.fx = 1; walker.fy = -1;
  const cues = [];
  for (const [index, plant] of GATE_HEDGE.entries()) {
    walker.x = plant.x; walker.y = plant.y;
    for (let i = 0; i < 30; i++) {
      step(.02);
      const cue = hedge.takeSound();
      if (cue) cues.push(cue);
    }
    expect(hedge.bend(index)).toBeGreaterThan(.7);
    if (index === 0) expect(hedge.bend(4)).toBe(0);
  }
  expect(cues).toEqual(['hedge_twig', 'hedge_leaves']);
  for (let i = 0; i < 120; i++) step(0);
  expect(hedge.disturbed(time)).toBe(false);
  expect(Math.abs(hedge.bend(4))).toBeLessThan(.002);
  walker.alive = false;
  for (let i = 0; i < 30; i++) step(.02);
  expect(hedge.takeSound()).toBeUndefined();
});

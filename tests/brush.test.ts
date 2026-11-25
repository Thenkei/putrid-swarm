import { expect, it, vi } from 'vitest';
import { ENEMIES } from '../src/core/data/enemies';
import { newGame } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { build } from '../src/core/yard';
import * as assets from '../src/engine/assets';
import { GateHedge, GATE_HEDGE } from '../src/render/gate-hedge';
import { BrushPassage } from '../src/render/brush';
import { foxHedge } from '../src/render/fox-passage';
import { LogReactions } from '../src/render/log-sweep';
import { project } from '../src/render/projection';

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

it('keeps the same opening in the brush while the log shows an arriving infected before impact', () => {
  const game = newGame(1);
  const built = build({ ...game, inventory: { ...game.inventory, wood: 9, wire: 9, scrap: 9 } }, 'log', 10, 2);
  if (!built.ok) throw Error('Cannot place the rear entry log');
  const sim = new NightSim(3, built.value.yard, 1), brush = new BrushPassage();
  const step = () => { sim.step(1 / 60); brush.update(sim.time, sim.enemies); };
  while (!sim.enemies.length) step();
  const walker = sim.enemies[0]!;
  for (let i = 0; i < 6; i++) step();
  const log = sim.devices.find(d => d.type === 'log' && d.x === 10 && d.y === 2)!;
  expect(sim.trigger(log.id).ok).toBe(true);
  const release = sim.drainEvents().find(e => e.type === 'log_release')!;
  const motion = new LogReactions();
  motion.release(release.contactAt, release.sweeps, sim.time);
  const filmed = motion.enemies(sim.enemies, sim.time).find(e => e.id === walker.id)!;
  expect(filmed).not.toBe(walker);
  const presence = brush.presence(walker, sim.time);
  expect(presence).toBeGreaterThan(0);
  expect(presence).toBeLessThan(1);
  expect(brush.presence(filmed, sim.time)).toBe(presence);
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

it('parts shrubs on opposite shoulders when a walker moves straight towards the camera', () => {
  const sim = new NightSim(1, newGame(42).yard, 42);
  while (!sim.enemies.length) sim.step(1 / 60);
  const walker = sim.enemies[0]!;
  Object.assign(walker, { x: 8.75, y: 16.10, fx: Math.SQRT1_2, fy: Math.SQRT1_2 });
  const hedge = new GateHedge();
  for (let i = 0; i < 40; i++) {
    walker.x += .019; walker.y += .019; walker.travel += Math.SQRT2 * .019;
    hedge.update(i / 60, 1 / 60, [walker]);
  }
  expect(hedge.bend(2)).toBeLessThan(-.18);
  expect(hedge.bend(3)).toBeGreaterThan(.18);
});

it('bends both outer crowns in the fox’s direction, including when the reverse painting is unavailable', () => {
  const loneFace = { img: {} as HTMLImageElement, w: 116, h: 100, footX: .33, footY: .91 };
  const art = vi.spyOn(assets, 'sprite').mockImplementation(key => key.includes('_back_') ? undefined : loneFace);
  try {
    for (const rot of [0, 1] as const) for (const [i, plant] of GATE_HEDGE.entries()) {
      if (plant.foxAt === null) continue;
      const view = { rot, x: 0, y: 0, w: 480, h: 260, zoom: 1.6, cx: 8.7, cy: 16.6 };
      const mount = project(view, plant.x, plant.y);
      let tip = NaN, root = NaN, shear = 0, sign = 1;
      const ctx = { save() {}, restore() {}, translate(x: number, y: number) {
        expect(x).toBeCloseTo(mount.x); expect(y).toBeCloseTo(mount.y);
      }, scale() {}, transform(a: number, _b: number, c: number) { sign = a; shear = c; },
      drawImage(_img: HTMLImageElement, x: number, y: number, w: number, h: number) {
        root = sign * (x + w * loneFace.footX) + shear * (y + h * loneFace.footY);
        tip = sign * (x + w * .5) + shear * y;
      } } as unknown as CanvasRenderingContext2D;
      foxHedge(ctx, view, null, false)[i]!.draw();
      const rest = tip;
      foxHedge(ctx, view, plant.foxAt + .09, false)[i]!.draw();
      expect(root).toBeCloseTo(0);
      expect((tip - rest) * (rot ? -1 : 1)).toBeGreaterThan(1);
    }
  } finally { art.mockRestore(); }
});

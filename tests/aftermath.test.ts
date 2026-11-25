import { afterEach, expect, it, vi } from 'vitest';
import { newGame } from '../src/core/game';
import { ENTRIES, sectorOf } from '../src/core/map';
import { NightSim } from '../src/core/night';
import { deserialize, serialize } from '../src/core/save';
import { SECTOR_IDS, type Decal } from '../src/core/types';
import { doorStance, THRESHOLDS, VISIBLE_DOORS } from '../src/house-layout';
import { drawDecals, drawDoorstepDecals, type DoorstepDecals } from '../src/render/aftermath';
import { project, type View } from '../src/render/projection';

afterEach(() => vi.unstubAllGlobals());

it('keeps the impact position through the fall, end of night and save reload', () => {
  const game = newGame(42);
  const sim = new NightSim(5, { ...game.yard, devices: [] }, 42);
  const checked = new Set<string>();
  for (let i = 0; i < 6000 && checked.size < 2 && sim.outcome === 'ongoing'; i++) {
    sim.step(1 / 60);
    for (const enemy of sim.enemies) {
      const foot = doorStance(enemy);
      const location = foot.threshold ? 'door' : 'yard';
      if (!enemy.alive || checked.has(location) || (foot.threshold && enemy.action !== 'attack')) continue;
      const x = Math.floor(enemy.x), y = Math.floor(enemy.y);
      if (Math.hypot(foot.x - x - .5, foot.y - y - .5) < .25) continue;
      while (enemy.alive) sim.epicStrike(sectorOf(x, y), 'pack', new Set([enemy.id]));
      const death = sim.drainEvents().find(e => e.type === 'enemy_dead' && e.id === enemy.id);
      expect(death?.type).toBe('enemy_dead');
      if (death?.type !== 'enemy_dead') throw new Error('Missing death event');
      expect(death.stain).toBe(sim.decals.at(-1));
      expect(death.stain).toEqual({ kind: 'splat', x, y, at: { x: foot.x, y: foot.y, threshold: foot.threshold } });
      checked.add(location);
    }
  }
  expect(checked).toEqual(new Set(['yard', 'door']));
  const loaded = deserialize(serialize({ ...game, yard: sim.toYard(game.yard) }));
  expect(loaded?.yard.decals).toEqual(sim.decals);
});

it('draws all four old barricade marks at their sills and keeps ordinary device and legacy blood marks on their tiles', () => {
  const noop = () => {};
  const brush = { save: noop, restore: noop, translate: noop, rotate: noop, fillRect: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, fill: noop };
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => brush }) });
  const decals: Decal[] = [
    ...SECTOR_IDS.map(sector => ({ kind: 'debris' as const, ...ENTRIES[sector] })),
    { kind: 'debris', x: 5, y: 9 }, { kind: 'splat', x: 8, y: 6 },
    { kind: 'splat', x: 12, y: 14, at: { x: 12.12, y: 14.86 } },
  ];
  const expected = [...SECTOR_IDS.map(sector => ({ x: THRESHOLDS[sector].gx, y: THRESHOLDS[sector].gy })),
    { x: 5.5, y: 9.5 }, { x: 8.5, y: 6.5 }, { x: 12.12, y: 14.86 }];
  for (const rot of [0, 1] as const) {
    const view: View = { rot, zoom: rot ? .8 : 1.45, cx: 10.7, cy: 12.3, x: 27, y: 68, w: 700, h: 420 };
    let matrix: number[] = [];
    const roots: { x: number; y: number }[] = [];
    const jambs: { x: number; y: number }[] = [];
    const ctx = { save: noop, restore: noop, rotate: noop, drawImage: noop,
      beginPath: noop, moveTo: (x: number, y: number) => jambs.push({ x, y }), lineTo: noop, closePath: noop, clip: noop,
      transform: (...args: number[]) => { matrix = args; },
      translate: (x: number, y: number) => roots.push({
        x: matrix[0]! * x + matrix[2]! * y + matrix[4]!,
        y: matrix[1]! * x + matrix[3]! * y + matrix[5]!,
      }) };
    drawDecals(ctx as unknown as CanvasRenderingContext2D, view, decals);
    expect(roots).toHaveLength(expected.length);
    for (const [i, point] of expected.entries()) {
      const p = project(view, point.x, point.y);
      expect(roots[i]!.x).toBeCloseTo(p.x, 8);
      expect(roots[i]!.y).toBeCloseTo(p.y, 8);
    }
    roots.length = 0;
    const steps: DoorstepDecals = {};
    drawDecals(ctx as unknown as CanvasRenderingContext2D, view, decals, steps);
    expect(roots).toHaveLength(decals.length - 2);
    expect(Object.keys(steps).sort()).toEqual([...VISIBLE_DOORS[rot]].sort());
    drawDoorstepDecals(ctx as unknown as CanvasRenderingContext2D, view, steps);
    expect(roots).toHaveLength(decals.length);
    for (const [i, sector] of VISIBLE_DOORS[rot].entries()) {
      const door = THRESHOLDS[sector], p = project(view, door.gx, door.gy);
      expect(roots.at(i - 2)!.x).toBeCloseTo(p.x, 8);
      expect(roots.at(i - 2)!.y).toBeCloseTo(p.y, 8);
      expect(jambs[i]!.y + (p.x - jambs[i]!.x) * door.slope).toBeCloseTo(p.y, 8);
    }
  }
});

it('registers the interruption on the mower when it jams at a real door', () => {
  const sim = new NightSim(2, { ...newGame(42).yard, devices: [] }, 42);
  for (let i = 0; i < 18000 && sim.outcome === 'ongoing'; i++) {
    sim.step(1 / 60);
    const interrupt = sim.drainEvents().find(e => e.type === 'interrupt');
    if (interrupt?.type !== 'interrupt') continue;
    const mower = sim.enemies.find(e => e.type === 'mower')!;
    const label = doorStance(interrupt.pose), foot = doorStance(mower);
    expect(label.threshold).toBe(mower.boss!.sector);
    expect(label.x).toBeCloseTo(foot.x);
    expect(label.y).toBeCloseTo(foot.y);
    expect(Math.hypot(label.x - interrupt.x, label.y - interrupt.y)).toBeGreaterThan(.5);
    return;
  }
  throw new Error('The mower never reached its door');
});

import { expect, it, vi } from 'vitest';
import { newGame, startNight } from '../src/core/game';
import { NightSim, type SimEvent } from '../src/core/night';
import { rattleForNight, rigRattle } from '../src/core/rattle';
import { deserialize, serialize } from '../src/core/save';
import { cameraView } from '../src/render/projection';
import { drawRattle } from '../src/render/rattle';

it('pays once, survives a reload and is offered again the next day', () => {
  const state = newGame(42);
  expect(rattleForNight(state)).toBeNull();
  expect(rigRattle({ ...state, hoursLeft: 0.2 }, 'grange')).toBeNull();
  expect(rigRattle({ ...state, where: 'garage' }, 'grange')).toBeNull();
  expect(rigRattle({ ...state, inventory: { ...state.inventory, wire: 0 } }, 'grange')).toBeNull();
  const rigged = rigRattle(state, 'grange')!;
  expect(rigged.hoursLeft).toBe(state.hoursLeft - 0.25);
  expect(rigged.inventory.wire).toBe(state.inventory.wire - 1);
  expect(rigRattle(rigged, 'portail')).toBeNull();
  const evening = startNight(rigged);
  if (!evening.ok) throw new Error('The night could not start');
  expect(rattleForNight(deserialize(serialize(evening.value))!)).toBe('grange');
  const tomorrow = { ...rigged, day: 2 };
  expect(rattleForNight(tomorrow)).toBeNull();
  expect(rigRattle(tomorrow, 'portail')).not.toBeNull();
});

it('sounds once on the rigged hedge, even if a prowler flanks towards another door', () => {
  const state = newGame(42);
  const yard = { ...state.yard, barricades: {
    ...state.yard.barricades,
    arriere: { ...state.yard.barricades.arriere, hp: 1 },
  } };
  const sim = new NightSim(3, yard, state.seed, null, null, null, null, 'verger');
  const events: SimEvent[] = [];
  while (sim.time < 17 && sim.outcome === 'ongoing') {
    sim.step(1 / 60);
    events.push(...sim.drainEvents());
  }
  const spawns = events.filter(event => event.type === 'spawn');
  expect(spawns[0]?.sector).toBe('arriere');
  expect(spawns.filter(event => event.sector === 'verger').length).toBeGreaterThan(1);
  expect(events.filter(event => event.type === 'rattle')).toEqual([{ type: 'rattle', sector: 'verger' }]);
  expect(sim.rattleAt).not.toBeNull();
  expect(sim.enemies.some(enemy => enemy.type === 'dog' && enemy.target === 'arriere')).toBe(true);
});

it('keeps the tin tied to the wire before and after a strike in both yard views', () => {
  for (const struckAt of [null, 0]) {
    const tilt: number[] = [];
    for (const camera of ['portail', 'arriere'] as const) {
      const ctx = {
        save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(),
        scale: vi.fn(), translate: vi.fn<(x: number, y: number) => void>(), rotate: vi.fn<(a: number) => void>(),
        moveTo: vi.fn<(x: number, y: number) => void>(), lineTo: vi.fn(),
        quadraticCurveTo: vi.fn<(cx: number, cy: number, x: number, y: number) => void>(),
      };
      const view = cameraView(camera, { x: 40, y: 10, w: 640, h: 480 }, 1.22);
      drawRattle(ctx as unknown as CanvasRenderingContext2D, view, { sector: 'grange', struckAt }, .27);
      const [, startY] = ctx.moveTo.mock.calls[2]!;
      const [, controlY, endX, endY] = ctx.quadraticCurveTo.mock.calls[0]!;
      const [tieX, tieY] = ctx.translate.mock.calls[1]!;
      const t = tieX / endX;
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
      expect(tieY).toBeCloseTo((1 - t) ** 2 * startY + 2 * (1 - t) * t * controlY + t ** 2 * endY);
      tilt.push(ctx.rotate.mock.calls[0]![0]);
    }
    expect(tilt[0]! + tilt[1]!).toBeCloseTo(0);
  }
});

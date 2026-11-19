import { expect, it } from 'vitest';
import { previewHornTurn } from '../src/core/horn-preview';
import { idx } from '../src/core/map';

it('shows the first steps of a busy walker turning around an intact fence', () => {
  const horn = { x: 8, y: 17 };
  const start = { x: 11, y: 18 };
  const route = [start, { x: 11, y: 17 }, { x: 11, y: 16 }];
  const traffic = new Map([[idx(11, 18), 5], [idx(11, 17), 2]]);
  const clear = previewHornTurn(horn, [route], traffic, new Set());
  const detour = previewHornTurn(horn, [route], traffic, new Set([idx(10, 18)]));
  expect(clear).toEqual([start, { x: 10, y: 17 }, { x: 9, y: 17 }, horn]);
  // The fence delays the turn by a cell. The walker continues up the main track until it clears the corner.
  expect(detour).toEqual([{ x: 11, y: 17 }, { x: 10, y: 17 }, { x: 9, y: 17 }, horn]);
});

it('leaves the arrow away from walks outside hearing or pointed toward the horn already', () => {
  const route = [{ x: 10, y: 20 }, { x: 10, y: 19 }, { x: 10, y: 18 }];
  const traffic = new Map([[idx(10, 20), 1], [idx(10, 19), 1]]);
  expect(previewHornTurn({ x: 3, y: 6 }, [route], traffic, new Set())).toEqual([]);
  expect(previewHornTurn(route[2]!, [route], traffic, new Set())).toEqual([]);
});

import { expect, it } from 'vitest';
import { blowChiefWhistle, whistleInGrass } from '../src/core/chief-whistle';
import { newGame, settleRadio, startNextDay } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { opensRadio } from '../src/core/radio';
import { deserialize, serialize } from '../src/core/save';
import type { GameState } from '../src/core/types';
import { hitsWhistle } from '../src/render/fallen-whistle';
import { project, unproject, type View } from '../src/render/projection';

const at = { x: 8.72, y: 4.31 };

it('keeps the end of the fallen whistle cord selectable at the same spot on the ground after a half-turn', () => {
  const front: View = { rot: 0, zoom: 1, cx: at.x, cy: at.y, x: 0, y: 0, w: 400, h: 300 };
  const root = project(front, at.x, at.y);
  // The leather tip is 20 px right and 9 px up from the brass in the front view.
  const tip = unproject(front, root.x + 20, root.y - 9);
  const empty = unproject(front, root.x - 20, root.y + 9);
  for (const rot of [0, 1] as const) for (const zoom of [.7, 1.5]) {
    const view = { ...front, cx: at.x + .5, rot, zoom };
    const cord = project(view, tip.gx, tip.gy);
    const ground = project(view, empty.gx, empty.gy);
    expect(hitsWhistle(view, at, cord.x, cord.y)).toBe(true);
    expect(hitsWhistle(view, at, ground.x, ground.y)).toBe(false);
  }
});

function morning() {
  const base = newGame(7);
  const report = { ...new NightSim(6, base.yard, base.seed).report(), night: 6, survived: true, bossDefeated: 'chief' as const, chiefFellAt: at };
  return opensRadio({ ...base, day: 6, phase: 'morning', lastNight: report }, report);
}

it('leaves the whistle exactly where the Chief fell until the player actually blows it after the CB', () => {
  const dawn = morning();
  expect(whistleInGrass(dawn)).toEqual(at);
  expect(blowChiefWhistle(dawn)).toBe(dawn);
  expect(startNextDay(dawn)).toBe(dawn);
  const settled = settleRadio(dawn, { ending: 'off', answer: null, sighted: [], hours: .5 });
  if (!settled.ok) throw new Error('Radio never opened');
  const day = deserialize(serialize(settled.value))!;
  expect(whistleInGrass(day)).toEqual(at);
  expect(whistleInGrass({ ...day, where: 'police' })).toBeNull();
  const blown = blowChiefWhistle(day);
  expect(blown).toEqual({ ...day, flags: { ...day.flags, chiefWhistleBlown: 1 } });
  const reloaded = deserialize(serialize(blown))!;
  expect(whistleInGrass(reloaded)).toBeNull();
  expect(blowChiefWhistle(reloaded)).toBe(reloaded);
});

it('never invents a fall for an escape, defeat elsewhere or old save with only a boss name', () => {
  const dawn = morning(), report = dawn.lastNight!;
  const { chiefFellAt: _position, ...legacy } = report;
  for (const variant of [legacy, { ...report, bossDefeated: null }, { ...report, night: 3 },
    { ...report, chiefFellAt: { x: -1, y: 6 } }, { ...report, chiefFellAt: { x: 9, y: 25 } }]) {
    const loaded = deserialize(serialize({ ...dawn, lastNight: variant } as GameState))!;
    expect(loaded.lastNight?.chiefFellAt).toBeUndefined();
    expect(whistleInGrass(loaded)).toBeNull();
  }
  expect(whistleInGrass({ ...dawn, lastNight: { ...report, survived: false } })).toBeNull();
});

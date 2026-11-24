import { expect, it } from 'vitest';
import { blowChiefWhistle, whistleInGrass } from '../src/core/chief-whistle';
import { newGame, settleRadio, startNextDay } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { opensRadio } from '../src/core/radio';
import { deserialize, serialize } from '../src/core/save';
import type { GameState } from '../src/core/types';

const at = { x: 8.72, y: 4.31 };
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

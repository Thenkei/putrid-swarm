import { expect, it } from 'vitest';
import { newGame, retryChapter, settleShed, startNextDay } from '../src/core/game';
import { pinnedInvoice, recordMechanicGift } from '../src/core/mechanic-invoice';
import { NightSim } from '../src/core/night';
import { deserialize, serialize } from '../src/core/save';
import type { GameState, SectorId } from '../src/core/types';

function dawn(sector: SectorId = 'verger'): GameState {
  const state = newGame(4);
  const report = new NightSim(4, state.yard, state.seed).report();
  const flags = recordMechanicGift(recordMechanicGift({}, { scrap: 2 }), { springs: 1 });
  return { ...state, flags, phase: 'morning', day: 4, shed: 'waiting',
    lastNight: { ...report, survived: true, mechanicStoppedAt: sector } };
}

it('keeps the invoice on the stopped door through a shed death, replay and day-five save', () => {
  const state = dawn();
  const bill = { sector: 'verger', springs: 1, scrap: 2, unitemized: 0 };
  expect(pinnedInvoice(state)).toEqual(bill);
  expect(startNextDay(state)).toBe(state);
  const death = settleShed(state, { ending: 'bitten', learned: [], hours: 1 });
  if (!death.ok) throw new Error('shed did not open');
  expect(pinnedInvoice(death.value)).toBeNull();
  const again = retryChapter(death.value);
  if (!again.ok) throw new Error('shed could not be replayed');
  expect(pinnedInvoice(again.value.state)).toEqual(bill);
  const day = settleShed(again.value.state, { ending: 'freed', learned: [], hours: 1 });
  if (!day.ok) throw new Error('shed did not close');
  const saved = deserialize(serialize(day.value))!;
  expect(saved.day).toBe(5);
  expect(pinnedInvoice(saved)).toEqual(bill);
  expect(saved.inventory).toEqual(state.inventory);
  expect(pinnedInvoice({ ...saved, day: 6 })).toBeNull();
});

it('requires a survived fourth night, a stopped strike and a garage bill', () => {
  const state = dawn('arriere');
  const { mechanicStoppedAt: _sector, ...withoutStop } = state.lastNight!;
  expect(pinnedInvoice({ ...state, lastNight: null })).toBeNull();
  expect(pinnedInvoice({ ...state, flags: {} })).toBeNull();
  expect(pinnedInvoice({ ...state, lastNight: { ...withoutStop, bossDefeated: 'mechanic' } })).toBeNull();
  expect(pinnedInvoice({ ...state, lastNight: { ...state.lastNight!, survived: false } })).toBeNull();
  expect(pinnedInvoice({ ...state, lastNight: { ...state.lastNight!, night: 3 } })).toBeNull();
  expect(pinnedInvoice({ ...state, phase: 'night' })).toBeNull();
});

it('retains unreadable old slips without turning them into parts', () => {
  const state = dawn('grange');
  const flags = recordMechanicGift({ bills: 2 }, { springs: 1 });
  expect(pinnedInvoice({ ...state, flags })).toEqual({ sector: 'grange', springs: 1, scrap: 0, unitemized: 2 });
});

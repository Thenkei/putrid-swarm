// Dev aid: prints saves around the radio for tools/radio-shots.mjs.
//   tsx tools/radio-saves.ts
import { LAST_NIGHT } from '../src/core/data/waves';
import { newGame, settleRadio } from '../src/core/game';
import { QUIET_RADIO, RADIO, type AnswerId, type Call, type CallerId, type Ending } from '../src/core/radio';
import { serialize } from '../src/core/save';
import type { GameState, NightReport, SectorId, Standing } from '../src/core/types';
import { layout } from '../tests/operator';

const report: NightReport = {
  night: RADIO.night,
  survived: true,
  kills: { shambler: 30, runner: 8, dog: 4, brute: 2, chief: 1 },
  breaches: 1,
  houseDamage: 9,
  devicesBroken: 4,
  barricadeDamage: { portail: 40, grange: 12, arriere: 66, verger: 20 },
  triggers: 14,
  autoTriggers: 19,
  bossDefeated: 'chief',
  durationSeconds: 140,
  cameraLost: null,
  traps: {},
};

const people = (dealer: Standing | null, camper: Standing | null): GameState['people'] => ({
  ...(dealer ? { dealer: { standing: dealer, met: 2, fought: dealer === 'grudge' } } : {}),
  ...(camper ? { camper: { standing: camper, met: 1, fought: false } } : {}),
});
const base: GameState = { ...layout(newGame(13), 5), day: RADIO.night, orchard: 'spared', shed: 'chained' };
const call = (caller: CallerId, secret: boolean, baker = false): Call => ({ caller, secret, at: 0.66, phase: 0.8, news: 0.27, baker: baker ? 0.4 : null });
/** The morning after night 6, a voice on the set. */
const morning = (c: Call, standing: GameState['people'], extra: Partial<GameState> = {}): GameState => ({
  ...base,
  ...extra,
  people: standing,
  phase: 'morning',
  hoursLeft: 0,
  lastNight: report,
  radio: { ...QUIET_RADIO, stage: 'waiting', call: c },
});
/** The last day after a call, as the scene would have settled it. */
const day = (c: Call, standing: GameState['people'], ending: Ending, answer: AnswerId | null, sighted: SectorId[] = []): GameState => {
  const settled = settleRadio(morning(c, standing), { ending, answer, sighted, hours: 1 });
  if (!settled.ok) throw new Error('could not settle');
  return settled.value;
};
/** The last evening with nothing left standing: the house falls within seconds, the mower comes out. */
const door = { hp: 1, level: 0 } as const;
const doomed = (state: GameState): GameState => ({ ...state, hoursLeft: 0, yard: { ...state.yard, devices: [], houseHp: 4, barricades: { portail: door, grange: door, arriere: door, verger: door } } });
const shedDay = day(call('camper_owes', true), people(null, 'owes'), 'bargained', 'shed');
const lostLast: GameState = { ...day(call('camper_owes', false), people(null, 'owes'), 'trusted', 'shelter'), phase: 'lost', lastNight: { ...report, night: LAST_NIGHT, survived: false } };

console.log(
  JSON.stringify({
    ham: serialize(morning(call('ham', false), {})),
    baker: serialize(morning(call('ham', false, true), people('stranger', 'stranger'), { shed: 'freed' })),
    dealerOwes: serialize(morning(call('dealer_owes', true), people('owes', null))),
    camperOwes: serialize(morning(call('camper_owes', true), people(null, 'owes'))),
    dealerGrudge: serialize(morning(call('dealer_grudge', true), people('grudge', 'stranger'))),
    camperGrudge: serialize(morning(call('camper_grudge', false), people('stranger', 'grudge'))),
    oneArm: serialize(morning(call('camper_owes', false), people(null, 'owes'), { orchard: 'maimed' })),
    dayLookout: serialize(day(call('ham', false), {}, 'trusted', 'stay', ['portail', 'arriere', 'grange'])),
    dayVisit: serialize(day(call('dealer_owes', true), people('owes', null), 'trusted', 'address')),
    dayAlly: serialize(day(call('camper_owes', true), people(null, 'owes'), 'trusted', 'shelter')),
    eveningAlly: serialize({ ...day(call('camper_owes', true), people(null, 'owes'), 'trusted', 'shelter'), hoursLeft: 0 }),
    dayGuest: serialize(shedDay),
    doomedGuest: serialize(doomed(shedDay)),
    endHeld: serialize(lostLast),
  }),
);

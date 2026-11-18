// Dev aid: prints saves around the orchard and the end, for tools/orchard-shots.mjs and tools/finale-shots.mjs.
//   tsx tools/orchard-saves.ts
import { newGame, startNight } from '../src/core/game';
import { ORCHARD } from '../src/core/orchard';
import { serialize } from '../src/core/save';
import type { GameState, NightReport } from '../src/core/types';
import { layout } from '../tests/operator';

const report: NightReport = {
  night: ORCHARD.night,
  survived: true,
  kills: { shambler: 22, runner: 9, mower: 1 },
  breaches: 0,
  houseDamage: 0,
  devicesBroken: 2,
  barricadeDamage: { portail: 12, grange: 0, arriere: 6, verger: 0 },
  triggers: 7,
  autoTriggers: 11,
  bossDefeated: 'mower',
  durationSeconds: 96,
  cameraLost: ORCHARD.sector,
  traps: {},
};

const base: GameState = { ...layout(newGame(7), 3), day: ORCHARD.night };
/** The morning after night 2, the orchard camera dark. */
const morning: GameState = { ...base, phase: 'morning', hoursLeft: 0, lastNight: report, orchard: 'cut' };
/** The evening of day 2: the night in which the camera goes. */
const evening: GameState = { ...base, hoursLeft: 0 };
const started = startNight(evening);
if (!started.ok) throw new Error('could not start the night');

/** An evening with nothing left standing, for tools/finale-shots.mjs: the house falls within seconds. */
const door = { hp: 1, level: 0 } as const;
const doomed = (day: number, orchard: GameState['orchard']): GameState => ({
  ...newGame(9),
  day,
  hoursLeft: 0,
  orchard,
  yard: { ...newGame(9).yard, devices: [], houseHp: 4, barricades: { portail: door, grange: door, arriere: door, verger: door } },
});

/** The evening of the seventh day with a house that cannot fall, for the seventh dawn: the night is held whatever happens. */
const unbreakable = { hp: 100000, level: 1 } as const;
const lastEvening: GameState = {
  ...layout(newGame(11), 3),
  day: 7,
  hoursLeft: 0,
  orchard: 'spared',
  yard: { ...layout(newGame(11), 3).yard, houseHp: 100000, barricades: { portail: unbreakable, grange: unbreakable, arriere: unbreakable, verger: unbreakable } },
};

/** Finished runs, as the end screen reopens them: the orchard's three deaths, and a run saved as `won` before there was no winning. */
const over = (patch: Partial<GameState>): string => serialize({ ...morning, ...patch });

console.log(
  JSON.stringify({
    morning: serialize(morning),
    evening: serialize(evening),
    doomedEarly: serialize(doomed(3, 'spared')),
    doomedLate: serialize(doomed(5, 'spared')),
    doomedOneArm: serialize(doomed(6, 'maimed')),
    lastEvening: serialize(lastEvening),
    fateThroat: over({ phase: 'lost', fate: 'throat' }),
    fateTurned: over({ phase: 'lost', fate: 'turned' }),
    fateBled: over({ phase: 'lost', fate: 'bled' }),
    legacyWon: JSON.stringify({ ...JSON.parse(serialize({ ...base, day: 7, phase: 'held', hoursLeft: 0 })), phase: 'won' }),
  }),
);

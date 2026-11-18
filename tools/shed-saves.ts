// Dev aid: prints saves around the shed for tools/shed-shots.mjs.
//   tsx tools/shed-saves.ts
import { BOSS_NIGHT } from '../src/core/data/locations';
import { newGame } from '../src/core/game';
import { SHED } from '../src/core/shed';
import { serialize } from '../src/core/save';
import type { GameState, NightReport } from '../src/core/types';
import { layout } from '../tests/operator';

const report: NightReport = {
  night: SHED.night,
  survived: true,
  kills: { shambler: 24, dog: 9, boar: 2, deer: 4, runner: 5, brute: 1, mechanic: 1 },
  breaches: 0,
  houseDamage: 4,
  devicesBroken: 3,
  barricadeDamage: { portail: 10, grange: 22, arriere: 4, verger: 0 },
  triggers: 9,
  autoTriggers: 14,
  bossDefeated: 'mechanic',
  durationSeconds: 104,
  cameraLost: null,
  traps: {},
};

const base: GameState = { ...layout(newGame(11), 4), day: SHED.night, orchard: 'spared' };
/** The morning after night 4, someone chained in the shed. */
const morning: GameState = { ...base, phase: 'morning', hoursLeft: 0, lastNight: report, shed: 'waiting' };
/** The same, for a protagonist the orchard left with one arm. */
const oneArm: GameState = { ...morning, orchard: 'maimed' };
/** The chief's day, after a baker who talked about him, and was let go. */
const chiefDay: GameState = { ...base, day: BOSS_NIGHT.chief, phase: 'day', hoursLeft: 11, shed: 'freed', intel: ['stash', 'tonight', 'chief'] };

console.log(JSON.stringify({ morning: serialize(morning), oneArm: serialize(oneArm), chiefDay: serialize(chiefDay) }));

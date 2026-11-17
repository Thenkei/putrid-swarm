// Dev aid: prints one-armed saves for tools/arm-shots.mjs — every screen the protagonist is seen on, after the orchard.
//   tsx tools/arm-saves.ts
import { leaveLocation, newGame } from '../src/core/game';
import { ORCHARD, daylight } from '../src/core/orchard';
import { serialize } from '../src/core/save';
import type { GameState, Inventory, NightReport } from '../src/core/types';
import { layout } from '../tests/operator';

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
const stock = (patch: Partial<Inventory>): Inventory => ({ wood: 0, scrap: 0, springs: 0, wire: 0, battery: 0, ...patch });
const DAY = ORCHARD.night + 2;

const report: NightReport = {
  night: DAY - 1,
  survived: true,
  kills: { shambler: 18, runner: 6, brute: 2 },
  breaches: 0,
  houseDamage: 8,
  devicesBroken: 1,
  barricadeDamage: { portail: 30, grange: 12, arriere: 0, verger: 4 },
  triggers: 9,
  autoTriggers: 14,
  bossDefeated: null,
  durationSeconds: 120,
  cameraLost: null,
};

const maimed: GameState = { ...layout(newGame(7), 3), day: DAY, orchard: 'maimed', totals: { kills: 40, triggers: 20, searches: 9 } };
/** At the refuge with the day ahead, for the map, a drive and a search. */
const day: GameState = { ...maimed, hoursLeft: daylight(maimed) };
/** The evening, everything built: the night is one click away. */
const evening: GameState = { ...maimed, hoursLeft: 0 };
/** The morning report. */
const morning: GameState = { ...maimed, day: DAY - 1, phase: 'morning', hoursLeft: 0, lastNight: report };
/** Home from the garage with a loaded boot, the road already crossed once today: nobody bars it again. */
const loaded: GameState = {
  ...maimed,
  flags: { ambushes: 1, [`ambush:${DAY}`]: 1 },
  where: 'garage',
  hoursLeft: 4,
  outing: { to: 'garage', trunk: stock({ scrap: 4, springs: 3, battery: 1 }), parted: stock({}), major: false, marks: [] },
};

/** The van from another town, on the way home. */
let van: GameState | null = null;
for (let seed = 1; seed < 400 && !van; seed++) {
  const out = unwrap(
    leaveLocation({
      ...maimed,
      rng: seed,
      flags: { ambushes: 1 },
      people: { camper: { standing: 'grudge', met: 1, fought: false } },
      where: 'grocery',
      hoursLeft: 5,
      outing: { to: 'grocery', trunk: stock({ wood: 5, scrap: 3, springs: 3, battery: 2, wire: 2 }), parted: stock({}), major: false, marks: [] },
    }),
  ).state;
  if (out.encounter?.kind === 'ambush' && out.encounter.group === 'van') van = out;
}

console.log(JSON.stringify({ day: serialize(day), evening: serialize(evening), morning: serialize(morning), loaded: serialize(loaded), van: van && serialize(van) }));

// Dev aid: prints saves that open straight on an encounter, for tools/encounter-shots.mjs.
//   tsx tools/encounter-saves.ts
import { leaveLocation, newGame, travelTo } from '../src/core/game';
import { serialize } from '../src/core/save';
import type { GameState, Inventory } from '../src/core/types';

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
const stock = (patch: Partial<Inventory>): Inventory => ({ wood: 0, scrap: 0, springs: 0, wire: 0, battery: 0, ...patch });
const seen = { kills: 0, triggers: 0, searches: 2 };

/** The dealer at the hardware shop, first meeting. */
const dispute = unwrap(travelTo({ ...newGame(7), totals: seen }, 'hardware')).state;

/** The camper at the grocery on day 3, the dealer already met today. */
const camperBase: GameState = { ...newGame(11), day: 3, totals: seen, flags: { disputes: 1, 'rival:dealer:3': 1 } };
let camper: GameState | null = null;
for (let seed = 1; seed < 200 && !camper; seed++) {
  const out = unwrap(travelTo({ ...camperBase, rng: seed }, 'grocery')).state;
  if (out.encounter?.kind === 'dispute' && out.encounter.rival === 'camper') camper = out;
}

const loaded = (day: number, flags: GameState['flags'], rng: number, people: GameState['people'] = {}): GameState => ({
  ...newGame(5),
  day,
  rng,
  flags,
  people,
  where: 'grocery',
  hoursLeft: 5,
  outing: { to: 'grocery', trunk: stock({ wood: 5, scrap: 3, springs: 3, battery: 2, wire: 2 }), parted: stock({}), major: false, marks: [] },
});

/** The neighbours' roadblock, the dealer among them owing a favour. */
const committee = unwrap(leaveLocation(loaded(2, {}, 3, { dealer: { standing: 'owes', met: 1, fought: false } }))).state;

/** The van from another town. */
let van: GameState | null = null;
for (let seed = 1; seed < 400 && !van; seed++) {
  const out = unwrap(leaveLocation(loaded(4, { ambushes: 1 }, seed, { camper: { standing: 'grudge', met: 1, fought: false } }))).state;
  if (out.encounter?.kind === 'ambush' && out.encounter.group === 'van') van = out;
}

/** At the refuge on day 1 after one plain rummage: the next drive to the hardware shop meets the dealer. */
const home: GameState = { ...newGame(7), totals: seen, hoursLeft: 10 };

console.log(JSON.stringify({ home: serialize(home), dispute: serialize(dispute), camper: camper && serialize(camper), committee: serialize(committee), van: van && serialize(van) }));

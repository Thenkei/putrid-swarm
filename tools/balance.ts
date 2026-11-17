// Headless balance sweep: every night against reference layouts, played by the automatic operator.
//   pnpm balance             every night against every reference tier
//   pnpm balance --arm       two arms against one, night by night, each with the yard its daylight pays for
//   pnpm balance --radio     the last night with nobody, a door held by someone from the radio, and one held by someone bitten
import { ONE_HAND } from '../src/core/data/desk';
import { LAST_NIGHT } from '../src/core/data/waves';
import { newGame } from '../src/core/game';
import { NightSim, type OneHand } from '../src/core/night';
import { ORCHARD } from '../src/core/orchard';
import { RADIO, type Ally } from '../src/core/radio';
import type { YardState } from '../src/core/types';
import { UPKEEP_HOURS, daylightOfDays, layout, layoutCost, operate, operateDesk, tierOf, yardBy, type Tier } from '../tests/operator';

const MAX_TICKS = 60 * 900;

if (process.argv.includes('--arm')) armSweep();
else if (process.argv.includes('--radio')) radioSweep();
else tierSweep();

function tierSweep(): void {
  const TIERS: Tier[] = [0, 1, 2, 3, 4, 5, 6];
  console.log('night | ' + TIERS.map((t) => `tier ${t}`.padEnd(30)).join('| '));
  for (let night = 1; night <= 7; night++) {
    const cells = TIERS.map((tier) => {
      const results: string[] = [];
      for (const seed of [11, 22, 33]) {
        const state = layout(newGame(seed), tier);
        const sim = new NightSim(night, state.yard, seed);
        for (let t = 0; t < MAX_TICKS && sim.outcome === 'ongoing'; t++) {
          operate(sim);
          sim.step(1 / 60);
        }
        const r = sim.report();
        const worstDoor = Math.min(...Object.values(sim.barricades).map((b) => Math.round(b.hp)));
        results.push(`${sim.outcome === 'survived' ? 'W' : 'L'}${Math.round(sim.houseHp)}/${worstDoor}/${r.durationSeconds}`);
      }
      return results.join(' ').padEnd(30);
    });
    console.log(`  ${night}   | ${cells.join('| ')}`);
  }
  for (const tier of TIERS) console.log(`tier ${tier} cost`, JSON.stringify(layoutCost(layout(newGame(1), tier))));
}

/** One night at the desk, over several seeds: wins, the house left standing on average, and at worst. */
interface Outcome {
  readonly wins: number;
  readonly house: number;
  readonly worst: number;
}

function play(night: number, yard: (seed: number) => YardState, hand: OneHand | null, seeds: readonly number[], ally: Ally | null = null): Outcome {
  let wins = 0;
  let house = 0;
  let worst = Infinity;
  for (const seed of seeds) {
    const sim = new NightSim(night, yard(seed), seed, null, hand, ally);
    for (let t = 0; t < MAX_TICKS && sim.outcome === 'ongoing'; t++) {
      operateDesk(sim);
      sim.step(1 / 60);
    }
    if (sim.outcome === 'survived') wins++;
    house += Math.round(sim.houseHp);
    worst = Math.min(worst, Math.round(sim.houseHp));
  }
  return { wins, house: Math.round(house / seeds.length), worst };
}

/**
 * Two arms against one, night by night, with the operator bound to the desk (one camera at a time):
 * the one-armed run once with the two-armed yard (what the desk alone costs) and once with the yard
 * its own daylight pays for (everything the arm costs). Yards come from `yardBy`: see tests/operator.ts.
 */
function armSweep(): void {
  const seeds = Array.from({ length: 16 }, (_, i) => 11 * (i + 1));
  const two = daylightOfDays(2, LAST_NIGHT);
  const one = daylightOfDays(1, LAST_NIGHT);
  console.log(`one hand: ${ONE_HAND.crossSeconds} s to cross rows · faint ${ORCHARD.faintHours} h · dressing ${ORCHARD.dressingHours} h · upkeep ${UPKEEP_HOURS} h a day · ${seeds.length} seeds`);
  console.log('night | daylight 2/1 | yard 2 arms | yard 1 arm || 2 arms           | 1 arm, 2-arm yard | 1 arm, own yard');
  const cell = (r: Outcome) => `${r.wins}/${seeds.length} ⌂${String(r.house).padStart(3)} ≥${String(r.worst).padStart(3)}`.padEnd(17);
  const lost = { a: 0, b: 0, c: 0 };
  let sumTwo = 0;
  let sumOne = 0;
  for (let night = 1; night <= LAST_NIGHT; night++) {
    sumTwo += two[night - 1] as number;
    sumOne += one[night - 1] as number;
    const yardTwo = (seed: number) => yardBy(newGame(seed), two, night).state.yard;
    const yardOne = (seed: number) => yardBy(newGame(seed), one, night).state.yard;
    const maimed = night > ORCHARD.night;
    const a = play(night, yardTwo, null, seeds);
    const b = maimed ? play(night, yardTwo, ONE_HAND, seeds) : a;
    const c = maimed ? play(night, yardOne, ONE_HAND, seeds) : a;
    if (maimed) {
      lost.a += 100 - a.house;
      lost.b += 100 - b.house;
      lost.c += 100 - c.house;
    }
    console.log(
      `  ${night}   | ${`${sumTwo}/${sumOne} h`.padEnd(12)} | ${tierOf(yardBy(newGame(1), two, night).steps).padEnd(11)} | ${tierOf(yardBy(newGame(1), one, night).steps).padEnd(10)} || ${cell(a)}| ${cell(b).padEnd(18)}| ${cell(c)}`,
    );
  }
  console.log(`house lost on nights ${ORCHARD.night + 1}-${LAST_NIGHT}, on average: two arms ${lost.a} · one arm, two-arm yard ${lost.b} · one arm ${lost.c}`);
}

/**
 * The last night with what the radio can put at a door: nobody, someone holding it to the end, or someone
 * bitten who holds it until a wave and then turns. Two arms and one, each with the yard its daylight pays for.
 */
function radioSweep(): void {
  const seeds = Array.from({ length: 16 }, (_, i) => 11 * (i + 1));
  const door = RADIO.ally.door;
  const held: Ally = { sector: door, factor: RADIO.ally.factor, turnsAtWave: null, loss: RADIO.ally.turnLoss };
  const turned: Ally = { ...held, turnsAtWave: RADIO.ally.turnWave };
  const cell = (r: Outcome) => `${r.wins}/${seeds.length} ⌂${String(r.house).padStart(3)} ≥${String(r.worst).padStart(3)}`.padEnd(17);
  console.log(`night ${LAST_NIGHT}, the ${door} door held at ×${RADIO.ally.factor}, turning at wave ${RADIO.ally.turnWave} (−${RADIO.ally.turnLoss * 100} % of that barricade) · ${seeds.length} seeds`);
  console.log('arms | nobody           | held             | held, then turned');
  for (const arms of [2, 1] as const) {
    const days = daylightOfDays(arms, LAST_NIGHT);
    const yard = (seed: number) => yardBy(newGame(seed), days, LAST_NIGHT).state.yard;
    const hand = arms === 1 ? ONE_HAND : null;
    console.log(`  ${arms}  | ${cell(play(LAST_NIGHT, yard, hand, seeds))}| ${cell(play(LAST_NIGHT, yard, hand, seeds, held))}| ${cell(play(LAST_NIGHT, yard, hand, seeds, turned))}`);
  }
}

// Headless balance sweep: every night against reference layouts, played by the automatic operator.
//   npx vite-node tools/balance.ts
import { newGame } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { layout, layoutCost, operate, type Tier } from '../tests/operator';

const TIERS: Tier[] = [0, 1, 2, 3, 4, 5, 6];
console.log('night | ' + TIERS.map((t) => `tier ${t}`.padEnd(30)).join('| '));
for (let night = 1; night <= 7; night++) {
  const cells = TIERS.map((tier) => {
    const results: string[] = [];
    for (const seed of [11, 22, 33]) {
      const state = layout(newGame(seed), tier);
      const sim = new NightSim(night, state.yard, seed);
      for (let t = 0; t < 60 * 900 && sim.outcome === 'ongoing'; t++) {
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

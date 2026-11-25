#!/usr/bin/env node
// Dev aid: the day after a night, as the yard tells it — the morning report with its silent traps,
// the yard with the traps that slept marked, what a trap did on its card with its reach on the
// ground, a piece laid and taken back whole, and everything the night broke repaired in one click.
//   node tools/yard-shots.mjs <outDir> [baseUrl]      (PS_LANG=en for the English texts)
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch } from './browser.mjs';

const OUT = resolve(process.argv[2] ?? 'shots');
const URL = process.argv[3] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const LANG = process.env.PS_LANG ?? 'fr';
mkdirSync(OUT, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: LANG === 'en' ? 'en-GB' : 'fr-FR' });
await page.addInitScript((lang) => {
  localStorage.setItem('putrid-swarm.warned', '1');
  localStorage.setItem('putrid-swarm.hint.v3', '1');
  localStorage.setItem('putrid-swarm.lang', lang);
}, LANG);
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`shot ${name}`);
};
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(URL);
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await wait(1200);

// A real night, played by the reference operator on a reference yard with one trap nobody will walk
// into; two traps are then broken by hand so there is something to repair.
const facts = await page.evaluate(async () => {
  const game = await import('/src/core/game.ts');
  const night = await import('/src/core/night.ts');
  const yard = await import('/src/core/yard.ts');
  const op = await import('/tests/operator.ts');
  const flow = await import('/src/scenes/flow.ts');
  const app = window.__app;
  let state = { ...op.layout(game.newGame(42), 3), day: 3, inventory: { wood: 30, scrap: 20, springs: 9, wire: 9, battery: 3 } };
  const lonely = yard.build(state, "spikes", 6, 13);
  if (lonely.ok) state = lonely.value;
  const started = game.startNight(state);
  state = started.value;
  const sim = new night.NightSim(3, state.yard, 11);
  for (let t = 0; t < 600 * 60 && sim.outcome === 'ongoing'; t++) {
    op.operate(sim);
    sim.step(1 / 60);
  }
  state = game.concludeNight(state, sim);
  const traps = state.yard.devices.filter((d) => d.type !== 'fence' && !d.broken);
  const wrecked = traps.filter((d) => state.lastNight.traps[d.id]?.fired > 0).slice(0, 2).map((d) => d.id);
  state = { ...state, yard: { ...state.yard, devices: state.yard.devices.map((d) => (wrecked.includes(d.id) ? { ...d, broken: true, hp: 0 } : d)) } };
  app.state = state;
  flow.goMorning(app);
  const busiest = traps.filter((d) => !wrecked.includes(d.id)).sort((a, b) => (state.lastNight.traps[b.id]?.kills ?? 0) - (state.lastNight.traps[a.id]?.kills ?? 0))[0];
  return { phase: state.phase, silent: yard.silentTraps(state).map((d) => d.id), busiest: { x: busiest.x, y: busiest.y }, lonely: { x: 6, y: 13 } };
});
console.log(JSON.stringify(facts));
await wait(1500);
await shot('01-morning-report');

/** Where a grid cell is on screen, in the day scene's own view. */
const screenOf = (cell) =>
  page.evaluate(async ([x, y]) => {
    const world = await import('/src/render/world.ts');
    const scene = window.__app.scene;
    const p = world.project(scene.view, x + 0.5, y + 0.5);
    return { x: p.x, y: p.y };
  }, [cell.x, cell.y]);
const pointAt = async (cell, lift = 14) => {
  const p = await screenOf(cell);
  const box = await page.locator('#stage').boundingBox();
  const scale = box.width / 1280;
  await page.mouse.move(box.x + p.x * scale, box.y + (p.y - lift) * scale, { steps: 3 });
};

await page.keyboard.press('Enter');
await wait(1800);
await shot('02-day-after');

await pointAt(facts.busiest);
await wait(400);
await shot('03-trap-that-worked');
await pointAt(facts.lonely);
await wait(400);
await shot('04-trap-that-slept');

// A piece laid today, on its card, then taken back.
await page.keyboard.press('Digit2');
await pointAt({ x: 4, y: 14 }, 0);
await wait(200);
await page.mouse.down();
await page.mouse.up();
await page.keyboard.press('Escape');
await pointAt({ x: 4, y: 14 }, 4);
await wait(400);
await shot('05-laid-today');
await page.keyboard.press('Backspace');
await wait(500);
await shot('06-taken-back');

await page.getByRole('button', { name: /Tout réparer|Repair all/ }).hover();
await wait(300);
await shot('07-repair-all-hover');
await page.getByRole('button', { name: /Tout réparer|Repair all/ }).click();
await wait(500);
await shot('08-repaired');

console.log(errors.length ? `console issues:\n${[...new Set(errors)].slice(0, 20).join('\n')}` : 'no console issues');
await browser.close();

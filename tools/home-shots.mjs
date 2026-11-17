#!/usr/bin/env node
// Dev aid: the home phase as it is rendered — the yard by day from both sides and up close, the
// same yard at dusk, and the night desk with a wave on the lot.
//   node tools/home-shots.mjs <outDir> [baseUrl]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const OUT = resolve(process.argv[2] ?? 'shots');
const URL = process.argv[3] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const SCALE = Number(process.env.PS_SCALE ?? 1);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: SCALE, locale: 'fr-FR' });
// The content warning is said once per browser: these tours are not here to read it.
await page.addInitScript(() => localStorage.setItem('putrid-swarm.warned', '1'));
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`);
});

const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`shot ${name}`);
};
const wait = (ms) => page.waitForTimeout(ms);

/** Puts a reference yard on screen: `tier` of defences, `hoursLeft` of daylight, on day `day`. */
const day = (tier, hoursLeft, dayNumber = 3) =>
  page.evaluate(
    async ([t, h, d]) => {
      localStorage.setItem('putrid-swarm.hint.v2', '1');
      localStorage.setItem('putrid-swarm.coach', '1');
      const game = await import('/src/core/game.ts');
      const op = await import('/tests/operator.ts');
      const flow = await import('/src/scenes/flow.ts');
      const app = window.__app;
      app.state = { ...op.layout(game.newGame(42), t), day: d, hoursLeft: h, inventory: { wood: 9, scrap: 4, springs: 1, wire: 2, battery: 0 } };
      flow.goDay(app);
    },
    [tier, hoursLeft, dayNumber],
  );

await page.goto(URL);
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await wait(1200);

// Day: the whole lot, an empty yard first (the ground has nothing to hide behind).
await day(0, 9);
await wait(1500);
await shot('01-day-empty');
await page.keyboard.press('KeyT');
await wait(300);
await shot('02-day-empty-no-routes');

await day(4, 6.5);
await wait(1500);
await page.keyboard.press('KeyT');
await wait(300);
await shot('03-day-built');
await page.keyboard.press('KeyR');
await wait(500);
await shot('04-day-built-back');
await page.keyboard.press('KeyR');

// Up close: where texture, edges and contact shadows are judged.
await page.mouse.move(700, 430);
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -160);
await wait(500);
await shot('05-day-close');
await page.mouse.move(980, 520);
await wait(300);
await page.keyboard.press('Digit2');
await wait(400);
await shot('06-day-close-ghost');
await page.keyboard.press('Escape');

// The edge of the world: as far out and as far into a corner as the view goes, on both sides.
await day(4, 6.5);
await wait(1500);
await page.keyboard.press('KeyT');
for (const [name, dx, dy] of [
  ['07a-day-corner-gate', -420, -260],
  ['07b-day-corner-barn', 900, 0],
]) {
  await page.mouse.move(780, 380);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 400);
  await page.mouse.down();
  await page.mouse.move(780 + dx / 2, 380 + dy / 2, { steps: 4 });
  await page.mouse.move(780 + dx, 380 + dy, { steps: 4 });
  await page.mouse.up();
  await wait(400);
  await shot(name);
}
await page.keyboard.press('KeyR');
await wait(500);
await shot('07c-day-corner-back');

for (const [name, hoursLeft] of [
  ['07d-day-afternoon', 3],
  ['07e-day-golden', 1.4],
  ['07-day-dusk', 0.4],
]) {
  await day(4, hoursLeft);
  await wait(1500);
  await shot(name);
}

// Night: a wave on the lot, then the far cameras.
await page.evaluate(async () => {
  const game = await import('/src/core/game.ts');
  const op = await import('/tests/operator.ts');
  const flow = await import('/src/scenes/flow.ts');
  const app = window.__app;
  const base = { ...op.layout(game.newGame(42), 4), day: 3 };
  const started = game.startNight(base);
  app.state = started.ok ? started.value : base;
  flow.goNight(app);
});
await wait(1500);
await shot('08-night-start');
await page.keyboard.press('F4');
await wait(2600);
await page.keyboard.press('F4');
await wait(700);
await shot('09-night-wave');
await page.keyboard.press('KeyQ');
await wait(220);
await shot('10-night-trigger');
await page.keyboard.press('Digit2');
await wait(900);
await shot('11-night-grange');
await page.keyboard.press('Digit3');
await wait(900);
await shot('12-night-arriere');
await page.keyboard.press('Digit4');
await wait(900);
await shot('13-night-verger');

console.log(errors.length ? `console issues:\n${[...new Set(errors)].slice(0, 20).join('\n')}` : 'no console issues');
await browser.close();

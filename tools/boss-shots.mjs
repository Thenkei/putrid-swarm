#!/usr/bin/env node
// Dev aid: jumps straight into a given night with a reference layout and captures boss moments.
//   node tools/boss-shots.mjs <outDir> <night> <tier> <seconds,seconds,…> [cam]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const OUT = resolve(process.argv[2] ?? 'shots');
const night = Number(process.argv[3] ?? 2);
const tier = Number(process.argv[4] ?? 3);
const marks = (process.argv[5] ?? '70,80').split(',').map(Number);
const cam = process.argv[6] ?? 'Digit1';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'fr-FR' });
// The content warning is said once per browser: these tours are not here to read it.
await page.addInitScript(() => localStorage.setItem('putrid-swarm.warned', '1'));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(process.env.PS_URL ?? 'http://localhost:5173/');
await page.waitForTimeout(2500);
await page.evaluate(
  async ({ night, tier }) => {
    const game = await import('/src/core/game.ts');
    const op = await import('/tests/operator.ts');
    const flow = await import('/src/scenes/flow.ts');
    const app = window.__app;
    const base = op.layout(game.newGame(42), tier);
    app.state = { ...base, day: night, phase: 'night', hoursLeft: 0 };
    flow.goNight(app);
  },
  { night, tier },
);
await page.waitForTimeout(1200);
await page.keyboard.press(cam);
let elapsed = 0;
for (const mark of marks) {
  // Let the bot-free night run; fire the first traps now and then so effects are on screen.
  while (elapsed < mark) {
    await page.waitForTimeout(500);
    elapsed += 0.5;
    if (Math.round(elapsed * 2) % 3 === 0) for (const key of ['KeyQ', 'KeyW', 'KeyE', 'KeyR']) await page.keyboard.press(key);
  }
  await page.screenshot({ path: join(OUT, `night${night}-t${mark}.png`) });
  console.log(`shot night${night}-t${mark}`);
}
console.log(errors.length ? errors.slice(0, 10).join('\n') : 'no errors');
await browser.close();

#!/usr/bin/env node
// Dev aid: a built-up yard by day, with a palisade ghost and the route preview.
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
const OUT = resolve(process.argv[2] ?? 'shots');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.PS_URL ?? 'http://localhost:5173/');
await page.waitForTimeout(2500);
await page.evaluate(async () => {
  localStorage.setItem('putrid-swarm.hint', '1');
  const game = await import('/src/core/game.ts');
  const op = await import('/tests/operator.ts');
  const flow = await import('/src/scenes/flow.ts');
  const app = window.__app;
  app.state = { ...op.layout(game.newGame(42), 4), day: 3, hoursLeft: 6.5, inventory: { wood: 9, scrap: 4, springs: 1, wire: 2, battery: 0 } };
  flow.goDay(app);
});
await page.waitForTimeout(1500);
await page.keyboard.press('Digit1');
await page.mouse.move(560, 430);
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'day-built.png') });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();

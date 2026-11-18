#!/usr/bin/env node
// Dev aid: drives the running dev server through a short scripted tour and saves screenshots.
//   node tools/shots.mjs <outDir> [baseUrl]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch } from './browser.mjs';
import { fillTimberOrder } from './timber.mjs';

const OUT = resolve(process.argv[2] ?? 'shots');
const URL = process.argv[3] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const only = process.argv[4]?.split(',');
mkdirSync(OUT, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'fr-FR' });
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
  if (only && !only.includes(name)) return;
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`shot ${name}`);
};
const wait = (ms) => page.waitForTimeout(ms);
const clickText = async (text) => page.getByText(text, { exact: false }).first().click();

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(2500);
await shot('01-title');

await clickText('Commencer');
await wait(4000);
await shot('02-news');
await page.keyboard.press('Space');
await wait(2600);
await shot('03-smoke');
await page.keyboard.press('Space');
await wait(1500);
await shot('04-later');
await page.keyboard.press('Space');
await wait(1200);
await shot('05-reveal');
await wait(3200);
await shot('06-day');
await clickText('Compris').catch(() => {});
await wait(300);

// Build a log near the gate.
await page.keyboard.press('Digit4');
await page.mouse.move(700, 470);
await wait(300);
await shot('07-build-ghost');
await page.mouse.click(700, 470);
await wait(400);
await page.keyboard.press('Escape');
await page.keyboard.press('KeyR');
await wait(500);
await shot('08-day-back');
await page.keyboard.press('KeyR');

await clickText('Prendre le break');
await wait(1200);
await shot('09-map');
await clickText('quincaillerie');
await wait(300);
await clickText('Y aller');
await wait(1100);
await shot('09b-drive');
await page.keyboard.press('Space');
await wait(1200);
await shot('10-location');
await page.locator('.spot').first().click();
await wait(700);
await shot('11-search');
await fillTimberOrder(page);
await clickText('Reprendre le break');
await wait(1100);
await shot('11b-return');
await page.keyboard.press('Space');
await wait(1200);

await clickText('Attendre la nuit');
await wait(300);
await clickText('Attendre').catch(() => {});
await page.locator('.modal .btn-primary').click().catch(() => {});
await wait(1200);
await shot('12-nightfall');
await clickText('Prendre le poste');
await wait(14000);
await shot('13-night');
await page.keyboard.press('KeyQ');
await wait(250);
await shot('14-night-trigger');
await page.keyboard.press('Digit2');
await wait(9000);
await shot('15-night-grange');
await page.keyboard.press('F3');
await page.keyboard.press('Digit4');
await wait(6000);
await shot('16-night-arriere-debug');

// Play the rest of night 1 at dev speed, firing whatever is ready, to reach the morning.
await page.keyboard.press('F3');
await page.keyboard.press('F4');
for (let i = 0; i < 80; i++) {
  if (await page.getByText('Le lendemain').count()) break;
  for (const key of ['Digit1', 'KeyQ', 'KeyW', 'Digit2', 'KeyQ', 'Digit3', 'KeyQ', 'Digit4', 'KeyQ']) await page.keyboard.press(key);
  await wait(250);
}
await wait(1500);
await shot('17-morning');
await page.locator('.report .btn-primary').click().catch(() => {});
await wait(1500);
await shot('18-day2');

// Force the two endings through the dev handle.
await page.evaluate(() => {
  const app = window.__app;
  app.state = { ...app.state, phase: 'lost', lastNight: { ...app.state.lastNight, night: 2, survived: false } };
});
await page.evaluate(async () => {
  const flow = await import('/src/scenes/flow.ts');
  flow.goEnd(window.__app);
});
await wait(1200);
await shot('19-lost');
await page.evaluate(async () => {
  const app = window.__app;
  app.state = { ...app.state, phase: 'held', day: 7 };
  const flow = await import('/src/scenes/flow.ts');
  flow.goEnd(app);
});
await wait(1200);
await shot('20-held');

console.log(errors.length ? `console issues:\n${errors.slice(0, 20).join('\n')}` : 'no console issues');
await browser.close();

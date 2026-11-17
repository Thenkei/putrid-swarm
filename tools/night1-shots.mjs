#!/usr/bin/env node
// Dev aid: plays the opening, the first day and the first night the way a new player meets them,
// and saves a screenshot at each lesson (placement guidance, coaching holds, firing cue).
//   node tools/night1-shots.mjs <outDir> [baseUrl]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch } from './browser.mjs';

const OUT = resolve(process.argv[2] ?? 'shots');
const URL = process.argv[3] ?? process.env.PS_URL ?? 'http://localhost:5173/';
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
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`shot ${name}`);
};
const wait = (ms) => page.waitForTimeout(ms);
const clickText = async (text) => page.getByText(text, { exact: false }).first().click();
const coach = () => page.locator('.coach.on').textContent({ timeout: 200 }).catch(() => null);
const held = () => page.locator('.coach.hold').count();

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(2500);
await shot('01-title');

await clickText('Commencer');
await wait(9000);
await shot('02-news');
await page.keyboard.press('Space');
await wait(1500);
await page.keyboard.press('Space');
await wait(2500);
await shot('03-later');
await page.keyboard.press('Space');
await wait(4600);
await shot('04-day-hint');
await clickText('Compris').catch(() => {});
await wait(300);
await shot('05-day');

// Placement guidance: stakes off the routes, then on one.
await page.keyboard.press('Digit2');
await page.mouse.move(560, 300);
await wait(300);
await shot('06-stakes-off-route');
await page.mouse.move(905, 420);
await wait(300);
await shot('07-stakes-near-barn');

// Drag a line of palisades.
await page.keyboard.press('Digit1');
await page.mouse.move(520, 470);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(520 + i * 12, 470 + i * 6);
  await wait(60);
}
await page.mouse.up();
await wait(300);
await shot('08-palisade-line');
await page.keyboard.press('Escape');

await clickText('Attendre la nuit');
await wait(300);
await page.locator('.modal .btn-primary').click();
await wait(1500);
await shot('09-nightfall');
await clickText('Prendre le poste');
await wait(2500);
await shot('10-night-intro');

// Play the way the desk asks: obey each coaching hold, and otherwise go where a trap is flagged and fire it.
const lessons = [];
let cues = 0;
for (let i = 0; i < 900; i++) {
  await wait(200);
  if ((await page.locator('.report').count()) > 0) break;
  if ((await held()) > 0) {
    const text = await coach();
    lessons.push(text);
    await shot(`11-hold-${lessons.length}`);
    if (/Espace|Space/.test(text ?? '')) await page.keyboard.press('Space');
    else await page.keyboard.press('KeyQ');
    await wait(500);
    await shot(`12-after-hold-${lessons.length}`);
    continue;
  }
  if ((await page.locator('.trap.now').count()) > 0) {
    if (cues++ === 1) await shot('13-cue');
    await page.locator('.trap.now').first().click({ force: true });
  } else if ((await page.locator('.mini.cue').count()) > 0) {
    await shot('13b-cue-elsewhere');
    await page.keyboard.press('Space');
  }
}
console.log('lessons:', JSON.stringify(lessons), 'cues fired:', cues);

await wait(800);
await shot('14-morning');

console.log(errors.length ? `console issues:\n${[...new Set(errors)].join('\n')}` : 'no console issues');
await browser.close();

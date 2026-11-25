#!/usr/bin/env node
// Dev aid: the things that are of no use — the title monitor's screensaver (and its corner), the test
// card behind the code everyone knows, the break's horn and the well in the yard.
//   node tools/egg-shots.mjs <outDir> [baseUrl]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch } from './browser.mjs';

const OUT = resolve(process.argv[2] ?? 'shots');
const URL = process.argv[3] ?? process.env.PS_URL ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'fr-FR' });
await page.addInitScript(() => {
  localStorage.setItem('putrid-swarm.warned', '1');
  localStorage.setItem('putrid-swarm.hint.v3', '1');
});
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
await wait(1500);

for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA']) await page.keyboard.press(key);
await wait(900);
await shot('01-test-card');
await wait(7000);

// The screensaver, without the wait: the scene is told it has been left alone, then that the corner is due.
await page.evaluate(() => (window.__app.scene.lastInput = window.__app.scene.time - 41));
await wait(2500);
await shot('02-screensaver');
await page.evaluate(async () => {
  const { SAVER_CORNER_AT } = await import('/src/engine/saver.ts');
  const scene = window.__app.scene;
  scene.saver = { ...scene.saver, at: scene.time - SAVER_CORNER_AT + 0.25 };
});
await wait(330);
await shot('03-corner');
await wait(1500);
await shot('04-after-corner');
await page.mouse.move(600, 300);
await page.mouse.move(640, 320);
await wait(300);
await shot('05-awake');

// The yard: honk the break, drop a washer down the well.
await page.evaluate(async () => {
  const game = await import('/src/core/game.ts');
  const flow = await import('/src/scenes/flow.ts');
  window.__app.state = game.newGame(42);
  flow.goDay(window.__app);
});
await wait(1800);
const click = async (gx, gy) => {
  const p = await page.evaluate(async ([x, y]) => {
    const world = await import('/src/render/world.ts');
    return world.project(window.__app.scene.view, x, y);
  }, [gx, gy]);
  const box = await page.locator('#stage').boundingBox();
  const k = box.width / 1280;
  await page.mouse.click(box.x + p.x * k, box.y + p.y * k);
};
await click(16, 14.5);
await wait(2200);
await shot('06-honk');
await wait(2500);
await page.keyboard.press('KeyR');
await wait(600);
await click(15.5, 6.5);
await wait(2000);
await shot('07-well');

console.log(errors.length ? `console issues:\n${[...new Set(errors)].slice(0, 20).join('\n')}` : 'no console issues');
await browser.close();

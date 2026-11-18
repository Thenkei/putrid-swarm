#!/usr/bin/env node
// Dev aid: opens the credits from the title and saves a screenshot at each moment of their script.
//   node tools/credits-shots.mjs <outDir> [baseUrl]
// On a dev server the scene's clock is moved straight to each moment, so the whole of it is shot in
// under a minute; PS_REAL=1 lets it play at its own pace instead (75 s). PS_SEEN=1 marks an ending as
// seen first: what rises from the sofa then includes what only a finished run has met.
// PS_BROWSER=chrome|firefox|webkit, PS_LANG=en for English.
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { BROWSER, launch } from './browser.mjs';

const OUT = resolve(process.argv[2] ?? 'shots');
const URL = process.argv[3] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const LANG = process.env.PS_LANG ?? 'fr';
const REAL = process.env.PS_REAL === '1';
mkdirSync(OUT, { recursive: true });

/** Seconds into the credits, and what should be on screen then. */
const MARKS = [
  [0.9, 'desk'],
  [4.2, 'toward-note'],
  [6.4, 'note'],
  [7.3, 'yellow'],
  [9.6, 'summer-date'],
  [12.5, 'line-1'],
  [17.5, 'line-2'],
  [23, 'line-3-ideas'],
  [29, 'names'],
  [34, 'names-late'],
  [36.4, 'yellow-back'],
  [38.2, 'later'],
  [41.5, 'pulling-back'],
  [46, 'roll-start'],
  [52, 'roll'],
  [57, 'roll-late'],
  [61, 'roll-end'],
  [64, 'photo-coming'],
  // The last words wait for the picture: given the time they take.
  [69, 'photo-and-thanks', 5200],
  [72.9, 'fading'],
];

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: LANG === 'fr' ? 'fr-FR' : 'en-GB' });
await page.addInitScript(() => localStorage.setItem('putrid-swarm.warned', '1'));
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(URL);
await page.waitForSelector('.crt', { timeout: 90000 });
await page.evaluate(
  ([lang, seen]) => {
    localStorage.setItem('putrid-swarm.lang', lang);
    localStorage.setItem('putrid-swarm.sound', 'off');
    if (seen) localStorage.setItem('putrid-swarm.endings', JSON.stringify(['finale.rampage']));
  },
  [LANG, process.env.PS_SEEN === '1'],
);
await page.reload();
await page.waitForSelector('.crt', { timeout: 90000 });
await page.waitForTimeout(800);
// These pixels are on the paper and inside the glass. The CRT must never paint over them.
const noteCorner = { x: 340, y: 70, width: 16, height: 12 };
const titleCorner = await page.screenshot({ clip: noteCorner });
await page.getByText(LANG === 'fr' ? 'Crédits' : 'Credits', { exact: true }).click();
await page.waitForSelector('.credits', { state: 'attached', timeout: 10000 });
const started = Date.now();

for (const [at, name, settle = 1000] of MARKS) {
  if (REAL) {
    const rest = started + at * 1000 - Date.now();
    if (rest > 0) await page.waitForTimeout(rest);
  } else {
    // A second before the moment, then left to run: fades and the typed date settle as they would.
    await page.evaluate((t) => {
      const scene = window.__app?.scene;
      if (scene && typeof scene.time === 'number') scene.time = Math.max(scene.time, t);
    }, at - settle / 1000);
    await page.waitForTimeout(settle);
  }
  await page.screenshot({ path: join(OUT, `${BROWSER}-${String(Math.round(at)).padStart(2, '0')}-${name}.png`) });
  if (name === 'roll' || name === 'photo-and-thanks') {
    assert((await page.screenshot({ clip: noteCorner })).equals(titleCorner), `The monitor covers the sticky note during ${name}`);
  }
  console.log(`shot ${name}`);
}
await page.waitForSelector('.credits', { state: 'detached', timeout: 15000 });
await page.waitForSelector('.crt');
console.log('back at the title');
console.log(errors.length === 0 ? 'no console issues' : `${errors.length} console issue(s):\n${errors.join('\n')}`);
await browser.close();

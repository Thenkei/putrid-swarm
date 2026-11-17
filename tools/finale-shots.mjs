#!/usr/bin/env node
// Dev aid: loses a night on purpose and plays what follows, saving a screenshot at every stage.
//   node tools/finale-shots.mjs <outDir> [desk,rampage,onearm] [baseUrl]
// PS_LANG=en for English, PS_JAM=soft for the gentle chart (hard by default). The jam is played by reading the chart.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? 'shots');
const BRANCHES = (process.argv[3] ?? 'desk,rampage,onearm').split(',');
const URL = process.argv[4] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const LANG = process.env.PS_LANG ?? 'fr';
const JAM = process.env.PS_JAM === 'soft' ? 'soft' : 'hard';
mkdirSync(OUT, { recursive: true });

const saves = JSON.parse(execFileSync('npx', ['tsx', 'tools/orchard-saves.ts'], { cwd: ROOT, encoding: 'utf8' }));
const chart = JSON.parse(execFileSync('npx', ['tsx', '-e', `import('./src/core/finale.ts').then((m) => console.log(JSON.stringify(m.chartOf('${JAM}'))))`], { cwd: ROOT, encoding: 'utf8' }));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: LANG === 'fr' ? 'fr-FR' : 'en-GB' });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`shot ${name}`);
};
const T = LANG === 'fr' ? { cont: 'Continuer', night: 'Attendre la nuit', begin: 'Prendre le poste' } : { cont: 'Continue', night: 'Wait for night', begin: 'Take the desk' };
const CHORD_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY'];

/** Opens a doomed evening and lets the night be lost at eight times the speed. */
async function lose(save) {
  await page.goto(URL);
  await page.evaluate(([s, lang, jam]) => {
    localStorage.clear();
    localStorage.setItem('putrid-swarm.jam', jam);
    localStorage.setItem('putrid-swarm.save.v1', s);
    localStorage.setItem('putrid-swarm.lang', lang);
    localStorage.setItem('putrid-swarm.sound', 'off');
  }, [save, LANG, JAM]);
  await page.reload();
  await wait(2500);
  await page.getByText(T.cont, { exact: false }).first().click();
  await wait(1200);
  await page.getByText(T.night, { exact: true }).click();
  await wait(1200);
  await page.getByText(T.begin, { exact: true }).click();
  await wait(1500);
  await page.keyboard.press('F4');
  await page.waitForSelector('.finale', { state: 'attached', timeout: 120000 });
}

for (const branch of BRANCHES) {
  if (branch === 'desk') {
    await lose(saves.doomedEarly);
    await wait(1200);
    await shot('f-01-desk-fall');
    await wait(3000);
    await shot('f-02-devoured');
    await wait(2200);
    await shot('f-03-devoured-late');
    await page.waitForFunction(() => document.querySelector('.finale') === null, null, { timeout: 15000 });
    await wait(1200);
    await shot('f-04-end');
  }
  if (branch === 'rampage' || branch === 'onearm') {
    const tag = branch === 'rampage' ? 'g' : 'h';
    await lose(branch === 'rampage' ? saves.doomedLate : saves.doomedOneArm);
    await wait(1500);
    await shot(`${tag}-01-fall`);
    await page.waitForSelector('.finale-title', { state: 'attached', timeout: 10000 });
    await wait(2600);
    await shot(`${tag}-02-shed`);
    await page.waitForSelector('.jam', { state: 'attached', timeout: 15000 });
    const start = Date.now();
    await wait(1500);
    await shot(`${tag}-03-jam-start`);
    // Play the chart off the wall clock: with the sound off, the scene's clock is the song's.
    const until = branch === 'rampage' ? 34 : 12;
    let held = null;
    let shots = 0;
    for (const note of chart) {
      if (note.time > until) break;
      const due = start + note.time * 1000;
      const lead = due - Date.now() - 70;
      if (lead > 0) await wait(lead);
      if (held !== note.chord) {
        if (held !== null) await page.keyboard.up(CHORD_KEYS[held]);
        await page.keyboard.down(CHORD_KEYS[note.chord]);
        held = note.chord;
      }
      const rest = due - Date.now();
      if (rest > 0) await wait(rest);
      await page.keyboard.press('Space');
      if (note.time > 9 && shots === 0) {
        shots++;
        await shot(`${tag}-04-jam`);
      }
      if (note.time > 24 && shots === 1) {
        shots++;
        await shot(`${tag}-05-jam-later`);
      }
    }
    if (held !== null) await page.keyboard.up(CHORD_KEYS[held]);
    console.log(`${branch}: tally ${await page.locator('.jam-count b').textContent()}, ${await page.locator('.jam-combo').textContent()}`);
    if (branch === 'rampage') {
      await page.waitForSelector('.jam-out.on', { state: 'attached', timeout: 10000 });
      await shot('g-06-offer');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.finale-swarm', { state: 'attached', timeout: 5000 });
      await wait(1500);
      await shot('g-07-swarm');
      console.log('swarm:', await page.locator('.finale-swarm').innerText());
      await page.waitForFunction(() => document.querySelector('.finale') === null, null, { timeout: 20000 });
      await wait(1200);
      await shot('g-08-end');
    }
  }
}
console.log(errors.length ? `console issues:\n${[...new Set(errors)].join('\n')}` : 'no console issues');
await browser.close();

#!/usr/bin/env node
// Dev aid: ends runs on purpose and plays what follows, saving a screenshot at every stage.
//   node tools/finale-shots.mjs <outDir> [desk,rampage,onearm,dawn,fates,title] [baseUrl]
// PS_LANG=en for English, PS_JAM=soft for the gentle chart (hard by default). The jam is played by reading the chart.
//   desk     a house lost on night 3: the desk, then the end screen
//   rampage  a house lost on night 5: the shed, the song left once leaving is offered, the horde, the end screen
//   onearm   the same with one arm, the first twelve seconds of the song
//   dawn     the seventh night held: the dawn that does not send them home, the song left early (a first
//            record), then played again from the end screen to its last chord (a new record)
//   fates    the end screens of the orchard's three deaths, and a run saved as `won` before there was no winning
//   title    the title screen, with its count of endings seen
// Endings and records are kept from one branch to the next (storage is cleared once, at the start), so the
// order of the branches decides which record and which count the screens show.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? 'shots');
const BRANCHES = (process.argv[3] ?? 'desk,rampage,onearm,dawn,fates,title').split(',');
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
const T =
  LANG === 'fr'
    ? { cont: 'Continuer', night: 'Attendre la nuit', begin: 'Prendre le poste', encore: 'Rejouer le morceau', menu: 'Menu' }
    : { cont: 'Continue', night: 'Wait for night', begin: 'Take the desk', encore: 'Play the song again', menu: 'Menu' };
const CHORD_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY'];

let fresh = true;
/** Opens the game on a save. Storage is wiped the first time only: endings and records carry on between branches. */
async function open(save) {
  await page.goto(URL);
  await page.evaluate(
    ([s, lang, jam, wipe]) => {
      if (wipe) localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('putrid-swarm.jam', jam);
      localStorage.setItem('putrid-swarm.save.v1', s);
      localStorage.setItem('putrid-swarm.lang', lang);
      localStorage.setItem('putrid-swarm.sound', 'off');
    },
    [save, LANG, JAM, fresh],
  );
  fresh = false;
  await page.reload();
  await wait(2500);
  await page.getByText(T.cont, { exact: false }).first().click();
}

/** Opens an evening and lets its night run at eight times the speed, until the last scene begins. */
async function night(save) {
  await open(save);
  await wait(1200);
  await page.getByText(T.night, { exact: true }).click();
  await wait(1200);
  await page.getByText(T.begin, { exact: true }).click();
  await wait(1500);
  await page.keyboard.press('F4');
  await page.waitForSelector('.finale', { state: 'attached', timeout: 240000 });
}

/**
 * Plays the chart off the wall clock until `until` seconds (with the sound off the scene's clock is the song's),
 * taking a screenshot when the song passes each of `marks` ({ at, name }).
 */
async function play(start, until, marks = []) {
  let held = null;
  const pending = [...marks];
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
    while (pending.length && note.time >= pending[0].at) await shot(pending.shift().name);
  }
  if (held !== null) await page.keyboard.up(CHORD_KEYS[held]);
  console.log(`tally ${await page.locator('.jam-count b').textContent()}, ${await page.locator('.jam-combo').textContent()}`);
}

/** Waits for the song to start; its clock starts then. */
async function songStarts() {
  await page.waitForSelector('.jam', { state: 'attached', timeout: 20000 });
  return Date.now();
}

/** Leaves the song once leaving is offered, and waits for the horde. */
async function bowOut(tag) {
  await page.waitForSelector('.jam-out.on', { state: 'attached', timeout: 10000 });
  await shot(`${tag}-offer`);
  await page.keyboard.press('Enter');
}

/** The horde, then the end screen, both photographed. */
async function swarmAndEnd(tag) {
  await page.waitForSelector('.finale-swarm', { state: 'attached', timeout: 15000 });
  await wait(1500);
  await shot(`${tag}-swarm`);
  console.log('swarm:', (await page.locator('.finale-swarm').innerText()).replace(/\n+/g, ' | '));
  await wait(6200);
  await shot(`${tag}-swarm-late`);
  await page.waitForFunction(() => document.querySelector('.finale') === null, null, { timeout: 20000 });
  await wait(400);
  await shot(`${tag}-end-early`);
  await wait(1800);
  await shot(`${tag}-end`);
  console.log('end:', (await page.locator('.center-col').innerText()).replace(/\n+/g, ' | '));
}

for (const branch of BRANCHES) {
  if (branch === 'desk') {
    await night(saves.doomedEarly);
    await wait(1200);
    await shot('f-01-desk-fall');
    await wait(3000);
    await shot('f-02-devoured');
    await wait(2200);
    await shot('f-03-devoured-late');
    await page.waitForFunction(() => document.querySelector('.finale') === null, null, { timeout: 15000 });
    await wait(2000);
    await shot('f-04-end');
    console.log('end:', (await page.locator('.center-col').innerText()).replace(/\n+/g, ' | '));
  }
  if (branch === 'rampage' || branch === 'onearm') {
    const tag = branch === 'rampage' ? 'g' : 'h';
    await night(branch === 'rampage' ? saves.doomedLate : saves.doomedOneArm);
    await wait(1500);
    await shot(`${tag}-01-fall`);
    await page.waitForSelector('.finale-title', { state: 'attached', timeout: 10000 });
    await wait(2600);
    await shot(`${tag}-02-shed`);
    const start = await songStarts();
    await wait(1500);
    await shot(`${tag}-03-jam-start`);
    await play(start, branch === 'rampage' ? 34 : 12, [
      { at: 9, name: `${tag}-04-jam` },
      { at: 24, name: `${tag}-05-jam-later` },
    ]);
    if (branch === 'rampage') {
      await bowOut('g-06');
      await swarmAndEnd('g-07');
    }
  }
  if (branch === 'dawn') {
    await night(saves.lastEvening);
    await wait(1200);
    await shot('d-01-calm');
    await wait(4200);
    await shot('d-02-dissolve');
    await wait(2400);
    await shot('d-03-still');
    await page.waitForSelector('.jam-modes', { state: 'attached', timeout: 15000 });
    await wait(3000);
    await shot('d-04-shed');
    const first = await songStarts();
    await wait(1200);
    await shot('d-05-jam-start');
    // First time round: left as soon as it is offered. That sets the first record.
    await play(first, 31, [{ at: 14, name: 'd-06-jam-line' }]);
    await bowOut('d-07');
    await swarmAndEnd('d-08');
    // Again, from the end screen, and this time to the last chord: a new record.
    await page.getByText(T.encore, { exact: true }).click();
    await page.waitForSelector('.jam-modes', { state: 'attached', timeout: 10000 });
    await wait(2000);
    await shot('d-09-encore-shed');
    await play(await songStarts(), 80, [
      { at: 51.4, name: 'd-10-solo' },
      { at: 64.2, name: 'd-11-solo-peak' },
      { at: 75.4, name: 'd-12-last-chord-coming' },
      { at: 76.9, name: 'd-13-last-chord' },
    ]);
    await swarmAndEnd('d-14');
  }
  if (branch === 'fates') {
    for (const [name, save] of [
      ['throat', saves.fateThroat],
      ['turned', saves.fateTurned],
      ['bled', saves.fateBled],
      ['legacy-won', saves.legacyWon],
    ]) {
      await open(save);
      await wait(2200);
      await shot(`e-${name}`);
      console.log(`${name}:`, (await page.locator('.center-col').innerText()).replace(/\n+/g, ' | '));
    }
  }
  if (branch === 'title') {
    await page.goto(URL);
    await wait(3000);
    await shot('t-title');
    console.log('title:', await page.locator('.crt-endings').innerText().catch(() => '(no count)'));
  }
}
console.log(errors.length ? `console issues:\n${[...new Set(errors)].join('\n')}` : 'no console issues');
await browser.close();

#!/usr/bin/env node
// Dev aid: plays a one-armed run's screens (from saves built by tools/arm-saves.ts) and saves a
// screenshot of each: the day, a drive and a search, the way home, the van, the morning, the evening,
// and a night at the desk with the hand crossing between the two rows of keys.
//   node tools/arm-shots.mjs <outDir> [baseUrl]          PS_LANG=en for English
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? 'shots');
const URL = process.argv[3] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const LANG = process.env.PS_LANG ?? 'fr';
mkdirSync(OUT, { recursive: true });

const saves = JSON.parse(execFileSync('npx', ['tsx', 'tools/arm-saves.ts'], { cwd: ROOT, encoding: 'utf8' }));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: LANG === 'fr' ? 'fr-FR' : 'en-GB' });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${LANG}-${name}.png`) });
  console.log(`shot ${LANG}-${name}`);
};
const T =
  LANG === 'fr'
    ? { cont: 'Continuer', night: 'Attendre la nuit', begin: 'Prendre le poste', car: 'Prendre le break', drive: 'Y aller', leave: 'Reprendre le break' }
    : { cont: 'Continue', night: 'Wait for night', begin: 'Take the desk', car: 'Take the car', drive: 'Drive there', leave: 'Back to the car' };

/** Loads a save and resumes it from the title screen. `fresh` forgets that the one-handed desk was ever explained. */
async function open(save, fresh = true) {
  await page.goto(URL);
  await page.evaluate(([s, lang, keep]) => {
    const coach = localStorage.getItem('putrid-swarm.coach');
    const hand = localStorage.getItem('putrid-swarm.coach-hand');
    localStorage.clear();
    if (coach) localStorage.setItem('putrid-swarm.coach', coach);
    localStorage.setItem('putrid-swarm.coach', '1');
    if (keep && hand) localStorage.setItem('putrid-swarm.coach-hand', hand);
    localStorage.setItem('putrid-swarm.save.v1', s);
    localStorage.setItem('putrid-swarm.lang', lang);
    localStorage.setItem('putrid-swarm.sound', 'off');
  }, [save, LANG, !fresh]);
  await page.reload();
  await wait(2500);
  await page.getByText(T.cont, { exact: false }).first().click();
  await wait(1500);
}
const click = async (text) => {
  await page.getByText(text, { exact: true }).first().click();
  await wait(900);
};

// ───────────── The day: the top bar, a drive to the garage, a search, the way home ─────────────
await open(saves.day);
await shot('01-day');
await click(T.car);
await shot('02-map');
await page.locator('.pin', { hasText: LANG === 'fr' ? 'Le garage' : 'garage' }).first().click();
await wait(400);
await click(T.drive);
await wait(300);
await shot('03-drive-town');
await page.keyboard.press('Space');
await wait(1800);
await shot('04-garage');

await open(saves.loaded);
await page.getByText(T.leave, { exact: false }).first().click();
await wait(1200);
await shot('05-home-trunk');

await open(saves.van);
await wait(500);
await shot('06-van');

await open(saves.morning);
await shot('07-morning');

// ───────────── The night: the hand at the desk ─────────────
await open(saves.evening);
await click(T.night);
await wait(600);
await shot('08-nightfall');
await click(T.begin);
await wait(1200);
await shot('09-night-intro');
// A camera, then a trap key: the camera waits for the hand, the key waits behind it for the camera.
await page.keyboard.press('KeyQ');
await wait(150);
await page.keyboard.press('Digit2');
await page.keyboard.press('KeyQ');
await wait(350);
await shot('10-night-hand-crossing');
await wait(800);
await shot('11-night-camera-switched');
await wait(1100);
await shot('12-night-trap-fired');
// The rest of the night, faster, with the cameras worked the way a player would.
await page.keyboard.press('F4');
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('Space');
  await wait(120);
  for (const key of ['KeyQ', 'KeyW', 'KeyE']) await page.keyboard.press(key);
  await wait(600);
  if (i === 6) await shot('13-night-busy');
  const done = await page.evaluate(() => !document.querySelector('.trap-bar'));
  if (done) break;
}
await wait(4000);
await shot('14-after-night');

console.log(errors.length ? `console:\n${errors.join('\n')}` : 'console clean');
await browser.close();

#!/usr/bin/env node
// Dev aid: plays the orchard down each of its branches and saves a screenshot at every beat.
//   node tools/orchard-shots.mjs <outDir> [branch,…] [baseUrl]
// Branches: spared, maimed, throat, bled, turned, night (the camera going dark). PS_LANG=en for English.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? 'shots');
const BRANCHES = (process.argv[3] ?? 'spared,maimed,throat,bled,turned,night').split(',');
const URL = process.argv[4] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const LANG = process.env.PS_LANG ?? 'fr';
mkdirSync(OUT, { recursive: true });

const saves = JSON.parse(execFileSync('npx', ['tsx', 'tools/orchard-saves.ts'], { cwd: ROOT, encoding: 'utf8' }));
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
const prompts = () => page.locator('.qte').evaluateAll((nodes) => nodes.map((n) => n.className.replace('qte ', '').split(' ')[0].replace('qte-', '')));
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')));
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
};
/** Holds a key until a prompt shows up (or goes away). */
const holdUntil = async (key, id, present = true, timeout = 9000) => {
  await page.keyboard.down(key);
  await page.waitForFunction(([cls, want]) => (document.querySelector(`.qte-${cls}`) !== null) === want, [id, present], { timeout });
  await page.keyboard.up(key);
};
const waitFor = (id, timeout = 9000) => page.waitForSelector(`.qte-${id}`, { timeout });

async function open(save) {
  await page.goto(URL);
  await page.evaluate(([s, lang]) => {
    const seen = localStorage.getItem('putrid-swarm.orchard.seen');
    localStorage.clear();
    if (seen) localStorage.setItem('putrid-swarm.orchard.seen', seen);
    localStorage.setItem('putrid-swarm.save.v1', s);
    localStorage.setItem('putrid-swarm.lang', lang);
    localStorage.setItem('putrid-swarm.sound', 'off');
  }, [save, LANG]);
  await page.reload();
  await wait(2500);
  await page.getByText(LANG === 'fr' ? 'Continuer' : 'Continue', { exact: false }).first().click();
  await wait(1200);
}

const T = LANG === 'fr' ? { toOrchard: 'Aller voir au verger', begin: 'Prendre le poste', night: 'Attendre la nuit' } : { toOrchard: 'Go and look in the orchard', begin: 'Take the desk', night: 'Wait for night' };

/** From the morning report to the foot of the pole. */
async function walkIn(tag) {
  await open(saves.morning);
  if (tag) await shot(`${tag}-00-morning`);
  await page.getByText(T.toOrchard, { exact: true }).click();
  await wait(1500);
  if (tag) await shot(`${tag}-01-title`);
  await waitFor('walk_in');
  await wait(300);
  if (tag) await shot(`${tag}-02-wide`);
  await page.keyboard.down('ArrowUp');
  await wait(1500);
  if (tag) await shot(`${tag}-03-walking`);
  await waitFor('approach');
  await page.keyboard.up('ArrowUp');
  await wait(900);
  if (tag) await shot(`${tag}-04-rabbit`);
}

/** Up to it, arm up in time, torn off. */
async function getBitten(tag, guard = true) {
  await page.keyboard.down('ArrowUp');
  await wait(1100);
  if (tag) await shot(`${tag}-05-closer`);
  await page.waitForFunction(() => document.querySelector('.qte') === null, null, { timeout: 5000 });
  await page.keyboard.up('ArrowUp');
  await wait(1150);
  if (tag) await shot(`${tag}-06-turned`);
  await waitFor('guard');
  if (!guard) {
    // Too slow on purpose: the screenshot alone takes a good part of the window.
    await wait(250);
    if (tag) await shot(`${tag}-07-lunge`);
    return;
  }
  await wait(150);
  await page.keyboard.press('Space');
  await wait(350);
  if (tag) await shot(`${tag}-08-clamped`);
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Space');
    await wait(130);
  }
  await wait(250);
  if (tag) await shot(`${tag}-09-flung`);
  await waitFor('go_right');
  await wait(900);
  if (tag) await shot(`${tag}-10-loose`);
}

async function saw(tag) {
  await page.keyboard.press('ArrowDown');
  await wait(900);
  await shot(`${tag}-16-kneeling`);
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press(i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight');
    await wait(170);
    if (i === 7) await shot(`${tag}-17-sawing`);
  }
}

for (const branch of BRANCHES) {
  if (branch === 'spared') {
    await walkIn('a');
    await hold('ArrowLeft', 900);
    await shot('a-05-toward-tree');
    await holdUntil('ArrowLeft', 'look_saw');
    await wait(500);
    await shot('a-06-tree');
    await page.keyboard.press('Space');
    await wait(600);
    await holdUntil('ArrowRight', 'approach');
    await holdUntil('ArrowRight', 'look_rope');
    await wait(500);
    await shot('a-07-fence');
    await holdUntil('ArrowLeft', 'approach');
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('ArrowRight');
    await wait(60);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowRight');
    await wait(300);
    await shot('a-08-clapped');
    await wait(1200);
    await shot('a-09-gone');
    await page.keyboard.down('Space');
    await wait(1300);
    await shot('a-10-splicing');
    await page.waitForSelector('.orchard-card', { timeout: 12000 });
    await page.keyboard.up('Space');
    await wait(900);
    await shot('a-11-card');
    await page.locator('.orchard-card .btn').click();
    await wait(1500);
    await shot('a-12-day');
    const s = await state();
    console.log('spared:', s.phase, s.day, s.orchard, s.hoursLeft);
  }
  if (branch === 'maimed') {
    await walkIn(null);
    await getBitten('b');
    await holdUntil('ArrowRight', 'take_rope');
    await wait(400);
    await shot('b-11-fence');
    await page.keyboard.down('Space');
    await wait(1200);
    await shot('b-12-tying');
    await page.waitForFunction(() => document.querySelector('.orchard-meter.tied') !== null, null, { timeout: 6000 });
    await page.keyboard.up('Space');
    await wait(400);
    await shot('b-13-tied');
    await holdUntil('ArrowLeft', 'take_saw', true, 12000);
    await wait(300);
    await shot('b-14-tree');
    await page.keyboard.press('Space');
    await wait(500);
    await shot('b-15-saw-taken');
    console.log('prompts with saw and tourniquet:', await prompts());
    await saw('b');
    await wait(700);
    await shot('b-18-white');
    await wait(3300);
    await shot('b-19-later');
    await page.waitForSelector('.orchard-card', { timeout: 12000 });
    await wait(900);
    await shot('b-20-card');
    await page.locator('.orchard-card .btn').click();
    await wait(1500);
    await shot('b-21-day');
    const s = await state();
    console.log('maimed:', s.phase, s.day, s.orchard, s.hoursLeft);
  }
  if (branch === 'throat') {
    await walkIn(null);
    await getBitten('c', false);
    await wait(700);
    await shot('c-08-too-late');
    await wait(3600);
    await shot('c-09-end');
    const s = await state();
    console.log('throat:', s.phase, s.fate, s.orchard);
    await page.getByText(LANG === 'fr' ? 'Retourner au verger' : 'Back to the orchard', { exact: true }).click();
    await wait(2500);
    await shot('c-10-again');
  }
  if (branch === 'bled') {
    await walkIn(null);
    await getBitten(null);
    await holdUntil('ArrowLeft', 'take_saw');
    await page.keyboard.press('Space');
    await wait(900);
    await shot('d-15-saw-no-rope');
    await saw('d');
    await wait(1800);
    await shot('d-18-bleeding');
    await wait(3200);
    await shot('d-19-bleeding-late');
    await wait(4500);
    await shot('d-20-end');
    const s = await state();
    console.log('bled:', s.phase, s.fate);
  }
  if (branch === 'turned') {
    await walkIn(null);
    await getBitten(null);
    await wait(14000);
    await shot('e-11-half');
    await wait(14000);
    await shot('e-12-nearly');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).phase === 'lost', null, { timeout: 20000 });
    await wait(1500);
    await shot('e-13-end');
    const s = await state();
    console.log('turned:', s.phase, s.fate);
  }
  if (branch === 'night') {
    await open(saves.evening);
    await page.getByText(T.night, { exact: true }).click();
    await wait(1200);
    await page.getByText(T.begin, { exact: true }).click();
    await wait(1500);
    await page.keyboard.press('F4');
    await page.keyboard.press('Digit4');
    await page.waitForFunction(() => document.querySelector('.mini.dark') !== null || document.querySelector('.banner .bad') !== null, null, { timeout: 60000 }).catch(() => {});
    await page.keyboard.press('F4');
    await wait(500);
    await shot('n-01-signal-lost');
    await page.keyboard.press('Digit1');
    await wait(1200);
    await shot('n-02-mini-dark');
  }
}

console.log(errors.length ? `console issues:\n${[...new Set(errors)].join('\n')}` : 'no console issues');
await browser.close();

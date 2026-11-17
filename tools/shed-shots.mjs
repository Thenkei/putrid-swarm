#!/usr/bin/env node
// Dev aid: plays the shed down each of its branches and saves a screenshot at every beat.
//   node tools/shed-shots.mjs <outDir> [branch,…] [baseUrl]
// Branches: freed, current (the leads, two answers, then leaving him chained), finished, emptied, bitten,
// onearm (the water given with one hand), chief (the day-6 card). PS_LANG=en for English.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? 'shots');
const BRANCHES = (process.argv[3] ?? 'freed,current,finished,emptied,bitten,onearm,chief').split(',');
const URL = process.argv[4] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const LANG = process.env.PS_LANG ?? 'fr';
mkdirSync(OUT, { recursive: true });

const saves = JSON.parse(execFileSync('npx', ['tsx', 'tools/shed-saves.ts'], { cwd: ROOT, encoding: 'utf8' }));
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
/** Where the needle stands, 0..1. */
const presence = () => page.evaluate(() => parseFloat(document.querySelector('.shed-gauge .needle')?.style.left ?? '0') / 100);
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
};
/** Holds a key until a prompt shows up (or goes away). */
const holdUntil = async (key, id, present = true, timeout = 12000) => {
  await page.keyboard.down(key);
  await page.waitForFunction(([cls, want]) => (document.querySelector(`.qte-${cls}`) !== null) === want, [id, present], { timeout });
  await page.keyboard.up(key);
};
/** Holds a key until the needle has got to `level` (or the hold is no longer offered). */
const holdTo = async (key, level, timeout = 20000) => {
  await page.keyboard.down(key);
  await page
    .waitForFunction((want) => parseFloat(document.querySelector('.shed-gauge .needle')?.style.left ?? '0') / 100 >= want || document.querySelector('.qte') === null, level, { timeout })
    .catch(() => console.log(`  (needle stopped at ${level})`));
  await page.keyboard.up(key);
};
const waitFor = (id, timeout = 12000) => page.waitForSelector(`.qte-${id}`, { timeout });
const waitAsk = (timeout = 15000) => page.waitForSelector('.qte.ask', { timeout });
/** Lets an answer run, then waits until he can be dealt with again. */
const listen = async (tag) => {
  await wait(1400);
  if (tag) await shot(tag);
  await page.waitForFunction(() => document.querySelector('.qte') !== null, null, { timeout: 15000 });
  if (await page.locator('.qte-dodge').count()) await page.keyboard.press('ArrowDown');
  await wait(400);
};

async function open(save) {
  await page.goto(URL);
  await page.evaluate(([s, lang]) => {
    const seen = localStorage.getItem('putrid-swarm.shed.seen');
    localStorage.clear();
    if (seen) localStorage.setItem('putrid-swarm.shed.seen', seen);
    localStorage.setItem('putrid-swarm.save.v1', s);
    localStorage.setItem('putrid-swarm.lang', lang);
    localStorage.setItem('putrid-swarm.sound', 'off');
  }, [save, LANG]);
  await page.reload();
  await wait(2500);
  await page.getByText(LANG === 'fr' ? 'Continuer' : 'Continue', { exact: false }).first().click();
  await wait(1200);
}

const T = LANG === 'fr' ? { toShed: 'Aller à la cabane', retry: 'Retourner à la cabane' } : { toShed: 'Go to the shed', retry: 'Back to the shed' };

/** From the morning report to the post. */
async function walkIn(tag, save = saves.morning) {
  await open(save);
  if (tag) await shot(`${tag}-00-morning`);
  await page.getByText(T.toShed, { exact: true }).click();
  await wait(1500);
  if (tag) await shot(`${tag}-01-title`);
  await waitFor('walk_in');
  await wait(300);
  if (tag) await shot(`${tag}-02-door`);
  await page.keyboard.down('ArrowUp');
  await wait(1300);
  if (tag) await shot(`${tag}-03-walking`);
  await waitFor('approach');
  await page.keyboard.up('ArrowUp');
  await wait(900);
  if (tag) await shot(`${tag}-04-post`);
}

/** The bowl from the shelf, back to the post, crouched by him, and water until he comes back. */
async function water(tag, save) {
  await walkIn(tag, save);
  await holdTo('Space', 0.44);
  if (tag) await shot(`${tag}-05-sitting`);
  await holdUntil('ArrowRight', 'take_bowl');
  await wait(700);
  if (tag) await shot(`${tag}-06-shelf`);
  await page.keyboard.press('Space');
  await wait(400);
  await holdUntil('ArrowLeft', 'approach');
  await holdUntil('ArrowUp', 'give_water');
  await wait(300);
  if (tag) await shot(`${tag}-07-close`);
  await page.keyboard.down('Space');
  await wait(1200);
  if (tag) await shot(`${tag}-08-drinking`);
  await page.waitForFunction(() => document.querySelector('.qte') === null, null, { timeout: 12000 });
  await page.keyboard.up('Space');
  await wait(1500);
  if (tag) await shot(`${tag}-09-flash`);
  await waitAsk();
  await wait(400);
  if (tag) await shot(`${tag}-10-window`);
}

for (const branch of BRANCHES) {
  if (branch === 'freed') {
    await water('a');
    console.log('prompts in the window:', await prompts());
    await holdTo('Space', 0.83);
    await page.keyboard.press('Digit2');
    await page.keyboard.press('ArrowDown');
    await listen('a-11-answer-tonight');
    await shot('a-12-after');
    await holdTo('Space', 0.79);
    await wait(200);
    await shot('a-13-named-silence');
    await page.keyboard.press('Digit1');
    await listen('a-14-answer-stash');
    // Empty hands: the bowl back on the shelf.
    await holdUntil('ArrowRight', 'take_flour');
    for (let i = 0; i < 2 && (await page.locator('.qte-take_bowl').count()) === 0; i++) {
      await page.keyboard.press('Space');
      await wait(300);
    }
    await holdUntil('ArrowLeft', 'approach');
    await holdTo('Space', 0.79);
    await holdUntil('ArrowUp', 'step_back');
    await waitFor('unlock', 4000).catch(() => console.log('  (no unlock offered)'));
    await page.keyboard.down('Space');
    await wait(900);
    await shot('a-15-unlocking');
    await page.waitForFunction(() => document.querySelector('.qte') === null, null, { timeout: 6000 });
    await page.keyboard.up('Space');
    await wait(2200);
    await shot('a-16-standing');
    await wait(2000);
    await shot('a-17-leaving');
    await page.waitForSelector('.orchard-card', { timeout: 12000 });
    await wait(900);
    await shot('a-18-card');
    await page.locator('.orchard-card .btn').click();
    await wait(1800);
    await shot('a-19-day');
    const s = await state();
    console.log('freed:', s.phase, s.day, s.shed, s.intel, s.hoursLeft, s.inventory);
  }
  if (branch === 'current') {
    await walkIn('b');
    await holdUntil('ArrowLeft', 'take_leads');
    await wait(600);
    await shot('b-05-bench');
    await page.keyboard.press('Space');
    await wait(500);
    await shot('b-06-leads');
    await holdUntil('ArrowRight', 'clip');
    await page.keyboard.press('Space');
    await wait(700);
    await shot('b-07-wired');
    await holdUntil('ArrowLeft', 'current');
    await wait(400);
    await shot('b-08-bench-wired');
    await page.keyboard.down('Space');
    await wait(900);
    await shot('b-09-the-wall');
    await page.waitForFunction(() => parseFloat(document.querySelector('.shed-gauge .needle')?.style.left ?? '0') >= 82 || document.querySelector('.qte') === null, null, { timeout: 8000 });
    await page.keyboard.up('Space');
    await wait(1200);
    await shot('b-10-flash-hurt');
    await waitAsk();
    await holdTo('Space', 0.86);
    await page.keyboard.press('Digit1');
    await listen('b-11-answer-stash');
    await holdTo('Space', 0.87);
    await page.keyboard.press('Digit3');
    await listen('b-12-answer-chief');
    await holdTo('Space', 0.9);
    await page.keyboard.press('Digit4');
    await listen('b-13-the-first');
    await shot('b-14-spent');
    await holdUntil('ArrowRight', 'leave');
    await page.keyboard.down('ArrowDown');
    await wait(700);
    await shot('b-15-leaving');
    await page.waitForSelector('.orchard-card', { timeout: 12000 });
    await page.keyboard.up('ArrowDown');
    await wait(900);
    await shot('b-16-card');
    await page.locator('.orchard-card .btn').click();
    await wait(1800);
    await shot('b-17-day');
    const s = await state();
    console.log('current:', s.phase, s.day, s.shed, s.intel, s.hoursLeft);
  }
  if (branch === 'finished') {
    await walkIn(null);
    await holdTo('Space', 0.44);
    await holdUntil('ArrowLeft', 'take_hammer');
    await page.keyboard.press('ArrowUp');
    await wait(500);
    await shot('c-05-hammer');
    await holdUntil('ArrowRight', 'approach');
    await holdUntil('ArrowUp', 'strike');
    await wait(300);
    await shot('c-06-crouched');
    await page.keyboard.press('Space');
    await wait(900);
    await shot('c-07-wall');
    await wait(1400);
    await shot('c-08-blow');
    await page.waitForSelector('.orchard-card', { timeout: 12000 });
    await wait(900);
    await shot('c-09-card');
    const s = await state();
    console.log('finished (before settling):', s.shed);
  }
  if (branch === 'emptied') {
    await walkIn(null);
    await holdUntil('ArrowLeft', 'take_leads');
    await page.keyboard.press('Space');
    await holdUntil('ArrowRight', 'clip');
    await page.keyboard.press('Space');
    await holdUntil('ArrowLeft', 'current');
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('.qte') === null, null, { timeout: 8000 });
    await page.keyboard.up('Space');
    await waitFor('current', 10000);
    await page.keyboard.down('Space');
    await wait(1500);
    await shot('d-05-breaking');
    await page.waitForFunction(() => document.querySelector('.qte') === null, null, { timeout: 12000 });
    await page.keyboard.up('Space');
    await wait(1500);
    await shot('d-06-emptied');
    await wait(2200);
    await shot('d-07-wall');
    await page.waitForSelector('.orchard-card', { timeout: 12000 });
    await wait(900);
    await shot('d-08-card');
  }
  if (branch === 'bitten') {
    await walkIn(null);
    await holdUntil('ArrowUp', 'dodge');
    await wait(250);
    await shot('e-05-lunge');
    await wait(900);
    await shot('e-06-too-late');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).phase === 'lost', null, { timeout: 8000 });
    await wait(1500);
    await shot('e-07-end');
    const s = await state();
    console.log('bitten:', s.phase, s.fate, s.shed);
    await page.getByText(T.retry, { exact: true }).click();
    await wait(2500);
    await shot('e-08-again');
  }
  if (branch === 'onearm') {
    await water('f', saves.oneArm);
    await holdTo('Space', 0.83);
    await shot('f-11-one-hand');
  }
  if (branch === 'chief') {
    await open(saves.chiefDay);
    await wait(800);
    await shot('g-01-chief-day');
  }
}

console.log(errors.length ? `console issues:\n${[...new Set(errors)].join('\n')}` : 'no console issues');
await browser.close();

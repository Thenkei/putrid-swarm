#!/usr/bin/env node
// Dev aid: plays the radio down each of its branches and saves a screenshot at every beat.
//   node tools/radio-shots.mjs <outDir> [branch,…] [baseUrl]
// Branches (each a kind of caller and an answer):
//   ham      the man on the hill, nobody met: stayed on the line, then day 7 and its "tonight" card
//   silence  the man on the hill, never answered
//   baker    the band with the broadcast and the baker's round on it, then switched off
//   dealer   La Brocanteuse owes a crate, the committee listening: the address given, then day 7
//   camper   Le Campeur owes, bitten: "come and hold a door", then day 7
//   grudge   La Brocanteuse for the committee, six of them: two planks
//   van      Le Campeur for the van lot, alone: "come alone"
//   hangup   Le Campeur owes: the shed, then hung up while he answers
//   onearm   one-armed: the hand going from the knob to the microphone and back
//   night    night 7 with the camper at the back door, until he turns
//   finale   the last evening with the camper in the shed: the mower comes out past him
//   end      the end screen after night 7, with the radio's last line
// PS_LANG=en for English. The set is tuned off the trace, as a player would: the voice's peak against the dial's line.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? 'shots');
const BRANCHES = (process.argv[3] ?? 'ham,silence,baker,dealer,camper,grudge,van,hangup,onearm,night,finale,end').split(',');
const URL = process.argv[4] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const LANG = process.env.PS_LANG ?? 'fr';
mkdirSync(OUT, { recursive: true });

const saves = JSON.parse(execFileSync('npx', ['tsx', 'tools/radio-saves.ts'], { cwd: ROOT, encoding: 'utf8' }));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: LANG === 'fr' ? 'fr-FR' : 'en-GB' });
// The content warning is said once per browser: these tours are not here to read it.
await page.addInitScript(() => localStorage.setItem('putrid-swarm.warned', '1'));
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const T =
  LANG === 'fr'
    ? { cont: 'Continuer', go: 'Aller à la radio', night: 'Attendre la nuit', begin: 'Prendre le poste' }
    : { cont: 'Continue', go: 'Go to the radio', night: 'Wait for night', begin: 'Take the desk' };

const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`shot ${name}`);
};
const voice = () => page.evaluate(() => Number(document.querySelector('.radio')?.dataset.voice ?? 0));
const beat = () => page.evaluate(() => document.querySelector('.radio')?.dataset.beat ?? '');
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')));
const waitBeat = (want, timeout = 30000) => page.waitForFunction((b) => document.querySelector('.radio')?.dataset.beat === b, want, { timeout });

async function open(save) {
  await page.goto(URL);
  await page.evaluate(
    ([s, lang]) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('putrid-swarm.save.v1', s);
      localStorage.setItem('putrid-swarm.lang', lang);
      localStorage.setItem('putrid-swarm.sound', 'off');
    },
    [save, LANG],
  );
  await page.reload();
  await wait(2500);
  await page.getByText(T.cont, { exact: false }).first().click();
  await wait(1200);
}

/**
 * Keeps the dial on the voice as a player would, reading the trace: the voice's peak against the dial's line.
 * Runs until `done` says so (checked between turns) or the time is up. Shots can be taken on the way, at given times.
 */
async function track(ms, done = async () => false, marks = []) {
  const start = Date.now();
  const pending = [...marks];
  while (Date.now() - start < ms) {
    if (await done()) return true;
    while (pending.length && Date.now() - start >= pending[0].at) await shot(pending.shift().name);
    const peak = await page.evaluate(() => Number(document.querySelector('.radio')?.dataset.peak ?? 0));
    if (Math.abs(peak) < 0.005) {
      await wait(50);
      continue;
    }
    const key = peak > 0 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    await wait(Math.min(220, Math.max(30, (Math.abs(peak) / 0.14) * 1000 * 0.7)));
    await page.keyboard.up(key);
  }
  return done();
}

/** From the morning report to a voice found: leaning in, then sweeping up the band until something comes in. */
async function find(tag, save) {
  await open(save);
  if (tag) await shot(`${tag}-00-morning`);
  await page.getByText(T.go, { exact: true }).click();
  await wait(1500);
  if (tag) await shot(`${tag}-01-title`);
  await page.waitForSelector('.qte-lean', { timeout: 12000 });
  if (tag) await shot(`${tag}-02-desk`);
  await page.keyboard.down('ArrowUp');
  await wait(900);
  if (tag) await shot(`${tag}-03-leaning`);
  await waitBeat('search');
  await page.keyboard.up('ArrowUp');
  await wait(700);
  if (tag) await shot(`${tag}-04-static`);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => Number(document.querySelector('.radio')?.dataset.peak ?? 1) < 0.07, null, { timeout: 15000 });
  await page.keyboard.up('ArrowRight');
  if (tag) await shot(`${tag}-05-something`);
  await track(20000, async () => (await beat()) === 'hail');
  await wait(600);
  if (tag) await shot(`${tag}-06-found`);
}

/** Answers the call — again if it was not heard — and listens until they ask. */
async function converse(tag) {
  for (let i = 0; i < 4 && (await beat()) === 'hail'; i++) {
    await track(1500, async () => (await voice()) > 0.8);
    await page.keyboard.press('Space');
    await wait(700);
    if (tag && i === 0) await shot(`${tag}-07-hello`);
    await track(9000, async () => !['hail', 'hello'].includes(await beat()) || ((await beat()) === 'hail' && (await page.locator('.qte-hello').count()) > 0));
  }
  await track(60000, async () => (await beat()) === 'answer', tag ? [{ at: 2500, name: `${tag}-08-talk` }, { at: 9000, name: `${tag}-09-talk` }] : []);
  await wait(500);
  if (tag) await shot(`${tag}-10-asked`);
}

/** Says the n-th answer, again if it did not reach them, and listens to the end. */
async function reply(tag, n) {
  for (let i = 0; i < 4 && (await beat()) === 'answer'; i++) {
    await track(1200, async () => (await voice()) > 0.8);
    await page.keyboard.press(`Digit${n}`);
    await wait(900);
    if (tag && i === 0) await shot(`${tag}-11-answering`);
    await track(9000, async () => (await beat()) !== 'reply' && (await beat()) !== 'answer');
    if ((await beat()) === 'reply') await track(9000, async () => (await beat()) !== 'reply');
  }
  await track(30000, async () => !['response', 'answer', 'reply'].includes(await beat()), tag ? [{ at: 1800, name: `${tag}-12-response` }] : []);
}

/** The recap card, and the day it leads to. */
async function card(tag, settle = true) {
  await page.waitForSelector('.radio-card', { timeout: 15000 });
  await wait(900);
  await shot(`${tag}-13-card`);
  console.log(`${tag} card:`, (await page.locator('.radio-card').innerText()).replace(/\n+/g, ' | '));
  if (!settle) return;
  await page.locator('.radio-card .btn').click();
  await wait(1800);
  await shot(`${tag}-14-day`);
  const s = await state();
  console.log(`${tag} day:`, s.phase, s.day, s.hoursLeft, JSON.stringify(s.inventory), JSON.stringify(s.radio.took), s.radio.ending, s.radio.answer, JSON.stringify(s.radio.sighted), JSON.stringify(s.people));
}

for (const branch of BRANCHES) {
  if (branch === 'ham') {
    await find('a', saves.ham);
    await converse('a');
    console.log('ham answers:', await page.locator('.qte.ask').allInnerTexts());
    await reply('a', 1);
    await card('a');
    await page.locator('.tonight').screenshot({ path: join(OUT, 'a-15-tonight.png') });
  }
  if (branch === 'silence') {
    await find(null, saves.ham);
    await converse(null);
    await track(12000, async () => false, [{ at: 4000, name: 'b-10-waiting' }, { at: 10000, name: 'b-11-nudge' }]);
    await track(20000, async () => (await beat()) === 'outro', [{ at: 4000, name: 'b-12-gone' }]);
    await card('b', false);
  }
  if (branch === 'baker') {
    await open(saves.baker);
    await page.getByText(T.go, { exact: true }).click();
    await page.waitForSelector('.qte-lean', { timeout: 12000 });
    await page.keyboard.down('ArrowUp');
    await waitBeat('search');
    await page.keyboard.up('ArrowUp');
    await page.keyboard.down('ArrowRight');
    await wait(1450);
    await page.keyboard.up('ArrowRight');
    await wait(1500);
    await shot('c-04-news');
    await page.keyboard.down('ArrowRight');
    await wait(950);
    await page.keyboard.up('ArrowRight');
    await wait(1500);
    await shot('c-05-baker');
    await page.keyboard.down('ArrowDown');
    await wait(700);
    await shot('c-06-switching-off');
    await page.waitForFunction(() => document.querySelector('.radio')?.dataset.beat === 'outro', null, { timeout: 5000 });
    await page.keyboard.up('ArrowDown');
    await wait(1200);
    await shot('c-07-off');
    await card('c', false);
  }
  if (branch === 'dealer') {
    await find('d', saves.dealerOwes);
    await converse('d');
    await reply('d', 1);
    await card('d');
  }
  if (branch === 'camper') {
    await find(null, saves.camperOwes);
    await converse('e');
    await reply('e', 1);
    await card('e');
    await page.locator('.tonight').screenshot({ path: join(OUT, 'e-15-tonight.png') });
  }
  if (branch === 'grudge') {
    await find(null, saves.dealerGrudge);
    await converse('f');
    await reply('f', 2);
    await card('f');
  }
  if (branch === 'van') {
    await find(null, saves.camperGrudge);
    await converse('g');
    await reply('g', 3);
    await card('g');
  }
  if (branch === 'hangup') {
    await find(null, saves.camperOwes);
    await converse(null);
    await track(1200, async () => (await voice()) > 0.8);
    await page.keyboard.press('Digit2');
    await track(12000, async () => (await beat()) === 'response');
    await wait(800);
    await page.keyboard.down('ArrowDown');
    await wait(600);
    await shot('h-12-hanging-up');
    await page.waitForFunction(() => document.querySelector('.radio')?.dataset.beat === 'outro', null, { timeout: 5000 });
    await page.keyboard.up('ArrowDown');
    await card('h');
  }
  if (branch === 'onearm') {
    await find('i', saves.oneArm);
    await track(1500, async () => (await voice()) > 0.85);
    await page.keyboard.press('Space');
    await wait(450);
    await shot('i-07-hand-going');
    await wait(1000);
    await shot('i-08-hand-on-mic');
    await page.keyboard.down('ArrowRight');
    await wait(400);
    await page.keyboard.up('ArrowRight');
    await converse('i');
    await reply('i', 1);
    await card('i', false);
  }
  if (branch === 'night') {
    await open(saves.eveningAlly);
    await wait(1200);
    await page.getByText(T.night, { exact: true }).click();
    await wait(1200);
    await page.getByText(T.begin, { exact: true }).click();
    await wait(1800);
    await shot('j-01-night-ally');
    await page.keyboard.press('F4');
    await page.waitForFunction(() => [...document.querySelectorAll('.banner *')].some((n) => /retourné|turned/.test(n.textContent ?? '')), null, { timeout: 120000 }).catch(() => console.log('  (he did not turn in time)'));
    await shot('j-02-turned');
  }
  if (branch === 'finale') {
    await open(saves.doomedGuest);
    await wait(1200);
    await page.getByText(T.night, { exact: true }).click();
    await wait(1200);
    await page.getByText(T.begin, { exact: true }).click();
    await wait(1500);
    await page.keyboard.press('F4');
    await page.waitForSelector('.finale-title', { state: 'attached', timeout: 120000 });
    await wait(1500);
    await shot('k-01-shed');
    console.log('shed:', (await page.locator('.finale-title').innerText()).replace(/\n+/g, ' | '));
  }
  if (branch === 'end') {
    await open(saves.endHeld);
    await wait(2500);
    await shot('l-01-end');
    console.log('end:', (await page.locator('.center-col').innerText()).replace(/\n+/g, ' | '));
  }
}

console.log(errors.length ? `console issues:\n${[...new Set(errors)].join('\n')}` : 'no console issues');
await browser.close();

#!/usr/bin/env node
// Dev aid: opens the game on each kind of encounter (from saves built by tools/encounter-saves.ts),
// plays through the ways out and saves a screenshot at every step.
//   node tools/encounter-shots.mjs <outDir> [baseUrl]
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';
import { fillTimberOrder } from './timber.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? 'shots');
const URL = process.argv[3] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const LANG = process.env.PS_LANG ?? 'fr';
mkdirSync(OUT, { recursive: true });

const saves = JSON.parse(execFileSync('npx', ['tsx', 'tools/encounter-saves.ts'], { cwd: ROOT, encoding: 'utf8' }));

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: LANG === 'fr' ? 'fr-FR' : 'en-GB' });
// The content warning is said once per browser: these tours are not here to read it.
await page.addInitScript(() => localStorage.setItem('putrid-swarm.warned', '1'));
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
const choices = () => page.locator('.choice').evaluateAll((nodes) => nodes.map((n) => `${n.classList.contains('blocked') ? '✗ ' : ''}${n.querySelector('b')?.textContent} [${n.querySelector('.when')?.textContent ?? ''}]`));
const pick = async (label) => {
  await page.locator('.choice', { hasText: label }).first().click();
  await wait(350);
};
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')));

/** Loads a save and resumes it from the title screen. */
async function open(save) {
  await page.goto(URL);
  await page.evaluate(([s, lang]) => {
    localStorage.clear();
    localStorage.setItem('putrid-swarm.save.v1', s);
    localStorage.setItem('putrid-swarm.lang', lang);
    localStorage.setItem('putrid-swarm.sound', 'off');
  }, [save, LANG]);
  await page.reload();
  await wait(2500);
  await page.getByText(LANG === 'fr' ? 'Continuer' : 'Continue', { exact: false }).first().click();
  await wait(1200);
}

const T = LANG === 'fr'
  ? { share: 'Partager', play: 'Jouer aux rondelles', threaten: 'Insister', fight: 'En venir aux mains', later: 'Voir d’abord', ok: 'Continuer', pay: 'Donner ce qu', defend: 'Défendre', detour: 'Faire le tour', favor: 'Rappeler', leave: 'Reprendre le break', car: 'Prendre le break', hardware: 'La quincaillerie', drive: 'Y aller' }
  : { share: 'Share', play: 'Play washers', threaten: 'Insist', fight: 'Come to blows', later: 'Look around', ok: 'Continue', pay: 'Hand over what', defend: 'Defend', detour: 'Go round', favor: 'Call in', leave: 'Back to the car', car: 'Take the car', hardware: 'hardware', drive: 'Drive there' };

// ── The whole trip, the way a player meets it: refuge → map → shop → dispute → road → refuge.
await open(saves.home);
await page.getByText(T.car, { exact: false }).first().click();
await wait(900);
await page.locator('.pin', { hasText: T.hardware }).click();
await wait(300);
await page.getByText(T.drive, { exact: true }).click();
await wait(5200);
await shot('00a-arrival');
await pick(T.share);
await shot('00b-shared');
await page.getByText(T.ok, { exact: true }).click();
await wait(300);
await page.locator('.spot:not(.done)').first().click();
await fillTimberOrder(page);
await wait(700);
await page.getByText(T.leave, { exact: false }).click();
await wait(1500);
await shot('00c-home-stretch');
await wait(4500);
await shot('00d-refuge');
{
  const s = await state();
  console.log('trip:', s.where, JSON.stringify(s.inventory), s.outing, JSON.stringify(s.people), s.hoursLeft);
}

// ── A dispute: look around first, then the wager.
await open(saves.dispute);
await shot('01-dispute-menu');
console.log('dispute:', await choices());
await page.getByText(T.later, { exact: false }).click();
await wait(400);
await shot('02-location-claimed');
await page.locator('.spot').nth(0).click();
await fillTimberOrder(page);
await wait(600);
await page.locator('.spot.claimed').click();
await wait(400);
await shot('03-dispute-with-load');
console.log('with a load:', await choices());
await pick(T.play);
await wait(1500);
await shot('04-washers-aim');
for (let i = 0; i < 3; i++) {
  // Let go when the cursor is over the tin: read it off the canvas-free state is not possible, so time it.
  await page.waitForFunction(() => !document.querySelector('.encounter .btn-primary')?.disabled, null, { timeout: 8000 });
  await wait(420 + i * 30);
  await page.keyboard.press('Space');
  await wait(900);
  if (i === 0) await shot('05-washers-thrown');
}
await wait(1800);
await shot('06-washers-result');
console.log('after the wager:', JSON.stringify((await state()).outing), JSON.stringify((await state()).people));
await page.getByText(T.ok, { exact: true }).click();
await wait(400);
await shot('07-location-after');

// ── A dispute that turns sour: threat refused, then blows.
await open(saves.dispute);
await pick(T.threaten);
await shot('08-refused');
console.log('refused:', await choices());
await pick(T.fight);
await shot('09-fight-1');
console.log('fight:', await page.locator('.choice').evaluateAll((nodes) => nodes.map((n) => `${n.querySelector('b')?.textContent}: ${n.querySelector('small')?.textContent}`)));
await page.keyboard.press('Digit2');
await wait(400);
await shot('10-fight-2');
await page.keyboard.press('Digit1');
await wait(500);
await shot('11-fight-result');

// ── The camper.
if (saves.camper) {
  await open(saves.camper);
  await shot('12-camper');
  console.log('camper:', await choices());
}

// ── The neighbours' roadblock: paying, piece by piece.
await open(saves.committee);
await shot('13-roadblock');
console.log('roadblock:', await choices());
await pick(T.pay);
await shot('14-pay');
await page.locator('.pay-row .step').nth(0).click();
await wait(200);
await page.locator('.pay-row').nth(1).locator('.step').nth(1).click();
await wait(200);
await shot('15-pay-adjusted');
await page.locator('.encounter .btn-primary').click();
await wait(400);
await shot('16-paid');
await page.getByText(T.ok, { exact: true }).click();
await wait(1500);
await shot('17-home-stretch');
await wait(4200);
await shot('18-home');
console.log('home:', JSON.stringify((await state()).inventory), (await state()).where, (await state()).outing);

// ── The van: standing one's ground.
if (saves.van) {
  await open(saves.van);
  await shot('19-van');
  console.log('van:', await choices());
  await pick(T.defend);
  await shot('20-van-fight');
  await page.keyboard.press('Digit1');
  await wait(500);
  await shot('21-van-result');
}

console.log(errors.length ? `console issues:\n${[...new Set(errors)].join('\n')}` : 'no console issues');
await browser.close();

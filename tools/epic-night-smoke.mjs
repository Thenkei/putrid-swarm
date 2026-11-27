// Run against a production preview. No development hooks or simulated button events.
// node --import tsx tools/epic-night-smoke.mjs http://localhost:4173/ [screenshot-directory]
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { newGame } from '../src/core/game.ts';
import { NightSim } from '../src/core/night.ts';
import { launch } from './browser.mjs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3];
if (out) await mkdir(out, { recursive: true });
const browser = await launch();
const errors = [];
async function openSave(state, mobile = false) {
  const page = await browser.newPage({
    locale: 'en-GB', viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    hasTouch: mobile, isMobile: mobile, reducedMotion: mobile ? 'reduce' : 'no-preference',
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
  await page.addInitScript(save => {
    localStorage.setItem('putrid-swarm.save.v1', JSON.stringify(save));
    localStorage.setItem('putrid-swarm.warned', '1');
  }, state);
  await page.goto(url);
  if (mobile) await page.locator('.gate button').tap();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  return page;
}

try {
  const page = await openSave({ ...newGame(54), day: 3, phase: 'night' }, true);
  const tap = name => page.getByRole('button', { name, exact: true }).tap();
  await tap('Wait for night'); // Restored nights restart at the refuge at dusk.
  await tap('Take the desk');
  await tap('Develop the print');
  await tap('Dip the paper');
  await page.getByText('Details are sharp', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  const resume = page.getByRole('button', { name: 'Resume', exact: true });
  assert.ok(await resume.evaluate(el => el === document.activeElement));
  await page.waitForTimeout(3200); // longer than the entire sharp exposure window
  await resume.tap();
  assert.ok(await page.getByRole('button', { name: 'Lift the print' }).evaluate(el => el === document.activeElement));
  if (out) await page.screenshot({ path: join(out, 'garage-print-portrait.png') });
  await tap('Lift the print');
  await page.getByText(/brass glints at the edge of a pocket/).waitFor();
  await tap('Back to the desk');
  assert.equal(await page.locator('.epic-night').count(), 0);
  // Decode the actual shipped samples from the same relative base as GitHub Pages.
  const decoded = await page.evaluate(async () => {
    const manifest = await (await fetch('./assets/audio/manifest.json')).json();
    const audio = new AudioContext();
    try {
      const ids = [...Object.keys(manifest).filter(id => /^(vo_)?epic_/.test(id)), 'vhs_eject', 'baker_bowl_slide', 'letter_fold'];
      return await Promise.all(ids.map(async id => {
        const response = await fetch('./assets/audio/' + manifest[id].file);
        const sample = await audio.decodeAudioData(await response.arrayBuffer());
        return [id, sample.duration, sample.getChannelData(0).some(x => Math.abs(x) > .01)];
      }));
    } finally { await audio.close(); }
  });
  assert.ok(decoded.length >= 7 && decoded.every(([,duration, signal]) => duration > .1 && signal), JSON.stringify(decoded));
  await page.close();

  const spoiled = await openSave({ ...newGame(54), day: 3, phase: 'night' }, true);
  for (const name of ['Wait for night', 'Take the desk', 'Develop the print', 'Dip the paper']) {
    await spoiled.getByRole('button', { name, exact: true }).tap();
  }
  await spoiled.getByText(/The print is unreadable/).waitFor();
  await spoiled.getByRole('button', { name: 'Field notebook', exact: true }).tap();
  await spoiled.getByText(/A ring peeks out of Gérard/).waitFor();
  const darkroomFlags = await spoiled.evaluate(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).flags);
  assert.equal(darkroomFlags['epic.found.pocket'], 1);
  assert.ok(!darkroomFlags['epic.garagePrint']);
  await spoiled.close();

  const refuge = await openSave({ ...newGame(54), day: 6, flags: { 'epic.photo': 1, 'epic.moped': 1 } });
  await refuge.locator('summary').filter({ hasText: 'Ashtray and lamp' }).click();
  await refuge.getByRole('button', { name: 'Look out of the window' }).click();
  await refuge.getByRole('button', { name: 'Inspect the lamp' }).click();
  await refuge.getByRole('button', { name: 'Set the lamp in the window' }).click();
  await refuge.getByRole('button', { name: 'Back to the yard' }).click();
  await refuge.locator('summary').filter({ hasText: 'bladed moped' }).click();
  await refuge.getByRole('button', { name: /Aim at/ }).click();
  const flags = await refuge.evaluate(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).flags);
  assert.equal(flags['epic.lamp'], 1);
  assert.equal(flags['epic.lane'], 1);
  await refuge.close();
  // A sacrificed stove predates the lock print in existing saves. Both mornings
  // have the meal, while only a completed, sooty key return leaves a mark.
  for (const printed of [false, true]) {
    const kitchen = await openSave({ ...newGame(54), day: 3, flags: { 'epic.stove': 1, ...(printed && { 'epic.sootyLock': 1 }) } });
    await kitchen.locator('summary').filter({ hasText: 'Clean patch of lino' }).click();
    const photo = kitchen.locator('.stove-morning-photo');
    await photo.locator('img').evaluate(img => img.decode());
    assert.equal(await photo.locator('.stove-soot-print').count(), Number(printed));
    await kitchen.close();
  }
  const mail = newGame(54);
  const letter = await openSave({ ...mail, day:5, phase:'morning',
    lastNight:{ ...new NightSim(5, mail.yard, mail.seed).report(), letterDelivered:true } });
  const readComplaint = () => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).flags['epic.readComplaint'];
  assert.equal(await letter.evaluate(readComplaint), undefined);
  await letter.locator('summary').filter({hasText:'Open the registered letter'}).click();
  await letter.waitForFunction(readComplaint);
  assert.equal(await letter.evaluate(readComplaint), 1);
  await letter.close();
  assert.deepEqual(errors, []);
  console.log('Passed: portrait print, pause/resume, focus, desk return, refuge discoveries, both stove mornings, ' + decoded.length + ' decoded sound files.');
} finally {
  await browser.close();
}

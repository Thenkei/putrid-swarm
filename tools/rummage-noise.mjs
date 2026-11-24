#!/usr/bin/env node
// Play a noisy search through a reload, an abandoned attempt, a failure and a delivery.
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { launch } from './browser.mjs';

const { newGame, travelTo, prepareSearch } = await tsImport('../src/core/game.ts', import.meta.url);
const { makeNoise } = await tsImport('../src/core/street-noise.ts', import.meta.url);
const visit = travelTo({ ...newGame(1), day: 3 }, 'garage');
assert.ok(visit.ok);
const base = makeNoise(visit.value.state, 2);
const save = { ...base, encounter: null, outing: { ...base.outing, major: true } };
const attempt = prepareSearch(save,3);
assert.ok(attempt.ok);
const noiseKey = 'noise:garage:3:' + save.locations.garage.visits;
const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await launch();

try {
  let junkName;
  for (const outcome of ['reload', 'leave', 'success', 'failure']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(save => {
      localStorage.setItem('putrid-swarm.lang', 'fr');
      localStorage.setItem('putrid-swarm.warned', '1');
      if (!localStorage.getItem('putrid-swarm.save.v1')) localStorage.setItem('putrid-swarm.save.v1', JSON.stringify(save));
    }, save);
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')));
    const resume = () => page.getByRole('button', {name:'Continuer',exact:true}).click();
    await page.goto(url);
    await resume();
    await page.locator('[data-spot="3"]').click();
    // The four quiet probes and one loud probe reveal all but one box.
    const quiet = await page.locator('.rummage-item:not(.loud)').all();
    const tested = [...quiet, page.locator('.rummage-item.loud').first()];
    for (const card of tested) {
      if (outcome === 'failure' && await card.locator('strong').innerText() === junkName) continue;
      await card.locator('button').first().click();
    }
    const paid = await read();
    assert.equal(paid.flags[noiseKey], 3);
    assert.ok(paid.hoursLeft < save.hoursLeft);
    if (outcome === 'leave') await page.keyboard.press('Escape');
    if (outcome === 'success') {
      const good = await page.locator('.rummage-item[data-state=good]').all();
      junkName = await page.locator('.rummage-item:not(.loud)[data-state=junk] strong').first().innerText();
      if (good.length === 1) good.push(page.locator('.rummage-item[data-state=unknown]'));
      for (const card of good) await card.locator('button').last().click();
    }
    if (outcome === 'failure') {
      const wrong = page.locator('.rummage-item[data-state=unknown]').filter({hasText:junkName});
      await wrong.locator('button').last().click();
    }
    await page.reload();
    await resume();
    await page.locator('.street-noise').waitFor();
    const after = await read();
    assert.equal(after.flags[noiseKey], outcome === 'failure' ? 4 : 3);
    assert.equal(after.hoursLeft, paid.hoursLeft);
    assert.equal(after.locations.garage.searched.includes(3), outcome === 'success');
    if (outcome === 'success') {
      assert.deepEqual(after.outing.trunk, attempt.value.success.state.outing.trunk);
      await page.locator('.loc-leave button').click();
      await page.locator('.travel-summary .center-col').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).where === 'home');
      const home = await read();
      for (const [id, units] of Object.entries(after.outing.trunk)) assert.equal(home.inventory[id], save.inventory[id]+units);
    } else assert.deepEqual(after.outing.trunk, save.outing.trunk);
    console.log(outcome+' verified');
    await context.close();
  }
} finally { await browser.close(); }

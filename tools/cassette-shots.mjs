// Play a real night with the desk on the orchard, then inspect the saved footage from the winning highlight.
// node tools/cassette-shots.mjs <outDir> [devServerUrl]     PS_LANG=en for English
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch } from './browser.mjs';

const out = resolve(process.argv[2] ?? 'shots');
mkdirSync(out, { recursive: true });
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(lang => {
    localStorage.setItem('putrid-swarm.warned', '1');
    localStorage.setItem('putrid-swarm.coach', '1');
    localStorage.setItem('putrid-swarm.lang', lang);
  }, process.env.PS_LANG ?? 'fr');
  await page.goto(process.argv[3] ?? 'http://localhost:5173');
  const ready = () => page.waitForFunction(() => window.__app && !window.__app.pendingScene && window.__app.fade === 0);
  await ready();
  await page.evaluate(async () => {
    const { goNight } = await import('/src/scenes/flow.ts');
    const { newGame, startNight } = await import('/src/core/game.ts');
    const app = window.__app;
    app.state = startNight(newGame(42)).value;
    goNight(app);
  });
  await page.waitForFunction(() => window.__app.scene.sim);
  await page.keyboard.press('Digit4');
  await page.keyboard.press('F4');
  const launchTape = page.locator('.tape-launch');
  await launchTape.waitFor({ timeout: 120000 });
  await launchTape.click();
  await page.screenshot({ path: join(out, '01-birthday.png') });
  await page.waitForFunction(() => Number(document.querySelector('.vcr-deck input').value) > 2);
  await page.locator('.play-key').click();
  const scrub = page.locator('.vcr-deck input');
  const paused = await scrub.inputValue();
  await page.waitForTimeout(250);
  assert.equal(await scrub.inputValue(), paused);
  await scrub.focus();
  await page.keyboard.press('End');
  await page.screenshot({ path: join(out, '02-playback.png') });
  await page.locator('.tape-yard').click();
  assert(await page.evaluate(() => window.__app.scene.inspecting));
  await page.waitForTimeout(750);
  await page.screenshot({ path: join(out, '03-yard.png') });
  await page.reload();
  await ready();
  await page.evaluate(async () => {
    const { resumeGame } = await import('/src/scenes/flow.ts');
    const app = window.__app;
    resumeGame(app, app.loadSave());
  });
  await launchTape.click();
  assert.equal(await page.locator('.family-frame').count(), 0);
  console.log('Verified capture, pause, seek, daylight inspection and morning reload.');
} finally {
  await browser.close();
}

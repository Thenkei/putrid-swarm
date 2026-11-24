// node tools/finale-touch.mjs <dev URL>. The scene clock is observed only to time the taps.
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { launch } from './browser.mjs';

const { newGame } = await tsImport('../src/core/game.ts', import.meta.url);
const browser = await launch();
try {
  for (const hard of [false, true]) {
    const page = await browser.newPage({
      locale: 'en-GB', isMobile: true, hasTouch: true,
      viewport: hard ? { width: 844, height: 390 } : { width: 390, height: 844 },
    });
    await page.addInitScript(({ save, mode }) => {
      localStorage.setItem('putrid-swarm.warned', '1');
      localStorage.setItem('putrid-swarm.sound', 'off');
      localStorage.setItem('putrid-swarm.save.v1', JSON.stringify(save));
      localStorage.setItem('putrid-swarm.jam', mode);
    }, { save: { ...newGame(8), day: 6, phase: 'lost', orchard: hard ? 'maimed' : 'spared' }, mode: hard ? 'hard' : 'soft' });
    await page.goto(process.argv[2] ?? 'http://localhost:5173/');
    await page.locator('.gate button').tap();
    for (const name of ['Continue', 'Play the song again']) await page.getByRole('button', { name, exact: true }).tap();
    const pads = page.getByRole('button', { name: /^Play chord / });
    await pads.first().waitFor();
    assert.equal(await pads.count(), hard ? 6 : 3);
    const notes = await page.evaluate(() => window.__app.scene.chart.slice(0, 4));
    for (const note of notes) {
      const box = await pads.nth(note.chord).boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44);
      await page.waitForFunction(time => window.__app.scene.now >= time, note.time - 0.018, { polling: 'raf' });
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    }
    const jam = await page.evaluate(() => window.__app.scene.jam);
    assert.equal(jam.strums, 4);
    assert.equal(jam.good + jam.perfect, 4);
    assert.ok(jam.mown >= 8);
    console.log(hard ? 'Hard / one arm' : 'Soft', jam);
    await page.close();
  }
} finally {
  await browser.close();
}

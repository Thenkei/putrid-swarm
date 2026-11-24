// Play the second outing through the normal menu. Observe which painted cels actually reach the canvas.
// node tools/window-descent-check.mjs <preview URL> [capture directory]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { launch } from './browser.mjs';

const [url, out] = process.argv.slice(2);
if (!url) throw new Error('Pass the URL of the game preview.');
if (out) await mkdir(out, { recursive: true });
const { newGame } = await tsImport('../src/core/game.ts', import.meta.url);
const browser = await launch();
try {
  for (const [oneArm, reduced] of [[false, false], [true, false], [true, true]]) {
    const state = newGame(17);
    state.day = 3;
    state.locations.garage.visits = 1;
    if (oneArm) state.orchard = 'maimed';
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'fr-FR',
      reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ save, capture }) => {
      localStorage.setItem('putrid-swarm.warned', '1');
      localStorage.setItem('putrid-swarm.save.v1', JSON.stringify(save));
      const seen = window.descentCels = {};
      const original = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
        original.call(this, image, ...args);
        if (this.canvas.id !== 'game' || args.length !== 8 || !image.src) return;
        const [x, y] = args;
        let id;
        if (image.src.endsWith('/hero_window_descent.webp')) {
          const row = y / image.naturalHeight > .5 ? 'one' : 'two';
          id = row + '-' + Math.round(3 * x / image.naturalWidth);
        } else if (image.src.endsWith('/hero_departure.webp') && Math.abs(x / image.naturalWidth - .5) < .01
            && y / image.naturalHeight > .44 && y / image.naturalHeight < .46) {
          id = 'two-full-grip';
        }
        if (id && !(id in seen)) {
          seen[id] = true;
          if (capture) queueMicrotask(() => { seen[id] = this.canvas.toDataURL(); });
        }
      };
    }, { save: state, capture: !!out });
    await page.goto(url);
    await page.locator('[data-menu-item="continue"]').click();
    await page.getByRole('button', { name: 'Prendre le break' }).click();
    await page.locator('.pin:not(.home):not(.locked)').first().click();
    await page.locator('.map-card .btn-primary').click();
    await page.locator('.travel-summary:not([hidden]) .center-col').waitFor();
    const cels = await page.evaluate(() => window.descentCels);
    const row = oneArm ? 'one' : 'two';
    const expected = reduced ? [] : [row+'-0', row+'-1', row+'-2', ...(!oneArm ? ['two-full-grip'] : [])];
    assert.deepEqual(Object.keys(cels).sort(), expected.sort());
    if (out) for (const [id, image] of Object.entries(cels)) {
      await writeFile(join(out, id+'.png'), Buffer.from(image.split(',')[1], 'base64'));
    }
    await page.locator('.travel-summary .center-col').click();
    await page.locator('.travel-summary').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    console.log(row+' arm, '+(reduced ? 'reduced motion' : 'regular motion')+': departure and road verified');
    await page.close();
  }
} finally { await browser.close(); }

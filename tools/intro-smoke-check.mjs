// node tools/intro-smoke-check.mjs <dev-server-url> [output-directory]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launch } from './browser.mjs';

const [url, out] = process.argv.slice(2);
if (out) await mkdir(out, { recursive: true });
const browser = await launch();
try {
  for (const motion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({ reducedMotion: motion, viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => localStorage.setItem('putrid-swarm.warned', '1'));
    await page.goto(url);
    await page.locator('.menu button').first().waitFor({ state: 'attached' });
    await page.evaluate(async () => {
      const { sprite } = await import('/src/engine/assets.ts');
      window.introArtReady = () => !!sprite('plate_title_desk') && !!sprite('plate_smoke') && !!sprite('fx_smoke');
    });
    await page.waitForFunction(() => window.introArtReady());
    const hashes = [];
    for (const hz of [30, 60, 144]) {
      const result = await page.evaluate(async hz => {
        const { IntroScene } = await import('/src/scenes/title.ts');
        const canvas = document.createElement('canvas');
        canvas.width = 1280; canvas.height = 720;
        const ctx = canvas.getContext('2d');
        const draw = ctx.drawImage.bind(ctx);
        let count = 0;
        ctx.drawImage = (image, ...args) => {
          if (image.src?.endsWith('/fx_smoke.webp')) count++;
          draw(image, ...args);
        };
        const ui = document.createElement('div');
        const fixture = { ui, ctx, save() {}, go() { this.started = true; } };
        const rand = Math.random;
        try {
          let seed = 54;
          Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
          const scene = new IntroScene(fixture);
          scene.enter();
          if (!ui.querySelector('.desk-note')) throw new Error('The post-it is missing during the news');
          scene.onKeyDown('Space');
          if (ui.querySelector('.desk-note')) throw new Error('The post-it is still visible after the news');
          function advance(seconds, target = scene) {
            for (let frame = 0; frame < Math.round(seconds * hz); frame++) target.update((frame + 1) / hz - frame / hz);
          }
          function paint() { count = 0; scene.render(ctx); return count; }
          paint(); const opening = canvas.toDataURL();
          advance(1); paint(); const still = opening === canvas.toDataURL();
          advance(2); const clouds = paint(), image = canvas.toDataURL();
          scene.onKeyDown('Space');
          const skipped = paint();
          advance(1); const cleared = paint();
          const card = !!ui.querySelector('.later h1');
          const clean = ctx.getImageData(640, 360, 1, 1).data.join(',');
          ui.replaceChildren();
          const cut = new IntroScene(fixture);
          cut.enter();
          for (let seconds = 0; seconds < 60 && ui.querySelector('.news'); seconds++) cut.update(1);
          if (ui.querySelector('.news, .desk-note')) throw new Error('The news and post-it should be gone after the automatic cut');
          advance(4.9, cut);
          const before = !ui.querySelector('.later');
          advance(.2, cut); const automatic = !!ui.querySelector('.later');
          count = 0; cut.render(ctx); const automaticClouds = count;
          advance(5, cut); const held = !fixture.started;
          advance(.3, cut);
          return { clouds, image, still, skipped, cleared, card, clean, before, automatic, automaticClouds, held, started: !!fixture.started };
        } finally { Math.random = rand; }
      }, hz);
      const reduced = motion === 'reduce';
      assert.equal(result.clouds, reduced ? 0 : 93, JSON.stringify({ motion, hz, ...result, image: undefined }));
      assert.equal(result.still, reduced);
      assert.equal(result.skipped > 0, !reduced);
      assert.equal(result.cleared + result.automaticClouds, 0);
      assert.equal(result.clean, '207,199,184,255');
      assert.ok(result.card && result.before && result.automatic && result.held && result.started);
      const png = Buffer.from(result.image.split(',')[1], 'base64');
      hashes.push(createHash('sha256').update(png).digest('hex'));
      if (out && hz === 60) await writeFile(join(out, 'smoke-' + motion + '.png'), png);
      console.log(motion, hz + ' Hz', result.clouds + ' clouds', hashes.at(-1));
    }
    assert.equal(new Set(hashes).size, 1);
    await page.close();
  }
} finally { await browser.close(); }

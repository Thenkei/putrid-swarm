// Start pnpm gate-study, then run: node tools/field-guide-study.mjs <screenshot-directory>
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const out = resolve(process.argv[2] ?? 'shots');
const origin = process.env.PS_GUIDE_ORIGIN ?? 'http://127.0.0.1:5186';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-GB' });
  await context.addInitScript(() => {
    for (const key of ['warned', 'coach', 'hint.v2']) localStorage.setItem('putrid-swarm.' + key, '1');
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const ready = () =>
    page.waitForFunction(() => document.querySelector('.guide-inspection canvas') && document.querySelector('#ui').style.opacity === '1');
  const shot = (name) => page.screenshot({ path: join(out, name + '.png') });
  await page.goto(origin + '/?showcase=fence');
  await ready();
  await page.locator('button[data-stage=broken]').click();
  await page.waitForFunction(() => window.__app.scene.age >= 1.0);
  await shot('palisade-broken');
  const moves = {};
  for (const kind of ['defence', 'mob']) {
    await page.locator('button[data-kind=' + kind + ']').click();
    const entries = await page.locator('.guide-item').evaluateAll((nodes) => nodes.map((n) => n.dataset.asset));
    assert.equal(entries.length, kind === 'mob' ? 11 : 7);
    for (const id of entries) {
      await page.locator('button[data-asset="' + id + '"]').click();
      const steps = await page.locator('.guide-stages button').evaluateAll((nodes) => nodes.map((n) => n.dataset.stage));
      const end = kind === 'mob' ? 'fallen' : 'broken';
      assert.ok(steps.includes(end));
      const poses = {};
      for (const step of steps) {
        await page.locator('button[data-stage="' + step + '"]').click();
        assert.equal(await page.locator('.field-guide').getAttribute('data-stage'), step);
        poses[step] = await page.evaluate(() => {
          const guide = window.__app.scene,
            saved = guide.age;
          const scratch = document.createElement('canvas');
          scratch.width = 240;
          scratch.height = 120;
          const ctx = scratch.getContext('2d', { willReadFrequently: true });
          try {
            return [0.03, 0.35, 1.35].map((t) => {
              guide.age = t;
              guide.render();
              ctx.clearRect(0, 0, 240, 120);
              ctx.drawImage(guide.preview.canvas, 0, 0, 240, 120);
              const data = ctx.getImageData(0, 0, 240, 120).data;
              let hash = 2166136261;
              for (const n of data) hash = Math.imul(hash ^ n, 16777619);
              return hash >>> 0;
            });
          } finally {
            guide.age = saved;
          }
        });
      }
      assert.notEqual(poses[steps[0]][2], poses[end][2], id + ' must have a settled wreck or defeated silhouette');
      assert.notEqual(poses[end][0], poses[end][2], id + ' must visibly fall apart or collapse');
      const signature = kind === 'mob' ? steps[1] : id === 'fence' ? 'impact' : 'active';
      assert.ok(new Set(poses[signature]).size > 1, id + ' action must move');
      moves[id] = steps;
    }
  }
  await page.locator('button[data-asset=mechanic]').click();
  await page.locator('button[data-stage=attack]').click();
  await shot('mechanic');
  const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
  await zoom.click({clickCount:3});
  assert.ok(await page.evaluate(() => window.__app.scene.zoom > 2), 'The inspection camera must reach the face and fabric');
  await shot('mechanic-close');
  const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });
  await zoomOut.click({clickCount:3});
  await page.locator('button[data-night=true]').click();
  await page.locator('button[data-stage=fallen]').click();
  await page.waitForFunction(() => window.__app.scene.age > 0.95);
  await shot('mechanic-fallen-night');
  await page.getByRole('button', { name: 'Turn left', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const frozen = await page.evaluate(() => window.__app.scene.age);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.evaluate(() => window.__app.scene.age), frozen);
  await page.locator('.guide-tour').click();
  const tour = await page.evaluate(() => {
    const scene = window.__app.scene,
      seen = [];
    // The normal update handles the transition at the end of every clip.
    for (let i = 0; i < 180 && scene.tour; i++) {
      seen.push([scene.entry.id, scene.step]);
      scene.update(10);
    }
    return { seen, last: scene.step, paused: scene.paused };
  });
  const expected = Object.entries(moves).flatMap(([asset, stages]) => stages.map(stage => [asset, stage]));
  assert.deepEqual(tour.seen, expected);
  assert.equal(tour.last, 'fallen');
  assert.equal(tour.paused, true);
  assert.equal(await page.evaluate(() => localStorage.getItem('putrid-swarm.save.v1')), null);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Field guide', exact: true }).focus();
  await page.keyboard.press('Enter');
  await ready();
  await page.locator('.guide-inspection canvas').evaluate(canvas => canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByText('Illustrated view', { exact: true }).waitFor();
  await page.locator('button[data-stage=broken]').click();
  await page.waitForFunction(() => document.querySelector('.guide-illustration')?.naturalWidth > 0);

  // Enter from an actual build card and come back to the same campaign and placement selection.
  await page.goto(origin + '/');
  await page.waitForFunction(() => window.__app?.scene?.view && document.querySelector('#ui').style.opacity === '1');
  await page.keyboard.press('Digit4');
  const saved = await page.evaluate(() =>
    JSON.stringify({ state: window.__app.state, mode: window.__app.scene.mode, view: window.__app.scene.view }),
  );
  await page.getByRole('button', { name: 'Field guide', exact: true }).click();
  await ready();
  assert.equal(await page.locator('.field-guide').getAttribute('data-asset'), 'log');
  await page.keyboard.press('Escape');
  await page.locator('.field-guide').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Field guide', exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => JSON.stringify({ state: window.__app.state, mode: window.__app.scene.mode, view: window.__app.scene.view })),
    saved,
  );

  const fallback = await context.newPage();
  await fallback.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (mode, ...args) {
      return mode === 'webgl2' ? null : get.call(this, mode, ...args);
    };
  });
  await fallback.goto(origin + '/?showcase=deer');
  await fallback.getByText('Illustrated view', { exact: true }).waitFor();
  await fallback.locator('button[data-stage=fallen]').click();
  assert.equal(await fallback.locator('.guide-illustration').isVisible(), true);
  assert.equal(await fallback.locator('.field-guide').getAttribute('data-stage'), 'fallen');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ models: Object.keys(moves).length, clips: expected.length, toured: tour.seen.length, last: tour.last, errors }));
} finally {
  await browser.close();
}

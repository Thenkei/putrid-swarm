#!/usr/bin/env node
// Dev aid: what the home phase costs to draw. Prints the one-off cost of painting the ground and
// the per-frame cost of the yard by day and of the night desk (main feed and one thumbnail).
//   node tools/home-perf.mjs [baseUrl]
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? process.env.PS_URL ?? 'http://localhost:5173/';
// PS_GPU=1 asks headless Chrome for the real GPU; without it the picture is rasterised in software,
// which overstates the cost of every full-screen blend.
const gpu = process.env.PS_GPU ? ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: gpu });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: Number(process.env.PS_SCALE ?? 2) });
await page.goto(URL);
await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
await page.waitForTimeout(1500);

const result = await page.evaluate(async () => {
  const world = await import('/src/render/world.ts');
  const game = await import('/src/core/game.ts');
  const op = await import('/tests/operator.ts');
  const flow = await import('/src/scenes/flow.ts');
  const app = window.__app;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const out = {};

  const t = performance.now();
  world.prepareWorld?.();
  out.groundBuildMs = Math.round(performance.now() - t);

  /**
   * The game as it runs: the time between displayed frames over `seconds`, and how long the
   * scene's own update and render take inside each of them.
   */
  const frames = async (seconds) => {
    const scene = app.scene;
    const work = [];
    const render = scene.render.bind(scene);
    const update = scene.update.bind(scene);
    let started = 0;
    scene.update = (dt) => {
      started = performance.now();
      update(dt);
    };
    scene.render = (ctx) => {
      render(ctx);
      work.push(performance.now() - started);
    };
    const gaps = [];
    let last = 0;
    const end = performance.now() + seconds * 1000;
    await new Promise((resolve) => {
      const tick = (now) => {
        if (last) gaps.push(now - last);
        last = now;
        if (now < end) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    scene.update = update;
    scene.render = render;
    const stats = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { median: +(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(2), p95: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(2) };
    };
    return { frames: gaps.length, frameGapMs: stats(gaps), sceneWorkMs: stats(work) };
  };

  app.state = { ...op.layout(game.newGame(42), 5), day: 3, hoursLeft: 6 };
  flow.goDay(app);
  await sleep(1200);
  out.day = await frames(4);

  const started = game.startNight({ ...op.layout(game.newGame(42), 5), day: 5 });
  app.state = started.value;
  localStorage.setItem('putrid-swarm.coach', '1');
  flow.goNight(app);
  await sleep(1200);
  // Let the night fill up at development speed, then measure it at its real pace.
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F4' }));
  await sleep(5000);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F4' }));
  out.nightEnemies = app.scene.sim.enemies.length;
  out.night = await frames(4);
  return out;
});
console.log(JSON.stringify(result, null, 2));
await browser.close();

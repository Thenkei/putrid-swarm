// Browser acceptance + paired frame timings. Start "pnpm gate-study" first.
// node tools/gate-study.mjs <screenshot-directory>
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const out = resolve(process.argv[2] ?? 'shots');
const density = process.env.PS_STUDY_DPR === '2' ? 2 : 1;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--enable-gpu-rasterization'] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: density, locale: 'en-GB' });
  const page = await context.newPage();
  await context.addInitScript(() => {
    for (const name of ['warned', 'hint.v2', 'coach']) localStorage.setItem('putrid-swarm.' + name, '1');
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5186');
  const mode = page.getByRole('button', { name: '3D yard preview' });
  await mode.waitFor({ timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('#ui').style.opacity === '1');
  assert.equal(await mode.getAttribute('aria-pressed'), 'true');
  const shot = name => page.screenshot({ path: join(out, name + '.png') });
  const select = async enabled => {
    if (await mode.getAttribute('aria-pressed') !== String(enabled)) await mode.click();
    assert.equal(await mode.getAttribute('aria-pressed'), String(enabled));
    await page.mouse.move(3, 3);
  };
  const benchmark = () => page.evaluate(async () => {
    // Same world snapshot for both renderers; the night still refreshes one thumbnail per frame.
    const scene = window.__app.scene;
    const original = scene.render;
    const work = [];
    const gaps = [];
    let last;
    scene.render = function(ctx) {
      const before = performance.now();
      original.call(this, ctx);
      work.push(performance.now() - before);
      if (last !== undefined) gaps.push(before - last);
      last = before;
    };
    try {
      while (gaps.length < 100) await new Promise(requestAnimationFrame);
    } finally { scene.render = original; }
    const p95 = a => +a.slice(10).sort((x, y) => x - y)[Math.ceil((a.length - 10) * 0.95) - 1].toFixed(1);
    return { p95FrameMs: p95(gaps), p95RenderMs: p95(work) };
  });
  const report = {};
  report.parallaxPixels = await page.evaluate(async () => (await import('/tools/relief-study.mjs')).measureParallax());
  const [left, front, right] = report.parallaxPixels;
  assert.ok(left < -4 && Math.abs(front) < 0.6 && right > 4, 'View-dependent relief: ' + report.parallaxPixels);

  const dayPoint = (x, y) => page.evaluate(async ([x, y]) => {
    const { project } = await import('/src/render/projection.ts');
    return project(window.__app.scene.view, x + 0.5, y + 0.5);
  }, [x, y]);
  const place = async (x, y) => {
    const point = await dayPoint(x, y);
    await page.mouse.click(point.x, point.y);
  };
  const devices = () => page.evaluate(() => window.__app.state.yard.devices);
  const original = await devices();
  for (const enabled of [true, false]) {
    await select(enabled);
    await page.keyboard.press('Digit5');
    await place(11, 11);
    assert.equal((await devices()).length, original.length);
    const facing = await page.evaluate(() => window.__app.scene.facing);
    await page.keyboard.press('KeyF');
    await place(10, 8);
    const placed = (await devices()).at(-1);
    assert.deepEqual([placed.type, placed.x, placed.y, placed.facing], ['barrier', 10, 8, 1 - facing]);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    assert.deepEqual(await devices(), original);
    await page.keyboard.press('KeyR');
    await page.keyboard.press('KeyR');
  }
  await page.waitForFunction(() => !document.querySelector('#toast')?.childElementCount);
  for (const enabled of [false, true]) {
    await select(enabled);
    await shot(enabled ? 'day-3d' : 'day-2d');
    report[enabled ? 'day3d' : 'day2d'] = await benchmark();
  }
  // Inspect the material work at the closest normal placement zoom, from both directions.
  await page.mouse.move(780, 350);
  await page.mouse.wheel(0, -600 * density);
  await page.waitForFunction(() => window.__app.scene.view.zoom === 1.5);
  await page.mouse.move(3, 3);
  await shot('day-front-detail');
  const definition = () => page.evaluate(async () => (await import('/tools/yard-detail-study.mjs')).definitionStudy());
  report.definition = await definition();
  assert.ok(report.definition.renderWidth >= Math.ceil(report.definition.viewWidth * density), JSON.stringify({ definition: report.definition, errors }));
  assert.ok(report.definition.wagonTexture[1] > report.definition.wagonTexture[0]);
  // Keep the geometry and camera fixed while advancing only the preparation hour.
  const originalHours = await page.evaluate(() => {
    const app = window.__app, hours = app.state.hoursLeft;
    app.state = { ...app.state, hoursLeft: 1 };
    app.scene.refresh();
    return hours;
  });
  await page.waitForFunction(async () => (await import('/tools/yard-detail-study.mjs')).definitionStudy().sunX > 20);
  await shot('day-evening');
  await page.evaluate(hours => { const app = window.__app; app.state = { ...app.state, hoursLeft: hours }; app.scene.refresh(); }, originalHours);
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.__app.scene.view.rot === 1);
  await shot('day-back-detail');
  for (const rot of [0, 1]) {
    const data = await page.evaluate((rot) => {
      const scene = window.__app.scene;
      const saved = { rot: scene.rot, cx: scene.cx, cy: scene.cy, zoom: scene.zoom, showRoutes: scene.showRoutes };
      try {
        const sign = rot ? -1 : 1;
        Object.assign(scene, { rot, cx: 16 - sign * 0.9, cy: 14.5 - sign * 0.9, zoom: 3.2, showRoutes: false });
        const view = scene.view,
          canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 350;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width / 2 - view.x - view.w / 2, canvas.height / 2 - view.y - view.h / 2);
        scene.render(ctx);
        return canvas.toDataURL('image/png').split(',')[1];
      } finally {
        Object.assign(scene, saved);
      }
    }, rot);
    writeFileSync(join(out, rot ? 'wagon-rear.png' : 'wagon-front.png'), Buffer.from(data, 'base64'));
  }
  await page.getByRole('button', { name: 'Wait for night', exact: true }).click();
  await page.getByRole('button', { name: 'Wait', exact: true }).click();
  await page.getByRole('button', { name: 'Take the desk', exact: true }).click();
  await mode.waitFor();
  await page.waitForFunction(() => document.querySelector('#ui').style.opacity === '1');
  assert.equal(await mode.getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => {
    const scene = window.__app.scene;
    // Freeze after advancing a real wave. Each view gets the exact same agents and clock.
    while (scene.sim.time < 42) scene.update(1 / 60);
    scene.studyUpdate = scene.update.bind(scene);
    scene.update = () => {};
    scene.banners.replaceChildren();
  });
  const clickTrap = async (type, lift) => {
    const point = await page.evaluate(async ([type, lift]) => {
      const scene = window.__app.scene;
      const d = scene.sim.devices.find(d => d.type === type);
      const { project } = await import('/src/render/projection.ts');
      const view = scene.viewFor('portail', { x: 12, y: 54, w: 884, h: 497 }, 1.22);
      // Aim at one floodlight head. Clicking the gate tests its actual lowered slats.
      const p = project(view, d.x + 0.5 + (type === 'floodlight' ? 0.23 : 0), d.y + 0.5 + (type === 'barrier' ? 0.35 : 0.14));
      return { x: p.x, y: p.y - lift * view.zoom };
    }, [type, lift]);
    await page.mouse.click(point.x, point.y);
    const state = await page.evaluate(type => window.__app.scene.sim.devices.find(d => d.type === type).state, type);
    assert.equal(state, 'active', type + ' must fire from a click on its model');
  };
  await clickTrap('floodlight', 65);
  await clickTrap('barrier', 17);
  await page.evaluate(() => {
    const scene = window.__app.scene;
    for (let i = 0; i < 16; i++) scene.studyUpdate(1 / 60);
  });
  report.enemies = await page.evaluate(() => window.__app.scene.sim.enemies.filter(e => e.alive).length);
  assert.ok(report.enemies > 0);
  for (const enabled of [true, false]) {
    await select(enabled);
    await page.evaluate(() => window.__app.scene.syncHud(true));
    await shot(enabled ? 'night-3d' : 'night-2d');
    report[enabled ? 'night3d' : 'night2d'] = await benchmark();

  }
  await select(true);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Digit' + (i + 1));
    const camera = await page.evaluate(() => window.__app.scene.cam);
    assert.equal(camera, ['portail', 'grange', 'arriere', 'verger'][i]);
  }
  // Render all the campaign actors through real wave plans. Keep the busiest seventh-night
  // snapshot for a paired measurement with a full reference yard at the camera desk.
  const late = await page.evaluate(async () => {
    const { newGame, startNight } = await import('/src/core/game.ts');
    const { NightScene } = await import('/src/scenes/night.ts');
    const { operate, layout } = await import('/tests/operator.ts');
    const { ENEMY_TYPE_IDS } = await import('/src/core/types.ts');
    const { cameraView, drawWorld } = await import('/src/render/world.ts');
    const app = window.__app;
    const rendered = new Set(), triggered = new Set(), broken = new Set(), defeated = new Set();
    const ctx = document.createElement('canvas').getContext('2d');
    let busiest = 0;
    let busiestTime = 0;
    for (let day = 1; day <= 7; day++) {
      const started = startNight({ ...layout(newGame(42), 6), day });
      app.state = started.value;
      const scene = new NightScene(app);
      const sim = scene.sim;
      for (let steps = 0; steps < 60 * 600 && sim.outcome === 'ongoing'; steps++) {
        operate(sim);
        sim.step(1/60);
        const living = sim.enemies.filter(e => e.alive);
        if (day === 7 && living.length > busiest) { busiest = living.length; busiestTime = sim.time; }
        const deaths = sim.drainEvents().filter(event => {
          if (event.type === 'trigger') triggered.add(event.device);
          if (event.type === 'device_broken') broken.add(event.device);
          if (event.type !== 'enemy_dead' || defeated.has(event.enemy)) return false;
          defeated.add(event.enemy);
          return true;
        });
        if (living.some(e => !rendered.has(e.type)) || deaths.length) {
          scene.time = sim.time;
          scene.consume(deaths);
          for (const event of deaths) {
            const fallen = scene.fallen.find(actor => actor.id === event.id);
            if (!fallen || fallen.type !== event.enemy) throw Error('Missing night defeat for ' + event.enemy);
            fallen.age = 0.65;
          }
          const view = cameraView(sim.camera, { x: 0, y: 0, w: 300, h: 150 }, 0.5);
          drawWorld(ctx, view, scene.frame(sim.camera, true));
          scene.fallen.length = 0;
          scene.particles.length = 0;
          for (const enemy of living) rendered.add(enemy.type);
        }
      }
    }
    if (rendered.size !== ENEMY_TYPE_IDS.length) throw Error('Missing enemy models in campaign render: ' + ENEMY_TYPE_IDS.filter(id=>!rendered.has(id)));
    const { goNight } = await import('/src/scenes/flow.ts');
    goNight(app);
    return { busiest, busiestTime, rendered: [...rendered], defeated: [...defeated], triggered: [...triggered], broken: [...broken], devices: app.state.yard.devices.length };
  });
  await page.waitForFunction(() => window.__app.scene?.sim?.night === 7 && document.querySelector('#ui').style.opacity === '1');
  await page.evaluate(async time => {
    const { operate } = await import('/tests/operator.ts');
    const scene = window.__app.scene;
    while(scene.sim.time < time && scene.sim.outcome === 'ongoing') {
      operate(scene.sim);
      scene.sim.step(1/60);
      scene.sim.drainEvents();
    }
    scene.time = scene.sim.time;
    scene.update = () => {};
    scene.syncHud(true);
  }, late.busiestTime);
  report.late = { ...late, enemies: await page.evaluate(() => window.__app.scene.sim.enemies.filter(e=>e.alive).length) };
  for (const enabled of [false,true]) {
    await select(enabled);
    report.late[enabled ? 'mesh' : 'illustrated'] = await benchmark();
  }
  await shot('night-seven-3d');
  await page.keyboard.press('Digit2');
  await page.waitForFunction(() => window.__app.scene.cam === 'grange');
  // The simulation clock is frozen for paired timings. Capture the settled camera,
  // after the momentary red switching flash that normally decays in update().
  await page.evaluate(() => { window.__app.scene.flash = 0; });
  await shot('night-barn-detail');
  const subject = await page.evaluate(async () => {
    const { drawWorld, applyNight, applyCctv } = await import('/src/render/world.ts');
    const scene = window.__app.scene;
    const { sectorOf } = await import('/src/core/map.ts');
    const clear = (e) => Math.min(...scene.sim.devices.map((d) => Math.hypot(e.x - d.x - 0.5, e.y - d.y - 0.5)));
    const walker = scene.sim.enemies
      .filter((e) => e.alive && e.type === 'shambler' && e.action === 'walk' && !e.nettedFor && !e.stunnedFor)
      .sort((a, b) => clear(b) - clear(a))[0];
    if (!walker) throw new Error('Could not find a walking shambler in the seventh-night wave');
    const frame = scene.frame(sectorOf(Math.floor(walker.x), Math.floor(walker.y)), true);
    (await import('/tools/yard-detail-study.mjs')).verifyCover(frame);
    const img = document.createElement('canvas');
    img.width = 440;
    img.height = 292;
    const ctx = img.getContext('2d');
    const rot = walker.fx + walker.fy > 0 ? 0 : 1,
      sign = rot ? -1 : 1;
    const view = { x: 0, y: 0, w: img.width, h: img.height, zoom: 3.0, rot, cx: walker.x - sign * 0.95, cy: walker.y - sign * 0.95 };
    drawWorld(ctx, view, frame);
    applyNight(ctx, view, scene.lights(rot), frame.time, true);
    applyCctv(ctx, view, frame.time, 0.37);
    return img.toDataURL('image/png').split(',')[1];
  });
  writeFileSync(join(out, 'infected-detail.png'), Buffer.from(subject, 'base64'));
  const poses = await page.evaluate(async () => (await import('/tools/yard-detail-study.mjs')).infectedStudy());
  assert.notEqual(poses[0], poses[8], 'The walk cycle must change its rendered pose');
  if (process.env.PS_GAIT_FRAMES) {
    const dir = join(out, 'gait');
    mkdirSync(dir, { recursive: true });
    poses.forEach((png, i) => writeFileSync(join(dir, String(i).padStart(2, '0') + '.png'), Buffer.from(png, 'base64')));
  }
  writeFileSync(join(out, 'infected-lineup.png'), Buffer.from(poses[0], 'base64'));
  assert.deepEqual(errors, []);
  await page.close();
  const fallback = await context.newPage();
  await fallback.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...args);
    };
  });
  await fallback.goto('http://127.0.0.1:5186');
  const unavailable = fallback.getByRole('button', { name: '3D yard preview' });
  await unavailable.waitFor();
  await unavailable.click();
  await fallback.getByText('3D preview unavailable. The illustrated yard is active.').waitFor();
  assert.equal(await unavailable.getAttribute('aria-pressed'), 'false');
  await fallback.close();
  if (density === 2) {
    const missing = await context.newPage();
    await missing.route('**/yard/obj_car_front.webp', route => route.abort());
    await missing.goto('http://127.0.0.1:5186');
    await missing.locator('[aria-label="3D yard preview"][aria-pressed="true"]').waitFor({timeout:60000});
    const fallbackArt = await missing.evaluate(async () => (await import('/tools/yard-detail-study.mjs')).definitionStudy());
    assert.ok(fallbackArt.renderWidth > 0 && fallbackArt.wagonTexture[0] === fallbackArt.wagonTexture[1]);
    await missing.close();
    const streaming = await context.newPage();
    const heldMaps = [];
    await streaming.route(/\/textures\/infected-(?:cloth|normals)\.webp(?:\?.*)?$/, route => {
      if (route.request().resourceType() === 'image') heldMaps.push(route);
      else return route.continue();
    });
    await streaming.goto('http://127.0.0.1:5186');
    await streaming.locator('[aria-label="3D yard preview"][aria-pressed="true"]').waitFor();
    const renderWalker = () => streaming.evaluate(async () => {
      const study = await import('/tools/yard-detail-study.mjs');
      const [image] = await study.infectedStudy({types:['shambler'], frames:1, w:240, h:300});
      return {image, error:study.definitionStudy().glError};
    });
    const first = await renderWalker();
    assert.equal(heldMaps.length, 2);
    await Promise.all(heldMaps.map(route => route.continue()));
    await streaming.waitForFunction(async () => (await import('/tools/yard-detail-study.mjs')).infectedSurfaceReady());
    const loaded = await renderWalker();
    assert.equal(first.error, 0);
    assert.equal(loaded.error, 0);
    assert.ok(first.image !== loaded.image, 'The first wave must upgrade to painted cloth after loading');
    await streaming.close();
  }
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }

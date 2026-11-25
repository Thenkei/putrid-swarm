// Run against the Vite dev server: node tools/yard-controls-check.mjs [baseUrl]
import assert from 'node:assert/strict';
import { launch } from './browser.mjs';

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('putrid-swarm.warned', '1');
    localStorage.setItem('putrid-swarm.hint.v2', '1');
  });
  await page.goto(process.argv[2] ?? process.env.PS_URL ?? 'http://localhost:5173/');
  await page.waitForFunction(() => window.__app, null, { timeout: 90000 });

  const day = (rot, cx, cy, wood = 50) => page.evaluate(async args => {
    const { newGame } = await import('/src/core/game.ts');
    const { DayScene } = await import('/src/scenes/day.ts');
    const app = window.__app, game = newGame(11);
    app.state = { ...game, day: 2, yard: { ...game.yard, devices: [] }, inventory: { ...game.inventory, wood: args.wood } };
    app.swap(new DayScene(app));
    Object.assign(app.scene, { rot: args.rot, cx: args.cx, cy: args.cy, zoom: 1.18 });
  }, { rot, cx, cy, wood });
  const screen = (x, y) => page.evaluate(async ([gx, gy]) => {
    const { project } = await import('/src/render/world.ts');
    return project(window.__app.scene.view, gx + 0.5, gy + 0.5);
  }, [x, y]);
  const moveTo = async (x, y) => {
    const p = await screen(x, y);
    await page.mouse.move(p.x, p.y);
  };
  const built = () => page.evaluate(() => window.__app.state.yard.devices.map(d => [d.x, d.y, d.facing]));
  const mouseWorld = () => page.evaluate(async () => {
    const { unproject } = await import('/src/render/world.ts');
    const app = window.__app;
    return unproject(app.scene.view, app.pointer.x, app.pointer.y);
  });
  const stroke = async (start, end) => {
    await page.keyboard.press('Digit1');
    await moveTo(...start);
    await page.mouse.down();
    await moveTo(...end);
    await page.mouse.up();
  };

  for (const rot of [0, 1]) {
    for (const [facing, x, y, dx, dy] of [[0, 5, 16, 1, 0], [1, 8, 14, 0, 1], [2, 6, 18, 1, -1], [3, 4, 13, 1, 1]]) {
      await day(rot, x + 2 * dx + 0.5, y + 2 * dy + 0.5);
      await stroke([x, y], [x + 4 * dx, y + 4 * dy]);
      assert.deepEqual(await built(), Array.from({ length: 5 }, (_, i) => [x + i * dx, y + i * dy, facing]));
    }
    await day(rot, 7.5, 16.5, 2);
    await stroke([5, 16], [9, 16]);
    assert.deepEqual(await built(), [[5, 16, 0], [6, 16, 0]]);
    await day(rot, 14.5, 13.5);
    await stroke([13, 14], [18, 14]); // The parked wagon occupies (15,14) and (16,14).
    assert.deepEqual(await built(), [[13, 14, 0], [14, 14, 0], [17, 14, 0], [18, 14, 0]]);

    await day(rot, 7.5, 16.5);
    await page.keyboard.press('Digit1');
    await moveTo(5,16);
    await page.mouse.down();
    const release = await screen(9,16);
    // A captured pointerup can report a final position without a matching pointermove.
    await page.locator('canvas').first().dispatchEvent('pointerup', {
      clientX: release.x, clientY: release.y, button: 0, buttons: 0, pointerId: 1, pointerType: 'mouse', bubbles: true,
    });
    await page.mouse.up();
    assert.equal((await built()).length, 5);
    await day(rot, 7.5, 16.5);
    await page.keyboard.press('Digit1');
    await moveTo(5,16);
    await page.mouse.down();
    await page.keyboard.press('r');
    await moveTo(9,16);
    await page.mouse.up();
    assert.deepEqual(await built(), [[5, 16, 0]]);

    await day(rot, 7.5, 16.5);
    await page.keyboard.press('Digit1');
    await moveTo(5, 16);
    await page.mouse.down();
    await page.mouse.wheel(0, -150);
    await page.waitForFunction(() => window.__app.scene.zoom > 1.18);
    await moveTo(9, 16);
    await page.mouse.up();
    assert.equal((await built()).length, 5);

    await day(rot, 2, 2);
    await page.keyboard.press('Digit1');
    await moveTo(5, 6);
    await page.mouse.down();
    await page.mouse.wheel(0, 650);
    await page.waitForFunction(() => window.__app.scene.zoom === 0.62);
    await moveTo(9, 16);
    await page.mouse.up();
    assert.deepEqual(await built(), [[5, 6, 0]]);

    await day(rot, 7.5, 16.5);
    await page.keyboard.press('Digit1');
    await moveTo(7, 16);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.up({ button: 'middle' });
    const middleClick = await built();
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    assert.equal(await page.evaluate(() => window.__app.scene.facing), 1);

    await day(rot, 7.5, 16.5);
    await moveTo(7, 16);
    await page.mouse.down();
    await page.keyboard.press('Digit1');
    await page.mouse.up();
    const switchedTool = await built();

    await day(rot, 7.5, 16.5);
    await page.keyboard.press('Digit2');
    await moveTo(7, 16);
    await page.mouse.down();
    await page.keyboard.press('r');
    await page.mouse.up();
    const switchedView = await built();
    assert.deepEqual({ middleClick, switchedTool, switchedView }, { middleClick: [], switchedTool: [], switchedView: [] });

    await day(rot, 11, 11);
    const centre = await screen(11, 11);
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(centre.x + 96, centre.y + 18);
    const original = await mouseWorld();
    await page.mouse.wheel(0, -130);
    await page.waitForFunction(() => window.__app.scene.zoom > 1.18);
    await page.mouse.move(centre.x + 97, centre.y + 18);
    const moved = await mouseWorld();
    await page.mouse.up({ button: 'right' });
    assert.ok(Math.hypot(original.gx - moved.gx, original.gy - moved.gy) < 0.025, JSON.stringify({ rot, original, moved }));
  }
  await day(0, 7.5, 16.5);
  await page.keyboard.press('Digit1');
  const parked = await screen(7, 16);
  await page.mouse.move(parked.x, parked.y);
  await page.mouse.down();
  await page.setViewportSize({ width: 1040, height: 780 });
  await page.waitForFunction(() => window.__app.scale === 1040 / 1280);
  const resized = await page.evaluate(async ({ x, y }) => {
    const { unproject } = await import('/src/render/projection.ts');
    const app = window.__app, rect = app.canvas.getBoundingClientRect();
    const ground = unproject(app.scene.view, (x - rect.left) / app.scale, (y - rect.top) / app.scale);
    return { hover: app.scene.hover, expected: { x: Math.floor(ground.gx), y: Math.floor(ground.gy) } };
  }, parked);
  assert.deepEqual(resized.hover, resized.expected, 'Resizing keeps the build preview under a stationary cursor');
  await page.mouse.up();
  assert.deepEqual(await built(), [[7, 16, 0]], 'A resized fence stroke cannot place on the newly hovered cells');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForFunction(() => window.__app.scale === 1);

  const controls = await page.evaluate(async () => {
    const { newGame, startNight } = await import('/src/core/game.ts');
    const { build } = await import('/src/core/yard.ts');
    const { NightScene } = await import('/src/scenes/night.ts');
    const { project } = await import('/src/render/projection.ts');
    const app = window.__app, game = newGame(11);
    let state = { ...game, day: 2, yard: { ...game.yard, devices: [] }, inventory: { ...game.inventory, wood: 20, springs: 20, scrap: 20 } };
    const cells = [[11, 16], [17, 11], [11, 5], [5, 10]];
    for (const kind of ['barrier', 'fence']) for (const [index, [x, y]] of cells.entries()) {
      const front = index < 2 ? 1 : -1;
      const result = build(state, kind, kind === 'fence' ? x + front : x, y, 1);
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      state = result.value;
    }
    app.state = startNight(state).value;
    app.swap(new NightScene(app));
    return ['portail', 'grange', 'arriere', 'verger'].map((sector, index) => {
      const device = app.scene.sim.devices[index];
      const view = app.scene.viewFor(sector, { x: 12, y: 54, w: 884, h: 497 }, 1.22);
      return { sector, id: device.id, point: project(view, device.x + 0.5, device.y + 0.5) };
    });
  });
  for (const index of [2, 0, 1, 3]) {
    const { sector, id, point } = controls[index];
    await page.mouse.move(point.x, point.y);
    await page.keyboard.press(`Digit${index + 1}`);
    await page.waitForFunction(expected => window.__app.scene.cam === expected, sector);
    assert.equal(await page.evaluate(() => window.__app.scene.hoverFeedDevice), id);
    // An opaque slat on the adjacent fence covers the barrier from either side.
    const slat = { x: point.x + (index < 2 ? 18 : 28), y: point.y - (index < 2 ? 4 : 5) };
    await page.mouse.move(slat.x, slat.y);
    assert.equal(await page.evaluate(() => window.__app.scene.hoverFeedDevice), null);
    await page.mouse.click(slat.x, slat.y);
    for (const button of ['middle', 'right']) await page.mouse.click(point.x, point.y, { button });
    const trapState = () => page.evaluate(id => window.__app.scene.sim.device(id).state, id);
    assert.equal(await trapState(), 'armed');
    if (index === 3) {
      const hoverAfterOutage = await page.evaluate(() => {
        const scene = window.__app.scene, sim = scene.sim;
        sim.outage = { sector: 'portail', wave: 1, delay: 0 };
        sim.outageAt = sim.time;
        scene.update(.08);
        return [sim.cameraLost, scene.hoverFeedDevice];
      });
      assert.deepEqual(hoverAfterOutage, ['portail', id]);
    }
    await page.mouse.click(point.x, point.y);
    assert.equal(await trapState(), 'active');
  }
  const timberHits = await page.evaluate(async () => {
    const { pickDevice, cameraView, project } = await import('/src/render/world.ts');
    const hits = [];
    for (const [sector, x, y, dx, dy] of [['portail', 10, 16, 53.5, -74.5], ['arriere', 12, 3, -81.5, -58.5]]) {
      const view = cameraView(sector, { x: 12, y: 54, w: 884, h: 497 }, 1.22);
      const centre = project(view, x + .5, y + .5);
      const log = { id: 1, type: 'log', x, y, facing: 0, hpRatio: .81, state: 'active', activeAge: .4,
        logTarget: { id: 3, type: 'shambler', x: x + 1.5, y: y - .5, fx: 0, fy: -1, crawlDepth: 0, target: sector, lureDevice: null } };
      const light = { id: 2, type: 'floodlight', x: x + 1, y: y - 1, facing: 0, hpRatio: 1, state: 'armed' };
      // The falling timber is painted over this lamp pixel, irrespective of build order.
      const pick = devices => pickDevice(view, devices, centre.x + dx, centre.y + dy)?.id;
      hits.push([pick([light]), pick([log, light]), pick([light, log])]);
    }
    return hits;
  });
  assert.deepEqual(timberHits, [[2, 1, 1], [2, 1, 1]]);
  assert.deepEqual(errors, []);
  console.log('Yard controls passed in both yard views and all four CCTV feeds.');
} finally {
  await browser.close();
}

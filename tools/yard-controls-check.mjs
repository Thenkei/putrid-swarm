// Run against the Vite dev server: node tools/yard-controls-check.mjs [baseUrl]
import assert from 'node:assert/strict';
import { BROWSER, launch } from './browser.mjs';

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
  const moveTo = async (x, y, steps = 1) => {
    const p = await screen(x, y);
    await page.mouse.move(p.x, p.y, { steps });
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
    await day(rot, 7.5, 15.5);
    await page.keyboard.press('Digit1');
    await moveTo(5, 16);
    await page.mouse.down();
    await moveTo(7, 16, 12);
    await moveTo(7, 14, 12);
    await moveTo(9, 16, 12);
    await page.mouse.up();
    const bentFence = await built();

    await day(rot, 7.5, 15.5, 1);
    await stroke([7, 16], [7, 14]);
    const singleFence = await built();

    await day(rot, 7.5, 15.5);
    await page.keyboard.press('Digit1');
    await moveTo(5, 16);
    await page.mouse.down();
    await page.keyboard.press('Backspace');
    await moveTo(7, 16);
    await page.mouse.up();
    const undone = await built();
    assert.deepEqual({ bentFence, singleFence, undone }, {
      bentFence: [[5, 16, 0], [6, 16, 0], [7, 16, 0], [7, 15, 1], [7, 14, 1], [8, 15, 3], [9, 16, 3]],
      singleFence: [[7, 16, 0]], undone: [],
    });

    await day(rot, 5.5, 2.5);
    await page.keyboard.press('Digit2');
    await moveTo(5, 2);
    assert.equal(await page.evaluate(async () => {
      const { S } = await import('/src/engine/i18n.ts');
      return window.__app.scene.info.textContent.includes(S().day.onRoute);
    }), true, 'A diagonal route passes within trigger range of the spikes');

    await day(rot, 2.5, 2.5);
    await page.keyboard.press('Digit6');
    const horn = await screen(2, 2);
    await page.mouse.click(horn.x, horn.y);
    assert.equal((await built()).length, 1);
    assert.equal(await page.locator('[data-door="grange"] .cover').textContent(), '0', 'The far edge cannot cover the barn route');

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
  if (BROWSER === 'chrome') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const touch = (type, ...points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    for (const [rot, viewport] of [[0, { width: 960, height: 800 }], [1, { width: 1536, height: 720 }]]) {
      await page.setViewportSize(viewport);
      await day(rot, 7.5, 16.5);
      const rect = await page.locator('#game').boundingBox();
      const cell = async x => {
        const p = await screen(x, 16);
        return { x: rect.x + p.x * rect.width / 1280, y: rect.y + p.y * rect.height / 720 };
      };
      const first = await cell(5), last = await cell(9);
      await page.keyboard.press('Digit1');
      await touch('touchStart', first);
      for (let x = 6; x <= 9; x++) await touch('touchMove', await cell(x));
      await touch('touchEnd');
      assert.deepEqual(await built(), [5, 6, 7, 8, 9].map(x => [x, 16, 0]));
      assert.equal(await page.evaluate(() => window.__app.scene.hover), null);

      // The screen receives the whole gesture after implicit capture, including the letterbox.
      await day(rot, 7.5, 16.5);
      await page.keyboard.press('Digit1');
      await touch('touchStart', first);
      await touch('touchMove', { x: 3, y: 3 });
      assert.equal(await page.evaluate(() => window.__app.pointer.overCanvas), false);
      await touch('touchMove', last);
      await touch('touchEnd');
      assert.deepEqual(await built(), [[5, 16, 0], [9, 16, 0]]);

      await day(rot, 7.5, 16.5);
      await page.keyboard.press('Digit1');
      await touch('touchStart', { ...first, id: 1 });
      await touch('touchStart', { ...first, id: 1 }, { ...last, id: 2 });
      await touch('touchMove', { ...first, id: 1 }, { ...await cell(8), id: 2 });
      await touch('touchCancel');
      assert.deepEqual(await built(), [[5, 16, 0]]);
      assert.equal(await page.evaluate(() => window.__app.pointer.down), false);
      await touch('touchStart', last);
      await touch('touchEnd');
      assert.deepEqual(await built(), [[5, 16, 0], [9, 16, 0]]);

      // Release just inside the opaque door panel, over an otherwise buildable cell.
      await day(rot, 7.5, 16.5);
      await page.keyboard.press('Digit2');
      const edge = await page.evaluate(async () => {
        const { unproject } = await import('/src/render/projection.ts');
        const app = window.__app, scene = app.scene, canvas = app.canvas.getBoundingClientRect();
        const panel = document.querySelector('.door-chips').getBoundingClientRect(), y = panel.top + 20;
        const g = unproject(scene.view, (panel.left - canvas.left) * 1280 / canvas.width, (y - canvas.top) * 720 / canvas.height);
        scene.cx += 8.5 - g.gx;
        scene.cy += 8.5 - g.gy;
        return { outside: { x: panel.left - 3, y }, inside: { x: panel.left + 3, y } };
      });
      await touch('touchStart', edge.outside);
      await touch('touchMove', edge.inside);
      await touch('touchEnd');
      assert.deepEqual(await built(), []);
    }
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await cdp.detach();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForFunction(() => window.__app.scale === 1);
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const rot of [0, 1]) {
    await day(rot, 7.5, 16.5);
    const landing = await page.evaluate(async () => {
      const { project } = await import('/src/render/projection.ts');
      const app = window.__app, scene = app.scene;
      scene.zoom = 1;
      const id = scene.placeDevice('spikes', { x: 7, y: 16 });
      const foot = project(scene.view, 7.5, 16.5);
      // Each sample is opaque on the raised spike plank and clear once it lands.
      Object.assign(app.pointer, { x: foot.x + (scene.rot ? -.5 : -2.5),
        y: foot.y + (scene.rot ? -43.5 : -41.5), overCanvas: true, down: false });
      scene.onPointerMove(app.pointer);
      const raised = scene.hoverDevice?.id === id;
      scene.update(.26);
      return [raised, scene.hoverDevice === null];
    });
    assert.deepEqual(landing, [true, true]);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });

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
    await page.keyboard.press('p');
    await page.mouse.move(slat.x, slat.y);
    await page.keyboard.press('p');
    assert.equal(await page.evaluate(() => window.__app.scene.hoverFeedDevice), null);
    await page.mouse.click(slat.x, slat.y);
    for (const button of ['middle', 'right']) await page.mouse.click(point.x, point.y, { button });
    const trapState = () => page.evaluate(id => window.__app.scene.sim.device(id).state, id);
    assert.equal(await trapState(), 'armed');
    if (index === 3) {
      const hoverAfterOutage = await page.evaluate(() => {
        const scene = window.__app.scene, sim = scene.sim;
        const mini = scene.minis.get('portail'), before = mini.toDataURL();
        sim.outage = { sector: 'portail', wave: 1, delay: 0 };
        sim.outageAt = sim.time;
        scene.update(.08);
        return [sim.cameraLost, scene.hoverFeedDevice, before !== mini.toDataURL()];
      });
      assert.deepEqual(hoverAfterOutage, ['portail', id, true]);
    }
    await page.mouse.click(point.x, point.y);
    assert.equal(await trapState(), 'active');
  }
  const trip = await page.evaluate(async () => {
    const { HOUSE_RETURN_SECONDS } = await import('/src/core/night.ts');
    const scene = window.__app.scene, sim = scene.sim;
    const hovered = () => scene.frame(scene.cam, true).hoverCell;
    sim.enterHouse('shambler', scene.cam, 1);
    scene.update(.08);
    const away = hovered();
    sim.defense.started = sim.time - HOUSE_RETURN_SECONDS;
    scene.update(.08);
    const back = hovered();
    const mini = scene.minis.get(scene.cam), before = mini.toDataURL();
    scene.switchCam('arriere');
    const retuned = before !== mini.toDataURL();
    scene.consume([{ type: 'outcome', survived: true }]);
    scene.syncHud();
    const frame = scene.frame(scene.cam, true);
    return [away, back, retuned, frame.hoverCell, frame.devices.some(d => d.label)];
  });
  assert.deepEqual(trip, [null, { x: 5, y: 10 }, true, null, false]);
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
  const porchTargets = await page.evaluate(async () => {
    const { ENTRIES } = await import('/src/core/map.ts');
    const { doorStance } = await import('/src/house-layout.ts');
    const { project } = await import('/src/render/projection.ts');
    const scene = window.__app.scene, canvas = document.createElement('canvas');
    canvas.width = 896;
    canvas.height = 420;
    return Object.entries(ENTRIES).map(([sector, entry]) => {
      const enemy = scene.sim.spawn('shambler', sector, false);
      Object.assign(enemy, { x: entry.x + .5, y: entry.y + .5, action: 'attack' });
      const foot = doorStance(enemy);
      const view = scene.viewFor(sector, { x: 0, y: 0, w: canvas.width, h: canvas.height }, 1.1);
      const contact = scene.epic.paintYard(canvas, sector).find(p => p.id === enemy.id);
      const painted = project(view, foot.x, foot.y);
      return contact && Math.hypot(contact.x - painted.x, contact.y - painted.y);
    });
  });
  assert.deepEqual(porchTargets, [0, 0, 0, 0], 'Porch targeting follows the figure standing at each painted sill');
  assert.deepEqual(errors, []);
  console.log('Yard controls passed in both yard views and all four CCTV feeds.');
} finally {
  await browser.close();
}

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
    localStorage.setItem('putrid-swarm.hint.v3', '1');
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
    const [x, y] = rot === 0 ? [10, 8] : [11, 13];
    await day(rot, x + 0.5, y + 0.5);
    const previewPixels = await page.evaluate(async ({ x, y }) => {
      const { drawWorld, project } = await import('/src/render/world.ts');
      const { scene, state } = window.__app;
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const p = project(scene.view, x + 0.5, y + 0.5);
      const sample = ghost => {
        drawWorld(ctx, scene.view, { time: 2, night: false, carPresent: true, houseHpRatio: 1,
          enemies: [], particles: [], decals: [], barricades: state.yard.barricades, devices: [],
          showBuildable: true, hoverCell: ghost, ghost });
        return ctx.getImageData(p.x - 40, p.y - 34, 80, 60).data;
      };
      const before = sample(null);
      const after = sample({ x, y, type: 'spikes', ok: true, facing: 0 });
      let changed = 0;
      for (let i = 0; i < before.length; i += 4) {
        if ([0, 1, 2].some(c => Math.abs(before[i + c] - after[i + c]) > 8)) changed++;
      }
      return changed;
    }, { x, y });
    assert.ok(previewPixels > 150, `Covered spikes preview disappeared in view ${rot}: ${previewPixels} pixels`);
    await page.keyboard.press('Digit2');
    await moveTo(x, y);
    await page.mouse.down();
    await page.mouse.up();
    assert.deepEqual(await built(), [[x, y, 0]]);

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
    await page.locator('.build-wheel').waitFor();
    assert.equal(await page.evaluate(() => window.__app.scene.facing), 0);
    await page.keyboard.press('Escape');

    const placement = await screen(7, 16);
    await page.mouse.move(placement.x, placement.y);
    for (const [delta, cycle] of [[120, [3, 1, 2, 0]], [-120, [2, 1, 3, 0]]]) {
      for (const facing of cycle) {
        await page.mouse.wheel(0, delta);
        await page.waitForFunction(f => window.__app.scene.currentGhost().ghost?.facing === f, facing);
        await page.mouse.click(placement.x, placement.y);
        assert.deepEqual(await built(), [[7, 16, facing]]);
        await page.keyboard.press('Backspace');
      }
    }

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

    // Chrome reports the first button's release as a pointermove while another one is held.
    for (const tool of ['Digit1', 'Digit2']) {
      await day(rot, 7.5, 16.5);
      await page.keyboard.press(tool);
      await moveTo(5, 16);
      await page.mouse.down();
      await page.mouse.down({ button: 'right' });
      await page.mouse.up();
      assert.deepEqual(await built(), [[5, 16, 0]]);
      await moveTo(9, 16);
      await page.mouse.up({ button: 'right' });
      assert.deepEqual(await built(), [[5, 16, 0]]);
    }
    await moveTo(5, 16);
    await page.mouse.down({ button: 'right' });
    await page.mouse.down();
    await page.mouse.up({ button: 'right' });
    await page.locator('.build-wheel').waitFor();
    assert.equal(await page.evaluate(() => window.__app.scene.facing), 0);
    await page.keyboard.press('Escape');
    await moveTo(9, 16);
    await page.mouse.up();
    assert.deepEqual(await built(), [[5, 16, 0]]);

    const waitButton = page.locator('.day-actions button').last();
    const nightPrompt = page.getByRole('dialog');
    await waitButton.click();
    assert.equal(await nightPrompt.locator('button').first().evaluate(el => el === document.activeElement), true);
    for (const key of ['r', 'f', 't', 'Digit1', 'Backspace']) await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => window.__app.scene.rot), rot);
    assert.deepEqual(await built(), [[5, 16, 0]]);
    const next = await screen(9, 16);
    await page.mouse.click(next.x, next.y);
    assert.deepEqual(await built(), [[5, 16, 0]], 'The backdrop shields the yard');
    await page.keyboard.press('Escape');
    assert.equal(await nightPrompt.count(), 0);
    assert.equal(await waitButton.evaluate(el => el === document.activeElement), true);
    assert.deepEqual(await page.evaluate(() => window.__app.scene.hover), { x: 9, y: 16 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    assert.equal(await nightPrompt.locator('button').last().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    assert.equal(await nightPrompt.count(), 0);
    await page.keyboard.press('Backspace');
    assert.deepEqual(await built(), []);

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

      // A hardware keyboard can switch the view or palette with one finger still down.
      for (const key of ['r', 'Digit2']) {
        await day(rot, 7.5, 16.5);
        await page.keyboard.press('Digit1');
        await touch('touchStart', first);
        await page.keyboard.press(key);
        await touch('touchMove', last);
        await touch('touchEnd');
        assert.deepEqual(await built(), [[5, 16, 0]]);
        assert.equal(await page.evaluate(() => window.__app.pointer.down), false);
      }

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

      // The same track skirts the upper left corner of the door panel, then crosses behind it.
      for (const steps of [1, 40]) {
        await day(rot, 7.5, 16.5);
        await page.keyboard.press('Digit1');
        const [start, end] = await page.evaluate(async () => {
          const { unproject } = await import('/src/render/projection.ts');
          const app = window.__app, scene = app.scene, canvas = app.canvas.getBoundingClientRect();
          const panel = document.querySelector('.door-chips').getBoundingClientRect(), scale = canvas.width / 1280;
          const a = { x: panel.left - 75 * scale, y: panel.top + 101 * scale };
          const b = { x: panel.left + 140 * scale, y: panel.top - 6 * scale };
          const g = unproject(scene.view, ((a.x + b.x) / 2 - canvas.left) / scale, ((a.y + b.y) / 2 - canvas.top) / scale);
          scene.cx += 7.5 - g.gx;
          scene.cy += 16.5 - g.gy;
          return [a, b];
        });
        await touch('touchStart', start);
        for (let i = 1; i <= steps; i++) {
          await touch('touchMove', { x: start.x + (end.x - start.x) * i / steps, y: start.y + (end.y - start.y) * i / steps });
        }
        await touch('touchEnd');
        const rows = rot === 0 ? [19, 18, 17, 13] : [13, 14, 15, 19];
        assert.deepEqual(await built(), rows.map(y => [7, y, 1]), `Fence swipe with ${steps} samples in view ${rot}`);
      }
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

    // Both points are on the upright lamp head, outside its tile and the broken painting.
    await page.evaluate(async rot => {
      const { newGame } = await import('/src/core/game.ts');
      const { DayScene } = await import('/src/scenes/day.ts');
      const app = window.__app, game = newGame(5);
      const lamp = { id: 71, type: 'floodlight', facing: 0, x: 10, y: rot ? 4 : 17, hp: 0, broken: true };
      const inventory = Object.fromEntries(Object.keys(game.inventory).map(key => [key, 12]));
      app.state = { ...game, day: 2, inventory, yard: { ...game.yard, devices: [lamp] } };
      app.swap(new DayScene(app));
      Object.assign(app.scene, { rot, cx: lamp.x + .5, cy: lamp.y + .5, zoom: 1.35 });
      app.scene.root.querySelector('.tool-row button.btn-alert').focus();
    }, rot);
    await page.mouse.move(rot ? 776.5 : 770.5, 282.5);
    assert.equal(await page.evaluate(() => window.__app.scene.hoverDevice?.id), 71);
    await page.mouse.down();
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.__app.state.yard.devices[0].broken), false,
      'Releasing over the displayed lamp repairs it even though pressing the canvas blurred the preview button');

    const damage = await page.evaluate(async rot => {
      const { NightScene } = await import('/src/scenes/night.ts');
      const app = window.__app;
      app.state = { ...app.state, phase: 'night' };
      const strike = (fraction, age) => {
        app.swap(new NightScene(app));
        const scene = app.scene, sim = scene.sim, lamp = sim.device(71);
        scene.switchCam(rot ? 'arriere' : 'portail');
        sim.time = 10;
        scene.defenseMotion.update(sim);
        sim.damageDevice(lamp, Math.floor(lamp.hp * fraction));
        scene.defenseMotion.update(sim);
        sim.time += age;
        return scene;
      };
      const point = (x, y) => ({ x, y, down: false, overCanvas: true });
      const recoil = rot ? point(462.5, 255.5) : point(384.5, 235.5);
      const hit = strike(.78, .025);
      hit.onPointerDown(recoil, { button: 0 });
      const fired = hit.sim.device(71).state;
      const scene = strike(1, .13);
      const former = rot ? point(440.5, 251.5) : point(400.5, 232.5);
      const wreck = rot ? point(421.5, 271.5) : point(380.5, 279.5);
      Object.assign(app.pointer, former);
      scene.syncHud();
      const held = scene.hoverDevice;
      const beforeWreck = scene.manualDeviceAt(wreck)?.id ?? null;
      scene.sim.time += 1;
      scene.defenseMotion.update(scene.sim);
      scene.syncHud();
      return [fired, held, beforeWreck, scene.hoverDevice];
    }, rot);
    assert.deepEqual(damage, ['active', 71, null, null], 'A stationary pointer follows the lamp through recoil and into the wreck');
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

  const nightControls = oneHand => page.evaluate(async oneHand => {
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
    if (oneHand) {
      const extra = build(state, 'barrier', 10, 17, 1);
      if (!extra.ok) throw new Error(JSON.stringify(extra.error));
      state = { ...extra.value, day: 5, orchard: 'maimed' };
    }
    app.state = startNight(state).value;
    app.swap(new NightScene(app));
    return ['portail', 'grange', 'arriere', 'verger'].map((sector, index) => {
      const device = app.scene.sim.devices[index];
      const view = app.scene.viewFor(sector, { x: 12, y: 54, w: 884, h: 497 }, 1.22);
      return { sector, id: device.id, point: project(view, device.x + 0.5, device.y + 0.5) };
    });
  }, oneHand);
  const controls = await nightControls(false);
  for (const index of [2, 0, 1, 3]) {
    const { sector, id, point } = controls[index];
    await page.mouse.move(point.x, point.y);
    await page.keyboard.press(`Digit${index + 1}`);
    await page.waitForFunction(expected => window.__app.scene.cam === expected, sector);
    assert.equal(await page.evaluate(() => window.__app.scene.hoverDevice), id);
    // An opaque slat on the adjacent fence covers the barrier from either side.
    const slat = { x: point.x + (index < 2 ? 18 : 28), y: point.y - (index < 2 ? 4 : 5) };
    await page.keyboard.press('p');
    await page.mouse.move(slat.x, slat.y);
    await page.keyboard.press('p');
    assert.equal(await page.evaluate(() => window.__app.scene.hoverDevice), null);
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
        return [sim.cameraLost, scene.hoverDevice, before !== mini.toDataURL()];
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
  const [gate] = await nightControls(true);
  await page.keyboard.press('KeyW');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const queuedCamera = () => page.evaluate(() => window.__app.scene.sim.handView().queue[0].sector);
  assert.equal(await queuedCamera(), 'arriere');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await queuedCamera(), 'grange');
  await page.mouse.move(gate.point.x, gate.point.y);
  await page.mouse.down();
  const pinned = await page.evaluate(async gateId => {
    const { trapKeyLabels } = await import('/src/engine/keys.ts');
    const scene = window.__app.scene;
    const waitForHand = () => { for (let i = 0; i < 65; i++) scene.update(1 / 60); };
    waitForHand();
    const label = scene.hand.queue.textContent;
    const correctChip = label === '1·' + trapKeyLabels()[0];
    const feed = scene.cam;
    waitForHand();
    return [feed, correctChip, scene.sim.device(gateId).state, scene.sim.manualDevicesIn('grange')[0].state];
  }, gate.id);
  await page.mouse.up();
  assert.deepEqual(pinned, ['grange', true, 'active', 'armed'], 'A queued click retains the original camera and trap while held');
  const timberLayers = await page.evaluate(async () => {
    const { drawWorld } = await import('/src/render/world.ts');
    const { newGame } = await import('/src/core/game.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 360; canvas.height = 270;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const frame = { time: 4, night: false, carPresent: true, houseHpRatio: 1, barricades: newGame(3).yard.barricades,
      enemies: [], particles: [], decals: [], devices: [], showBuildable: true };
    const counts = [];
    for (const [rot, x, y] of [[0, 17, 13], [1, 13, 8]]) for (const zoom of [.62, 1.5]) {
      const view = { rot, zoom, cx: x + .5, cy: y + .5, x: 0, y: 0, w: 360, h: 270 };
      const log = { id: 43, type: 'log', x, y, facing: 0, hpRatio: 1, state: 'idle' };
      const sample = additions => {
        drawWorld(ctx, view, { ...frame, ...additions });
        // The gallows above the ground diamond, beside the wagon or the rear farmhouse.
        return ctx.getImageData(90, 0, 180, Math.floor(135 - 20 * zoom)).data;
      };
      const empty = sample({}), built = sample({ devices: [log] });
      for (const other of [sample({ dismantling: [{ device: log, progress: 0 }] }),
        ...[true, false].map(ok => sample({ hoverCell: { x, y }, ghost: { ...log, ok } }))]) {
        let exposed = 0, covered = 0;
        for (let i = 0; i < empty.length; i += 4) {
          const delta = bytes => Math.max(...[0, 1, 2].map(k => Math.abs(bytes[i + k] - empty[i + k])));
          if (delta(other) > 18) {
            if (delta(built) === 0) covered++;
            else exposed++;
          }
        }
        counts.push([exposed, covered]);
      }
    }
    return counts;
  });
  for (const [exposed, covered] of timberLayers) {
    assert.ok(exposed > 3, 'The exposed part of the log frame stays visible');
    assert.equal(covered, 0, 'A construction or removal preview cannot paint over the scenery covering the installed frame');
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
  const throughLeaves = await page.evaluate(async () => {
    const { NightScene } = await import('/src/scenes/night.ts');
    const { newGame, startNight } = await import('/src/core/game.ts');
    const { build } = await import('/src/core/yard.ts');
    const app = window.__app, game = newGame(11);
    const rich = { ...game, yard: { ...game.yard, devices: [] },
      inventory: Object.fromEntries(Object.keys(game.inventory).map(k => [k, 16])) };
    const placed = build(rich, 'horn', 5, 9, 0).value;
    app.state = startNight(placed).value;
    app.swap(new NightScene(app));
    const scene = app.scene, horn = scene.sim.devices[0];
    scene.switchCam('verger');
    Object.assign(app.pointer, { x: 388.5, y: 293.5, down: false, overCanvas: true });
    const hovered = () => {
      scene.render(app.canvas.getContext('2d'));
      scene.syncHud();
      return scene.hoverDevice === horn.id;
    };
    const opaque = hovered();
    scene.onPointerDown(app.pointer, { button: 0 });
    const first = horn.state;
    const enemy = scene.sim.spawn('shambler', 'verger', false);
    Object.assign(enemy, { x: 5.5, y: 9.5 });
    const faded = hovered();
    scene.switchCam('portail');
    scene.switchCam('verger');
    const returned = hovered();
    scene.onPointerDown(app.pointer, { button: 0 });
    return [opaque, first, faded, returned, horn.state];
  });
  assert.deepEqual(throughLeaves, [false, 'armed', true, true, 'active'],
    'The orchard horn follows the visible canopy when a figure arrives and when the camera returns');
  assert.deepEqual(errors, []);
  console.log('Yard controls passed in both yard views and all four CCTV feeds.');
} finally {
  await browser.close();
}

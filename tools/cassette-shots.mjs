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
  const spotErrors = await page.evaluate(async () => {
    const { MorningScene } = await import('/src/scenes/morning.ts');
    const { DOOR_OPENINGS } = await import('/src/house-layout.ts');
    const { houseOffset } = await import('/src/render/registration.ts');
    const { project, TW } = await import('/src/render/projection.ts');
    const { HOUSE_CENTER } = await import('/src/core/map.ts');
    const { SECTOR_IDS } = await import('/src/core/types.ts');
    const state = window.__app.state;
    const devices = [
      { id: 1, type: 'spikes', x: 16, y: 11, facing: 1, hp: 0, broken: true },
      { id: 2, type: 'spikes', x: 5, y: 10, facing: 0, hp: 30, broken: false },
    ];
    const canvas = document.createElement('canvas');
    canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d'), ellipse = ctx.ellipse.bind(ctx);
    const highlights = [...SECTOR_IDS.map(sector => ({ kind: 'breach', sector })),
      { kind: 'broken', deviceId: 1 }, { kind: 'catch', deviceId: 2, kills: 4 }];
    return highlights.map(highlight => {
      const fixture = { ui: document.createElement('div'), state: { ...state, morningTape: undefined,
        yard: { ...state.yard, devices }, lastNight: { ...state.lastNight, highlight } } };
      const morning = new MorningScene(fixture);
      morning.enter();
      fixture.ui.querySelector('.morning-headline button').click();
      morning.update(1);
      const view = morning.inspection.view;
      let ring;
      ctx.ellipse = (x, y, rx, ry, ...args) => {
        if (Math.abs(rx - 1.2 * Math.SQRT2 * TW / 2 * view.zoom) < .01 && Math.abs(rx - 2 * ry) < .01) ring = { x, y };
        ellipse(x, y, rx, ry, ...args);
      };
      morning.render(ctx);
      morning.exit();
      let point;
      if ('sector' in highlight) {
        const door = DOOR_OPENINGS[highlight.sector], root = project(view, HOUSE_CENTER.x, HOUSE_CENTER.y);
        const sill = houseOffset(view.rot, door.x + door.w / 2, door.y + door.h + door.rise / 2);
        point = { x: root.x + sill.dx * view.zoom, y: root.y - sill.lift * view.zoom };
      } else {
        const d = devices.find(d => d.id === highlight.deviceId);
        point = project(view, d.x + .5, d.y + .5);
      }
      return { target: highlight.sector ?? highlight.deviceId, ring: ring ? Math.hypot(ring.x - point.x, ring.y - point.y) : Infinity,
        focus: Math.hypot(view.x + view.w / 2 - point.x, view.y + view.h / 2 - point.y) };
    });
  });
  for (const spot of spotErrors) assert.ok(spot.ring < .01 && spot.focus < .01, JSON.stringify(spot));
  console.log('Verified capture, pause, seek, morning reload and daylight inspection at all four sills and both spike controls.');
} finally {
  await browser.close();
}

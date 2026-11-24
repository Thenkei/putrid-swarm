// Start Vite, then run: node tools/porch-light-check.mjs art/logs/porch-light http://localhost:5173/
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { launch } from './browser.mjs';

const out = resolve(process.argv[2] ?? 'art/logs/porch-light');
const url = process.argv[3] ?? 'http://localhost:5173/';
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
  await page.goto(url);
  await page.waitForFunction(() => window.__app && !window.__app.pendingScene && !document.querySelector('.loading'));
  await page.evaluate(async () => {
    const { newGame } = await import('/src/core/game.ts');
    const { goNight } = await import('/src/scenes/flow.ts');
    window.__app.state = { ...newGame(42), day: 2, phase: 'night', flags: { 'epic.stove': 1 } };
    goNight(window.__app);
  });
  await page.waitForFunction(() => window.__app.scene.sim?.night === 2);
  const evidence = await page.evaluate(async () => {
    const { porchContact, porchFlame } = await import('/src/render/porch-flame.ts');
    const { sectorOf } = await import('/src/core/map.ts');
    const scene = window.__app.scene;
    scene.paused = true;
    const sim = scene.sim;
    while (sim.time < 18) sim.step(1 / 60);
    const canvas = document.createElement('canvas');
    canvas.width = 896;
    canvas.height = 420;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sector = 'portail';
    const visible = scene.epic.paintYard(canvas, sector);
    const candidates = visible.filter(p => {
      const e = sim.enemies.find(e => e.id === p.id);
      return e && sectorOf(Math.floor(e.x), Math.floor(e.y)) === sector &&
        p.y > 135 && p.y < 325 && p.x > 160 && p.x < 720;
    });
    if (!candidates.length) throw Error('Frozen campaign frame has no visible contact in the gate lane.');
    const target = candidates.sort((a, b) => Math.abs(a.y - 235) - Math.abs(b.y - 235))[0];
    const aim = 448 + (target.x - 448) * 290 / (420 - target.y);
    const axis = y => 448 + (aim - 448) * (420 - y) / 290;
    const contacts = candidates.filter(p => porchContact(aim, p));
    const images = {};
    function render(age, emit, drawFlame, hits = contacts, direction = aim, save) {
      scene.epic.paintYard(canvas, sector, emit ? { age, aim: direction, contacts: hits } : undefined);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      if (drawFlame) porchFlame(ctx, direction, direction, age, hits);
      if (save) images[save] = canvas.toDataURL('image/png').split(',')[1];
      return pixels;
    }
    const base = render(-1, false, true, [], aim, 'off');
    const full = render(.22, true, true, contacts, aim, 'on');
    render(.22, true, false, contacts, aim, 'light-only');
    const noContact = render(.22, true, false, []);
    const decay = render(.72, true, false);
    const cold = render(1.05, true, false);
    const repeat = render(-1, false, false);
    const otherAim = aim < 448 ? 720 : 170;
    const otherShot = render(.22, true, false, [], otherAim);
    function measure(a, b, take) {
      let n = 0, r = 0, g = 0, blue = 0, max = 0, changed = 0;
      for (let y = 0; y < 420; y++) for (let x = 0; x < 896; x++) {
        if (!take(x, y)) continue;
        const i = (y * 896 + x) * 4;
        const dr = a[i] - b[i], dg = a[i+1] - b[i+1], db = a[i+2] - b[i+2];
        r += dr; g += dg; blue += db; n++;
        const d = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
        max = Math.max(max, d);
        if (d > 0) changed++;
      }
      const round = v => Math.round(v * 1000) / 1000;
      return { pixels: n, changed, meanRGB: [r, g, blue].map(v => round(v/n)), meanLuma: round((r*.2126+g*.7152+blue*.0722)/n), maxChannelDelta: max };
    }
    const material = (x,y) => y > 165 && y < 350 && Math.abs(x - axis(y)) > 40 && Math.abs(x - axis(y)) < 94;
    const far = (x,y) => y > 145 && y < 350 && Math.abs(x - axis(y)) > 270;
    const contact = (x,y) => Math.hypot(x-target.x, y-target.y+5) < 31;
    const swappedLane = (x,y) => y > 165 && y < 260 && Math.abs(x-axis(y)) < 40;
    return { images, report: { seed: 42, night: 2, sector, time: sim.time, aim, contacts, comparison: 'Per-channel changes on the native yard before drawing the flame or sight, on a 0–255 scale.',
      material: measure(full, base, material), far: measure(full, base, far),
      contactBounce: measure(full, noContact, contact), afterglow: measure(decay, base, material),
      originalLane: measure(noContact, base, swappedLane), turnedAway: measure(otherShot, base, swappedLane),
      extinguished: measure(cold, base, () => true), identicalState: measure(repeat, base, () => true) } };
  });
  await mkdir(out, { recursive: true });
  const { report, images } = evidence;
  for (const [name, bytes] of Object.entries(images)) await writeFile(join(out, name + '.png'), Buffer.from(bytes, 'base64'));
  await sharp({ create: { width: 1792, height: 420, channels: 3, background: '#111' } })
    .composite(['off', 'on'].map((key, i) => ({ input: Buffer.from(images[key], 'base64'), left: i*896, top: 0 })))
    .png().toFile(join(out, 'off-on.png'));
  await writeFile(join(out, 'measurements.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  assert.equal(report.identicalState.maxChannelDelta, 0);
  assert.equal(report.extinguished.maxChannelDelta, 0);
  assert.equal(report.far.maxChannelDelta, 0);
  assert(report.material.meanRGB[0] > report.material.meanRGB[2] && report.material.meanLuma > 1);
  assert(report.contactBounce.meanLuma > 0);
  assert(report.afterglow.meanLuma < report.material.meanLuma * .35);
  assert(report.turnedAway.meanLuma < report.originalLane.meanLuma * .25);
} finally { await browser.close(); }

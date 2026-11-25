// Run against the Vite dev server: node tools/yard-leaves-check.mjs [baseUrl]
import assert from 'node:assert/strict';
import { launch } from './browser.mjs';

const browser = await launch();
try {
  const page = await browser.newPage({ reducedMotion: 'no-preference' });
  await page.goto(process.argv[2] ?? 'http://localhost:5173/');
  await page.waitForFunction(() => window.__app, null, { timeout: 90000 });
  const result = await page.evaluate(async () => {
    const { drawWorld, propSpriteKey } = await import('/src/render/world.ts');
    const { sprite, paintingImage } = await import('/src/engine/assets.ts');
    const { project, TH } = await import('/src/render/projection.ts');
    const { PROPS } = await import('/src/core/map.ts');
    const oak = PROPS.find(prop => prop.kind === 'oak');
    const canvas = document.createElement('canvas');
    canvas.width = 1440;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    const drawImage = ctx.drawImage.bind(ctx), fill = ctx.fill.bind(ctx);
    const colours = new Set(['#d98a2b', '#c9561f', '#e0b23a', '#a8662a', '#8f3b1c']);
    const flowers = sprite('dawn_wildlife');
    let tree, leafBatch, flowerMirror, oakDrawn;
    ctx.drawImage = (image, ...args) => {
      if (image === tree.img || image === paintingImage(tree)) oakDrawn = true;
      if (image === flowers.img && args[1] === flowers.h * 3 / 4) flowerMirror = ctx.getTransform().a < 0;
      drawImage(image, ...args);
    };
    ctx.fill = (...args) => {
      if (colours.has(ctx.fillStyle)) {
        // Colour, opacity and signed orientation distinguish leaves at the same instant.
        // Depth is deliberately absent, so a draw-order change cannot change the pairing.
        const m = ctx.getTransform();
        const id = [ctx.fillStyle, ctx.globalAlpha, m.a.toFixed(5)].join('/');
        leafBatch.set(id, { x: m.e, y: m.f, afterOak: oakDrawn });
      }
      fill(...args);
    };
    const frame = { night: false, carPresent: true, houseHpRatio: 1, devices: [], enemies: [], particles: [], decals: [],
      barricades: Object.fromEntries(['portail', 'grange', 'arriere', 'verger'].map(s => [s, { hp: 100, level: 0 }])) };
    const counts = { behind: 0, ahead: 0 };
    const errors = [];
    for (const zoom of [.8, 1.45]) {
      for (const time of [2.13, 9.42, 27.67, 51.8]) {
        const pair = [];
        for (const rot of [0, 1]) {
          const view = { rot, zoom, cx: oak.x + .5, cy: oak.y + .5, x: 0, y: 0, w: canvas.width, h: canvas.height };
          tree = sprite(propSpriteKey('oak', rot));
          oakDrawn = false;
          flowerMirror = undefined;
          leafBatch = new Map();
          drawWorld(ctx, view, { ...frame, time });
          if (!oakDrawn) throw Error('Missing oak in yard');
          const daisies = project(view, 12.85, 19.78);
          if (daisies.x >= 0 && daisies.x <= canvas.width && daisies.y >= 0 && daisies.y <= canvas.height && flowerMirror !== Boolean(rot)) {
            throw Error('Daisies did not turn with their patch of soil');
          }
          pair.push(leafBatch);
        }
        for (const [id, front] of pair[0]) {
          const rear = pair[1].get(id);
          if (!rear || Math.abs(front.x + rear.x - canvas.width) > .1) continue;
          // The vertical fall distance cancels between views. The remaining displacement
          // gives the ground depth relative to the oak, which stands at the camera centre.
          const depth = (front.y - rear.y) / (TH * zoom);
          if (Math.abs(depth) < 1) continue;
          if (depth < 0) counts.behind++;
          else counts.ahead++;
          if (front.afterOak !== (depth > 0) || rear.afterOak !== (depth < 0)) errors.push({ time, depth });
        }
      }
    }
    return { ...counts, errors };
  });
  assert.ok(result.behind > 5 && result.ahead > 5, 'Sample leaves on both sides of the oak');
  assert.deepEqual(result.errors, []);
  console.log('Leaf depth and flower facing passed in both views at two zoom levels.', result);
} finally {
  await browser.close();
}

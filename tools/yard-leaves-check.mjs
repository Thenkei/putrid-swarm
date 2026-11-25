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
  const canopyChecks = await page.evaluate(async () => {
    const { drawForest, projectStand } = await import('/src/render/forest.ts');
    const { treesIn } = await import('/src/render/scenery.ts');
    const { drawWorld, propSpriteKey } = await import('/src/render/world.ts');
    const { sprite, paintingImage } = await import('/src/engine/assets.ts');
    const { project } = await import('/src/render/projection.ts');
    const { PROPS } = await import('/src/core/map.ts');
    const canvas = document.createElement('canvas');
    canvas.width = 450; canvas.height = 360;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const draw = ctx.drawImage.bind(ctx);
    let watch, alpha, phase;
    ctx.drawImage = (image, ...args) => {
      if (watch(image)) alpha.push([phase, ctx.globalAlpha]);
      draw(image, ...args);
    };
    const frame = { time: 3.2, night: false, carPresent: true, houseHpRatio: 1, devices: [], enemies: [], particles: [], decals: [],
      barricades: Object.fromEntries(['portail', 'grange', 'arriere', 'verger'].map(s => [s, { hp: 100, level: 0 }])) };
    let checked = 0;
    for (const rot of [0, 1]) for (const zoom of [.69, 1.3]) {
      const far = rot ? 32 : -12;
      const [gx,gy] = rot ? [26.097, 6.200] : [30.500,14.251];
      const roadside = treesIn(gx-.02, gy-.02, gx+.02, gy+.02)[0];
      const background = treesIn(far-2, far-2, far+2, far+2).find(t => t.trait < .83);
      for (const [label, tree] of [['roadside', roadside], ['backdrop', background], ['oak'], ['apple'], ['bush']]) {
        const prop = tree ? null : PROPS.find(p => p.kind === label);
        const cx = tree?.gx ?? prop.x+prop.w/2, cy = tree?.gy ?? prop.y+prop.h/2;
        const view = { rot, zoom, cx, cy, x: 0, y: 0, w: canvas.width, h: canvas.height };
        const stand = tree && projectStand(view, tree);
        const art = prop && sprite(propSpriteKey(label, rot));
        watch = image => tree ? image === stand.image : image === art.img || image === paintingImage(art);
        const root = project(view, cx, cy);
        const point = tree ? { x: stand.x, y: stand.y - stand.h * .53 }
          : { x: root.x, y: root.y - ({oak:78,apple:65,bush:20}[label])*zoom };
        function sample(pointer) {
          ctx.clearRect(0,0,canvas.width,canvas.height); alpha = []; phase = 'backdrop';
          if (tree) {
            const foreground = [];
            drawForest(ctx,view,frame.time,foreground,pointer);
            phase = 'roadside';
            for (const item of foreground.sort((a,b) => a.depth-b.depth)) item.draw();
          } else drawWorld(ctx,view,{ ...frame, treePointer: pointer });
          return ctx.getImageData(point.x-10,point.y-10,20,20).data;
        }
        const before = sample(null), hovered = sample(point);
        if (!alpha.some(([pass,opacity]) => opacity === .5 && (!tree || pass === label))) throw Error('Missing half opacity: '+[label,rot,zoom]);
        if (!before.some((v,i)=>Math.abs(v-hovered[i])>3)) throw Error('No visible change: '+[label,rot,zoom]);
        const after = sample(null);
        if (!before.every((v,i)=>v===after[i])) throw Error('Hover did not restore: '+[label,rot,zoom]);
        checked++;
      }
    }
    return checked;
  });
  console.log(canopyChecks+' canopy hover/leave checks passed.');
  console.log('Leaf depth and flower facing passed in both views at two zoom levels.', result);
} finally {
  await browser.close();
}

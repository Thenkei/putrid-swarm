#!/usr/bin/env node
/** Verify the garage retrieval, bladed wheel and arcade via the regular title and save flow.
 * Run against a dev or preview server: node tools/epic-arcade-shots.mjs <outDir> [URL]
 * Chrome additionally exercises real touch swipes through its input protocol. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { BROWSER, launch } from './browser.mjs';

const { newGame, travelTo } = await tsImport('../src/core/game.ts', import.meta.url);
const OUT = resolve(process.argv[2] ?? 'shots');
const URL = process.argv[3] ?? process.env.PS_URL ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });

function garageSave() {
  const visit = travelTo({ ...newGame(1), day: 3 }, 'garage');
  assert.ok(visit.ok);
  const state = visit.value.state;
  // The outing's major encounter is already settled. Isolate the cargo cost from random tolls.
  return { ...state, outing: { ...state.outing, major: true, trunk: { ...state.outing.trunk, scrap: 8 } } };
}

const browser = await launch();
async function openSave(profile, save, reducedMotion = 'no-preference') {
  const phone = profile.startsWith('phone');
  const context = await browser.newContext({
    locale:'fr-FR', reducedMotion, hasTouch:phone, isMobile:phone,
    viewport: profile === 'phone-wide' ? {width:844,height:390} : phone ? {width:390,height:844} : {width:1280,height:720}, deviceScaleFactor:1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.addInitScript(save => {
    localStorage.setItem('putrid-swarm.lang','fr');
    localStorage.setItem('putrid-swarm.warned','1');
    if (!localStorage.getItem('putrid-swarm.save.v1')) localStorage.setItem('putrid-swarm.save.v1', JSON.stringify(save));
  }, save);
  await page.goto(URL);
  const click = locator => phone ? locator.tap() : locator.click();
  const btn = name => page.getByRole('button', {name, exact:true});
  const resume = async () => {
    if (phone) await click(page.locator('.gate button'));
    await click(btn('Continuer'));
  };
  await resume();
  const shot = async (label) => page.screenshot({path:join(OUT,profile+'-'+label+'.png')});
  return { page, click, btn, shot, resume, finish: async () => {
    await context.close(); assert.deepEqual(errors,[]);
  } };
}

async function garage(profile) {
  const {page,click,btn,shot,resume,finish} = await openSave(profile, garageSave());
  const phone = profile.startsWith('phone');
  const cdp = phone ? await page.context().newCDPSession(page) : null;
  const summary = page.locator('.epic-object summary');
  const piece = id => page.locator('[data-piece="'+id+'"]');
  const puzzle = async () => {
    await click(summary);
    await click(page.getByRole('button',{name:/Décrocher la clé/}));
    await page.locator('.aisle-dialog[open]').waitFor();
  };
  await puzzle();
  await page.waitForTimeout(220);
  await shot('garage');
  await click(btn('La laisser ici'));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).flags['epic.loaded']), undefined);
  await click(page.getByRole('button',{name:/Décrocher la clé/}));
  const move = async (id,key) => {
    const token = piece(id);
    const before = await token.getAttribute('style');
    if (phone) {
      const box = await token.boundingBox();
      const grid = await page.locator('.aisle-grid').boundingBox();
      const x = box.x + box.width/2, y = box.y+box.height/2;
      const dx = key==='ArrowLeft' ? -grid.width/8 : key==='ArrowRight' ? grid.width/8 : 0;
      const dy = key==='ArrowDown' ? grid.height/6 : 0;
      const touch = (type,points) => cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
      await touch('touchStart',[{x,y}]); await touch('touchMove',[{x:x+dx,y:y+dy}]); await touch('touchEnd',[]);
    } else {
      await click(token);
      await page.keyboard.press(key);
    }
    await page.waitForFunction(([id,before]) => document.querySelector('[data-piece="'+id+'"]')?.getAttribute('style') !== before,[id,before]);
    await page.waitForTimeout(190);
  };
  await move('trolley','ArrowLeft');
  await move('toolbox','ArrowDown'); await move('toolbox','ArrowDown');
  await move('bench','ArrowDown');
  if (phone) {
    for(let i=0;i<3;i++) await move('moped','ArrowRight');
  } else {
    await click(piece('moped'));
    await page.keyboard.press('ArrowRight');
    // Sample the second real key at a known point in the previous slide.
    await piece('moped').evaluate(token => {
      const slide = token.getAnimations()[0];
      slide.pause();
      slide.currentTime = 35;
      const left = token.getBoundingClientRect().left;
      token.closest('dialog').addEventListener('keydown', () => {
        const next = document.querySelector('[data-piece="moped"]');
        window.mopedSlideJump = next.getBoundingClientRect().left - left;
      }, {once:true});
    });
    await page.keyboard.press('ArrowRight');
    const jump = await page.evaluate(() => window.mopedSlideJump);
    assert.ok(Math.abs(jump) < 1, 'repeated moped slide jumped '+jump+' pixels');
    await page.keyboard.press('ArrowRight');
  }
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).flags['epic.loaded']===1);
  await page.reload(); await resume();
  assert.match(await summary.textContent(), /break/);
  await click(page.locator('.loc-leave button'));
  await click(page.locator('.travel-summary .center-col'));
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).flags['epic.moped']===1);
  const inventory = await page.evaluate(()=>JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).inventory);
  assert.equal(inventory.scrap,garageSave().inventory.scrap+4);
  await click(btn('Attendre la nuit'));
  await click(btn('Attendre'));
  await click(btn('Prendre le poste'));
  const launch=page.locator('.epic-launch');
  await click(launch);
  assert.equal(await launch.isDisabled(),true);
  assert.equal(await launch.getAttribute('data-stage'),'run');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).flags['epic.spent']),1);
  await page.waitForTimeout(360);
  await shot('moped-open-door');
  await page.waitForTimeout(220);
  await shot('moped-launch');
  await page.waitForTimeout(830);
  await shot('moped-door-shut');
  await page.waitForFunction(()=>document.querySelector('.epic-launch')?.dataset.stage==='spent');
  assert.match(await launch.textContent(), /Mob détruite/);
  await shot('moped-blast');
  assert.equal(await launch.isDisabled(),true);
  await page.reload(); await resume();
  await click(btn('Attendre la nuit'));
  await click(btn('Prendre le poste'));
  await page.locator('.cam-frame').waitFor();
  assert.equal(await page.locator('.epic-launch').count(),0);
  await finish();
  console.log(profile+' garage: retrieval, cargo cost, one launch, wreck and spent save after reload verified');
}

// Resume at the garage after the puzzle, with known goods and an earlier road loss.
async function mopedCargo(profile, packed, loaded = true) {
  const base = garageSave();
  const save = { ...base, flags: { ...base.flags, 'epic.loaded': Number(loaded) }, outing: {
    ...base.outing, trunk: { ...base.outing.trunk, scrap: 0, ...packed }, parted: { ...base.outing.parted, wire: 1 },
  } };
  const { page, click, shot, finish } = await openSave(profile, save);
  const bar = page.locator('.topbar .cost .res');
  await bar.first().waitFor();
  const ids = ['wood','scrap','wire','springs','battery'];
  const have = id => loaded ? Math.floor(save.outing.trunk[id] / 2) : save.outing.trunk[id];
  for (const id of ids) {
    const label = bar.filter({has:page.locator('img[src*="icons_'+id+'"]')});
    assert.equal(Number(await label.textContent()), have(id), id);
  }
  await page.evaluate(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(image,...args) {
      draw.call(this,image,...args);
      const plate = image.src?.match(/\b(plate_trunk|plate_return)\.webp/);
      if (plate) window.arrivalPlate = plate[1];
    };
  });
  await click(page.locator('.loc-leave button'));
  const summary = page.locator('.travel-summary .center-col');
  await summary.waitFor();
  await page.waitForFunction(expected => window.arrivalPlate === expected,loaded ? 'plate_return' : 'plate_trunk');
  assert.equal(await summary.locator('.moped-delivery').count(), Number(loaded));
  if (loaded) {
    assert.ok(await summary.locator('.moped-delivery img').evaluate(img => img.complete && img.naturalWidth > 0));
    assert.match(await summary.textContent(), /Laissé pour la mob/);
    assert.doesNotMatch(await summary.textContent(), /Coffre vide/);
  }
  assert.match(await summary.textContent(), /Laissé en route/);
  for (const id of ids) {
    const found = summary.locator('p:not(.lost) .res').filter({has:page.locator('img[src*="icons_'+id+'"]')});
    assert.equal(await found.count(), Number(have(id)>0));
    if (have(id)) assert.equal(await found.textContent(), '+'+have(id));
  }
  const label = !loaded ? 'ordinary' : ids.some(id => have(id) > 0) ? 'mixed' : 'single';
  await page.waitForTimeout(220);
  await shot('cargo-'+label);
  if (loaded) {
    const displaced = summary.locator('p.lost').filter({hasText:/pour la mob/});
    for (const id of ids) {
      const loss = save.outing.trunk[id] - have(id);
      const chip = displaced.locator('.res').filter({has:page.locator('img[src*="icons_'+id+'"]')});
      assert.equal(await chip.count(), Number(loss > 0));
      if (loss) assert.equal(await chip.textContent(), '−'+loss);
    }
  }
  if (loaded) {
    const beforeReload = await summary.innerText();
    await page.reload();
    if (profile.startsWith('phone')) await click(page.locator('.gate button'));
    await click(page.getByRole('button',{name:'Continuer',exact:true}));
    await summary.waitFor();
    const resumed = await page.evaluate(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')));
    assert.equal(resumed.where,'road');
    assert.deepEqual(resumed.inventory,base.inventory);
    assert.equal(resumed.flags['epic.loaded'],1);
    assert.equal(await summary.innerText(),beforeReload);
  }
  await click(summary);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).where==='home');
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')));
  const home = await read();
  assert.equal(Boolean(home.flags['epic.moped']),loaded);
  for (const id of ids) assert.equal(home.inventory[id],base.inventory[id]+have(id));
  if (loaded) {
    await page.getByText(/Mob livrée au refuge/).waitFor();
    await page.waitForTimeout(250);
    await shot('home-'+label);
  }
  await page.reload();
  if(profile.startsWith('phone')) await click(page.locator('.gate button'));
  await click(page.getByRole('button',{name:'Continuer',exact:true}));
  await page.locator('.topbar').waitFor();
  assert.deepEqual((await read()).inventory,home.inventory);
  await finish();
  console.log(profile+' cargo '+label+': topbar, illustration, full breakdown, stock and reload verified');
}

async function arcade(profile, motion, armless = false) {
  const save = {...newGame(37),day:4,hoursLeft:0,orchard:armless ? 'maimed' : 'quiet',flags:{'epic.vhs':1}};
  const {page,click,btn,shot,finish} = await openSave(profile,save,motion);
  await click(btn('Attendre la nuit'));
  await click(btn('Prendre le poste'));
  await click(btn('Lecture ▶'));
  const canvas=page.locator('.vhs-track');
  await canvas.waitFor();
  // Observe only the real tape renderer. Each capture is the completed action frame, including
  // lane motion and impacts. Check the aim and arm variant that reached the production canvas.
  await page.evaluate(() => {
    window.vhsFrames = {};
    window.vhsAngles = {};
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
      draw.call(this, image, ...args);
      if (!this.canvas.matches?.('.vhs-track') || !image.src?.includes('epic_vhs_hero') || args.length !== 8) return;
      const [x,y,w,h] = args;
      const id = (y / h) + '-' + (x / w);
      const name = image.src.split('/').pop().split('.')[0];
      window.vhsAngles[name + '-' + id] = true;
      if (window.vhsFrames[id] !== undefined) return;
      window.vhsFrames[id] = '';
      queueMicrotask(() => { window.vhsFrames[id] = this.canvas.toDataURL(); });
    };
  });
  const row=armless ? 1 : 0;
  await page.waitForFunction(row => window.vhsFrames[row+'-0'],row);
  if(profile.startsWith('phone')) await canvas.tap(); else { await page.keyboard.down('Space'); await page.waitForTimeout(450); await page.keyboard.up('Space'); }
  await page.waitForFunction(()=>/^[1-9]\d* pts/.test(document.querySelector('.epic-night p').textContent));
  await click(btn('Pause'));
  const status = page.locator('.epic-night p'), paused = await status.textContent();
  await page.waitForTimeout(350); assert.equal(await status.textContent(),paused);
  await click(btn('Reprendre'));
  await click(page.getByRole('button',{name:/Tir automatique/}));
  if(!profile.startsWith('phone')) { await canvas.focus(); await page.keyboard.press('ArrowLeft'); } else {
    const box=await canvas.boundingBox();
    await canvas.tap({position:{x:box.width*.15,y:box.height*.6}});
  }
  await page.waitForFunction(()=>document.querySelector('.epic-night p').textContent.includes('gauche'));
  await page.waitForFunction(row => window.vhsAngles['epic_vhs_hero-'+row+'-3'],row);
  await shot(motion+(armless ? '-one-arm' : '')+'-vhs');
  if (profile.startsWith('phone')) {
    const box=await canvas.boundingBox();
    await canvas.tap({position:{x:box.width*.86,y:box.height*.6}});
  } else {
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  }
  await page.waitForFunction(row => window.vhsAngles['epic_vhs_hero_left-'+row+'-3'],row);
  assert.ok(await page.evaluate(row => !!window.vhsAngles['epic_vhs_hero_center-'+row+'-3'],row));
  const poses = motion === 'reduce' ? [0,3] : [0,1,2,3];
  await page.waitForFunction(({row,poses})=>poses.every(p=>window.vhsFrames[row+'-'+p]),{row,poses});
  const captures=await page.evaluate(()=>window.vhsFrames);
  assert.ok(Object.keys(captures).every(k=>k.startsWith(row+'-')));
  if(motion==='no-preference' && profile==='desktop') {
    for(const pose of poses) {
      const filename=(armless ? 'one-arm' : 'two-arm')+'-'+['ready','stride-left','stride-right','fire'][pose]+'.png';
      writeFileSync(join(OUT,'vhs-'+filename),Buffer.from(captures[row+'-'+pose].split(',')[1],'base64'));
    }
  }
  await click(btn('Éjecter'));
  assert.ok(await page.evaluate(()=>Number(localStorage.getItem('putrid-swarm.vhs-best'))>0));
  await click(btn('Reprendre la veille'));
  await page.locator('.epic-night').waitFor({state:'detached'});
  await finish();
  console.log(profile+' VHS '+motion+': tap/fire, lane, pause, auto, record and desk verified');
}

try {
  await garage('desktop');
  await mopedCargo('desktop', {springs:1});
  await mopedCargo('phone-wide', {wood:5,scrap:3,battery:1});
  await mopedCargo('desktop', {springs:1}, false);
  if (!process.argv.includes('--cargo-only')) {
    await arcade('desktop','no-preference');
    await arcade('desktop','no-preference',true);
    await arcade('desktop','reduce');
    if(BROWSER==='chrome') {
      for (const phone of ['phone','phone-wide']) { await garage(phone); await arcade(phone,'reduce'); }
    }
  }
} finally { await browser.close(); }

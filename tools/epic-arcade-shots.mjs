#!/usr/bin/env node
/** Verify the garage retrieval, bladed wheel and arcade via the regular title and save flow.
 * Run against a dev or preview server: node tools/epic-arcade-shots.mjs <outDir> [URL]
 * Chrome additionally exercises real touch swipes through its input protocol. */
import { mkdirSync } from 'node:fs';
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
  for(let i=0;i<3;i++) await move('moped','ArrowRight');
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
  await page.waitForTimeout(480);
  await shot('moped-launch');
  await page.waitForFunction(()=>document.querySelector('.epic-launch')?.textContent.includes('Klaxon'));
  assert.equal(await launch.isDisabled(),true);
  await finish();
  console.log(profile+' garage: cancel, retrieval, reload, 4/8 scrap returned, night launch and horn verified');
}

async function arcade(profile, motion) {
  const save = {...newGame(37),day:4,hoursLeft:0,flags:{'epic.vhs':1}};
  const {page,click,btn,shot,finish} = await openSave(profile,save,motion);
  await click(btn('Attendre la nuit'));
  await click(btn('Prendre le poste'));
  await click(btn('Lecture ▶'));
  const canvas=page.locator('.vhs-track');
  await canvas.waitFor();
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
  await shot(motion+'-vhs');
  await click(btn('Éjecter'));
  assert.ok(await page.evaluate(()=>Number(localStorage.getItem('putrid-swarm.vhs-best'))>0));
  await click(btn('Reprendre la veille'));
  await page.locator('.epic-night').waitFor({state:'detached'});
  await finish();
  console.log(profile+' VHS '+motion+': tap/fire, lane, pause, auto, record and desk verified');
}

try {
  await garage('desktop');
  await arcade('desktop','no-preference');
  await arcade('desktop','reduce');
  if(BROWSER==='chrome') {
    for (const phone of ['phone','phone-wide']) { await garage(phone); await arcade(phone,'reduce'); }
  }
} finally { await browser.close(); }

#!/usr/bin/env node
// Chrome can keep drawing an unfocused game window. Verify both course modes against that case.
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { launch } from './browser.mjs';

const { newGame, prepareSearch, travelTo } = await tsImport('../src/core/game.ts', import.meta.url);
const visit = travelTo({...newGame(11),day:3}, 'grocery');
assert.ok(visit.ok);
const state = visit.value.state;
const save = {...state,encounter:null,outing:{...state.outing,major:true}};
const preview = prepareSearch(save,6);
assert.ok(preview.ok);
const browser = await launch();

try {
  for (const mode of ['timed','untimed','late']) {
    const context = await browser.newContext({ viewport:{width:1280,height:720} });
    const page = await context.newPage();
    const away = await context.newPage();
    await page.addInitScript(save => {
      localStorage.setItem('putrid-swarm.lang','fr');
      localStorage.setItem('putrid-swarm.warned','1');
      localStorage.setItem('putrid-swarm.save.v1',JSON.stringify(save));
    },save);
    await page.bringToFront();
    await page.goto(process.argv[2] ?? 'http://localhost:5173/');
    await page.getByRole('button',{name:'Continuer',exact:true}).click();
    await away.goto('about:blank');
    // Disable the automation focus override so switching windows generates a real blur.
    for (const tab of [page,away]) {
      const client = await context.newCDPSession(tab);
      await client.send('Emulation.setFocusEmulationEnabled',{enabled:false});
    }
    await page.bringToFront();
    await page.locator('[data-spot="6"]').click();
    const buttons = page.locator('.vachette-controls button');
    await buttons.nth(mode === 'untimed' ? 1 : 0).click();
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')));
    assert.equal((await read()).hoursLeft,preview.value.paid.hoursLeft);
    if (mode === 'late') {
      await page.locator('.salvage-retry').waitFor();
      assert.deepEqual((await read()).outing.trunk,save.outing.trunk);
    } else {
      await page.locator('.vachette-arena[data-in-band=true]').waitFor();
      await page.evaluate(() => {
        window.addEventListener('blur', () => {
          window.frozenCourse = document.querySelector('.vachette-arena').style.getPropertyValue('--vachette-position');
        }, {once:true});
      });
      await away.bringToFront();
      await page.waitForFunction(() => !document.hasFocus(),undefined,{polling:50});
      // Wait on real animation frames even if background rendering is throttled.
      const jump = await page.evaluate(async () => {
        for (let i=0;i<5;i++) await new Promise(requestAnimationFrame);
        const position = document.querySelector('.vachette-arena')?.style.getPropertyValue('--vachette-position');
        return position !== window.frozenCourse;
      });
      assert.equal(jump,false);
      await page.bringToFront();
      for (let gate=0;gate<3;gate++) {
        await page.locator('.vachette-arena[data-in-band=true]').waitFor();
        await buttons.click();
      }
      await buttons.click();
      const homebound = await read();
      assert.deepEqual(homebound.outing.trunk,preview.value.success.state.outing.trunk);
      assert.equal(homebound.hoursLeft,preview.value.paid.hoursLeft);
      assert.ok(homebound.locations.grocery.searched.includes(6));
    }
    console.log(mode+' fairground verified');
    await context.close();
  }
} finally { await browser.close(); }

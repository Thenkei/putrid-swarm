// node --import tsx tools/night-evidence-check.mjs <preview URL> [screenshots]
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch } from './browser.mjs';
import { newGame } from '../src/core/game.ts';

const [url, output] = process.argv.slice(2);
if (output) await mkdir(output, { recursive:true });
const browser = await launch();
const errors = [];
async function visit(save, phone) {
  const page = await browser.newPage({ locale:'fr-FR', viewport:phone ? { width:390,height:844 } : { width:1280,height:720 }, hasTouch:phone, isMobile:phone });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(save => {
    if (sessionStorage.getItem('started')) return;
    sessionStorage.setItem('started','1');
    for (const [k,v] of Object.entries({ warned:'1', coach:'1', lang:'fr', sound:'off', 'save.v1':JSON.stringify(save) })) localStorage.setItem('putrid-swarm.'+k,v);
  }, save);
  await page.goto(url);
  await resume(page, phone);
  return page;
}
async function resume(page, phone) {
  if (phone) await page.locator('.gate button').tap();
  await page.getByRole('button',{name:'Continuer',exact:true}).click();
}
async function enter(page) {
  for (const name of ['Attendre la nuit','Prendre le poste']) await page.getByRole('button',{name,exact:true}).click();
  await page.locator('.epic-night').waitFor({timeout:90000});
}
async function start(day,phone) {
  const page = await visit({ ...newGame(54), day, hoursLeft:0 }, phone);
  await enter(page);
  return page;
}
async function shot(page,name) {
  if (output) await page.screenshot({path:join(output,name+'.png')});
}
try {
  const opening = newGame(54);
  for (const [chapter,day,props,go] of [
    ['orchard',2,{ orchard:'cut' },'Aller voir au verger'],
    ['shed',4,{ shed:'waiting' },'Aller à la cabane'],
    ['radio',6,{ radio:{...opening.radio,stage:'waiting'} },'Aller à la radio'],
    ['finale',7,{ phase:'held' },'Rejouer le morceau'],
  ]) {
    const page = await visit({ ...opening, phase:'morning',day,...props }, day === 4);
    await page.getByRole('button',{name:go,exact:true}).click();
    for (const i of [0,1]) {
      const point = page.locator('.chapter-point').nth(i);
      await point.waitFor();
      await point.press('Enter');
      const label = await point.getAttribute('aria-label');
      await page.getByRole('dialog',{name:label,exact:true}).waitFor();
      await page.getByRole('button',{name:'Carnet de terrain',exact:true}).click();
      const pictures = page.locator('.notebook-leaf figure img');
      assert.equal(await pictures.count(), i+1, chapter+' / '+i);
      const pic = await pictures.last().evaluate(async img => { await img.decode(); return [img.src.slice(0,16),img.naturalWidth]; });
      assert.deepEqual(pic, ['data:image/webp;',384]);
      await page.getByRole('button',{name:'Refermer',exact:true}).click();
      await page.getByRole('button',{name:'Revenir à la scène',exact:true}).click();
      await page.waitForFunction(idx => document.activeElement === document.querySelectorAll('.chapter-point')[idx], i);
    }
    await page.waitForFunction(c => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).chapterPrints?.[c+'1'],chapter);
    await page.close();
    console.log('Deux vues du décor enregistrées, chapitre '+chapter);
  }
  for (const [day, ids] of [[2,['latch','hob']], [3,['tongs','paper']], [4,['signature','rewind']], [6,['coat','curtain']]]) {
    const page = await start(day, day === 6);
    const button = name => page.getByRole('button',{name,exact:true});
    const points = page.locator('.epic-field .room-point');
    for (const [i,id] of ids.entries()) {
      await points.nth(i).press('Enter');
      await page.waitForFunction(id => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).flags['epic.found.'+id] === 1,id);
      await button('Carnet de terrain').click();
      assert.equal(await page.locator('.notebook-leaf p').count(), i+1);
      await page.locator('.notebook-crop img').first().evaluate(img => img.decode());
      if (i === 1) await shot(page,'carnet-nuit-'+day);
      await button('Refermer').click();
      await button('Vue d’ensemble').click();
    }
    await shot(page,'decor-nuit-'+day);
    await page.close();
    console.log('Indices et carnet vérifiés, nuit '+day);
  }
  const p = await start(5,false);
  const button = name => p.getByRole('button',{name,exact:true});
  await button('Descendre de la maison').waitFor({timeout:90000});
  await p.waitForFunction(() => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).moonPrints?.length === 1);
  await p.reload();
  await resume(p,false);
  await enter(p);
  await button('Descendre de la maison').waitFor({timeout:90000});
  await button('Carnet de terrain').click();
  assert.equal(await p.locator('.notebook-leaf figure img').count(),1);
  await shot(p,'tirage-etendoir');
  await button('Refermer').click();
  await p.getByText(/Il a quitté la cour/).waitFor({timeout:45000});
  await button('Descendre de la maison').click();
  await button('Suivre le louveteau').click();
  await button('Entrer dans le bois').click();
  await p.locator('[data-phase=forest][data-window=open]').waitFor();
  await button('Appeler le petit au creux du chêne').focus();
  await p.keyboard.down('Space');
  await p.locator('[data-outcome=allied]').waitFor();
  await p.keyboard.up('Space');
  await button('Reprendre la veille').waitFor();
  await shot(p,'retrouvailles');
  await p.close();
  assert.deepEqual(errors,[]);
  console.log('Tirage de l’étendoir conservé après rechargement et alliance dans le bois au clavier.');
} finally { await browser.close(); }

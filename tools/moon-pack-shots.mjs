// node tools/moon-pack-shots.mjs <preview URL> <capture directory> [noise|track|keys|idle|retour|hesitate|hostile|caught|day1|day6]
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { launch } from './browser.mjs';
const [url,out,only]=process.argv.slice(2);
await mkdir(out,{recursive:true});
const {newGame}=await tsImport('../src/core/game.ts',import.meta.url);
const {build}=await tsImport('../src/core/yard.ts',import.meta.url);
const browser=await launch();
const errors=[];
async function run(mode) {
  const phone=mode==='track';
  const page=await browser.newPage({locale:'fr-FR',viewport:phone?{width:390,height:844}:{width:1280,height:720},isMobile:phone,hasTouch:phone,reducedMotion:phone?'reduce':'no-preference'});
  page.on('pageerror',e=>errors.push(e.message));
  const shot=key=>page.screenshot({path:join(out,mode+'-'+key+'.png')});
  const button=name=>page.getByRole('button',{name,exact:true});
  const click=el=>phone?el.tap():el.click();
  try {
    let state={...newGame(54),day:mode==='day1'?1:6,hoursLeft:0};
    const waitAtDoor=mode==='track'||mode==='keys';
    if(waitAtDoor) {
      const trap=build({...state,hoursLeft:1},'spikes',16,3);
      assert.ok(trap.ok);
      state={...trap.value,hoursLeft:0};
    }
    await page.addInitScript(state=>{
      if(sessionStorage.getItem('started'))return;
      sessionStorage.setItem('started','1');
      for(const [k,v] of Object.entries({lang:'fr',warned:'1',coach:'1',sound:'off','save.v1':JSON.stringify(state)}))localStorage.setItem('putrid-swarm.'+k,v);
    },state);
    await page.goto(url);
    if(phone)await click(page.locator('.gate button'));
    await click(button('Continuer'));
    await button('Attendre la nuit').waitFor();
    await page.waitForTimeout(900);
    await shot('terrain');
    if(mode.startsWith('day'))return;
    await click(button('Attendre la nuit'));await click(button('Prendre le poste'));
    const scene=page.locator('.moon-screen');
    await scene.waitFor({timeout:100000});
    if(waitAtDoor){await page.waitForTimeout(6400);await shot('etendoir');}
    await page.getByText(/Une queue claire traverse la cour/).waitFor({timeout:45000});
    await page.waitForTimeout(950);await shot('poursuite');
    const stairs=button('Descendre de la maison');
    await stairs.waitFor({timeout:35000});
    assert.equal(await page.locator('.epic-actions button:visible').count(),0);
    if(mode==='caught'){
      await page.getByText(/Une main racle la porte/).waitFor();
      await shot('passage');await page.keyboard.press('Space');
      await scene.locator('..').locator('[data-outcome=outside]').waitFor();
      await page.getByText(/Le rôdeur te saisit/).waitFor();
      await page.waitForTimeout(550);await shot('attaque');
      const end=page.getByRole('heading',{name:'À deux pas du perron'});
      await end.waitFor();await page.waitForTimeout(1000);await shot('fin');
      await page.reload();await click(button('Continuer'));await end.waitFor();
      await click(button('Rejouer cette nuit'));await button('Prendre le poste').waitFor();return;
    }
    if(mode==='idle'){
      await scene.locator('..').locator('[data-outcome=neutral]').waitFor({timeout:45000});
      await shot('neutre'); await scene.waitFor({state:'detached'});return;
    }
    await shot('descente');
    if(waitAtDoor){
      await page.getByText('Le petit saute la palissade.',{exact:true}).waitFor({timeout:22000});
      await shot('saut');
      await page.getByText(/Il a quitté la cour/).waitFor({timeout:20000});
      await shot('seuil');
    }
    if(!waitAtDoor){
      await page.getByText(/Une main racle la porte/).waitFor();
      if(mode==='noise'){await page.getByText(/Le bruit des pas s’éloigne/).waitFor();await shot('accalmie');}
      else await page.getByText(/Il a quitté la cour/).waitFor();
    }
    assert.equal(await stairs.locator('kbd').textContent(),'Espace');
    assert.equal(await stairs.locator('kbd').isVisible(),!phone);
    if(mode==='keys'){
      await button('Carnet de terrain').focus();await page.keyboard.press('Space');
      await page.getByText(/Une main a raclé ma porte en passant/).waitFor();
      await click(button('Refermer'));await page.locator('.field-notebook').waitFor({state:'detached'});await stairs.focus();
    }
    if(phone)await click(stairs);else await page.keyboard.press(mode==='keys'?'Space':'ArrowUp');
    await page.locator('[data-phase=emerge]').waitFor();
    await page.waitForTimeout(1000);await shot('sortie');
    await button('Aller au break').waitFor();await shot('perron');
    if(mode==='retour'){await page.keyboard.press('ArrowDown');await page.locator('[data-outcome=neutral]').waitFor();await shot('neutre');return;}
    if(mode==='keys')await page.keyboard.press('ArrowLeft');
    else await click(button(mode==='noise'?'Aller au break':'Suivre le louveteau'));
    const local=button(mode==='noise'?'Frapper la boîte en métal':'Entrer dans le bois');
    await local.waitFor();await shot('sur-place');if(mode==='keys')await page.keyboard.press('ArrowUp');else await click(local);
    if(mode==='noise'){await page.waitForTimeout(410);await shot('boite');}
    assert.equal(await page.locator('.epic-actions button:visible').count(),0);
    if(mode==='hostile'||mode==='hesitate'){
      await click(button('Rabattre les rôdeurs vers le creux'));
      await page.getByText('Sa queue dépasse. Si je les pousse dans le creux, ils vont le tuer.',{exact:true}).waitFor();
      await shot('avertissement');
      if(mode==='hesitate'){
        await page.waitForTimeout(4600);
        await click(button('Les éloigner du petit'));
        await page.locator('[data-outcome=neutral]').waitFor({timeout:6000});
        return;
      }
      await click(button('Les éloigner du petit'));
      await click(button('Rabattre les rôdeurs vers le creux'));
      await click(button('Les pousser sur le petit'));
      await shot('cri');
      await page.locator('.moon-screen[data-phase=revenge]').waitFor();
      await page.waitForTimeout(1500);await shot('parents');
      await page.getByRole('heading',{name:'Ils ont retrouvé ta porte'}).waitFor();
      await shot('fin');
      await page.reload();await click(button('Continuer'));
      await page.getByRole('heading',{name:'Ils ont retrouvé ta porte'}).waitFor();
      return;
    }
    const gest=button(mode==='noise'?'Frapper le seau':'Appeler le petit au creux du chêne');
    await click(gest);
    await page.locator('[data-phase=forest][data-window=open]').waitFor();
    await shot('foret');
    if(mode==='noise') await click(gest);
    else if(phone){
      const box=await gest.boundingBox();assert.ok(box);
      const cdp=await page.context().newCDPSession(page);
      const touch=[{x:box.x+box.width/2,y:box.y+box.height/2}];
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch});
      await page.locator('[data-outcome=allied]').waitFor({timeout:3200});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
      await gest.focus();await page.keyboard.down('Space');await page.waitForTimeout(220);await page.keyboard.up('Space');
      await page.getByText(/Il s’arrête. Encore/).waitFor();
      await page.locator('[data-phase=forest][data-window=closed]').waitFor();
      await page.locator('[data-phase=forest][data-window=open]').waitFor();
      await page.keyboard.down('Space');await page.locator('[data-outcome=allied]').waitFor({timeout:3200});await page.keyboard.up('Space');
    }
    await button('Reprendre la veille').waitFor();
    await shot('meute');
    await click(button('Carnet de terrain'));
    await page.getByText(/Le petit s’abrite entre les racines/).waitFor();
    await click(button('Refermer'));await click(button('Reprendre la veille'));
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).phase==='morning',null,{timeout:120000});
    await shot('matin');
  } catch(e){await shot('debug');console.error(mode,(await page.locator('body').innerText()).slice(-900));throw e;}
  finally{await page.close();}
}
try{for(const mode of only?[only]:['day1','day6','caught','noise','track','keys','idle','retour','hesitate','hostile']){await run(mode);console.log(mode+' OK');}assert.deepEqual(errors,[]);}
finally{await browser.close();}

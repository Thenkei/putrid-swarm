import { describe, expect, it } from 'vitest';
import { CLOTHESLINE, CLOTHESLINE_POSTS, isStaticBlocked, terrainAt } from '../src/core/map';
import { CUB_LEAVES_LINE, CUB_REACHES_WOOD, planCubRun, porchTraffic, CUB_CROSSING, gatePassage, PACK_CYCLE } from '../src/core/moon-pack';
import { THRESHOLDS } from '../src/house-layout';
import { markEpic, MOON_NIGHT, packTrail } from '../src/core/epics';
import { newGame, startNextDay } from '../src/core/game';
import { build, placementProblem } from '../src/core/yard';
import { zombieClothContacts } from '../src/render/moon-laundry';
import { NightSim } from '../src/core/night';
import { serialize, deserialize } from '../src/core/save';
import type { GameState } from '../src/core/types';

describe('moonlit gate', () => {
  it('allows the cub through only after it crosses completely', () => {
    expect(gatePassage(3.1, 3.1)).toBe('crossing');
    expect(gatePassage(3.1, 4.0)).toBe('crossing');
    expect(gatePassage(3.1, 4.4)).toBe('through');
  });
  it('leaves a second opening for a player who waits or lowers early', () => {
    expect(gatePassage(11.1, 12.4)).toBe('through');
  });
  it('registers early, late and held-open impacts, including across a cycle', () => {
    expect(gatePassage(2.8, 4.5)).toBe('impact');
    expect(gatePassage(6.3, 7.0)).toBe('impact');
    expect(gatePassage(3.1, 11.4)).toBe('impact');
    expect(gatePassage(7.5, 7.5)).toBe('impact');
  });
  it('preserves a completed crossing when the next update also includes the impact', () => {
    for (const cycle of [0, 1, 4]) {
      const start = cycle * PACK_CYCLE;
      expect(gatePassage(start + 5.79, start + 7.01)).toBe('impact');
      expect(gatePassage(start + 5.79, start + 5.79 + CUB_CROSSING)).toBe('through');
      for (const offset of [2.99, 5.80, 5.81, 7.15]) {
        const opened = start + offset;
        expect(gatePassage(opened, opened + CUB_CROSSING)).toBe('impact');
      }
    }
  });
});

describe('the clothesline in wave two', () => {
  const game = newGame(54);
  it('starts on the lawn and runs across open cells to the forest', () => {
    const moonCubAt=planCubRun([]);
    expect(terrainAt(Math.floor(CLOTHESLINE.x), Math.floor(CLOTHESLINE.y))).toBe('grass');
    expect(moonCubAt(CUB_LEAVES_LINE)).toMatchObject(CLOTHESLINE);
    for (let t=CUB_LEAVES_LINE;t<=CUB_REACHES_WOOD;t+=.05) {
      const p=moonCubAt(t);
      expect(isStaticBlocked(Math.floor(p.x),Math.floor(p.y))).toBe(false);
    }
    const end=moonCubAt(CUB_REACHES_WOOD);
    expect(terrainAt(Math.floor(end.x),Math.floor(end.y))).toBe('forest');
  });
  it('skirts the armed stakes under the sheet and clears the standing driveway fence', () => {
    const spikes={x:16,y:3,type:'spikes' as const,hp:40};
    const fence={x:14,y:16,type:'fence' as const,hp:60};
    const run=planCubRun([spikes,fence]);
    let crossed=false;
    for(let age=0;age<=CUB_REACHES_WOOD;age+=.025) {
      const p=run(age), x=Math.floor(p.x), y=Math.floor(p.y);
      expect(x===spikes.x && y===spikes.y).toBe(false);
      expect(isStaticBlocked(x,y)).toBe(false);
      if(x===fence.x && y===fence.y) {expect(p.lift).toBeGreaterThan(55);crossed=true;}
    }
    expect(crossed).toBe(true);
    expect(run(CUB_REACHES_WOOD).lift).toBe(0);
    fence.hp=0;
    expect(run(18.8).lift).toBe(0);
  });
  it('allows a spike trap under the linen and reserves just the footings', () => {
    const x = Math.floor(CLOTHESLINE.x), y = Math.floor(CLOTHESLINE.y);
    expect(build(game, 'spikes', x, y).ok).toBe(true);
    const [first,last] = CLOTHESLINE_POSTS;
    expect(first.y).toBe(last.y);
    expect(first.x).toBeLessThan(CLOTHESLINE.x);
    expect(last.x).toBeGreaterThan(CLOTHESLINE.x);
    for (const post of CLOTHESLINE_POSTS) {
      expect(placementProblem(game.yard,'spikes',Math.floor(post.x),Math.floor(post.y))?.code).toBe('not_buildable');
    }
  });
  it('finds a continuous detour when adjacent traps cover a turn beside the well', () => {
    const traps=[{x:16,y:7,type:'net' as const,hp:30},{x:16,y:8,type:'spikes' as const,hp:30}];
    const run=planCubRun(traps);
    let prev=run(0);
    for(let t=0;t<CUB_REACHES_WOOD;t+=.04) {
      const p=run(t), x=Math.floor(p.x), y=Math.floor(p.y);
      expect(isStaticBlocked(x,y) || traps.some(d=>d.x===x && d.y===y)).toBe(false);
      expect(Math.hypot(p.x-prev.x,p.y-prev.y)).toBeLessThan(.2);
      expect(p.lift).toBe(0);
      prev=p;
    }
  });

  it('folds the sheet at each body in contact, including restrained walkers', () => {
    const body = {...CLOTHESLINE,alive:true,type:'shambler' as const,crawlDepth:0};
    const second = {...body,x:body.x+.35,y:body.y-.22};
    const touching = zombieClothContacts([body,second]);
    expect(touching).toHaveLength(2);
    expect(touching[0]!.x).toBeLessThan(touching[1]!.x);
    expect(touching[0]!.pressure).toBeGreaterThan(.8);
    const reverse = zombieClothContacts([body,second],1);
    expect(reverse[0]!.x).toBeGreaterThan(reverse[1]!.x);
    expect(reverse[1]!.pressure).toBe(touching[1]!.pressure);
    expect(zombieClothContacts([{...body,crawlDepth:1}])[0]!.pressure).toBeLessThan(touching[0]!.pressure);
    expect(zombieClothContacts([{...body,alive:false},{...body,x:body.x+1,y:body.y+1}])).toEqual([]);
  });
  function secondWave() {
    const sim = new NightSim(MOON_NIGHT, game.yard, game.seed);
    expect(sim.moonAge).toBeNull();
    for (let i=0;i<3000 && sim.moonAge===null;i++) sim.step(1/30);
    expect(sim.waveIndex).toBe(2);
    return sim;
  }
  it('turns all live attackers away from the barricades and towards the linen', () => {
    const sim=secondWave();
    const hp=Object.values(sim.barricades).map(b=>b.hp);
    const distance=(e:{x:number;y:number})=>Math.hypot(e.x-CLOTHESLINE.x,e.y-CLOTHESLINE.y);
    const original=sim.enemies.map(e=>({e,d:distance(e)}));
    for(let i=0;i<180;i++)sim.step(1/30);
    expect(Object.values(sim.barricades).map(b=>b.hp)).toEqual(hp);
    expect(original.filter(({e,d})=>e.alive && distance(e)<d).length).toBeGreaterThan(0);
    expect(sim.moonAge).toBeGreaterThan(5);
  });
  it.each([1,7,54,99])('brings wave two across the steps, then leaves time to follow on seed %i', seed=>{
    const sim=new NightSim(MOON_NIGHT,game.yard,seed);
    const step={x:THRESHOLDS.portail.gx,y:THRESHOLDS.portail.gy+1.25};
    for(let i=0;i<3000 && sim.moonAge===null;i++)sim.step(1/30);
    let lastContact=0, contactTicks=0;
    for(let i=0;i<CUB_REACHES_WOOD*30;i++){
      sim.step(1/30);
      if(i>17*30 && porchTraffic(sim.enemies,step)==='occupied'){lastContact=i;contactTicks++;}
    }
    expect(contactTicks).toBeGreaterThan(30);
    expect(CUB_REACHES_WOOD-lastContact/30).toBeGreaterThan(4);
    expect(sim.waveIndex).toBe(2);
    sim.settlePack('neutral');
    for(let i=0;i<1200 && sim.waveIndex===2;i++)sim.step(1/30);
    expect(sim.waveIndex).toBe(3);
  });
  it('distinguishes an approaching walker from one that has passed or is caught in a trap',()=>{
    const e={...secondWave().enemies[0]!,type:'shambler' as const,alive:true,x:2.8,y:0,fx:-1,fy:0,moveSpeed:2,
      stunnedFor:0,nettedFor:0,crawlDepth:0};
    const step={x:0,y:0};
    expect(porchTraffic([e],step)).toBe('near');
    expect(porchTraffic([{...e,fx:1}],step)).toBe('clear');
    expect(porchTraffic([{...e,x:1}],step)).toBe('occupied');
    for(const disabled of [{alive:false},{stunnedFor:1},{nettedFor:1},{type:'deer' as const}]){
      expect(porchTraffic([{...e,x:1,...disabled}],step)).toBe('clear');
    }
  });
  it('clears the pursuit without killing the Chief or his escort', () => {
    const sim=secondWave();
    sim.settlePack('allied');
    expect(sim.enemies.every(e=>!e.alive)).toBe(true);
    for(let i=0;i<3000 && !sim.enemies.some(e=>e.fileRank);i++)sim.step(1/30);
    expect(sim.waveIndex).toBe(3);
    expect(sim.enemies.some(e=>e.type==='chief' && e.alive)).toBe(true);
    expect(sim.enemies.some(e=>e.fileRank && e.alive)).toBe(true);
    expect(sim.report().bossDefeated).toBeNull();
  });
  it('resumes normal waves when left alone', () => {
    const sim=secondWave(); sim.settlePack('neutral');
    expect(sim.moonAge).toBeNull();
    expect(sim.remainingSpawns()).toBeGreaterThan(0);
    expect(sim.enemies.some(e=>e.alive)).toBe(true);
  });
  it.each(['werewolves','outside'] as const)('loads %s on night six and on older night-five saves', fate => {
    const lost = { ...game, phase: 'lost', day: MOON_NIGHT, fate } as const;
    expect(deserialize(serialize(lost))).toMatchObject({ phase:'lost', fate, yard:{houseHp:game.yard.houseHp} });
    expect(deserialize(serialize({ ...lost, day:5 }))?.fate).toBe(fate);
    expect(deserialize(serialize({ ...lost, day:4 }))?.fate).toBeNull();
  });
});

describe('the tracks at the refuge', () => {
  const game = newGame(54);
  const report = { ...new NightSim(5, game.yard, game.seed).report(), survived: true };
  const dawn: GameState = { ...game, phase: 'morning', day: 5, lastNight: report };
  it.each([
    ['cub', 1, 'together'], ['packExit', 1, 'digging'], ['packExit', 2, 'ditch'],
  ] as const)('keeps %s=%i on the morning and in a reloaded day-six yard', (flag, value, trail) => {
    const result = markEpic(dawn, flag, value);
    expect(packTrail(result)).toBe(trail);
    const day = startNextDay(result);
    expect(packTrail(deserialize(serialize(day))!)).toBe(trail);
    expect(packTrail({ ...day, phase: 'night' })).toBeUndefined();
    expect(packTrail({ ...day, day: 7 })).toBeUndefined();
  });
  it('keeps only the evidence a legacy save can establish', () => {
    expect(packTrail(dawn)).toBeUndefined();
    expect(packTrail(markEpic(dawn, 'cub'))).toBe('together');
    expect(packTrail({ ...dawn, lastNight: null })).toBeUndefined();
    expect(packTrail({ ...dawn, phase: 'night' })).toBeUndefined();
  });
  it('rewinds a mid-night checkpoint without keeping abandoned tracks', () => {
    const saved = markEpic({ ...game, day: 5, phase: 'night' }, 'packExit', 1);
    expect(deserialize(serialize(saved))!.flags['epic.packExit']).toBeUndefined();
  });
  it.each([[1,'woodland'],[2,'clothesline']] as const)('keeps a night-six pact %i from the report through day seven', (pact, trail) => {
    const newDawn: GameState = { ...dawn, day: MOON_NIGHT, lastNight: { ...report, night: MOON_NIGHT } };
    const settled = markEpic(markEpic(newDawn, 'moonPact', pact), 'moonResolvedNight', MOON_NIGHT);
    expect(packTrail(settled)).toBe(trail);
    const day = deserialize(serialize(startNextDay(settled)))!;
    expect(day.day).toBe(MOON_NIGHT + 1);
    expect(packTrail(day)).toBe(trail);
    expect(packTrail({ ...day, phase: 'night' })).toBeUndefined();
  });
  it('keeps both relay allies when reloading after the new moon scene', () => {
    const checkpoint: GameState = { ...game, day: MOON_NIGHT, phase: 'night', flags: {
      'epic.gardenNight': 3, 'epic.neighbor': 1, 'epic.gardenWalk': 1,
      'epic.moonResolvedNight': MOON_NIGHT, 'epic.moonPact': 1, 'epic.cub': 1,
    } };
    expect(deserialize(serialize(checkpoint))).toMatchObject({ phase: 'day', flags: checkpoint.flags });
  });
});

import { CUB_LEAVES_LINE, CUB_REACHES_WOOD, type CubPose } from '../core/moon-pack';
import { cub } from './moon-pack';
import { calmMotion } from './lighting';
import { CLOTHESLINE, TRACKS } from '../core/map';
import { SECTOR_IDS } from '../core/types';
import { cameraView, depthOf, project, unproject, type Point, type View } from './projection';
import type { Enemy } from '../core/night';
import { computeField, traceRoute } from '../core/pathing';
import { sprite } from '../engine/assets';
import type { ApproachingHero } from './hero-approach';
import { groundPaw } from './pack-tracks';
import { drawBarnLaundry, laundryMount, laundryX, zombieClothContacts } from './moon-laundry';

export const moonSectors = ['verger', 'grange', 'portail'] as const;
export type MoonSector = typeof moonSectors[number];
type Paint = (ctx: CanvasRenderingContext2D) => void;
export interface MoonLot {
  hero:ApproachingHero|null;
  elapsed:number;
  held:boolean;
  struck:number|null;
  prints:boolean;
  attack?:{attackers:ReadonlyMap<number,Enemy>; point:Point; age:number};
}
export type MoonCamera = (canvas: HTMLCanvasElement, sector: MoonSector, paint?: Paint, lot?:MoonLot) => readonly Enemy[]|void;
export function porchAttack({attackers,point,age}:NonNullable<MoonLot['attack']>,patrol:readonly Enemy[]) {
  return patrol.map(walker=>{
    const e=attackers.get(walker.id);
    if(!e)return walker;
    const dx=point.x-e.x, dy=point.y-e.y, d=Math.hypot(dx,dy);
    const stop=Math.max(0,d-.30-(e.id%3)*.09);
    const step=Math.min(stop,age*2.8), close=step>=stop;
    const reach=step/Math.max(.001,d);
    return {...e,x:e.x+dx*reach,y:e.y+dy*reach,fx:dx/Math.max(.001,d),fy:dy/Math.max(.001,d),
      action:close?'attack' as const:'walk' as const,gripTarget:null,
      travel:e.travel+step,actionSeconds:Math.max(0,age-stop/2.8)};
  });
}
export const lotView:View={rot:0,x:0,y:0,w:900,h:420,cx:10.15,cy:11.15,zoom:.82};
export const tinPoint={x:18.26,y:13.85};
export const trackPoint={x:7.5,y:19.1};
export function walkRoute(points:readonly Point[], distance:number) {
  let a=points[0]!;
  for(const b of points.slice(1)) {
    const dx=b.x-a.x, dy=b.y-a.y, length=Math.hypot(dx,dy);
    if(length>0 && distance<length) return {x:a.x+dx*distance/length,y:a.y+dy*distance/length,fx:dx/length,fy:dy/length,done:false};
    distance-=length;a=b;
  }
  return {...a,fx:-1,fy:0,done:true};
}
// Once the desk is held, continue the visible pursuit from the actual attackers' feet.
export function lotPatrol() {
  let routes:{enemy:Enemy; points:Point[]}[]=[], start=0, destination:Point|null=null;
  function walkers(time:number) {
    return routes.map(({enemy,points})=>{
      const elapsed=Math.max(0,time-start);
      const distance=Math.max(0,elapsed-Math.max(enemy.stunnedFor,enemy.nettedFor))*Math.max(enemy.def.speed*.75,enemy.moveSpeed);
      const p=walkRoute(points,distance);
      return {...enemy,...p,stunnedFor:Math.max(0,enemy.stunnedFor-elapsed),nettedFor:Math.max(0,enemy.nettedFor-elapsed),
        travel:enemy.travel+distance,action:p.done||distance===0?'idle' as const:'walk' as const};
    });
  }
  return (lot:MoonLot,enemies:readonly Enemy[],blocked:Set<number>)=>{
    if(!lot.held)return enemies;
    const goal=lot.struck===null?trackExit:tinPoint;
    if(destination!==goal){
      const current=destination?walkers(lot.elapsed):enemies;
      destination=goal;start=lot.elapsed;
      const field=computeField({x:Math.floor(goal.x),y:Math.floor(goal.y)},{costly:blocked,costlyPenalty:9});
      routes=current.filter(e=>e.alive).map(enemy=>{
        const cells=traceRoute(field,{x:Math.floor(enemy.x),y:Math.floor(enemy.y)});
        return {enemy,points:[{x:enemy.x,y:enemy.y},...cells.slice(1).map(c=>({x:c.x+.5,y:c.y+.5})),goal]};
      });
    }
    return walkers(lot.elapsed);
  };
}
export const trackExit={x:1.5,y:21.2};
export function lotDetails(ctx:CanvasRenderingContext2D,view:View,lot:MoonLot) {
  const p=project(view,tinPoint.x,tinPoint.y);
  return [{depth:depthOf(view.rot,tinPoint.x,tinPoint.y)+.55,draw(){
    const tins=sprite('rattle_tins'), stake=sprite('rattle_stake');
    if(!tins)return;
    const age=lot.struck===null?2:lot.elapsed-lot.struck;
    const z=view.zoom,h=25*z,w=h*tins.w/tins.h;
    ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle='#211c1966';ctx.beginPath();ctx.ellipse(3*z,0,13*z,4*z,0,0,2*Math.PI);ctx.fill();
    if(stake){const postH=34*z,postW=postH*stake.w/stake.h;ctx.drawImage(stake.img,-postW*.55,-postH,postW,postH);}
    ctx.translate(0,-29*z);ctx.rotate(age<1&&!calmMotion()?Math.sin(age*23)*(1-age)*.48:0);
    ctx.drawImage(tins.img,-w*.56,-h*.045,w,h);ctx.restore();
  }}, {depth:0,draw(){
    if(!lot.prints)return;
    for(let i=0;i<12;i++){
      const paw=project(view,trackPoint.x+(5-i)*.48,trackPoint.y+(i-5)*.15+(i%2)*.16);
      groundPaw(ctx,paw.x,paw.y,view.zoom*.31,-1.9);
    }
  }}];
}
export interface MoonAction { sector: MoonSector; paint: Paint }
export const feedNumber = (sector: MoonSector) => String(SECTOR_IDS.indexOf(sector) + 1).padStart(2, '0');

// Feet on the campaign grid; local coordinates use the original animation cels.
// The night-seven witness uses the driveway. The clothesline stands on grass along the northern edge.
const spots = {
  portail: { gx:(TRACKS.gate.x0+TRACKS.gate.x1)/2, gy:20.6, x:350, y:307, scale:.31, zoom:1.73, screenX:375, screenY:325 },
  grange: { gx:CLOTHESLINE.x, gy:CLOTHESLINE.y, ...laundryMount, zoom:1.82, screenX:480, screenY:277 },
  verger: { gx:3.85, gy:8.7, x:440, y:338, scale:.39, zoom:1.66, screenX:475, screenY:284 },
};

export function moonView(sector: MoonSector, pup?: CubPose | null): View {
  if (pup) {
    const view:View = {rot:0,x:0,y:0,w:900,h:420,zoom:1.43,cx:pup.x,cy:pup.y};
    const centre = unproject(view,view.w/2-85,view.h/2-42);
    return {...view,cx:centre.gx,cy:centre.gy};
  }
  const spot = spots[sector];
  const view = cameraView(sector, { x:0,y:0,w:900,h:420 }, spot.zoom);
  const p = project(view,spot.gx,spot.gy);
  const centre = unproject(view, view.w/2+p.x-spot.screenX, view.h/2+p.y-spot.screenY);
  return { ...view, cx:centre.gx, cy:centre.gy };
}

export function moonPixel(sector: MoonSector, x: number, y: number) {
  const s = spots[sector], k = s.zoom*s.scale;
  return { x:s.screenX+(x-s.x)*k, y:s.screenY+(y-s.y)*k };
}

export function moonScenery(ctx: CanvasRenderingContext2D, view: View, sheet: boolean, age: number | null, pup:CubPose|null, time: number, enemies: readonly Enemy[], action?: MoonAction) {
  const props = moonSectors.flatMap(sector => {
    const active = action?.sector === sector;
    if (!active && sector !== 'grange') return [];
    const s = spots[sector];
    const p = project(view,s.gx,s.gy);
    const k = view.zoom*s.scale;
    if (p.x < view.x-470*k || p.x > view.x+view.w+470*k || p.y < view.y-100*k || p.y > view.y+view.h+280*k) return [];
    const reversed = view.rot !== (sector === 'verger' ? 1 : 0);
    return [{ depth:depthOf(view.rot,s.gx,s.gy), draw() {
      ctx.save();
      ctx.translate(p.x,p.y); ctx.scale(active && reversed ? -k : k,k); ctx.translate(-s.x,-s.y);
      if (active) action.paint(ctx);
      else {
        const underLine = pup && Math.abs(pup.y - s.gy) < .65 && Math.abs(pup.x - s.gx) < 1.8;
        const localX = underLine ? laundryX(pup.x, view.rot) : null;
        drawBarnLaundry(ctx, localX, (localX ?? 0) + (view.rot === 0 ? -17 : 17), calmMotion() ? 0 : time, underLine ? 1 : 0, sheet,
          sheet ? zombieClothContacts(enemies, view.rot) : [], view.rot);
      }
      ctx.restore();
    } }];
  });
  if (pup && age !== null && age < CUB_REACHES_WOOD) {
    const foot = project(view,pup.x,pup.y);
    props.push({ depth:depthOf(view.rot,pup.x,pup.y)-.02, draw() {
      ctx.save(); ctx.translate(foot.x,foot.y); ctx.scale(view.zoom*.51,view.zoom*.51);
      ctx.translate(0,-338);
      cub(ctx,0,view.rot === 0 ? pup.facing : -pup.facing,calmMotion() ? 0 : age,age > CUB_LEAVES_LINE,pup.lift);
      ctx.restore();
    } });
  }
  return props;
}

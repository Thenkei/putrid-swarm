import { CLOTHESLINE, CLOTHESLINE_POSTS, idx, isStaticBlocked } from './map';
import { computeField, traceRoute } from './pathing';
import type { Enemy } from './night';
import type { Cell, DeviceInstance } from './types';

export type PackChoice = 'allied' | 'neutral' | 'hostile';
export const canGrab = (e:Enemy) => e.alive && e.type!=='dog' && e.type!=='deer' && e.type!=='boar'
  && e.stunnedFor<=0 && e.nettedFor<=0 && e.crawlDepth<.5;
export const GRAB_REACH = 1.35;
export function porchTraffic(crowd:readonly Enemy[],step:Cell) {
  let state:'near'|'clear'='clear';
  for(const e of crowd){
    if(!canGrab(e))continue;
    const dx=step.x-e.x,dy=step.y-e.y;
    if(Math.hypot(dx,dy)<=GRAB_REACH)return 'occupied';
    // Look one stride ahead so a walker closing on the steps can be read before contact.
    const stride=Math.max(0,Math.min(e.moveSpeed*1.25,dx*e.fx+dy*e.fy));
    if(Math.hypot(dx-stride*e.fx,dy-stride*e.fy)<2)state='near';
  }
  return state;
}

export const CUB_LEAVES_LINE = 9;

// From the washing line, past the well, between the garage and the parked car,
// across the driveway and into the woods. Feet stay on the open ground.
const cubRoute = [CLOTHESLINE, {x:16.65,y:5.35}, {x:16.8,y:7.7}, {x:16.7,y:10.5},
  {x:14.25,y:12.5}, {x:10.4,y:13.5}, {x:8.6,y:13.7}, {x:7.1,y:14.6}, {x:10.6,y:15.35},
  {x:14.15,y:16.8}, {x:10.3,y:18.3}, {x:6.3,y:19.4}, {x:2,y:21.1}];
export const CUB_REACHES_WOOD = CUB_LEAVES_LINE + 2*(cubRoute.length-1);
type Obstacle = Pick<DeviceInstance,'type'|'x'|'y'|'hp'>;
export interface CubPose extends Cell { lift:number; facing:number; vault:Obstacle['type']|null }
const tile = (p:Cell) => ({x:Math.floor(p.x), y:Math.floor(p.y)});
const distance = (a:Cell,b:Cell) => Math.hypot(b.x-a.x,b.y-a.y);
const between = (a:Cell,b:Cell,t:number) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

/** Prepare the sprint once, against the defenses still standing when the second wave arrives. */
export function planCubRun(devices:readonly Obstacle[]): (age:number)=>CubPose {
  const defenses=new Map(devices.filter(d=>d.hp>0).map(d=>[idx(d.x,d.y),d]));
  const footings=new Set(CLOTHESLINE_POSTS.map(p=>idx(Math.floor(p.x),Math.floor(p.y))));
  const blocked=new Set(footings);
  for(const [key,d] of defenses) if(d.type!=='fence') blocked.add(key);
  const clear=(p:Cell)=>[-.13,.13].every(dx=>[-.13,.13].every(dy=>{
    const x=Math.floor(p.x+dx), y=Math.floor(p.y+dy);
    return !isStaticBlocked(x,y) && !blocked.has(idx(x,y));
  }));
  function clearLine(a:Cell,b:Cell) {
    const steps=Math.max(1,Math.ceil(distance(a,b)*16));
    for(let i=0;i<=steps;i++) if(!clear(between(a,b,i/steps))) return false;
    return true;
  }
  function landing(p:Cell) {
    if(clear(p)) return p;
    for(let radius=.2;radius<=3;radius+=.2) {
      for(const [dx,dy] of [[-1,0],[1,0],[0,1],[0,-1],[-.707,.707],[.707,.707],[-.707,-.707],[.707,-.707]] as const) {
        const side={x:p.x+dx*radius,y:p.y+dy*radius};
        if(clear(side)) return side;
      }
    }
    return p;
  }
  function detour(a:Cell,b:Cell) {
    if(clearLine(a,b)) return [b];
    const dest=tile(b);
    let cells=traceRoute(computeField(dest,{blocked}),tile(a),blocked);
    const end=cells[cells.length-1]!;
    // An enclosed strip still has an aerial escape over the devices.
    if(end.x!==dest.x || end.y!==dest.y) {
      const escape=computeField(dest,{blocked:footings,costly:blocked,costlyPenalty:12});
      cells=traceRoute(escape,tile(a),footings);
    }
    const candidates=[...cells.map(c=>({x:c.x+.5,y:c.y+.5})),b];
    const turns:Cell[]=[];
    let origin=a;
    for(let i=0;i<candidates.length;i++) {
      let j=candidates.length-1;
      while(j>i && !clearLine(origin,candidates[j]!)) j--;
      origin=candidates[j]!; turns.push(origin); i=j;
    }
    return turns;
  }
  const start=landing({x:CLOTHESLINE.x-.85,y:CLOTHESLINE.y});
  const points=[{...start,time:4,along:0}];
  const jumps:{from:number;to:number;device:Obstacle}[]=[];
  function leg(destination:Cell, arrive:number) {
    const last=points[points.length-1]!;
    const turns=detour(last,destination);
    const length=turns.reduce((n,p,i)=>n+distance(i?turns[i-1]!:last,p),0);
    let from=last;
    for(const p of turns) {
      const len=distance(from,p), along=from.along+len;
      // Mark the full occupied tile so longways and diagonal crossings also clear the timber.
      const samples=Math.max(1,Math.ceil(len*24));
      for(let i=0;i<=samples;i++) {
        const c=tile(between(from,p,i/samples)), device=defenses.get(idx(c.x,c.y));
        if(!device) continue;
        const at=from.along+len*i/samples, prior=jumps[jumps.length-1];
        if(prior?.device===device && at-prior.to<.09) prior.to=at;
        else jumps.push({device,from:at,to:at});
      }
      from={...p,along,time:length?last.time+(arrive-last.time)*(along-last.along)/length:arrive};
      points.push(from);
    }
  }
  const linen=landing(CLOTHESLINE);
  leg(linen,8);
  points.push({...points[points.length-1]!,time:CUB_LEAVES_LINE});
  for(let i=1;i<cubRoute.length;i++) leg(landing(cubRoute[i]!),CUB_LEAVES_LINE+i*2);
  return age=>{
    let i=1;
    while(i<points.length-1 && points[i]!.time<age) i++;
    const a=points[i-1]!, b=points[i]!;
    const t=Math.max(0,Math.min(1,(age-a.time)/(b.time-a.time || 1)));
    const along=a.along+(b.along-a.along)*t;
    let lift=0, vault:CubPose['vault']=null;
    for(const jump of jumps) {
      if(jump.device.hp<=0) continue;
      const phase=(along-jump.from+.75)/(jump.to-jump.from+1.5);
      const height=100*4*phase*(1-phase);
      if(height>lift) {lift=height;vault=jump.device.type;}
    }
    return {...between(a,b,t),lift,vault,facing:b.x-a.x>=b.y-a.y?1:-1};
  };
}

/** The cub reaches the threshold after the last infected passes and needs 1.2 seconds to cross. */
export const PACK_CYCLE = 8;
export const PACK_GAP = 3;
export const PACK_RETURN = 7;
export const CUB_CROSSING = 1.2;

export const packPhase = (time: number): number => time % PACK_CYCLE;

/** A gap cannot be carried into the next cycle. Both instants belong to this opening. */
export function gatePassage(openedAt: number, now: number): 'impact' | 'crossing' | 'through' {
  const returnsAt = Math.floor(openedAt / PACK_CYCLE) * PACK_CYCLE + PACK_RETURN;
  if (packPhase(openedAt) < PACK_GAP || now >= returnsAt) return 'impact';
  return now >= openedAt + CUB_CROSSING ? 'through' : 'crossing';
}

// On each feed the cub noses around, breaks cover, then slips out of sight.
export const TRAIL_BREAK = 1.05;
export const TRAIL_LOST = 3.35;
export const TRAIL_AGAIN = 4.65;

export function trailPass(t: number) {
  return t < TRAIL_BREAK ? 'waiting' : t < TRAIL_LOST ? 'running' : 'lost';
}

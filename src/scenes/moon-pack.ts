import { canGrab, GRAB_REACH, porchTraffic, CUB_LEAVES_LINE, CUB_REACHES_WOOD, type CubPose, type PackChoice } from '../core/moon-pack';
import type { App } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line as L } from '../engine/i18n';
import { cub, wolf } from '../render/moon-pack';
import { lotView, tinPoint, trackPoint, trackExit, walkRoute, type MoonCamera, type MoonLot } from '../render/moon-yard';
import type { Enemy } from '../core/night';
import { heroApproachShot, sampleApproach, type ApproachingHero } from '../render/hero-approach';
import { project, type Point } from '../render/projection';
import { THRESHOLDS } from '../house-layout';
import { say } from '../engine/voice';
import { S } from '../engine/i18n';
import { oneArmed } from './common';
import { HOUSE_MAX_HP } from '../core/data/devices';
import { patrolCel } from '../render/epic-night-light';
import { calmMotion } from '../render/lighting';
import forestUrl from '../assets/moon-hollow.webp';
import houseUrl from '../assets/moon-outside-barn.webp';
import { notebookButton } from './field-notebook';
import { discover } from './scene-evidence';
import './moon-pack.css';

type Shot = 'yard' | 'stairs' | 'emerge' | 'attack' | 'porch' | 'walk' | 'tin' | 'strike' | 'trail' | 'forest' | 'warning' | 'result' | 'revenge';
const STAIRS_AT = CUB_LEAVES_LINE + 8;
const PORCH_SECONDS = 12;
const FOREST_SECONDS = 8.4;
const CALL_SECONDS = .72;
const openings = [[1.85,3.65],[5.7,7.35]] as const;
interface Hunt {
  age(): number;
  cub(): CubPose|null;
  setLive(live:boolean): void;
  decide(result: PackChoice): void;
  caughtAtDoor():void;
  leave(): void;
}
export function moonWatch(field: HTMLElement, note: HTMLElement, actions: HTMLElement, app: App, camera: MoonCamera, hunt: Hunt) {
  const canvas = el('canvas'); canvas.width=900; canvas.height=420;
  const ctx = canvas.getContext('2d')!;
  const title = el('strong',{class:'moon-feed-id'});
  const subtitle = el('span',{class:'moon-caption'});
  subtitle.setAttribute('role','status');
  const picture=el('div',{class:'moon-picture'},[canvas]);
  const screen = el('div',{class:'moon-screen'},[picture,title,subtitle]);
  screen.tabIndex=-1;
  const speech=el('span',{class:'moon-line'});
  speech.setAttribute('role','status');
  const book = notebookButton(app,'moon',open => {
    reading = open;
    if (yardLive) hunt.setLive(!open);
  });
  const remaining = el('div',{class:'moon-deadline'});
  const meter = el('span');
  remaining.setAttribute('aria-hidden','true');
  remaining.append(meter);
  const forest = new Image(); forest.src=forestUrl;
  const house = new Image(); house.src=houseUrl;
  const approach=heroApproachShot(0,oneArmed(app.state),app.state!.yard.houseHp/HOUSE_MAX_HP);
  const sill=THRESHOLDS[approach?.start==='grange'?'grange':'portail'];
  const door={x:sill.gx,y:sill.gy};
  const outsideAt=(approach?.intro??1.3)+.55;
  const landing=approach?.walk[0]?.from??{x:door.x,y:door.y+1.25};
  let crowd:readonly Enemy[]=[];
  let attack:MoonLot['attack'], exitTime=0, impact=false;
  let sawCrowd=false,lastClose=0;
  let hero:ApproachingHero|null=null, elapsed=0, yardLive=true, heldAt=0, struck:number|null=null, voiceUntil=0, stageLine='';
  let steps:Point[]=[], walked:Point[]=[landing], walkEnd:'tin'|'trail'|'home'|'wood'='trail', lastStep=0;
  let heroFoot=landing;
  let shot: Shot='yard', route:'noise'|'track'='track', outcome:PackChoice='neutral';
  let time=0, reading=false, finished=false, flashUntil=0, feedback='', spotted=false, yardPrint=false;
  let forestTime=0, retryAfter=0, nextPulse=0, heldSince:number|null=null;
  let gesture:HTMLButtonElement | undefined;
  let cubApproach=0, resultFrom:Shot='forest';

  function view(next: Shot, heading: string, text: string) {
    shot=next; time=0; flashUntil=0; nextPulse=0; heldSince=null; gesture=undefined;
    screen.dataset.phase=shot; delete screen.dataset.window; delete screen.dataset.urgent;
    picture.replaceChildren(canvas);
    screen.replaceChildren(picture,title,subtitle,speech,book);
    if (next==='porch' || next==='tin' || next==='trail' || next==='forest' || next==='warning') {
      screen.append(remaining);
    }
    title.textContent=heading; note.textContent=''; subtitle.textContent='';
    stageLine=text; speech.textContent=elapsed<voiceUntil?S().voice.vo_moon_threshold:text;
    actions.replaceChildren();
    screen.focus({preventScroll:true});
  }
  function pressure(left:number, total:number, dt:number) {
    meter.style.transform='scaleX('+Math.max(0,Math.min(1,left/total))+')';
    screen.dataset.urgent=String(left<3);
    nextPulse-=dt;
    if(nextPulse<=0) {
      const urgency=1-Math.max(0,left/total);
      audio.play('heartbeat',.18+.43*urgency);
      nextPulse=1.05-.56*urgency;
    }
  }
  function cue(hit:HTMLButtonElement, label:string, hold=false) {
    hit.classList.add('moon-prompt');
    const key=el('kbd',{text:hold?L('Espace','Space'):'↵'});
    key.setAttribute('aria-hidden','true');
    const name=el('span',{class:'moon-prompt-label',text:label});
    name.append(key);hit.append(name);
    if(hold) hit.setAttribute('aria-description',L('Maintenir le bouton ou la barre d’espace.','Hold the button or the space bar.'));
  }
  function target(label:string, x:number, y:number, click?:()=>void) {
    const hit=el('button',{class:'moon-material',title:label});
    if(click) hit.addEventListener('click',click);
    hit.setAttribute('aria-label',label); hit.style.left=x+'%'; hit.style.top=y+'%';
    picture.append(hit); return hit;
  }
  const keyLabels:Record<string,string>={ArrowDown:'↓',ArrowUp:'↑',ArrowLeft:'←',ArrowRight:'→',Space:L('Espace','Space')};
  function choice(label:string, x:number,y:number, key:string, click:()=>void, short=label) {
    const hit=target(label,x,y,click); cue(hit,short);
    hit.dataset.key=key;
    const badge=hit.querySelector('kbd')!;
    badge.textContent=keyLabels[key]??key;
    hit.setAttribute('aria-keyshortcuts',key==='Space'?'Space ArrowUp':key);
    return hit;
  }
  screen.addEventListener('keydown',e=>{
    const key=e.key===' '?'Space':e.key;
    const hit=Array.from(picture.querySelectorAll<HTMLButtonElement>('[data-key]')).find(b=>b.getAttribute('aria-keyshortcuts')?.split(' ').includes(key));
    if(!hit || document.querySelector('dialog[open]'))return;
    if(key==='Space' && e.target instanceof HTMLButtonElement && e.target!==hit)return;
    e.preventDefault(); if(!e.repeat)hit.click();
  });
  function yardChoice(label:string,p:Point,lift:number,key:string,click:()=>void,short=label){
    const pos=project(lotView,p.x,p.y);
    return choice(label,pos.x/9,(pos.y-lift*lotView.zoom)/4.2,key,click,short);
  }
  function frame(image:HTMLImageElement) {
    ctx.fillStyle='#172026'; ctx.fillRect(0,0,900,420);
    if(image.naturalWidth) ctx.drawImage(image,0,0,900,420);
  }
  function photo(camera:number) {
    const small=el('canvas'); small.width=640; small.height=299;
    small.getContext('2d')!.drawImage(canvas,0,0,640,299);
    app.state={...app.state!,moonPrints:[...(app.state!.moonPrints??[]).filter(p=>p.camera!==camera),{camera,image:small.toDataURL('image/webp',.77)}]};
    app.save();
  }
  function pup(x:number,y:number,scale:number,face:number,t:number,moving:boolean, crouch=0) {
    ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale*(1-.24*crouch)); ctx.translate(0,-338);
    cub(ctx,0,face,calmMotion()?0:t,moving); ctx.restore();
  }
  function caption(value:string) { if(subtitle.textContent!==value) subtitle.textContent=value; }
  function holdYard() {
    if(yardLive) {yardLive=false; heldAt=elapsed; hunt.setLive(false);}
  }
  function yard() {
    crowd=camera(canvas,'grange',undefined,{hero,held:!yardLive||struck!==null,elapsed,struck,...(attack&&{attack}),prints:hunt.age()>CUB_LEAVES_LINE||!yardLive})??[];
  }
  function near(point:Point,radius:number) {
    return crowd.some(e=>canGrab(e) && Math.hypot(e.x-point.x,e.y-point.y)<=radius);
  }
  function onSteps(t:number) {
    if(!approach)return null;
    const pose=sampleApproach(approach,t);
    return t<approach.intro?pose:{...pose,position:landing,frame:0};
  }
  function caught(point:Point,started:number) {
    exitTime=started;
    const attackers=crowd.filter(e=>canGrab(e) && Math.hypot(e.x-point.x,e.y-point.y)<=3);
    attack={attackers:new Map(attackers.map(e=>[e.id,{...e}])),point,age:0};
    holdYard(); hunt.caughtAtDoor();
    voiceUntil=0;audio.stopVoice();
    view('attack',L('Sur les marches','On the steps'),L('La porte accroche ma manche… Lâche-moi !','My sleeve’s caught on the door… Get off me!'));
    screen.dataset.outcome='outside';
  }
  function pose(p:Point,fx:number,fy:number,frame:number) {
    heroFoot=p;
    if(approach) hero={shot:approach,position:p,opening:0,lift:0,frame,left:fx<fy};
  }
  function emerge(){
    audio.play('moped_door',.65);
    if(near(landing,GRAB_REACH)){caught(landing,0);return;}
    view('emerge',L('Le perron','The doorstep'),'');
  }
  function move(end:typeof walkEnd, waypoints:Point[]) {
    walkEnd=end; steps=[heroFoot,...waypoints]; lastStep=0;
    view('walk',L('La cour','The yard'),'');
    if(end==='tin'||end==='trail'){
      yardChoice(L('Rentrer à la maison','Go back inside'),door,18,'ArrowDown',()=>{
        const passed=[steps[0]!];
        let distance=time*4.4;
        for(let i=1;i<steps.length;i++){
          distance-=Math.hypot(steps[i]!.x-steps[i-1]!.x,steps[i]!.y-steps[i-1]!.y);
          if(distance<0)break;
          passed.push(steps[i]!);
        }
        move('home',passed.reverse());
      },L('Reculer','Back away'));
    }
  }
  function retreat(){
    if(shot==='forest'||shot==='warning'){
      heroFoot=trackPoint;walked=[landing,...trailWay];
    }
    move('home',walked.slice(0,-1).reverse());
  }
  const trailWay=[{x:10.5,y:14.7},{x:10.5,y:16.8},trackPoint];
  function porch(){
    heroFoot=landing;walked=[landing];
    if(voiceUntil>elapsed){audio.stopVoice();voiceUntil=0;}
    view('porch',L('En bas du perron','At the foot of the steps'),
      L('Sa piste part à gauche. Près du break, ces vieilles boîtes… ça ferait un sacré boucan.',
        'His tracks go left. Those old tins by the wagon… they’d make a hell of a racket.'));
    yardChoice(L('Suivre le louveteau','Follow the cub'),trackPoint,2,'ArrowLeft',()=>move('trail',trailWay),L('Vers les traces','To the tracks')).focus({preventScroll:true});
    yardChoice(L('Aller au break','Go to the wagon'),tinPoint,18,'ArrowRight',
      ()=>move('tin',approach?.walk.map(s=>s.to)??[tinPoint]),L('Vers le break','To the wagon'));
    yardChoice(L('Rentrer à la maison','Go back inside'),door,12,'ArrowDown',retreat,L('Rentrer','Go inside'));
  }
  function atPlace(){
    const noise=walkEnd==='tin';
    view(noise?'tin':'trail',noise?L('Le break','The wagon'):L('Les empreintes','The pawprints'),
      noise?L('Si je tape là-dessus, ils vont venir sur moi.','One hit and they’ll come for me.')
        :L('Ça file entre les arbres. Je peux encore le rattraper.','Through those trees. I can still catch him.'));
    yardChoice(noise?L('Frapper la boîte en métal','Strike the tin'):L('Entrer dans le bois','Enter the woods'),
      noise?tinPoint:trackPoint,noise?12:2,'ArrowUp',()=>{
        route=noise?'noise':'track';screen.dataset.route=route;
        if(noise){view('strike',L('Le break','The wagon'),'');return;}
        discover(app,'cubSpoor');
        move('wood',[trackExit]);
        speech.textContent=L('Tiens bon, petit.','Hang on, little one.');
      },noise?L('Frapper','Strike'):L('Suivre','Follow')).focus({preventScroll:true});
    yardChoice(L('Rentrer à la maison','Go back inside'),door,12,'ArrowDown',retreat,L('Rentrer','Go inside'));
  }
  function enterWood() {
    holdYard();
    const noise=route==='noise';
    view('forest',L('Le chêne creux','The hollow oak'),
      noise ? L('Le seau est à portée. Un seul coup, quand le premier s’arrête pour écouter.',
        'The pail is within reach. One strike, when the leader stops to listen.')
      : L('Dès que le dernier détourne la tête, je l’appelle tout doucement. Il faut qu’il vienne jusqu’à moi.',
        'When the last one looks away, I’ll call softly. I need to keep him coming.'));
    choice(L('Rabattre les rôdeurs vers le creux','Drive the stragglers into the hollow'),noise?40:57,65,'ArrowRight',warn,L('Barrer le passage','Block their path'));
    choice(L('Rentrer à la maison','Go back inside'),33,80,'ArrowDown',retreat,L('Reculer','Back away'));
    const windowButton=target(noise?L('Frapper le seau','Strike the pail'):L('Appeler le petit au creux du chêne','Call the cub at the hollow'),noise?18.5:77,noise?75:60,noise?act:undefined);
    gesture=windowButton;
    windowButton.classList.add('moon-timed');
    cue(windowButton,noise?L('Frapper','Strike'):L('Appeler · maintenir','Call · hold'),!noise);
    if (!noise) bindCall(windowButton);
    windowButton.focus({preventScroll:true});
    discover(app,'cubHollow');
  }
  function warn() {
    if(shot!=='forest') return;
    view('warning',L('Le petit est encore là','The cub is still there'),
      L('Sa queue dépasse. Si je les pousse dans le creux, ils vont le tuer.',
        'I can see his tail. If I drive them into the hollow, they’ll kill him.'));
    choice(L('Les éloigner du petit','Lead them away from the cub'),32,68,'ArrowLeft',enterWood,L('Détourner','Lure away')).focus({preventScroll:true});
    choice(L('Les pousser sur le petit','Drive them onto the cub'),77,57,'ArrowRight',()=>settle('hostile'),L('Pousser vers le creux','Drive into hollow'));
    choice(L('Rentrer à la maison','Go back inside'),44,84,'ArrowDown',retreat,L('Reculer','Back away'));
  }
  function act() {
    if(shot!=='forest'||forestTime<retryAfter||heldSince!==null) return;
    if(!ready()) {
      audio.play(route==='noise'?'tin':'hedge_leaves',.37);
      feedback=route==='noise'?L('Il ne t’a pas entendu. Il écoute entre deux pas.','He missed it. He listens between steps.'):L('Le rôdeur regarde encore. Le petit se plaque au sol.','The straggler is still looking. The cub crouches.');
      flashUntil=time+.85; retryAfter=forestTime+.5; return;
    }
    if(route==='noise') { audio.play('tin',.95); settle('allied'); }
    else { audio.play('whistle',.26); heldSince=forestTime; }
  }
  function bindCall(hit:HTMLButtonElement) {
    const cancel=()=>{
      if(heldSince===null) return;
      heldSince=null; feedback=L('Il s’arrête. Encore un peu…','He stops. A little longer…'); flashUntil=time+.65;
    };
    hit.onpointerdown=e=>{
      if(e.button!==0||!e.isPrimary) return;
      hit.setPointerCapture(e.pointerId); act();
    };
    hit.onpointerup=hit.onpointercancel=hit.onlostpointercapture=cancel;
    hit.onblur=cancel;
    hit.onkeydown=e=>{
      if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!e.repeat) act();}
    };
    hit.onkeyup=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();cancel();}};
    // Assistive technology may activate a native button without pointer or key events.
    hit.addEventListener('click',e=>{if(e.detail===0) act();});
  }
  function ready() {
    return openings.some(([start,end])=>forestTime>=start && forestTime<end);
  }
  function callProgress() {return heldSince===null?0:Math.min(1,(forestTime-heldSince)/CALL_SECONDS);}
  function leave() { if(!finished) { finished=true; hunt.leave(); } }
  function settle(result:PackChoice) {
    if(shot==='result'||shot==='revenge') return;
    resultFrom=shot;voiceUntil=0;
    outcome=result; hunt.setLive(false); hunt.decide(result);
    view('result',result==='allied'?L('La meute répond','The pack answers'):result==='neutral'?L('Le bois se referme','The woods fall quiet'):L('Un cri sous les racines','A cry beneath the roots'),
      result==='allied'?L('Le petit rejoint ses parents. Les deux adultes chargent et dispersent les rôdeurs. Tous trois disparaissent dans le bois. Il reste le Chef et sa file.',
        'The cub reaches its parents. Both adults charge, scattering the stragglers. All three vanish into the woods. The Chief and his column are still coming.')
      :result==='neutral'?L('Les traces se perdent dans les feuilles. La meute garde ses distances. La veille continue.',
        'The tracks vanish in the leaves. The pack keeps its distance. The watch continues.')
      :L('Les rôdeurs se pressent contre le chêne. Le petit se tait. Un hurlement, puis un autre, beaucoup plus près de la maison.',
        'The stragglers crowd the oak. The cub falls silent. One howl, then another, much closer to the house.'));
    screen.dataset.outcome=result;
    if(result!=='neutral') audio.play('epic_pack',.72);
  }
  function wood() {
    frame(forest);
    const alliance=shot==='result' && outcome==='allied', hostile=shot==='result' && outcome==='hostile';
    const standOff=shot==='forest'||shot==='warning';
    const clock=forestTime+(standOff?0:time);
    const t=calmMotion()?0:clock, progress=Math.min(1,time/2.4);
    const lead=route==='noise'?0:2;
    // The watcher plants its feet during each opening. The other two keep gaining ground.
    const pause=(start:number,end:number)=>Math.max(0,Math.min(end,forestTime)-start);
    const stopped=openings.reduce((sum,[start,end])=>sum+pause(start,end),0);
    const call=cubApproach;
    const neutral=!standOff&&!hostile&&!alliance;
    if (!neutral || progress<1) {
      const x=687-56*call+(neutral?43*progress:alliance?(route==='noise'?61:-106)*progress:0);
      pup(x,261+12*call-(neutral?31*progress:0),.76*(neutral?1-.68*progress:1),
        call>0 || (alliance && route==='track')?-1:1,t,call>0||(!standOff&&progress<1),standOff&&!ready()?1:0);
    }
    if(!hostile && !neutral) wolf(ctx,782-(alliance?148*progress:0),244+(alliance?32*progress:0),.55+.15*(alliance?progress:0),-1,t,alliance?2:1);
    for(let i=2;i>=0;i--){
      const walk=forestTime-(i===lead?stopped:0);
      const start=(route==='noise'?320:458)-i*65+walk*23;
      // The charging parent meets each walker at its current position.
      const meet=(start-25)/(310+45);
      const fall=Math.min(1,Math.max(0,(time-meet)/.32));
      const x=hostile?start+(710-start)*progress:alliance?start-45*Math.min(time,meet):start+(neutral?46*progress:0);
      const y=287-i*8+(hostile?(252-287+i*8)*progress:0);
      const listening=standOff && i===lead && (ready() || heldSince!==null);
      ctx.save(); ctx.translate(x,y);
      ctx.fillStyle='#15171366';ctx.beginPath();ctx.ellipse(0,1,18,4,0,0,2*Math.PI);ctx.fill();
      if(alliance)ctx.rotate(1.36*fall);
      patrolCel(ctx,0,0,85-i*5,listening||alliance?-1:1,calmMotion()?0:walk+i+(standOff?0:time));
      ctx.restore();
    }
    if(alliance) wolf(ctx,25+Math.min(time*310,560),284+11*progress,.92,1,t,progress<.76?2:1);
  }

  field.replaceChildren(screen);
  view('yard',L('Bordure du terrain','Yard perimeter'),
    L('Vague deux. Ils tournent tous le dos à la maison. Qu’est-ce qu’ils ont entendu là-bas ?', 'Wave two. They all have their backs to the house. What did they hear out there?'));
  yard();
  return (dt:number) => {
    if(finished||reading) return;
    time+=dt; elapsed+=dt;
    if(voiceUntil && elapsed>=voiceUntil){voiceUntil=0;speech.textContent=stageLine;}
    if(voiceUntil>elapsed){
      const line=voiceUntil-elapsed>3.65
        ?L('Ils l’ont tous suivi. Si je fais rien, ce petit loup va mourir.','They’ve all gone after him. That little wolf will die if I do nothing.')
        :L('Et moi… est-ce que j’ai envie de mourir ce soir ?','And me… do I want to die tonight?');
      if(speech.textContent!==line)speech.textContent=line;
    }
    if(yardLive && hunt.age()>=CUB_REACHES_WOOD)holdYard();
    if(shot==='yard'){
      const age=hunt.age(); yard();
      caption(age<CUB_LEAVES_LINE?L('Les pas convergent vers l’étendoir. Le bas du drap se soulève.','Footsteps converge on the clothesline. The bottom of the sheet lifts.')
        :L('Une queue claire traverse la cour. Les infectés bifurquent derrière elle.','A pale tail darts across the yard. The infected turn after it.'));
      if(age>CUB_LEAVES_LINE+1&&!yardPrint){yardPrint=true; photo(1); discover(app,'cubLine');}
      if(age>=STAIRS_AT){
        voiceUntil=elapsed+say('vo_moon_threshold',{interrupt:true,subtitle:false});
        view('stairs',L('Le perron','The doorstep'),'');
        yardChoice(L('Descendre de la maison','Go downstairs'),door,18,'Space',emerge,L('Sortir','Step outside')).focus({preventScroll:true});
      }
    } else if(shot==='stairs'){
      yard();
      const passage=porchTraffic(crowd,landing);
      if(passage==='near' && screen.dataset.passage!=='near' && elapsed-lastClose>.8)audio.play('step_gravel',.48);
      if(passage!=='clear')lastClose=elapsed;
      screen.dataset.passage=passage;
      if(!yardLive && elapsed-heldAt>=PORCH_SECONDS){settle('neutral');return;}
      if(passage==='occupied'){
        if(!sawCrowd){audio.play('scratch',.56);discover(app,'cubSteps');}
        sawCrowd=true;caption(L('Une main racle la porte. Ils passent sur les marches.','A hand scrapes the door. They’re crossing the steps.'));
      }else if(!yardLive && passage==='clear'){
        caption(L('Il a quitté la cour. Ses empreintes sont encore fraîches.','He’s left the yard. His tracks are still fresh.'));
      }else if(hunt.cub()?.vault==='fence' && (hunt.cub()?.lift??0)>20)caption(L('Le petit saute la palissade.','The cub vaults the palisade.'));
      else if(passage==='near')caption(L('Des pas tout près, dans le gravier.','Footsteps on the gravel, close by.'));
      else caption(sawCrowd && elapsed-lastClose>.8?L('Le bruit des pas s’éloigne.','The footsteps fade.'):'');
    } else if(shot==='emerge'){
      hero=onSteps(time);heroFoot=hero?.position??landing;
      if(lastStep===0 && time>.7){audio.play('step_shed',.65);lastStep=1;}
      yard();
      if(time>=(approach?.intro??1.3)*.76 && near(heroFoot,GRAB_REACH)){
        caught(heroFoot,time);return;
      }
      if(time>=outsideAt)porch();
    } else if(shot==='attack' && attack){
      const intro=approach?.intro??1.3, contact=Math.max(.18,intro-exitTime);
      hero=onSteps(exitTime+time);
      if(hero && time>=contact)hero={...hero,position:attack.point,opening:1,fall:Math.min(1,(time-contact)/.58)};
      attack.age=time;
      if(!impact && time>=contact){impact=true;audio.play('bite',.85);audio.play('body_fall',.75);
        caption(L('Le rôdeur te saisit avant que tu puisses refermer.','The walker grabs you before you can close the door.'));}
      yard();
      if(time>=contact+2.3)leave();
    } else if(shot==='porch'||shot==='tin'||shot==='trail'){
      yard(); pressure(PORCH_SECONDS-time,PORCH_SECONDS,dt);
      if(time>=PORCH_SECONDS)retreat();
    } else if(shot==='strike'){
      pose(heroFoot,1,0,time<.18?7:time<.7?5:2);
      if(time>=.18 && struck===null){
        struck=elapsed;audio.play('tin',1);discover(app,'cubMetal');
        speech.textContent=L('Hé ! Par ici !','Hey! Over here!');
      }
      yard();
      if(time>=1.25)move('wood',[...walked.slice(1,-1).reverse(),...trailWay,trackExit]);
    } else if(shot==='walk'){
      const speed=4.4, distance=time*speed;
      const point=walkRoute(steps,distance);
      pose(point,point.fx,point.fy,Math.floor(distance/.54)%4);
      if(!point.done && Math.floor(distance/1.08)>lastStep){lastStep=Math.floor(distance/1.08);audio.play('step_gravel',.35);}
      if(point.done){
        if(walkEnd==='home'){
          const length=steps.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-steps[i]!.x,p.y-steps[i]!.y),0);
          const backTime=time-length/speed;
          hero=onSteps(Math.max(0,outsideAt-backTime));
          if(backTime>=outsideAt){yard();audio.play('door',.55);settle('neutral');return;}
        }else if(walkEnd==='wood'){enterWood();return;}
        else {walked=steps;atPlace();}
      }
      yard();
    } else if(shot==='forest'||shot==='warning'){
      forestTime+=dt;
      pressure(FOREST_SECONDS-forestTime,FOREST_SECONDS,dt);
      cubApproach=heldSince===null?Math.max(0,cubApproach-dt*1.6):Math.max(cubApproach,callProgress());
      wood();
      if(shot==='forest'){
        screen.dataset.window=ready()?'open':'closed';
        gesture?.style.setProperty('--called',String(callProgress()));
        caption(heldSince!==null?L('Il avance vers toi…','He’s coming to you…'):time<flashUntil?feedback:
          forestTime>=openings[1][1]?L('Les branches se referment sur la piste.','Branches close over the trail.'):
          route==='noise'?(ready()?L('Il s’arrête. Maintenant.','He stops. Now.'):L('Leurs pas couvrent le métal.','Their footsteps drown out the metal.'))
          :(ready()?L('Il détourne la tête. Le petit se redresse.','He looks away. The cub stands up.'):L('Le petit se tasse sous les racines.','The cub crouches under the roots.')));
        if(callProgress()>=1){settle('allied');return;}
      }
      if(forestTime>=FOREST_SECONDS) settle('neutral');
    } else if(shot==='result'){
      if(resultFrom==='walk'||resultFrom==='stairs') yard();
      else wood();
      if(outcome==='hostile' && time>=3) {
        view('revenge',L('Avant l’aube','Before dawn'),L('Tu refermes derrière toi. De l’autre côté de la porte, deux souffles.','You shut the door behind you. On the other side, two breaths.'));
        audio.play('door',.7);
      } else if(outcome==='neutral' && time>=3.2) leave();
      else if(outcome==='allied' && time>=2.5 && !spotted){
        spotted=true; photo(2);
        choice(L('Reprendre la veille','Back to the desk'),29,76,'ArrowDown',leave,L('Rentrer','Go home')).focus({preventScroll:true});
      }
    } else {
      frame(house);
      const approach=Math.min(1,time/3);
      wolf(ctx,56+approach*134,333-42*approach,.97,1,calmMotion()?0:time,2);
      wolf(ctx,515-approach*232,321-28*approach,.9,-1,calmMotion()?0:time,1);
      if(time>=4) leave();
    }
  };
}

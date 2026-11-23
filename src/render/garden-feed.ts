import type { GardenEscort } from '../core/garden-escort';
import { lightPool, patrolCel } from './epic-night-light';
import { gardenBackdrop } from './garden-scenery';
import { calmMotion } from './lighting';
import { hash2 } from './noise';
import neighbourArt from './epic-neighbour.webp';

const WIDTH = 900;
const HEIGHT = 390;
const TRACK = 295;
let neighbourSheet: HTMLImageElement | undefined;
const escortPose = new WeakMap<GardenEscort, { walking: boolean; garden: number; changed: number }>();
const walkFrames = [0, 1, 2, 1] as const;

/** All six painted poses share the same scale, but the kneeling boots sit higher in the sheet. */
function paintedNeighbour(ctx: CanvasRenderingContext2D, x: number, game: GardenEscort, still: boolean): number | null {
  if (!neighbourSheet) {
    neighbourSheet = new Image();
    neighbourSheet.decoding = 'async';
    neighbourSheet.src = neighbourArt;
  }
  if (!neighbourSheet.complete || !neighbourSheet.naturalWidth) return null;
  let pose = escortPose.get(game);
  if (!pose || pose.garden !== game.garden) {
    pose = { walking: game.walking, garden: game.garden, changed: -1 };
    escortPose.set(game, pose);
  }
  if (pose.walking !== game.walking) {
    pose.walking = game.walking;
    pose.changed = game.time;
  }
  const settling = !still && game.time - pose.changed < .16;
  const walk = still ? 1 : walkFrames[Math.floor(game.position * 2.7) % walkFrames.length]!;
  const frame = settling ? 3 : game.walking ? walk : game.watched || game.alert > .12 ? 5 : 4;
  const anchorX = [131, 115, 123, 127, 110, 112][frame]!;
  const anchorY = frame < 3 ? 254 : 236;
  const scale = .305;
  const sway = game.walking && !still ? Math.sin(game.position * 8) * .8 : 0;
  lightPool(ctx, x, TRACK + 1, game.walking ? 22 : 24, 5, '#0a1316cf');
  lightPool(ctx, x, TRACK - (game.walking ? 45 : 28), 33, 34, '#e0d1a42b');
  ctx.drawImage(neighbourSheet, frame % 3 * 256, Math.floor(frame / 3) * 256, 256, 256,
    x - anchorX * scale, TRACK - anchorY * scale + sway, 256 * scale, 256 * scale);
  return TRACK - (settling ? 67 : game.walking ? 81 : 60);
}

function line(ctx: CanvasRenderingContext2D, points: number[], color: string, width: number) {
  ctx.beginPath();
  ctx.moveTo(points[0]!, points[1]!);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i]!, points[i + 1]!);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function neighbour(ctx: CanvasRenderingContext2D, x: number, walking: boolean, time: number) {
  const crouch = walking ? 0 : 15;
  const swing = walking ? Math.sin(9 * time) * 6 : 0;
  lightPool(ctx,x,TRACK,20,5,'#0d1514bf');
  ctx.save();
  ctx.translate(x, TRACK);
  ctx.scale(1.25,1.25);
  ctx.lineCap = 'round';
  const hip=-20+crouch*.55;
  for (const leg of [-1,1]) {
    const foot=leg*swing;
    line(ctx,[leg*2,hip,4+leg*2+foot*.55,-11+crouch*.23,foot-3*leg,-3], leg===1?'#414d4c':'#283331',5.7);
    line(ctx,[foot-3*leg,-3,foot+2-3*leg,-2], '#202624',4);
  }
  ctx.translate(walking?0:3,crouch*.78);
  ctx.rotate(walking?-.04:.12);
  const coat=ctx.createLinearGradient(-8,0,10,0);coat.addColorStop(0,'#a47437');coat.addColorStop(.35,'#dab05f');coat.addColorStop(1,'#af843f');
  ctx.fillStyle=coat;ctx.strokeStyle='#5c553b';ctx.lineWidth=1;
  const body=new Path2D('M-7 -18 Q-7 -28 -2 -35 Q1 -40 8 -36 L10 -30 6 -20 5 -15 Q-2 -14 -9 -16 Z');
  ctx.fill(body);ctx.stroke(body);
  line(ctx,[-4,-32,-6,-25,-8,-21],'#e6c775',1);
  line(ctx,[4,-32,2+swing*.6,-24,7+swing,-22],'#9b733a',5.4);
  line(ctx,[7+swing,-22,10+swing,-22.5],'#bba184',2.8);
  ctx.fillStyle='#dac6a4';ctx.fill(new Path2D('M3 -38 Q2 -45 9 -45 Q14 -45 14 -41 L16 -39 14 -37 12 -34 7 -35 Z'));
  ctx.fillStyle='#5a4d42';ctx.fill(new Path2D('M2 -41 Q0 -49 9 -49 Q14 -49 14 -45 L18 -43 14 -42 8 -44 4 -40 Z'));
  ctx.restore();
}

export function drawGarden(canvas: HTMLCanvasElement, game: GardenEscort) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const layout = game.layout;
  const x = (metres: number) => 52 + metres / layout.length * 790;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.drawImage(gardenBackdrop(game.garden),0,0);
  const still=calmMotion(), air=still?0:game.time;
  lightPool(ctx,423+18*Math.sin(air*.14),242,437,24,'#bac7b61c');
  const shelterX = x(layout.shelter[0]), shelterEnd = x(layout.shelter[1]);
  const span = shelterEnd - shelterX;
  if (game.garden === 1) {
    line(ctx, [shelterX, TRACK, shelterX, 169, shelterEnd, 171, shelterEnd, TRACK], '#736651', 4);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = ['#72776f', '#997f69', '#65716d'][i]!;
      const left=shelterX+2+i*span/3, loose=Math.sin(air*1.3+i)*3,w=span/3-3,bottom=234+(i%2)*11;
      ctx.beginPath();ctx.moveTo(left,172);ctx.lineTo(left+w,172);
      ctx.quadraticCurveTo(left+w+loose,203,left+w+loose*1.5,bottom);
      ctx.quadraticCurveTo(left+w*.5,bottom+4,left+loose,bottom-1);ctx.closePath();ctx.fill();
      for(let j=1;j<5;j++){const fold=left+w*j/5;line(ctx,[fold,173,fold+loose,205,fold+loose*.65,bottom-4],'#2936324a',1.7);}
      for(const end of [left+3,left+w-3])ctx.fillRect(end,169,1.7,6);
    }
  } else if (game.garden === 2) {
    ctx.fillStyle = '#51666298'; ctx.fillRect(shelterX, 199, span, 83);
    line(ctx, [shelterX, 283, shelterX, 194, (shelterX + shelterEnd) / 2, 166, shelterEnd, 194, shelterEnd, 283], '#9a9c87', 4);
    line(ctx, [shelterX, 218, shelterEnd, 218], '#858c78', 2);
    for(let j=1;j<4;j++) {
      const pane=shelterX+span*j/4;
      line(ctx,[pane,194,pane,281],'#9cafa1',1.7);
      line(ctx,[pane+4,211,pane+span/4-4,200],'#b0cbbd77',1.2);
    }
    for(let j=0;j<10;j++){
      const stem=shelterX+4+span*hash2(j,2,3);
      line(ctx,[stem,279,stem-2,253+hash2(j,1,2)*13,stem+4,244+hash2(j,1,4)*15],'#3f5245',2);
    }
  } else {
    ctx.fillStyle = '#536651';
    for (let i = 0; i < 11; i++) {
      ctx.beginPath(); ctx.ellipse(shelterX + span * i / 10, 239 + Math.cos(i * 12) * 4, 13, 26, .15, 0, Math.PI * 2); ctx.fill();
    }
    for(let i=0;i<220;i++){
      const leafX=shelterX-6+(span+12)*hash2(i,1,4),leafY=216+hash2(i,3,4)*43;
      ctx.fillStyle=['#627761','#73836a','#374c43','#42594a'][i%4]!;
      ctx.beginPath();ctx.ellipse(leafX,leafY,2.5,1.3,hash2(i,8,1)*2.7,0,Math.PI*2);ctx.fill();
    }
  }
  ctx.fillStyle = '#85b5a03d'; ctx.fillRect(shelterX, TRACK - 3, span, 8);
  for (const [i, patrol] of layout.patrols.entries()) {
    const center = game.patrolAt(i);
    const px = x(center) - (i ? -37 : 37);
    lightPool(ctx,px,242,17,3,'#141d19c4');
    if(!patrolCel(ctx,px,242,61,i?-1:1,air+i)){
      line(ctx,[px-3,241,px,218,px+4,198,px+9,193],'#76847a',6);
    }
    const left = x(center - patrol.width / 2), right = x(center + patrol.width / 2);
    const gaze=ctx.createLinearGradient(0,201,0,TRACK+4);
    gaze.addColorStop(0,'#e7c09713');gaze.addColorStop(1,game.watched&&game.walking?'#e79e5880':'#dfaa6852');ctx.fillStyle=gaze;
    ctx.beginPath(); ctx.moveTo(px + 5, 209); ctx.lineTo(left, TRACK + 4); ctx.lineTo(right, TRACK + 4); ctx.closePath(); ctx.fill();
    line(ctx, [left, TRACK + 5, right, TRACK + 5], '#dda275', 2);
  }
  ctx.fillStyle='#383e35';ctx.fillRect(829,189,57,107);
  line(ctx,[821,192,857,173,896,192],'#26312e',7);
  line(ctx,[821,189,857,171,896,190],'#819184',1.3);
  ctx.fillStyle='#30372f';ctx.fillRect(844,210,27,83);
  for(let i=0;i<5;i++)line(ctx,[846+i*4,245,846+i*4,289],'#5b6050',1);
  ctx.fillStyle='#ddba78';ctx.fillRect(848,214,18,22);
  line(ctx,[857,213,857,236],'#5d5640',2);line(ctx,[848,226,866,226],'#5d5640',1.7);
  lightPool(ctx,857,225,43,40,'#ffe0a434');lightPool(ctx,847,291,53,9,'#dbb86c47');
  const cx=x(game.position);
  if(game.advance)lightPool(ctx,cx-7,TRACK-20,39,38,game.lamp?'#ffcf7e47':'#d6c79b24');
  if(!still && game.walking){
    for(let i=0;i<6;i++) {
      const age=(air*1.6+i/6)%1;
      ctx.fillStyle='rgba(186,177,143,'+(.3*(1-age))+')';
      ctx.fillRect(cx-3-age*(8+i),TRACK-2-Math.sin(age*Math.PI)*(1.5+i*.5),1.8,1);
    }
  }
  for(let i=0;i<5&&game.position>i*.4;i++){
    ctx.fillStyle='#a7aa8b60';ctx.beginPath();ctx.ellipse(cx-6-i*8,TRACK+(i%2)*3,3,1.2,.1,0,Math.PI*2);ctx.fill();
  }
  const markerY = paintedNeighbour(ctx, cx, game, still);
  if (markerY === null) neighbour(ctx,cx,game.walking,air);
  const marker = markerY ?? 222;
  line(ctx, [cx - 5, marker, cx, marker + 4, cx + 5, marker], '#243430', 4);
  line(ctx, [cx - 5, marker, cx, marker + 4, cx + 5, marker], '#ffe59c', 2);
  ctx.fillStyle = '#19221eee'; ctx.fillRect(48, 335, 804, 6);
  ctx.fillStyle = '#dfbc7c'; ctx.fillRect(48, 335, 804 * game.position / layout.length, 6);
}

/** The window across the lane is the receipt for what happened on the camera feed. */
export function gardenAftermath(canvas: HTMLCanvasElement, home: boolean) {
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.drawImage(gardenBackdrop(2),0,0);
  const wall=ctx.createLinearGradient(0,0,900,0);
  wall.addColorStop(0,'#1d292b');wall.addColorStop(.45,'#47504a');wall.addColorStop(1,'#202d2c');
  ctx.fillStyle=wall;ctx.fillRect(0,0,900,390);
  for(let row=0;row<25;row++){
    const y=row*17,start=row%2*-29;
    for(let i=0;i<18;i++) {
      const x=start+i*58,t=hash2(i,row,31);
      ctx.fillStyle=t>.62?'#6c6c573b':'#25352f58';ctx.fillRect(x+1,y+1,56,14);
      ctx.fillStyle='#30393179';ctx.fillRect(x,y+15,58,1);
      for(let g=0;g<9;g++){
        ctx.fillStyle=g%3?'#1e2f2d45':'#90907930';
        ctx.fillRect(x+hash2(i*9+g,row,2)*55,y+hash2(i*5+g,row,4)*13,3,1);
      }
    }
  }
  const sill=291,wx=325,wy=62,ww=245,wh=sill-wy;
  if(home)lightPool(ctx,448,202,263,192,'#e3bb767a');
  ctx.fillStyle='#192326';ctx.fillRect(wx-9,wy-8,ww+18,wh+13);
  ctx.fillStyle='#777761';ctx.fillRect(wx-4,wy-3,ww+8,wh+7);
  const window=ctx.createLinearGradient(wx,wy,wx+ww,wy+wh);
  window.addColorStop(0,home?'#967747':'#26363b');window.addColorStop(.5,home?'#e5c88a':'#465a5c');window.addColorStop(1,home?'#8d7048':'#293738');
  ctx.fillStyle=window;ctx.fillRect(wx,wy,ww,wh);
  for(const side of [0,1]){
    ctx.save();ctx.translate(side?wx+ww:wx,wy);ctx.scale(side?-1:1,1);
    ctx.fillStyle=home?'#806245':'#344346';
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(82,0);ctx.quadraticCurveTo(77,80,39,138);
    ctx.quadraticCurveTo(51,179,68,wh);ctx.lineTo(0,wh);ctx.fill();
    for(let i=0;i<5;i++)line(ctx,[12+i*13,2,13+i*7,138,15+i*10,wh-1],home?'#ae906056':'#5e70673a',2);
    ctx.restore();
  }
  if(home){
    // A sleeve and upraised hand behind the glass answer the lamp one last time.
    ctx.save();ctx.translate(-24,0);
    ctx.fillStyle='#4c4d3e';ctx.beginPath();ctx.arc(444,176,17,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(413,263);ctx.quadraticCurveTo(408,191,438,191);ctx.quadraticCurveTo(462,186,469,214);ctx.lineTo(493,189);ctx.lineTo(501,195);ctx.lineTo(473,235);ctx.lineTo(465,234);ctx.lineTo(471,276);ctx.closePath();ctx.fill();
    ctx.lineCap='round';line(ctx,[495,194,503,182,503,173],'#5c5944',8);
    for(let i=0;i<4;i++)line(ctx,[500+i*2,177,498+i*3,169-i%2*3],'#5c5944',2);
    ctx.restore();
  }
  ctx.fillStyle='#423e31';ctx.fillRect(wx+ww*.5-3,wy,6,wh);ctx.fillRect(wx,wy+64,ww,6);
  for(const side of [-1,1]){
    const x=side===-1?wx-79:wx+ww+10;
    ctx.fillStyle='#35413a';ctx.fillRect(x,wy-2,68,wh+2);
    for(let slat=0;slat<22;slat++){
      const sy=wy+6+slat*10;
      line(ctx,[x+6,sy,x+61,sy-1],'#657061',2);
      line(ctx,[x+6,sy+2,x+61,sy+1],'#26332e',3);
    }
  }
  ctx.fillStyle='#26322d';ctx.fillRect(wx-27,sill,ww+54,13);ctx.fillStyle='#85836c';ctx.fillRect(wx-28,sill-1,ww+56,4);
  if(home){
    ctx.fillStyle='#646e60';ctx.beginPath();ctx.ellipse(493,286,17,6,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#c1bda2';ctx.lineWidth=2;ctx.stroke();
    line(ctx,[484,285,502,280],'#dad0af',2.2);
  }
}

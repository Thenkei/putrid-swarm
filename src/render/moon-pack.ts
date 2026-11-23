import { PACK_GAP, PACK_RETURN, packPhase } from '../core/moon-pack';
import { lightPool, patrolCel } from './epic-night-light';
import { calmMotion } from './lighting';
import { hash2 } from './noise';
import { sprite } from '../engine/assets';

// Outlines stay in the cache between frames, including when the operator switches cameras.
let body: Path2D, head: Path2D;
function wolf(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, facing: number, time: number, pose = 0) {
  const sheet = sprite('epic_pack_art');
  if (sheet) {
    // The feet line up at y=491 in each painted cel. A small breath stays anchored there.
    const breath = 1 + Math.sin(time * 1.8) * .009;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale * facing, scale * breath);
    ctx.drawImage(sheet.img, pose * 384, 0, 384, 505, -58, -147.3, 115.2, 151.5);
    ctx.restore();
    return;
  }
  body ??= new Path2D('M-22 -91 Q-13 -117 4 -113 L16 -96 27 -69 37 -39 32 -29 23 -41 12 -65 9 -42 24 -18 21 -4 32 0 10 0 7 -15 -6 -29 -20 -12 -22 -2 -42 0 -37 -8 -32 -11 -34 -24 -20 -49 -26 -66 -42 -47 -50 -28 -56 -25 -53 -49 -37 -81 Z');
  head ??= new Path2D('M-15 10 -20 -15 -16 -30 -7 -20 1 -35 9 -19 17 -12 31 -7 26 2 12 7 0 15 Z');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * facing, scale);
  const fur = ctx.createLinearGradient(-28, -105, 30, -18);
  fur.addColorStop(0, '#71807b'); fur.addColorStop(.3, '#3e4b4b'); fur.addColorStop(.65, '#252c2c'); fur.addColorStop(1, '#181e20');
  ctx.fillStyle = fur;
  ctx.strokeStyle = '#252d30';
  ctx.lineWidth = 1.6;
  ctx.fill(body); ctx.stroke(body);
  ctx.save(); ctx.clip(body);
  for (let i = 0; i < 96; i++) {
    const fx = -49 + hash2(i, 2, 18) * 85, fy = -111 + hash2(i, 3, 5) * 107;
    ctx.strokeStyle = i % 3 ? '#9eaba642' : '#0c171a80';
    ctx.beginPath(); ctx.moveTo(fx,fy);ctx.quadraticCurveTo(fx+2,fy+3,fx-2,fy+6);ctx.stroke();
  }
  ctx.restore();
  ctx.translate(-2, -107);
  ctx.rotate(.1 + .16 * Math.sin(time * 1.8));
  ctx.fill(head); ctx.stroke(head);
  ctx.fillStyle = '#98a398'; ctx.beginPath(); ctx.moveTo(-8,-16); ctx.lineTo(7,-17); ctx.lineTo(20,-9); ctx.lineTo(8,-6); ctx.fill();
  ctx.fillStyle = '#e7dc9b'; ctx.fillRect(10, -12, 3, 2); ctx.fillStyle = '#0e1618'; ctx.fillRect(26,-8,5,3);
  ctx.restore();
}

function infected(ctx: CanvasRenderingContext2D, x: number, time: number) {
  lightPool(ctx,x,295,29,6,'#050b10bb');
  if (patrolCel(ctx,x,295,88,1,time)) return;
  const stride = Math.sin(time * 7);
  ctx.save();
  ctx.translate(x, 295);
  ctx.lineCap = 'round'; ctx.strokeStyle = '#323132'; ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(1, -68); ctx.lineTo(-4, -36);
  ctx.lineTo(10 * stride, -3);
  ctx.moveTo(-4, -36); ctx.lineTo(-11 * stride, 0);
  ctx.moveTo(1, -66); ctx.lineTo(20, -51); ctx.lineTo(28, -56);
  ctx.stroke();
  ctx.fillStyle = '#45443f'; ctx.beginPath(); ctx.arc(6, -81, 10, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** The pale tail tip and the bent rear hocks distinguish the pup from either adult. */
function cub(ctx: CanvasRenderingContext2D, x: number, facing: number, time: number, running: boolean) {
  const stride = Math.sin(time * (running ? 13 : 5));
  lightPool(ctx,x,339,32,6,'#11161cbb');
  const sheet = sprite('epic_pack_art');
  if (sheet) {
    const frame = running && !calmMotion() ? Math.floor(time * 9) % 3 : 1;
    ctx.save(); ctx.translate(x, 338); ctx.scale(facing, 1);
    ctx.drawImage(sheet.img, frame * 384, 534, 384, 222, -53, -57, 107.52, 62.16);
    ctx.restore();
    return;
  }
  ctx.save(); ctx.translate(x,338); ctx.scale(facing,1);
  const rise = running ? Math.abs(stride) * 2 : 0;
  ctx.translate(0,-rise);
  ctx.lineCap = 'round';ctx.lineJoin = 'round';
  for(let i=0;i<4;i++) {
    const rear=i<2, near=i%2===0, hip=rear?-16:13;
    const step=(near===rear?stride:-stride)*(running?8:3);
    ctx.strokeStyle=near?'#545c59':'#303b3a';ctx.lineWidth=near?5:4;
    ctx.beginPath();ctx.moveTo(hip,-21);
    ctx.lineTo(hip+(rear?-5:3)+step/2,-10);
    ctx.lineTo(hip+step,-2+rise);ctx.lineTo(hip+step+3,-2+rise);ctx.stroke();
  }
  ctx.save();ctx.translate(-18,-23);ctx.rotate(.16*stride);
  ctx.fillStyle='#545e5d';ctx.fill(new Path2D('M3 -4 Q-8 -8 -17 -1 Q-28 4 -37 -2 Q-34 9 -26 11 Q-15 11 4 2 Z'));
  ctx.fillStyle='#d7d5c0';ctx.fill(new Path2D('M-26 2 Q-32 2 -37 -2 Q-34 8 -27 10 L-29 6 -24 7 Z'));ctx.restore();
  const coat=ctx.createLinearGradient(0,-48,0,-12);
  coat.addColorStop(0,'#a7aba0');coat.addColorStop(.43,'#737e79');coat.addColorStop(1,'#3e4847');ctx.fillStyle=coat;
  ctx.fill(new Path2D('M-23 -17 Q-30 -35 -12 -37 Q6 -36 11 -40 L14 -46 21 -46 26 -41 25 -28 Q22 -11 0 -11 Q-16 -10 -23 -17 Z'));
  ctx.save();ctx.translate(18,-37);ctx.rotate(.07*Math.sin(time*3));
  ctx.fillStyle='#818a7f';ctx.fill(new Path2D('M-12 -3 L-10 -18 -4 -14 3 -24 8 -14 13 -11 18 -5 27 -3 23 2 12 5 7 12 -4 10 Z'));
  ctx.fillStyle='#d2d1b9';ctx.fill(new Path2D('M4 -4 L14 -4 19 -1 25 -2 21 3 11 6 5 11 5 5 -2 7 Z'));
  ctx.fillStyle='#152326';ctx.fillRect(10,-8,3,2);ctx.fillRect(24,-4,3,3);
  ctx.restore();ctx.restore();
}

function paw(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#cfccb591';
  ctx.beginPath();ctx.ellipse(0,1,4,2.2,0,0,Math.PI*2);ctx.fill();
  for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(-4+i*2.6,-2.3-Math.sin(i*Math.PI/3),1.1,1.3,0,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}

export function moonFeed(canvas: HTMLCanvasElement, camera: number, subject: number, time: number, gate: boolean, lift: number, crossing: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 900, 420);
  const still=calmMotion(), air=still?0:time;
  const shade=ctx.createLinearGradient(0,0,0,420);
  shade.addColorStop(0,'#0b1c35bd');shade.addColorStop(.52,'#253f5594');shade.addColorStop(1,'#101c26ad');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 900, 420);
  if(camera!==1){
    lightPool(ctx,704,70,95,83,'#e0e5d052');
    ctx.save();ctx.beginPath();ctx.arc(704,70,19,0,Math.PI*2);ctx.clip();ctx.fillStyle='#e3e3cb';ctx.fillRect(684,50,40,40);
    for(let i=0;i<16;i++){ctx.fillStyle=i%2?'#898f8a44':'#fff4c93b';ctx.beginPath();ctx.ellipse(686+hash2(i,1,3)*37,51+hash2(i,3,1)*37,2+hash2(i,4,6)*5,2+hash2(i,5,7)*4,.2,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  lightPool(ctx,498+Math.sin(air*.13)*30,337,249,28,'#a7bdc934');
  if(!still)for(let i=0;i<12;i++){
    const x=(hash2(i,0,3)*900+air*(4+i%4))%900;
    const y=173+hash2(i,1,8)*182+Math.sin(air*.55+i)*3;
    ctx.fillStyle='#d1d8cb5c';ctx.fillRect(x,y,1.5,1);
  }
  if (gate) {
    const phase = packPhase(time);
    if (phase < PACK_GAP || phase >= PACK_RETURN) {
      // The patrol walks on the raised lane behind the gate. Its feet must never cross
      // the cub's outline, even when three figures line up in the reduced-motion view.
      const movement = phase >= PACK_RETURN ? phase - PACK_RETURN : phase + 1;
      ctx.save();
      ctx.translate(119, 29);
      ctx.scale(.82, .73);
      ctx.globalAlpha = .84;
      for (let i = 0; i < 3; i++) infected(ctx, 145 + movement * 116 + i * 72, air + i);
      ctx.restore();
    }
    lightPool(ctx,681,334,83,22,'#acbad22f');
    lightPool(ctx,681,340,55,10,'#071018b3');
    wolf(ctx, 681, 340, 1.28, -1, air, crossing > .45 ? 2 : 1);
    ctx.fillStyle = '#141b20'; ctx.strokeStyle = '#65716c';
    ctx.lineWidth = 1;
    for (let x = 295; x < 555; x += 28) {
      ctx.fillRect(x, 99 - lift, 6, 240);
      ctx.strokeRect(x, 99 - lift, 6, 240);
    }
    ctx.fillRect(277, 330 - lift, 301, 12);
    ctx.fillStyle='#a4a894';ctx.fillRect(277,330-lift,301,1.4);
    for(const x of [295,350,405,460,515,558]){ctx.fillStyle='#a3aca2';ctx.beginPath();ctx.arc(x,335-lift,2,0,Math.PI*2);ctx.fill();}
    // The cub is caught at the foot of the gate, on the camera side of the bars.
    // A separate soft pool follows the pale ear and tail through the crossing.
    const cubX = 427 + crossing * 166;
    lightPool(ctx, cubX, 320, 64, 27, '#a5becc3d');
    for (let i = 0; i < 5; i++) if (crossing > (i + 1) / 6) paw(ctx,439+i*25,341+(i%2)*4,.7);
    cub(ctx, cubX, 1, air, crossing > 0 && crossing < 1);
    return;
  }
  if (camera === subject) {
    const path = Math.sin(air * .57) * 100;
    const facing=Math.cos(air*.57)>0?1:-1;
    for(let i=0;i<6;i++)paw(ctx,490+path-facing*(38+i*16),340+(i%2)*5,facing*.7);
    cub(ctx, 490 + path, facing, air, !still);
  } else if (camera === (subject + 1) % 3) {
    lightPool(ctx,478,337,62,10,'#09101ab3');
    wolf(ctx, 478, 337, 1.35, -1, air);
  } else {
    infected(ctx, 360 + Math.sin(air * .6) * 63, air);
  }
}

export function packAftermath(canvas: HTMLCanvasElement, rescued: boolean, damage: number) {
  const ctx=canvas.getContext('2d'); if(!ctx)return;
  ctx.clearRect(0,0,900,420);
  const wash=ctx.createLinearGradient(0,0,0,420);
  wash.addColorStop(0,'#08172c9c');wash.addColorStop(.6,'#22394890');wash.addColorStop(1,'#16272cca');
  ctx.fillStyle=wash;ctx.fillRect(0,0,900,420);
  lightPool(ctx,510,320,320,47,'#c6cdb24d');
  for(let i=0;i<13;i++){
    const x=310+i*22,y=365-i*(rescued?7:2)+Math.sin(i*.55)*7;
    const spread=1-i*.045;
    ctx.save();ctx.translate(x,y);ctx.scale(spread,spread);
    if(rescued){
      for(const lateral of [-21,21]){ctx.save();ctx.translate(0,lateral);ctx.scale(2.1,1.6);paw(ctx,0,0,.9);ctx.restore();}
      paw(ctx,0,i%2*6,1);
    }else if(i<7){paw(ctx,0,i%2*5,1);}
    else {
      ctx.strokeStyle='#c0bb9b77';ctx.lineWidth=1.3;
      for(let claw=0;claw<3;claw++){ctx.beginPath();ctx.moveTo(-13,claw*3);ctx.quadraticCurveTo(-5,-5+claw*3,7,-7+claw*3);ctx.stroke();}
    }
    ctx.restore();
  }
  if(damage>0){
    ctx.save();ctx.translate(290,323);ctx.rotate(-.13);ctx.fillStyle='#343c3d';ctx.fillRect(0,0,235,8);ctx.fillStyle='#aaa998';ctx.fillRect(0,0,235,1);ctx.restore();
  }
}

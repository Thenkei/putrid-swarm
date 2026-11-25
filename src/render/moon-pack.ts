import { PACK_GAP, PACK_RETURN, packPhase } from '../core/moon-pack';
import { lightPool, patrolCel } from './epic-night-light';
import { calmMotion } from './lighting';
import { hash2, smoothstep } from './noise';
import { drawBarnLaundry } from './moon-laundry';
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

function infected(ctx: CanvasRenderingContext2D, x: number, time: number, facing = 1) {
  lightPool(ctx,x,295,29,6,'#050b10bb');
  if (patrolCel(ctx,x,295,88,facing,time)) return;
  const stride = Math.sin(time * 7);
  ctx.save();
  ctx.translate(x, 295);
  ctx.scale(facing, 1);
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
function cub(ctx: CanvasRenderingContext2D, x: number, facing: number, time: number, running: boolean, lift = 0) {
  const stride = Math.sin(time * (running ? 13 : 5));
  lightPool(ctx,x,339,32,6,'#11161cbb');
  const sheet = sprite('epic_pack_art');
  if (sheet) {
    const frame = running ? (calmMotion() ? 1 : Math.floor(time * 9) % 3) : 2;
    const breath = !running && !calmMotion() ? 1 + Math.sin(time * 3.2) * .015 : 1;
    // The middle stride lands ten source pixels lower than the other two.
    const footY = frame === 1 ? 200 : 190;
    ctx.save(); ctx.translate(x, 338 - lift); ctx.scale(facing, breath);
    ctx.drawImage(sheet.img, frame * 384, 534, 384, 222, -53, -footY * .28, 107.52, 62.16);
    ctx.restore();
    return;
  }
  ctx.save(); ctx.translate(x,338 - lift); ctx.scale(facing,1);
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

/** The evidence reticle and the cub use the same ground anchor even in reduced motion. */
export function trailCubX(time: number, camera = 0) {
  return cubPosition(calmMotion() ? 0 : time, camera);
}

function cubPosition(time: number, camera: number) {
  return camera === 2 ? 330 + Math.sin(time * .57) * 13 : 490 + Math.sin(time * .57) * 100;
}

function portcullis(ctx: CanvasRenderingContext2D, lift: number, time: number) {
  // Registration on the painted uprights at x=228 and x=467 and on the pulley at (395,143).
  ctx.save();
  ctx.beginPath(); ctx.rect(224, 125, 245, 182); ctx.clip();
  ctx.translate(0, -lift);
  const iron = ctx.createLinearGradient(0,141,0,307);
  iron.addColorStop(0,'#474847'); iron.addColorStop(.35,'#212b30'); iron.addColorStop(.83,'#58473b'); iron.addColorStop(1,'#262d32');
  for (let x = 238; x <= 459; x += 22) {
    ctx.fillStyle=iron;
    ctx.beginPath();ctx.moveTo(x,152);ctx.lineTo(x+2,145);ctx.lineTo(x+5,152);ctx.lineTo(x+5,302);ctx.lineTo(x+3,307);ctx.lineTo(x,302);ctx.fill();
    ctx.fillStyle='#a8a7a17a';ctx.fillRect(x+1,155,1,148);
    for(let flake=0;flake<4;flake++){ctx.fillStyle='#9a704989';ctx.fillRect(x+1,169+hash2(x,flake,9)*105,2,2+flake%2);}
  }
  for(const y of [164,230,295]){
    ctx.fillStyle=iron;ctx.fillRect(224,y,245,8);ctx.fillStyle='#a29a8987';ctx.fillRect(224,y,245,1);
    for(let x=240;x<469;x+=22){ctx.fillStyle='#171f23';ctx.fillRect(x,y+3,3,3);ctx.fillStyle='#b5a182';ctx.fillRect(x,y+3,1,1);}
  }
  ctx.restore();
  // Chain takes strain as the lift starts; its changing length tracks the ironwork.
  ctx.save();ctx.strokeStyle='#22262c';ctx.lineWidth=1.7;
  const offset=lift>0&&!calmMotion()?Math.sin(time*11)*.6:0;
  for(const x of [267,436]){
    ctx.beginPath();ctx.moveTo(395,145);ctx.lineTo(x+offset,164-lift);ctx.stroke();
    ctx.setLineDash([2,3]);ctx.strokeStyle='#a39b87';ctx.lineWidth=1;ctx.stroke();
    ctx.setLineDash([]);ctx.strokeStyle='#22262c';ctx.lineWidth=1.7;
  }
  ctx.restore();
}

/** The last straggler passes behind the adult's lowered muzzle and out the far
 * side of the lamp. Its feet and the cub's route are on different ground planes. */
function passingStraggler(ctx: CanvasRenderingContext2D, phase: number, still: boolean) {
  if (phase >= PACK_GAP && phase < PACK_RETURN) return;
  const x = still ? 561 : phase >= PACK_RETURN
    ? -75 + (phase - PACK_RETURN) * 494 : 419 + phase * 178;
  const y = 286 + (x - 419) * .045;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(.94, .96);
  lightPool(ctx, 9, -1, 32, 7, '#0f171eb0');
  if (!patrolCel(ctx, 0, 0, 105, 1, still ? .22 : phase)) {
    ctx.translate(0, -295);
    infected(ctx, 0, still ? 0 : phase);
  }
  ctx.restore();
}

function waitingAdult(ctx: CanvasRenderingContext2D, time: number, crossing: number) {
  const settled = calmMotion() ? 1 : smoothstep(0, 2.2, time);
  const x = 782 - settled * 129 - smoothstep(.55, 1, crossing) * 19;
  const y = 311 + settled * 26;
  const stride = settled < 1 ? Math.sin(time * 9) * (1 - settled) * 3 : 0;
  const pose = crossing > .55 ? 2 : settled < .17 ? 0 : 1;
  lightPool(ctx,x,y-4,83,22,'#b4c7d831');
  lightPool(ctx,x+16,y,58,10,'#e5b87827');
  lightPool(ctx,x,y,55,10,'#071018c0');
  wolf(ctx, x, y + stride, 1.04 + settled *.51, -1, calmMotion()?0:time, pose);
  if(!calmMotion()){
    const exhale=(time*.52)%1;
    lightPool(ctx,x-37-24*exhale,y-119-9*exhale,4+20*exhale,2+6*exhale,
      'rgba(211,225,226,'+(Math.sin(exhale*Math.PI)*.21)+')');
  }
}

/** On the last watch the already rescued cub crosses the near side of this same gate. */
export function homewardPack(ctx: CanvasRenderingContext2D, seconds: number, still: boolean) {
  const approach = still ? Number(seconds >= 1.45) : smoothstep(.28, 2.6, seconds);
  const adultX = 680, feet = 337;
  lightPool(ctx, adultX - 22, feet - 6, 104, 23, '#d4bc824e');
  lightPool(ctx, adultX, feet, 69, 10, '#081214b0');
  wolf(ctx, adultX, feet, 1.41, -1, still ? 0 : seconds, approach > .78 ? 1 : 0);
  const pupX = 288 + 312 * approach;
  const running = !still && approach > 0 && approach < .99;
  ctx.save();
  ctx.translate(pupX, feet + 10 - 4 * approach);
  ctx.scale(.87, .87); ctx.translate(0, -338);
  cub(ctx, 0, 1, still ? 0 : seconds, running);
  ctx.restore();
}

export function moonFeed(canvas: HTMLCanvasElement, camera: number, subject: number, time: number, gate: boolean, lift: number, crossing: number, arrivalTime: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 900, 420);
  const still=calmMotion(), air=still?0:time;
  const shade=ctx.createLinearGradient(0,0,0,420);
  shade.addColorStop(0,'#07162a16');shade.addColorStop(.52,'#2949510d');shade.addColorStop(1,'#101d3033');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 900, 420);
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
      for (let i = 0; i < 2; i++) infected(ctx, 145 + movement * 116 + i * 72, air + i);
      ctx.restore();
    }
    passingStraggler(ctx, phase, still);
    waitingAdult(ctx,arrivalTime,crossing);
    // The cub starts beyond the ironwork, passes through the opening towards the camera,
    // then turns across the lane towards the adult on the near side.
    const hesitant = crossing === 0 && !still ? 3 * Math.sin(time * 1.7) : 0;
    const advance = smoothstep(0,1,crossing);
    const cubX = 330 + 219 * advance * advance + hesitant;
    const feet = 281 + 57 * advance;
    if (feet >= 307) portcullis(ctx,lift,air);
    lightPool(ctx, cubX, feet - 14, 58, 21, '#a5becc3d');
    for (let i = 1; i <= 5; i++) {
      const step = i / 6;
      if (advance > step) paw(ctx,330 + 219 * step * step,281 + 57 * step + (i%2)*2,Math.PI / 2 + Math.atan2(57, 438 * step));
    }
    ctx.save();
    ctx.translate(cubX,feet);
    const leap = still?0:Math.sin(crossing*Math.PI) * 10;
    const scale = .85 + .27 * advance;
    ctx.scale(scale,scale);
    ctx.translate(-cubX,-338);
    cub(ctx,cubX,1,air,crossing>0&&crossing<1,leap);
    ctx.restore();
    if (feet < 307) portcullis(ctx,lift,air);
    return;
  }
  if(camera===2){
    if(camera===subject) {
      ctx.save();ctx.translate(trailCubX(time,2),281);ctx.scale(.85,.85);ctx.translate(0,-338);
      cub(ctx,0,1,air,false);ctx.restore();
    }
    portcullis(ctx,0,air);
    passingStraggler(ctx, still ? 1 : packPhase(arrivalTime + .65), still);
    waitingAdult(ctx,arrivalTime,0);
    // A second member hangs back in the orchard. Its silhouette supplies a sense of scale.
    ctx.save();ctx.globalAlpha=.65;wolf(ctx,188,266,.57,1,air,0);ctx.restore();
    return;
  }
  if (camera === subject) {
    const facing=Math.cos(air*.57)>0?1:-1;
    // Stamp each print where a paw touched down. Old prints stay put through a turn.
    const stride = .32;
    const lastStep = Math.floor(air / stride);
    for (let step = lastStep - 5; step <= lastStep; step++) {
      const footfall = step * stride;
      const direction = Math.cos(footfall * .57) >= 0 ? 1 : -1;
      paw(ctx, cubPosition(footfall, camera), 340 + Math.abs(step % 2) * 5, direction * Math.PI / 2);
    }
    cub(ctx, trailCubX(time, camera), facing, air, !still);
  } else if (camera === (subject + 1) % 3) {
    lightPool(ctx,478,337,62,10,'#09101ab3');
    wolf(ctx, 478, 337, 1.35, -1, air);
  } else {
    infected(ctx, 360 + Math.sin(air * .6) * 63, air, Math.cos(air * .6) >= 0 ? 1 : -1);
  }
  if (camera === 1) {
    const trackingCub = subject === camera;
    const direction = Math.cos(air * .57) >= 0 ? 1 : -1;
    drawBarnLaundry(ctx, trackingCub ? trailCubX(time) : null, trailCubX(time - .18) - 23 * direction, air);
  }
}

export function packAftermath(canvas: HTMLCanvasElement, damage: number) {
  const ctx=canvas.getContext('2d'); if(!ctx)return;
  ctx.clearRect(0,0,900,420);
  const wash=ctx.createLinearGradient(0,0,0,420);
  wash.addColorStop(0,'#08172c9c');wash.addColorStop(.6,'#22394890');wash.addColorStop(1,'#16272cca');
  ctx.fillStyle=wash;ctx.fillRect(0,0,900,420);
  ctx.save();
  if (damage > 0) { ctx.translate(225,164); ctx.rotate(.055); ctx.translate(-225,-164); }
  portcullis(ctx,0,0);
  ctx.restore();
  lightPool(ctx,510,320,320,47,'#c6cdb24d');
  for(let i=0;i<13;i++){
    const x=310+i*22,y=354-i*2+Math.sin(i*.55)*7;
    const spread=1-i*.045;
    ctx.save();ctx.translate(x,y);ctx.scale(spread,spread);
    if(i<7){paw(ctx,0,i%2*5,1);}
    else {
      ctx.strokeStyle='#c0bb9b77';ctx.lineWidth=1.3;
      for(let claw=0;claw<3;claw++){ctx.beginPath();ctx.moveTo(-13,claw*3);ctx.quadraticCurveTo(-5,-5+claw*3,7,-7+claw*3);ctx.stroke();}
    }
    ctx.restore();
  }
}

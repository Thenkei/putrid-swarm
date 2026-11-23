import { hash2 } from './noise';
import { lightPool } from './epic-night-light';

const backgrounds = new Map<number, HTMLCanvasElement>();

/** Three side elevations, painted once. The track is always at y=295. */
export function gardenBackdrop(garden: number): HTMLCanvasElement {
  const existing=backgrounds.get(garden);
  if(existing)return existing;
  const background=document.createElement('canvas');
  background.width=900;background.height=390;
  const ctx=background.getContext('2d')!;
  const noise=(index:number,channel:number)=>hash2(index,channel,garden+11);
  const sky=ctx.createLinearGradient(0,0,0,290);
  sky.addColorStop(0,'#142333');sky.addColorStop(.55,'#425456');sky.addColorStop(1,'#34413e');
  ctx.fillStyle=sky;ctx.fillRect(0,0,900,390);
  for(let i=0;i<85;i++){ctx.fillStyle='rgba(237,231,195,'+(.15+noise(i,1)*.45)+')';ctx.fillRect(noise(i,2)*900,noise(i,3)*100,1,1);}
  const moonX=671-garden*164;
  lightPool(ctx,moonX,45,130,76,'#a8bbaf47');
  ctx.fillStyle='#d8d8ba';ctx.beginPath();ctx.arc(moonX,45,10,0,Math.PI*2);ctx.fill();
  for(let i=0;i<95;i++) {
    const x=i*10, height=92+45*noise(i,6), ry=20+noise(i,9)*63;
    ctx.fillStyle=i%3?'#2c3f45':'#31454a';ctx.beginPath();ctx.ellipse(x,height,15+noise(i,3)*23,ry,noise(i,7)*.18,0,Math.PI*2);ctx.fill();
  }
  for(let i=0;i<400;i++){
    const x=noise(i,11)*900, y=98+Math.sin(x*.026+garden)*12+noise(i,12)*71;
    ctx.fillStyle=i%3?'#2c4043':'#35494b';
    ctx.beginPath();ctx.moveTo(x,y+16);ctx.lineTo(x-8,y+9);ctx.lineTo(x-3,y+8);ctx.lineTo(x-6,y+5);ctx.lineTo(x-2,y+4);
    ctx.lineTo(x,y-7);ctx.lineTo(x+3,y+3);ctx.lineTo(x+7,y+8);ctx.lineTo(x+3,y+7);ctx.lineTo(x+8,y+11);ctx.closePath();ctx.fill();
  }
  for(let house=0;house<7;house++){
    const x=-58+house*148, w=120+noise(house,3)*19, top=110+noise(house,5)*31;
    const y=top+27, ridge=x+w*(.4+noise(house,4)*.2);
    ctx.fillStyle=['#36413f','#40483e','#313d3d'][house%3]!;
    ctx.fillRect(x,y,w,100);ctx.fillStyle='#283135';ctx.fillRect(x+w*.73,top-5,11,31);
    ctx.fillStyle='#283638';ctx.beginPath();ctx.moveTo(x-7,y+3);ctx.lineTo(ridge,top-13);ctx.lineTo(x+w+5,y+4);ctx.closePath();ctx.fill();
    ctx.save();ctx.clip();
    for(let tile=0;tile<220;tile++){
      const tx=x+noise(tile,2)*w,ty=top-12+noise(tile,3)*42;
      ctx.strokeStyle=tile%3?'#78908a35':'#121f274d';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx+4+noise(tile,5)*6,ty-1);ctx.stroke();
    }
    ctx.restore();
    for(let course=0;course<10;course++){
      const sy=y+7+course*4;
      ctx.strokeStyle='#182b2c55';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x+1,sy);ctx.lineTo(x+w-2,sy);ctx.stroke();
    }
    ctx.strokeStyle='#69716b';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-6,y+2);ctx.lineTo(ridge,top-13);ctx.stroke();
    for(let j=0;j<3;j++){
      const wx=x+12+j*32, wy=y+12+noise(j,house+2)*10, lit=(j+house+garden)%4===0;
      if(lit)lightPool(ctx,wx+7,wy+10,28,26,'#dbab5f32');
      ctx.fillStyle='#29312e';ctx.fillRect(wx-2,wy-2,15,24);
      ctx.fillStyle=lit?'#c2aa77':'#536367';ctx.fillRect(wx,wy,11,19);
      ctx.fillStyle='#384139';ctx.fillRect(wx+4,wy,2,19);ctx.fillRect(wx,wy+7,11,2);
    }
  }
  // Telecommunication cable and ivy soften the straight roofline and give the garden depth.
  ctx.strokeStyle='#273738';ctx.lineWidth=1.4;
  ctx.beginPath();ctx.moveTo(-12,67+garden*9);ctx.quadraticCurveTo(200,118,455,83);ctx.quadraticCurveTo(680,128,920,99);ctx.stroke();
  ctx.fillStyle='#202e2e';ctx.fillRect(0,218,900,172);
  for(let i=0;i<92;i++){
    const x=i*10, y=178+noise(i,13)*9;
    ctx.fillStyle=['#44514b','#39483f','#425047','#3b4842'][i%4]!;ctx.fillRect(x,y,9.6,246-y);
    ctx.fillStyle='#83908463';ctx.fillRect(x+1,y,1.2,246-y);
    ctx.fillStyle='#1e2e27';ctx.fillRect(x+5,y+7+noise(i,1)*10,1,16+noise(i,3)*12);
  }
  ctx.strokeStyle='#26342c';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,222);ctx.lineTo(900,222);ctx.stroke();
  const soil=ctx.createLinearGradient(0,239,0,390);
  soil.addColorStop(0,'#303e35');soil.addColorStop(.4,'#505247');soil.addColorStop(.53,'#3a4138');soil.addColorStop(.9,'#142622');
  ctx.fillStyle=soil;ctx.fillRect(0,241,900,149);
  for(let i=0;i<6200;i++) {
    const x=noise(i,1)*900, y=243+noise(i,4)*147;
    ctx.fillStyle=i%3?'#162a273c':'#a6ab8f39';
    ctx.fillRect(x,y,1.2+noise(i,5)*(y>280&&y<307?8:3),.6+noise(i,8));
  }
  // Wheel ruts catch the window light in small pools on the far edge of the path.
  for(let i=0;i<44;i++) {
    const x=noise(i,4)*900,y=283+noise(i,7)*20;
    ctx.fillStyle='#768a841f';ctx.beginPath();ctx.ellipse(x,y,4+noise(i,2)*15,1.2+noise(i,4)*1.7,0,0,Math.PI*2);ctx.fill();
  }
  // Foreground weeds frame the camera without obscuring the crossing or its floor markings.
  for(let i=0;i<520;i++){
    const x=noise(i,14)*900,y=348+noise(i,15)*50;
    ctx.strokeStyle=i%2?'#162923':'#2e4034';ctx.lineWidth=1+noise(i,6)*1.2;ctx.beginPath();ctx.moveTo(x,y);
    ctx.quadraticCurveTo(x-2,y-8,x+(noise(i,16)-.5)*14,y-4-noise(i,17)*17);ctx.stroke();
  }
  backgrounds.set(garden,background);
  return background;
}

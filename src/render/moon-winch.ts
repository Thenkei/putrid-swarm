import { smoothstep } from './noise';

// Coordinates in the 900 × 420 gate painting. The axle is bolted to the right
// upright; both the painted grip and its native control use this crank angle.
const axle = { x: 489, y: 226 };
export const gatePitch = .11;
export const gateSlopeAt = (x: number) => (x - 350) * gatePitch;

export function winchGrip(lift: number) {
  const angle = -.98 + 2.48 * smoothstep(0, 84, lift);
  return { x: axle.x + 31 * Math.cos(angle) + 8, y: axle.y + 32 * Math.sin(angle) - 2 };
}

export function drawWinch(ctx: CanvasRenderingContext2D, lift: number, ironwork: HTMLImageElement) {
  const { x, y } = axle;
  const grip = winchGrip(lift);
  const tipX = grip.x - 8, tipY = grip.y + 2;
  ctx.save();
  ctx.lineCap = 'round';
  function stroke(x1: number, y1: number, x2: number, y2: number, width: number, ink: string | CanvasGradient) {
    ctx.strokeStyle = ink; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // The return cable rides over the existing overhead pulley and winds onto the drum.
  stroke(400, 134, 477, 210, 2.7, '#252626');
  stroke(401, 134, 478, 210, .8, '#9a9180');
  const iron = ctx.createLinearGradient(x - 19, y - 18, x + 7, y + 15);
  iron.addColorStop(0, '#969083'); iron.addColorStop(.16, '#514c46');
  iron.addColorStop(.58, '#352f2b'); iron.addColorStop(1, '#211e1b');
  ctx.fillStyle = '#1c1c1bbf'; ctx.fillRect(x - 19, y - 15, 27, 37);
  ctx.fillStyle = iron; ctx.fillRect(x - 21, y - 18, 26, 36);
  if (ironwork.naturalWidth) {
    // The mounting plate carries the same pitting, rivets and edge light as the gate.
    ctx.save(); ctx.translate(x-8,y); ctx.rotate(Math.PI/2);
    ctx.drawImage(ironwork, 149, 69, 55, 40, -18, -13, 36, 26); ctx.restore();
  }
  for (const yy of [-14, 14]) {
    stroke(x - 17,y+yy,x-15,y+yy-1,3,'#262323');
    stroke(x - 17,y+yy-1,x-16,y+yy-1,1,'#c2b39d');
  }
  ctx.fillStyle = '#252321'; ctx.beginPath(); ctx.ellipse(x-8,y,12,13,-.1,0,Math.PI*2); ctx.fill();
  for (let i = 0; i < 6; i++) {
    ctx.beginPath(); ctx.ellipse(x-12+i*2,y,5,10,-.14,Math.PI, 2.7 * Math.PI);
    ctx.strokeStyle = i % 2 ? '#797369' : '#524b41'; ctx.lineWidth = 1.7; ctx.stroke();
  }
  ctx.fillStyle = iron; ctx.beginPath(); ctx.arc(x,y,9,0,Math.PI*2); ctx.fill();
  stroke(x+2,y+2,tipX+2,tipY+2,6,'#1b1c1ac7');
  stroke(x,y,tipX,tipY,5.8,iron); stroke(x,y-1,tipX,tipY-1,1.3,'#aaa08d');
  if (ironwork.naturalWidth) {
    ctx.save(); ctx.translate(x,y); ctx.rotate(Math.atan2(tipY-y,tipX-x));
    ctx.drawImage(ironwork, 292, 75, 76, 21, 1, -2, Math.hypot(tipX-x,tipY-y)-1, 4.5); ctx.restore();
  }
  ctx.fillStyle = '#b3a793'; ctx.fillRect(x-2,y-2,4,3);
  // A worn wooden sleeve projects towards the camera. Its lit lip remains
  // visible against both the pale field and the dark upright during the stroke.
  const wood = ctx.createLinearGradient(0,tipY-8,0,tipY+4);
  wood.addColorStop(0,'#d0b18a'); wood.addColorStop(.28,'#997653');
  wood.addColorStop(.60,'#735337'); wood.addColorStop(1,'#3c3026');
  stroke(tipX-1,tipY+1,tipX+17,tipY-4,9,'#292623');
  stroke(tipX+1,tipY,tipX+16,tipY-4,7,wood);
  stroke(tipX+2,tipY-2,tipX+14,tipY-5,1,'#c7aa81');
  stroke(tipX+4,tipY+1,tipX+12,tipY-1,.6,'#563e2c');
  stroke(tipX+2,tipY-2,tipX+3,tipY+2,1.5,'#716558');
  ctx.restore();
}

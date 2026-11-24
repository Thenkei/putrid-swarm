import type { CoastDrive } from '../core/coast-home';
import { smoothstep } from '../core/math';
import { drawCoastGround } from './coast-ground';
import { coastCamera, coastGatePosts, coastWalkerPosition, GATE_AT, type CoastArt } from './coast-road';
import { drawMobStride } from './infected';

const focal = 47;
const eye = 1.28;

// The upper body is the same painted figure at every distance. Its coat and
// legs extend below the rear sill when it draws level with the back of the car.
function listener(ctx: CanvasRenderingContext2D, art: HTMLImageElement, turn: number, gait: number) {
  const half = art.naturalWidth / 2;
  const stride = Math.sin(gait * Math.PI * 2);
  ctx.strokeStyle = '#414039'; ctx.lineWidth = .115; ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(.10 * side, -.86);
    ctx.lineTo(side * (.11 + .06 * stride), -.38);
    ctx.lineTo(side * (.12 + .09 * stride), -.025); ctx.stroke();
  }
  const tall = .85, wide = tall * half / art.naturalHeight * .74;
  const blend = smoothstep(.32, .72, turn);
  ctx.save(); ctx.translate(0, -1.71 + .014 * Math.cos(gait * 4 * Math.PI));
  ctx.scale(1 - .12 * Math.sin(Math.PI * turn), 1);
  // Carry the painted folds of each lapel down to the coat hem. A tapered
  // strip leaves the sides ragged at long range and also survives a close look.
  const side = blend > .5 ? 1 : 0;
  const left = side ? -.56 : -.46;
  const slices = 5;
  for (let j = 0; j < slices; j++) {
    const taper = 1 - .16 * j / slices;
    ctx.drawImage(art, side * half, art.naturalHeight * .84, half, art.naturalHeight * .14,
      left * wide * taper, tall * .94 + j * .056, wide * taper, .068);
  }
  if (blend < 1) ctx.drawImage(art, 0, 0, half, art.naturalHeight, -.46 * wide, 0, wide, tall);
  if (blend > 0) {
    ctx.globalAlpha = blend;
    ctx.drawImage(art, half, 0, half, art.naturalHeight, -.56 * wide, 0, wide, tall);
  }
  ctx.restore();
}

function parcelShelf(ctx: CanvasRenderingContext2D, rattle: number) {
  ctx.fillStyle = '#242b2c'; ctx.beginPath();
  ctx.moveTo(306, 63); ctx.quadraticCurveTo(364, 58.3, 401, 58.3);
  ctx.quadraticCurveTo(427, 58.4, 442, 55.7); ctx.lineTo(445, 65); ctx.closePath(); ctx.fill();
  // Preserving jar on the passenger side. Its lid catches the sky when the glass rocks.
  ctx.save(); ctx.translate(418, 58.6);
  ctx.rotate(.14 * rattle * Math.sin(rattle * Math.PI * 4));
  ctx.fillStyle = 'rgba(51,52,39,.86)'; ctx.strokeStyle = '#737e74'; ctx.lineWidth = .34;
  ctx.beginPath(); ctx.moveTo(-1.7, -6); ctx.lineTo(1.5, -6); ctx.lineTo(1.5, -5);
  ctx.quadraticCurveTo(2.4, -4.8, 2.4, -3.8); ctx.lineTo(2.4, -.4);
  ctx.quadraticCurveTo(0, .2, -2.3, -.3); ctx.lineTo(-2.3, -4); ctx.lineTo(-1.7, -5); ctx.closePath();
  ctx.fill(); ctx.stroke(); ctx.fillStyle = '#6d4c37'; ctx.fillRect(-1.8, -2.2, 3.75, 1.9);
  ctx.fillStyle = '#a79b7e'; ctx.fillRect(-2.15, -6.25, 4.1, .65);
  ctx.restore();
}

export function reflection(ctx: CanvasRenderingContext2D, art: CoastArt, d: CoastDrive, age: number, alertAge: number, reduced: boolean) {
  const front = coastCamera(d, reduced);
  // An interior mirror reverses a rear-facing camera. The driver's left stays on the left.
  const camera = { x: front.x, z: front.z, centre: 375 - (front.centre - 320) * focal / 306, horizon: 46 };
  ctx.fillStyle = '#344349'; ctx.fillRect(305, 26, 140, 40);
  if (art.woods.complete && art.woods.naturalWidth) {
    const scale = focal / (85 + d.metres);
    const w = 340 * scale, h = w * art.woods.naturalHeight / art.woods.naturalWidth;
    ctx.save(); ctx.translate(camera.centre - camera.x * scale, camera.horizon + eye * scale);
    ctx.scale(-1, 1); ctx.drawImage(art.woods, -w / 2, -.48 * h, w, h); ctx.restore();
  }
  drawCoastGround(ctx, art.lane, camera, focal, eye, 62, -1);
  const gateDepth = d.metres - GATE_AT;
  if (gateDepth > .4 && art.posts.complete && art.posts.naturalWidth) {
    const scale = focal / gateDepth, half = art.posts.naturalWidth / 2;
    coastGatePosts.forEach((post, i) => {
      const x = camera.centre + scale * (post.x - camera.x);
      const h = scale * 2.05, w = h * half / art.posts.naturalHeight;
      ctx.drawImage(art.posts, i * half, 0, half, art.posts.naturalHeight, x - (i ? .76 : .25) * w, camera.horizon + eye * scale - h, w, h);
    });
  }
  for (const i of [0, 1]) {
    const walker = coastWalkerPosition(d, i);
    const behind = d.metres - walker.z;
    if (behind < .35) continue;
    const pursuit = d.heard && i === 0 ? smoothstep(0, 3.4, behind) * smoothstep(.2, 2.6, alertAge) : 0;
    const depth = behind - pursuit * Math.max(0, behind - 1.65);
    const x = walker.x + pursuit * (camera.x - .3 - walker.x);
    const scale = focal / depth;
    const mx = camera.centre + scale * (x - camera.x);
    if (mx + scale < 309 || mx - scale > 440) continue;
    const turn = d.heard ? smoothstep(.1 + i * .4, 1.12 + i * .4, alertAge) : 0;
    const phase = reduced ? .25 : (d.walkerTravel * 1.65 + i * .31 + pursuit * age * .64) % 1;
    ctx.save(); ctx.translate(mx, camera.horizon + scale * eye);
    if (!i && art.listener.complete && art.listener.naturalWidth) {
      ctx.scale(scale, scale); listener(ctx, art.listener, turn, phase);
    } else drawMobStride(ctx, 'shambler', phase, scale * 1.66, turn > .5);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(25,47,66,.16)'; ctx.fillRect(305, 26, 140, 39);
  parcelShelf(ctx, reduced ? 0 : d.jarRattle);
}

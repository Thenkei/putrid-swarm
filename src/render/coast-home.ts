import { type CoastDrive } from '../core/coast-home';
import { smoothstep } from '../core/math';
import { sprite } from '../engine/assets';
import { drawMobStride } from './infected';
import { GATE_AT, paintRoad, type CoastArt } from './coast-road';

const cabinOutline = 'M0 0H640V360H0Z M42 59Q43 31 61 26Q90 18 172 18L580 18Q632 17 630 41L590 253Q589 270 575 268L552 255Q471 246 404 249L344 249Q312 241 263 246L203 249Q135 245 68 269Q59 270 56 258Z M0 168L17 278Q18 287 0 289Z M640 170L630 276Q628 283 640 286Z';
const mirrorOutline = 'M354 0H395V14L383 17L382 26L435 27Q446 29 446 42L445 55Q445 65 435 66H314Q303 66 304 55L306 36Q307 26 320 26H367L366 18L358 15Z';
const glassOutline = 'M312 36Q313 31 321 31L433 32Q439 32 439 40L439 55Q439 60 432 60H317Q310 60 310 53Z';
let mask: { cabin: Path2D; mirror: Path2D; glass: Path2D } | undefined;

function reflection(ctx: CanvasRenderingContext2D, art: CoastArt, d: CoastDrive, age: number, alertAge: number, reduced: boolean) {
  ctx.fillStyle = '#273540'; ctx.fillRect(306, 26, 140, 39);
  if (art.hedge.complete && art.hedge.naturalWidth) {
    const w = art.hedge.naturalWidth, h = art.hedge.naturalHeight;
    ctx.save(); ctx.translate(445, 0); ctx.scale(-1, 1);
    ctx.drawImage(art.hedge, (.012 + d.metres * .003) * w, h * .29, w * .40, h * .31, -2 + d.lane, 28, 151, 38);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(39,62,80,.22)'; ctx.fillRect(306, 26, 140, 39);
  const gateBehind = d.metres - GATE_AT;
  if (gateBehind > .65 && art.posts.complete && art.posts.naturalWidth) {
    const scale = 47 / gateBehind, half = art.posts.naturalWidth / 2;
    for (const side of [-1, 1]) {
      const postX = side < 0 ? -3.15 : 3.45;
      const x = 380 + scale * (postX - d.lane * 1.64);
      const h = scale * 2.05, w = h * half / art.posts.naturalHeight;
      ctx.drawImage(art.posts, side < 0 ? 0 : half, 0, half, art.posts.naturalHeight,
        x - (side < 0 ? .25 : .76) * w, 48 + scale * 1.28 - h, w, h);
    }
  }
  // The second walker lags. Only the one nearest the car can catch up to the rear glass.
  for (const i of [1, 0]) {
    const behind = d.metres - (8.05 + 1.7 * i);
    if (behind <= .45) continue;
    const chasing = d.heard && !i;
    const depth = Math.max(1.62, behind - (chasing ? Math.min(behind - 1.62, alertAge * .85) : 0));
    const lateral = -2.35 - .32 * i - d.lane * 1.64 + (chasing ? 1.70 * smoothstep(.1, 3, alertAge) : 0);
    // Clip at the edge naturally while the walker passes the left rear corner of the wagon.
    const mx = 380 + 47 * lateral / Math.max(.48, behind < 1.62 ? behind : depth);
    const scale = 53 / depth;
    const feet = 48 + scale * 1.28;
    const turn = d.heard ? smoothstep(i * .48, .8 + i * .48, alertAge) : 0;
    if (i || depth > 4.6 || !art.listener.complete || !art.listener.naturalWidth) {
      ctx.save(); ctx.translate(mx, feet);
      drawMobStride(ctx, 'shambler', reduced || d.heard ? .27 : (age * .42 + .31 * i) % 1, scale * 1.66, turn > .5);
      ctx.restore();
    }
    if (!i && depth < 5.3 && art.listener.complete && art.listener.naturalWidth) {
      const half = art.listener.naturalWidth / 2;
      const tall = scale * 1.14, wide = tall * half / art.listener.naturalHeight;
      const y = feet - scale * 1.72 + (reduced ? 0 : .35 * Math.sin(age * 2.5));
      ctx.save(); ctx.globalAlpha = 1 - smoothstep(4.6, 5.3, depth);
      const side = turn > .48 ? 1 : 0;
      ctx.translate(mx, y);
      ctx.scale(1 - .20 * Math.sin(Math.PI * turn), 1);
      ctx.drawImage(art.listener, side * half, 0, half, art.listener.naturalHeight, -wide / 2, 0, wide, tall);
      ctx.restore();
    }
  }
  const glint = ctx.createLinearGradient(312, 30, 439, 60);
  glint.addColorStop(0, 'rgba(191,210,216,.13)'); glint.addColorStop(.4, 'rgba(145,173,186,.02)'); glint.addColorStop(1, 'rgba(18,29,34,.09)');
  ctx.fillStyle = glint; ctx.fillRect(306, 27, 140, 38);
}

export function drawCoast(ctx: CanvasRenderingContext2D, art: CoastArt, drive: CoastDrive, age: number, alertAge: number, reduced: boolean, health: number): void {
  const cabin = sprite('plate_drive_cabin');
  ctx.save(); ctx.scale(2, 2);
  ctx.fillStyle = '#202938'; ctx.fillRect(0, 0, 640, 360);
  paintRoad(ctx, art, drive, age, alertAge, reduced, health);
  const beam = drive.phase === 'ready' || drive.phase === 'powered' ? .28 : .28 * Math.max(0, 1 - drive.metres * 3.8);
  if (beam > 0) {
    ctx.save(); ctx.translate(316, 216); ctx.scale(1, .19);
    const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 230);
    glow.addColorStop(0, 'rgba(255,215,145,' + beam + ')'); glow.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = glow; ctx.fillRect(-230, -230, 460, 460); ctx.restore();
  }
  if (cabin) {
    mask ??= { cabin: new Path2D(cabinOutline), mirror: new Path2D(mirrorOutline), glass: new Path2D(glassOutline) };
    ctx.save(); ctx.clip(mask.cabin, 'evenodd');
    ctx.drawImage(cabin.img, 0, 0, 640, 360);
    ctx.fillStyle = 'rgba(12,22,41,.48)'; ctx.fillRect(0, 0, 640, 360);
    ctx.restore();
    // A fraying leather wrap makes steering legible against the painted wheel rim.
    ctx.save();
    ctx.translate(164, 423); ctx.rotate(drive.wheel * .68);
    ctx.strokeStyle = '#443d33'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(0, 0, 120, -1.63, -1.52); ctx.stroke();
    for (const edge of [-1.625, -1.59, -1.555, -1.525]) {
      ctx.strokeStyle = '#94836a'; ctx.lineWidth = .85;
      ctx.beginPath(); ctx.moveTo(115.8 * Math.cos(edge), 115.8 * Math.sin(edge));
      ctx.lineTo(124 * Math.cos(edge + .014), 124 * Math.sin(edge + .014)); ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(376, 7); ctx.scale(1.24, 1.30); ctx.translate(-376, -7);
    ctx.save(); ctx.clip(mask.mirror);
    ctx.drawImage(cabin.img, 0, 0, 640, 360);
    ctx.fillStyle = 'rgba(8,19,34,.44)'; ctx.fillRect(301, 0, 148, 69); ctx.restore();
    ctx.clip(mask.glass);
    reflection(ctx, art, drive, age, alertAge, reduced);
    ctx.restore();
  }
  ctx.restore();
}

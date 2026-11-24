import type { CoastDrive } from '../core/coast-home';
import { sprite } from '../engine/assets';
import { reflection } from './coast-mirror';
import { paintRoad, type CoastArt } from './coast-road';

const cabinOutline = 'M0 0H640V360H0Z M42 59Q43 31 61 26Q90 18 172 18L580 18Q632 17 630 41L590 253Q589 270 575 268L552 255Q471 246 404 249L344 249Q312 241 263 246L203 249Q135 245 68 269Q59 270 56 258Z M0 168L17 278Q18 287 0 289Z M640 170L630 276Q628 283 640 286Z';
const mirrorOutline = 'M354 0H395V14L383 17L382 26L435 27Q446 29 446 42L445 55Q445 65 435 66H314Q303 66 304 55L306 36Q307 26 320 26H367L366 18L358 15Z';
const glassOutline = 'M312 36Q313 31 321 31L433 32Q439 32 439 40L439 55Q439 60 432 60H317Q310 60 310 53Z';
let mask: { cabin: Path2D; mirror: Path2D; glass: Path2D } | undefined;

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

import { COAST_METRES, type CoastDrive } from '../core/coast-home';
import { sprite } from '../engine/assets';
import { drawMobStride } from './infected';

const cabinOutline = 'M0 0H640V360H0Z M42 59Q43 31 61 26Q90 18 172 18L580 18Q632 17 630 41L590 253Q589 270 575 268L552 255Q471 246 404 249L344 249Q312 241 263 246L203 249Q135 245 68 269Q59 270 56 258Z M0 168L17 278Q18 287 0 289Z M640 170L630 276Q628 283 640 286Z';
const mirrorOutline = 'M354 0H395V14L383 17L382 26L435 27Q446 29 446 42L445 55Q445 65 435 66H314Q303 66 304 55L306 36Q307 26 320 26H367L366 18L358 15Z';
const glassOutline = 'M312 36Q313 31 321 31L433 32Q439 32 439 40L439 55Q439 60 432 60H317Q310 60 310 53Z';
let mask: { cabin: Path2D; mirror: Path2D; glass: Path2D } | undefined;
function figure(ctx: CanvasRenderingContext2D, front: boolean, x: number, y: number, height: number, stride: number, turn: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(16,20,26,.47)';
  ctx.beginPath(); ctx.ellipse(x, y, height * .19, height * .033, -.05, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x, y);
  ctx.scale(1 - .45 * Math.sin(Math.PI * turn), 1);
  const phase = stride / (2 * Math.PI) % 1;
  if (!drawMobStride(ctx, 'shambler', phase, height, front)) {
    const still = sprite(front ? 'en_shambler_front' : 'en_shambler_back');
    if (still) {
      const width = height * still.w / still.h;
      ctx.drawImage(still.img, -width / 2, -height, width, height);
    }
  }
  ctx.restore();
}

function smooth(n: number): number {
  const x = Math.max(0, Math.min(1, n));
  return x * x * (3 - 2 * x);
}

export function drawCoast(ctx: CanvasRenderingContext2D, gate: HTMLImageElement, drive: CoastDrive, age: number, alertAge: number, reduced: boolean): void {
  const { metres, lane, phase, speed } = drive;
  const p = metres / COAST_METRES;
  const cabin = sprite('plate_drive_cabin');
  const view = gate.complete && gate.naturalWidth > 0 ? gate : cabin?.img;
  ctx.save();
  ctx.scale(2, 2);
  ctx.fillStyle = '#202938';
  ctx.fillRect(0, 0, 640, 360);
  const zoom = 1.14 + (reduced ? .25 : .88) * p * (.68 + .32 * p);
  const width = 642 * zoom;
  const height = width * 9 / 16;
  const bob = reduced ? 0 : Math.sin(metres * 7.2) * speed * (drive.grass ? .32 : .82);
  const ox = 320 - width * (.5 + .085 * p) - lane * (reduced ? 13 : 38);
  const oy = 144 - height * .51 + bob;
  if (view) ctx.drawImage(view, ox, oy, width, height);
  const turnAt = (i: number) => drive.heard ? smooth((alertAge - i * .36) / .74) : 0;
  const pose = (i: number) => turnAt(i) > .48;
  for (let i = 0; i < 2; i++) {
    const slip = smooth((p - .06) / .56);
    const stride = reduced ? i * 2 : (i * 2.7 + age * (drive.heard ? 1.2 : 2.9));
    const ground = oy + height * (.654 - .035 * i + .31 * slip);
    const x = ox + width * (.294 + .039 * i - .51 * slip) + Math.sin(stride) * .6;
    figure(ctx, pose(i), x, ground, height * (.17 - .022 * i + .12 * slip), stride, turnAt(i));
  }

  // The dipped beams roll off the wet gravel as the ignition dies.
  const beam = phase === 'ready' || phase === 'powered' ? .22 : phase === 'rolling' ? .20 * Math.max(0, 1 - metres * 4) : 0;
  if (beam > 0) {
    ctx.save();
    ctx.translate(315, 215);
    ctx.scale(1, .21);
    const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 230);
    glow.addColorStop(0, 'rgba(255,215,145,' + beam + ')');
    glow.addColorStop(1, 'rgba(255,210,140,0)');
    ctx.fillStyle = glow; ctx.fillRect(-230, -230, 460, 460);
    ctx.restore();
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
    ctx.translate(376, 7); ctx.scale(1.18, 1.15); ctx.translate(-376, -7);
    ctx.save(); ctx.clip(mask.mirror);
    ctx.drawImage(cabin.img, 0, 0, 640, 360);
    ctx.fillStyle = 'rgba(8,19,34,.44)'; ctx.fillRect(301, 0, 148, 69); ctx.restore();
    ctx.clip(mask.glass);
    ctx.fillStyle = '#283240'; ctx.fillRect(306, 27, 140, 38);
    if (view) {
      const iw = view.naturalWidth, ih = view.naturalHeight;
      ctx.save(); ctx.translate(444, 0); ctx.scale(-1, 1);
      ctx.drawImage(view, iw * .025, ih * .27, iw * .23, ih * .37, -.5 + lane * 1.5, 29, 145, 36);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(64,85,101,.26)'; ctx.fillRect(306, 27, 140, 38);
    for (let i = 0; i < 2; i++) {
      const inView = smooth((p - .32 - i * .055) / .21);
      const size = (drive.heard ? 32 : 26) - 5 * p - 3 * i;
      const x = 447 + 12 * i - inView * (drive.heard ? 76 - 15 * i : 85 + 6 * i) + lane * 2 - (drive.heard ? 0 : 13 * smooth((p - .65) / .35));
      figure(ctx, pose(i), x, 60 - i * 1.8, size, reduced ? 0 : age * 2.5 + i, turnAt(i));
    }
    const glint = ctx.createLinearGradient(312, 30, 439, 60);
    glint.addColorStop(0, 'rgba(191,210,216,.18)'); glint.addColorStop(.4, 'rgba(145,173,186,.03)'); glint.addColorStop(1, 'rgba(18,29,34,.10)');
    ctx.fillStyle = glint; ctx.fillRect(306, 27, 140, 38);
    ctx.restore();
  }
  ctx.restore();
}

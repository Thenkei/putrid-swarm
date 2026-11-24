import type { PackTrail } from '../core/epics';
import { hash2 } from './noise';
import { groundMatrix, type View } from './projection';

// Local ground units. +y points out along the drive. Both views use the same
// footprint arrangements, registered to their own gate rather than to the screen.
const sheets = new Map<PackTrail, HTMLCanvasElement>();
const width = 206, height = 191, left = -104, top = -48;

function paw(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, turn: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(turn); ctx.scale(size, size);
  const pad = new Path2D();
  pad.moveTo(-3.6, -1.7);
  pad.bezierCurveTo(-4.8, -6, -2, -5.6, -.7, -4.8);
  pad.bezierCurveTo(2.8, -6.7, 5.6, -4.5, 3.3, -1.6);
  pad.quadraticCurveTo(0, 3.6, -3.6, -1.7);
  for (let i = 0; i < 4; i++) {
    const dx = (i - 1.5) * 2.55, dy = i === 1 || i === 2 ? 4.4 : 1.9;
    pad.moveTo(dx + 1.02, dy);
    pad.ellipse(dx, dy, 1.02, 1.85, (1.5 - i) * .22, 0, Math.PI * 2);
  }
  ctx.translate(-.45, 1);
  ctx.fillStyle = '#d5b684af'; ctx.fill(pad);
  ctx.translate(.45, -1);
  ctx.fillStyle = '#342b24'; ctx.fill(pad);
  ctx.fillStyle = '#17191c';
  ctx.beginPath(); ctx.ellipse(.2, -2.8, 2.8, 1.25, .12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function loosenedEarth(ctx: CanvasRenderingContext2D) {
  ctx.save(); ctx.translate(-41, 11); ctx.rotate(-.28);
  // A shallow hollow with a broken lip and spoil kicked back towards the grass.
  const hollow = new Path2D();
  for (let i = 0; i < 23; i++) {
    const a = i / 23 * Math.PI * 2, edge = .85 + .15 * hash2(i, 2, 16);
    const x = Math.cos(a) * 13 * edge, y = Math.sin(a) * 8 * edge;
    if (i === 0) hollow.moveTo(x, y); else hollow.lineTo(x, y);
  }
  hollow.closePath();
  const wall = ctx.createLinearGradient(0, -8, 0, 8);
  wall.addColorStop(0, '#b29468'); wall.addColorStop(.18, '#514336');
  wall.addColorStop(.38, '#312c25'); wall.addColorStop(.72, '#4f4233'); wall.addColorStop(1, '#867153');
  ctx.fillStyle = wall; ctx.fill(hollow);
  ctx.save(); ctx.clip(hollow);
  for (let i = 0; i < 73; i++) {
    ctx.fillStyle = i % 3 ? '#a4906f77' : '#241d18';
    ctx.fillRect(-13 + 26 * hash2(i, 3, 12), -8 + 16 * hash2(i, 6, 7), .65 + hash2(i, 8, 11), .55);
  }
  ctx.restore();
  for (let i = 0; i < 30; i++) {
    const angle = hash2(i, 8, 7) * Math.PI + .08, reach = 9 + hash2(i, 3, 6) * 15;
    const x = Math.cos(angle) * reach, y = Math.sin(angle) * reach * .74;
    const r = .75 + hash2(i, 6, 9) * 2.45;
    ctx.beginPath(); ctx.moveTo(x - r, y);
    ctx.lineTo(x - r * .55, y - r); ctx.lineTo(x + r * .8, y - r * .55);
    ctx.lineTo(x + r, y + r * .5); ctx.lineTo(x - r * .75, y + r * .58); ctx.closePath();
    ctx.fillStyle = i % 3 === 0 ? '#544231' : '#796046'; ctx.fill();
    ctx.strokeStyle = '#b09469'; ctx.lineWidth = .63; ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x - r * .55, y - r); ctx.lineTo(x + r * .52, y - r * .65); ctx.stroke();
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const x = -7 + i * 3.2;
    ctx.beginPath(); ctx.moveTo(x, -1.5);
    ctx.quadraticCurveTo(x + .8, 6, x + 5.8, 10.8 - Math.abs(i - 1) * 1.4);
    ctx.strokeStyle = '#392c20'; ctx.lineWidth = 1.05; ctx.stroke();
  }
  ctx.restore();
}

function trailSheet(trail: PackTrail): HTMLCanvasElement {
  const cached = sheets.get(trail);
  if (cached) return cached;
  const sheet = document.createElement('canvas');
  sheet.width = width * 2; sheet.height = height * 2;
  const ctx = sheet.getContext('2d')!;
  ctx.scale(2, 2); ctx.translate(-left, -top);
  if (trail === 'together') {
    for (let row = 0; row < 3; row++) {
      const small = row === 1;
      for (let i = 0; i < (small ? 11 : 8); i++) {
        const y = i * (small ? 10 : 16) + row * 2;
        const x = (row - 1) * (14 + Math.max(0, 12 - y) * .22) + Math.sin(i * .71 + row) * 3;
        const side = i % 2 ? 1 : -1;
        paw(ctx, x + side * (small ? 1.7 : 3), y, small ? .54 : .91 + row * .05, side * .15);
      }
    }
  } else {
    // Both adults pace along the fence. A failed lift leaves a running pup's
    // tracks bending off towards the ditch, a closed gate leaves kicked earth.
    for (let i = 0; i < 10; i++) {
      const x = -88 + i * 18, side = i % 2 ? 1 : -1;
      paw(ctx, x, 17 + Math.sin(i * .47) * 4 + side * 2.3, .87, -1.45 + side * .16);
      paw(ctx, x + 5, 32 + Math.cos(i * .61) * 3 + side * 2.6, .93, 1.62 + side * .12);
    }
    if (trail === 'digging') {
      loosenedEarth(ctx);
      paw(ctx, -40, 45, .56, 2.79);
      paw(ctx, -37, 36, .54, 3.06);
    }
    if (trail === 'ditch') for (let i = 0; i < 9; i++) {
      paw(ctx, 11 - i * 11, 42 + Math.sin(i * .53) * 8, .55, 1.4 + i * .05);
    }
  }
  sheets.set(trail, sheet);
  return sheet;
}

export function paintedPackTrail(ctx: CanvasRenderingContext2D, trail: PackTrail) {
  ctx.save();
  ctx.transform(.94, .06, -.88, .72, 159, 323);
  ctx.drawImage(trailSheet(trail), left, top, width, height);
  ctx.restore();
}

export function yardPackTrail(ctx: CanvasRenderingContext2D, view: View, trail: PackTrail) {
  ctx.save(); ctx.transform(...groundMatrix(view));
  ctx.translate(11.05, 18.95); ctx.scale(1 / 34, 1 / 34);
  ctx.drawImage(trailSheet(trail), left, top, width, height);
  ctx.restore();
}

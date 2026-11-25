import { isEntryCell, sectorOf } from '../core/map';
import type { Decal, SectorId } from '../core/types';
import { sprite } from '../engine/assets';
import { THRESHOLDS, VISIBLE_DOORS } from '../house-layout';
import { hash2, seeded } from './noise';
import { groundMatrix, project, type View } from './projection';

// Transparent top-down stamps are projected onto the yard like its terrain. They stay on the
// same patch of soil when the camera turns. Only the choice of stamp varies between cells.
const stamps = new Map<number, HTMLCanvasElement>();
const SIZE = 96;

function debrisStamp(variant: number): HTMLCanvasElement {
  const cached = stamps.get(variant);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const c = canvas.getContext('2d')!;
  const random = seeded(variant + 775);
  for (let i = 0; i < 8; i++) {
    const length = 5 + random() * 19;
    const width = 1.5 + random() * 3;
    c.save();
    c.translate(19 + random() * 58, 19 + random() * 58);
    c.rotate(random() * Math.PI);
    c.fillStyle = 'rgba(42,33,24,0.5)';
    c.fillRect(-1, 1.6, length, width);
    c.fillStyle = i % 2 ? '#987348' : '#78563a';
    c.beginPath();
    c.moveTo(-1, 0);
    c.lineTo(length, -width * 0.3);
    c.lineTo(length - 4, width);
    c.lineTo(1, width * 0.8);
    c.fill();
    c.fillStyle = '#c4a379';
    c.fillRect(1, 0, length * 0.7, 0.9);
    c.restore();
  }
  stamps.set(variant, canvas);
  return canvas;
}

export type DoorstepDecals = Partial<Record<SectorId, Decal[]>>;

export function drawDecals(ctx: CanvasRenderingContext2D, view: View, decals: readonly Decal[], doorsteps?: DoorstepDecals): void {
  if (decals.length === 0) return;
  ctx.save();
  ctx.transform(...groundMatrix(view));
  for (const decal of decals) {
    if (decal.kind === 'mown') continue;
    // Entry cells cannot hold devices. Their debris comes from the barricade at the painted sill.
    const breach = decal.kind === 'debris' && isEntryCell(decal.x, decal.y) ? sectorOf(decal.x, decal.y) : undefined;
    const sector = breach ?? decal.at?.threshold;
    if (doorsteps && sector && VISIBLE_DOORS[view.rot].includes(sector)) {
      (doorsteps[sector] ??= []).push(decal);
      continue;
    }
    const variation = hash2(decal.x, decal.y, 148);
    ctx.save();
    if (breach) {
      const sill = THRESHOLDS[breach];
      ctx.translate(sill.gx, sill.gy);
    } else {
      ctx.translate(decal.at?.x ?? decal.x + 0.5, decal.at?.y ?? decal.y + 0.5);
    }
    if (decal.kind === 'splat') {
      const stain = sprite('fx_splat');
      if (stain) {
        ctx.rotate(variation * Math.PI * 2);
        ctx.globalAlpha *= 0.53;
        const size = 0.83 + variation * 0.19;
        ctx.drawImage(stain.img, -size / 2, -size / 2, size, size);
      }
    } else {
      ctx.drawImage(debrisStamp(Math.floor(variation * 4)), -0.5, -0.5, 1, 1);
    }
    ctx.restore();
  }
  ctx.restore();
}

/** The stoops are part of the house painting. Lay marks on the visible side of each sill
 * after painting the house and before drawing its boards or the figures standing there. */
export function drawDoorstepDecals(ctx: CanvasRenderingContext2D, view: View, doorsteps: DoorstepDecals): void {
  for (const sector of VISIBLE_DOORS[view.rot]) {
    const marks = doorsteps[sector];
    if (!marks?.length) continue;
    const sill = THRESHOLDS[sector], p = project(view, sill.gx, sill.gy);
    const left = view.x, right = left + view.w, bottom = view.y + view.h;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(left, p.y + (left - p.x) * sill.slope);
    ctx.lineTo(right, p.y + (right - p.x) * sill.slope);
    ctx.lineTo(right, bottom);
    ctx.lineTo(left, bottom);
    ctx.closePath();
    ctx.clip();
    drawDecals(ctx, view, marks);
    ctx.restore();
  }
}

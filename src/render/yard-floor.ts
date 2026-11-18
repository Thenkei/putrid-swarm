// Shallow detail baked into the yard before the actors and their shadows. All placements are in
// lot coordinates so the paving, plants and fallen leaves stay put when a camera changes sides.
import { GRID_H, GRID_W, PROPS } from '../core/map';
import { sprite } from '../engine/assets';
import { fbm, seeded } from './noise';
import { groundMatrix, project, type View } from './projection';
import { spriteRect } from './registration';
import { weightAt, type TerrainField } from './terrainfield';
import { vegetationView } from './vegetation';

/** The stones are painted from directly overhead, so they turn with the lot. */
function paving(ctx: CanvasRenderingContext2D, view: View): void {
  const rand = seeded(986);
  ctx.save();
  ctx.transform(...groundMatrix(view));
  const flag = (gx: number, gy: number, w: number, h: number): void => {
    const key = rand() < 0.58 ? 'yard_masonry_limestone' : 'yard_masonry_moss';
    const art = sprite(key);
    const angle = (rand() - 0.5) * 0.24;
    const flip = rand() < 0.5;
    if (!art) return;
    ctx.save();
    ctx.translate(gx + w / 2, gy + h / 2);
    ctx.rotate(angle + (flip ? Math.PI : 0));
    ctx.drawImage(art.img, -w / 2, -h / 2, w, h);
    ctx.restore();
  };
  for (let row = 0; row < 9; row++) {
    const y = 13.25 + row * 0.55;
    const x = 10.12 + Math.sin(row * 0.63) * 0.15 + rand() * 0.12;
    const span = 1.17 - row * 0.04;
    if (row % 3 === 1) {
      flag(x, y, span * 0.51, 0.43);
      flag(x + span * 0.55, y + 0.04, span * 0.42, 0.41);
    } else flag(x, y, span, 0.46 - rand() * 0.08);
  }
  for (let row = 0; row < 4; row++) flag(11.12 + rand() * 0.17, 6.65 + row * 0.56, 0.65 + rand() * 0.1, 0.42);
  ctx.restore();
}

type Scatter = 'fern' | 'straw' | 'dock' | 'leaves' | 'yarrow' | 'stones';
// A rear crop can be wider or tighter around identical debris. Height relative to the
// planting's nominal width is a world property, independent of the selected painting.
const heightAboveGround: Record<Scatter, number> = {
  fern: 0.46, straw: 0.46, dock: 0.42, leaves: 0.42, yarrow: 0.46, stones: 0.36,
};

function scatter(ctx: CanvasRenderingContext2D, view: View, gx: number, gy: number, kind: Scatter, width: number, flip: boolean): void {
  const face = vegetationView('yard_scatter', kind, flip, view.rot);
  if (!face) return;
  const { art } = face;
  const p = project(view, gx, gy);
  const top = width * heightAboveGround[kind];
  const h = top / face.foot[1];
  const w = h * art.w / art.h;
  ctx.save();
  const rect = spriteRect(p, w, h, face.foot, face.mirror);
  ctx.translate(rect.x + w / 2, rect.y);
  if (face.mirror) ctx.scale(-1, 1);
  ctx.drawImage(art.img, -w / 2, 0, w, h);
  ctx.restore();
}

/** Furrows spread a little past the vegetable beds to tie them into the lawn. */
function garden(ctx: CanvasRenderingContext2D, view: View, gx: number, gy: number, rand: () => number): void {
  ctx.save();
  ctx.transform(...groundMatrix(view));
  const bed = ctx.createRadialGradient(gx + 1, gy + 0.56, 0.15, gx + 1, gy + 0.56, 1.62);
  bed.addColorStop(0, 'rgba(73,48,26,.68)');
  bed.addColorStop(0.68, 'rgba(95,62,32,.54)');
  bed.addColorStop(1, 'rgba(109,75,37,0)');
  ctx.fillStyle = bed;
  ctx.fillRect(gx - 0.65, gy - 1.1, 3.3, 3.3);
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const x = gx - 0.19 + i * 0.48;
    ctx.strokeStyle = 'rgba(66,49,29,.42)';
    ctx.lineWidth = 0.065;
    ctx.beginPath();
    ctx.moveTo(x - rand() * 0.06, gy - 0.22);
    ctx.lineTo(x + rand() * 0.09, gy + 1.17 + rand() * 0.06);
    ctx.stroke();
  }
  ctx.restore();
}

export function dressYardFloor(ctx: CanvasRenderingContext2D, view: View, field: TerrainField): void {
  const rand = seeded(15928);
  ctx.save();
  for (const prop of PROPS) {
    if (prop.kind === 'veg') garden(ctx, view, prop.x, prop.y, rand);
    if (prop.kind === 'apple' || prop.kind === 'oak') {
      for (let i = 0; i < 7; i++) {
        const gx = prop.x + 0.55 + (rand() + rand() - 1) * 1.9;
        const gy = prop.y + 0.61 + (rand() + rand() - 1) * 1.55;
        scatter(ctx, view, gx, gy, 'leaves', 11 + rand() * 13, rand() < 0.5);
      }
    }
  }
  paving(ctx, view);

  // Plants grow in islands; litter and bracken mass at the wood's edge, slate at the shoulders
  // of the track. Keep the centres of the approaches clear for the silhouettes of infected.
  for (let i = 0; i < 860; i++) {
    const gx = rand() * (GRID_W + 4) - 2;
    const gy = rand() * (GRID_H + 4) - 2;
    const trait = rand();
    const flip = rand() < 0.5;
    const patch = fbm(gx * 0.53, gy * 0.53, 79);
    if (weightAt(field, 'forest', gx, gy) > 0.45) {
      if (patch > 0.44) scatter(ctx, view, gx, gy, trait > 0.67 ? 'fern' : 'leaves', 13 + rand() * 18, flip);
    } else if (weightAt(field, 'grass', gx, gy) > 0.6) {
      if (patch < 0.61) continue;
      const kind = trait < 0.12 ? 'yarrow' : trait < 0.55 ? 'straw' : 'dock';
      scatter(ctx, view, gx, gy, kind, 15 + rand() * 14, flip);
    } else if (trait > 0.58 && weightAt(field, 'path', gx, gy) < 0.95) {
      scatter(ctx, view, gx, gy, 'stones', 11 + rand() * 13, flip);
    }
  }
  ctx.restore();
}

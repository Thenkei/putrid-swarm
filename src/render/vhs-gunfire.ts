// These marks stay on the film where the shot was fired, even when the player changes lane.
export interface VhsShot {
  at: number;
  index: number;
  muzzleX: number;
  muzzleY: number;
  portX: number;
  portY: number;
}

export const CASE_LIFETIME = .94;
const KICKS = [0, .82, .37, .96, .21, .61, .45] as const;

/** Bounce the flash off the wet foreground tarmac. Keep the painted surface visible through it. */
export function drawVhsRoadLight(ctx: CanvasRenderingContext2D, x: number, floor: number, age: number) {
  if (age < 0 || age >= .075) return;
  ctx.save();
  ctx.translate(x, floor);
  ctx.scale(1, .28);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = (1 - age / .075) * .46;
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 58);
  glow.addColorStop(0, '#e6a157');
  glow.addColorStop(.40, '#a75832');
  glow.addColorStop(1, '#80371b00');
  ctx.fillStyle = glow;
  ctx.fillRect(-58, -58, 116, 116);
  ctx.restore();
}

export function drawVhsCasesAndSmoke(ctx: CanvasRenderingContext2D, shots: VhsShot[], time: number, floor: number) {
  ctx.save();
  for (const shot of shots) {
    const t = time - shot.at;
    if (t < 0 || t >= CASE_LIFETIME) continue;
    const variation = KICKS[shot.index % KICKS.length]!;

    // The case catches the light as it tumbles, then skips once on the tarmac.
    const landing = .53 + variation * .09;
    const progress = Math.min(1, t / landing);
    const ground = floor - 3 - variation * 8;
    const bounce = Math.min(1, Math.max(0, (t - landing) / .18));
    const x = shot.portX + (45 + 43 * variation) * progress + 12 * bounce;
    const y = shot.portY + (ground - shot.portY) * progress * progress
      - (56 + 15 * variation) * progress * (1 - progress) - 24 * bounce * (1 - bounce);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(variation * 3 + 13 * progress + 2 * bounce);
    ctx.globalAlpha = Math.min(1, (CASE_LIFETIME - t) * 7);
    ctx.fillStyle = '#31211a';
    ctx.fillRect(-4, -2, 8, 4);
    ctx.fillStyle = '#c58d44';
    ctx.fillRect(-3, -1.5, 6, 2.5);
    ctx.fillStyle = '#ffe4a2';
    ctx.fillRect(-3, -1.5, 1.5, 3);
    ctx.fillRect(-1, -1.5, 3, 1);
    ctx.restore();

    // One wisp outlasts several shots. Leave air between them during a held burst.
    if (shot.index % 3 || t < .035 || t > .52) continue;
    ctx.save();
    ctx.globalAlpha = .3 * (1 - t / .52);
    ctx.fillStyle = '#b1a396';
    ctx.beginPath();
    const drift = t * (22 + 14 * variation);
    ctx.ellipse(shot.muzzleX + drift, shot.muzzleY - 35 * t, 3 + 10 * t, 2 + 8 * t, -.6, 0, Math.PI * 2);
    ctx.ellipse(shot.muzzleX + 4 + drift, shot.muzzleY - 5 - 44 * t, 2 + 8 * t, 2 + 6 * t, -.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export function drawVhsMuzzle(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, age: number, index: number) {
  if (age < 0 || age >= .047) return;
  const variation = KICKS[index % KICKS.length]!;
  const length = (19 + variation * 9) * (1 - age * 8);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const glow = ctx.createRadialGradient(0, 0, 1, 2, 0, 16);
  glow.addColorStop(0, '#f9ab4b59');
  glow.addColorStop(1, '#e5862900');
  ctx.fillStyle = glow;
  ctx.fillRect(-15, -16, 34, 32);
  ctx.beginPath();
  ctx.moveTo(-1, -1);
  ctx.lineTo(length * .43, -7 - variation * 3);
  ctx.lineTo(length * .37, -3);
  ctx.lineTo(length, -1 + variation * 3);
  ctx.lineTo(length * .42, 2);
  ctx.lineTo(length * .57, 8 - variation * 3);
  ctx.lineTo(-1, 2);
  ctx.closePath();
  ctx.fillStyle = '#e58a39';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -1.5);
  ctx.lineTo(length * .29, -4);
  ctx.lineTo(length * .64, .5);
  ctx.lineTo(length * .28, 2.8);
  ctx.lineTo(0, 1.5);
  ctx.fillStyle = '#ffedb0';
  ctx.fill();
  ctx.restore();
}

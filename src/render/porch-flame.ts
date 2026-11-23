import { calmMotion } from './lighting';

const ORIGIN_X = 448;
const ORIGIN_Y = 420;
const BURST = .45;
const fraction = (n: number) => n - Math.floor(n);

/** The flame, sight and collision wedge share the same vanishing line on the porch camera. */
export function porchFlame(ctx: CanvasRenderingContext2D, aim: number, firedAim: number, age: number,
  contacts: readonly { x: number; y: number }[] = []) {
  const xAt = (x: number, y: number) => ORIGIN_X + (x - ORIGIN_X) * (ORIGIN_Y - y) / 290;
  const still = calmMotion();
  const firing = age >= 0 && age < BURST;
  const u = Math.min(1, Math.max(0, age / BURST));
  ctx.save();
  if (!firing) {
    ctx.strokeStyle = '#ffdb9cc7';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 9]);
    ctx.beginPath(); ctx.moveTo(ORIGIN_X, ORIGIN_Y); ctx.lineTo(xAt(aim, 65), 65); ctx.stroke();
    ctx.setLineDash([]);
    const cx = xAt(aim, 130);
    ctx.strokeStyle = '#ffeac2';
    ctx.beginPath(); ctx.moveTo(cx - 15, 130); ctx.lineTo(cx - 5, 130);
    ctx.moveTo(cx + 5, 130); ctx.lineTo(cx + 15, 130);
    ctx.moveTo(cx, 123); ctx.lineTo(cx, 128); ctx.stroke();
  }
  if (firing) {
    const reach = still ? 1 : Math.min(1, .15 + u * 5);
    const wave = still ? .2 : u;
    ctx.globalCompositeOperation = 'screen';
    // Convection bends the outer envelope more than the near-white inner stream.
    for (const [radius, alpha, color] of [[1,.64,'#ed5220'], [.76,.86,'#ff982b'], [.39,.98,'#ffdf79']] as const) {
      const shape = new Path2D();
      for (const side of [-1, 1]) {
        for (let i = 0; i <= 36; i++) {
          const p = side < 0 ? i / 36 : 1 - i / 36;
          const y = ORIGIN_Y - (p * reach * (radius * 53 + 237));
          const turbulence = Math.sin(p * 23 - wave * 15) * Math.sin(p * 11 + wave * 12);
          const width = 3 + (87 + turbulence * 24) * p * Math.sin(Math.PI * p) ** .48;
          const x = xAt(firedAim, y) + side * width * radius + 9 * p * Math.sin(p * 17 - wave * 11);
          if (side < 0 && i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
        }
      }
      shape.closePath();
      ctx.globalAlpha = alpha * (still ? .85 : Math.min(1, (1 - u) * 6 + .12));
      const plume = ctx.createLinearGradient(0, ORIGIN_Y, 0, ORIGIN_Y - reach * (radius * 53 + 237));
      plume.addColorStop(0, '#fff2c4');
      plume.addColorStop(.23, color);
      plume.addColorStop(.65, color + 'c4');
      plume.addColorStop(1, color + '19');
      ctx.fillStyle = plume; ctx.fill(shape);
    }
    // Separate curls at the leading edge leave the yard visible through the hot gas.
    for (let i = 0; i < 12; i++) {
      const p = .27 + fraction(i * .382 + wave * .6) * .66;
      const y = ORIGIN_Y - p * reach * 300;
      const spread = Math.sin(i * 17.1 + wave * 5);
      const x = xAt(firedAim, y) + spread * (6 + 48 * p);
      const r = 6 + 18 * p;
      const curl = ctx.createRadialGradient(x, y, 1, x, y, r);
      curl.addColorStop(0, '#ffe597b0'); curl.addColorStop(.33, '#ffa7469c'); curl.addColorStop(1, '#f06b1600');
      ctx.fillStyle = curl; ctx.fillRect(x-r, y-r, 2*r, 2*r);
    }
    const tip = xAt(firedAim, 385);
    const glow = ctx.createRadialGradient(tip, 385, 1, tip, 385, 47);
    glow.addColorStop(0, '#fff9ce'); glow.addColorStop(.2, '#ffd46d'); glow.addColorStop(1, '#ee651000');
    ctx.fillStyle = glow; ctx.fillRect(tip - 47, 338, 94, 94);
  }
  if (!still && age >= 0 && age < .92) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(1, (1 - age / .92) * 1.7);
    ctx.strokeStyle = '#ffca63'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 34; i++) {
      const t = age - fraction(i * .618) * .24;
      if (t < 0) continue;
      const spread = fraction(i * .371) * 2 - 1;
      const y = ORIGIN_Y - t * (390 + 290 * fraction(i * .721)) + t * t * 155;
      const x = xAt(firedAim, y) + spread * t * 238;
      ctx.moveTo(x, y); ctx.lineTo(x + spread * 2, y - 3);
    }
    ctx.stroke();
  }
  if (age >= 0 && age < .46) {
    // Footfall positions belong to the same projected view that resolved the burst.
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = .76 * (1 - age / .46);
    for (const contact of contacts) {
      const r = still ? 18 : 13 + age * 25;
      const heat = ctx.createRadialGradient(contact.x, contact.y - 13, 1, contact.x, contact.y - 14, r);
      heat.addColorStop(0, '#ffe4aa'); heat.addColorStop(.45, '#fc964b'); heat.addColorStop(1, '#e9511900');
      ctx.fillStyle = heat; ctx.fillRect(contact.x - r, contact.y - 14 - r, r * 2, r * 2);
    }
  }
  ctx.restore();
  ctx.save();
  ctx.translate(448, 420);
  ctx.rotate(Math.atan2(aim - 448, 290));
  const tip = ctx.createLinearGradient(-13, 0, 13, 0);
  tip.addColorStop(0, '#2e2923'); tip.addColorStop(.35, '#927d64'); tip.addColorStop(.56, '#50493e'); tip.addColorStop(1, '#181714');
  ctx.fillStyle = tip; ctx.fillRect(-10, -29, 20, 39);
  ctx.fillStyle = firing ? '#ffb359' : '#ad9071'; ctx.fillRect(-12, -28, 24, 3);
  // The browned seam and quilted check read as a familiar kitchen mitt at the edge of the view.
  ctx.fillStyle = '#875642';
  const mitt = new Path2D('M5 12 Q4 1 13 -4 Q13 -12 20 -13 Q26 -14 26 -8 Q35 -11 40 -3 L46 15 Z');
  ctx.fill(mitt); ctx.strokeStyle = '#352b23'; ctx.lineWidth = 2.3; ctx.stroke(mitt);
  ctx.save(); ctx.clip(mitt); ctx.strokeStyle = '#c6a17a'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let n = -10; n < 65; n += 7) {
    ctx.moveTo(n,-17); ctx.lineTo(n + 19,12); ctx.moveTo(n,12); ctx.lineTo(n + 19,-17);
  }
  ctx.stroke(); ctx.restore();
  ctx.restore();
}

export interface MobGesture {
  readonly kind: 'rev' | 'jam' | 'hoist' | 'delivery' | 'registered' | 'whistle' | 'speech';
  readonly time: number;
  readonly force: number;
}

// The hanging load is a separate cutout in the two painted wind-up poses.
// Source coordinates are divided by the sprite dimensions when drawing.
const HOIST = {
  front: { w: 331, h: 269, pivot: [252, 54], load: [[252, 54], [269, 61], [331, 84], [331, 178], [205, 178], [210, 77]],
    grip: [143, 94], sag: 7, mastEnd: 184, boot: [0, 194, 53, 267] },
  back: { w: 302, h: 268, pivot: [231, 45], load: [[231, 45], [258, 53], [302, 66], [302, 154], [205, 154], [207, 91], [219, 64]],
    grip: [151, 107], sag: 3, mastEnd: 175, boot: [75, 210, 138, 268] },
} as const;

export function drawHoist(
  ctx: CanvasRenderingContext2D, front: boolean, w: number, h: number, gesture: MobGesture, blit: () => void,
): void {
  const art = front ? HOIST.front : HOIST.back;
  const x = (u: number) => (u / art.w - 0.5) * w;
  const y = (v: number) => (v / art.h - 1) * h;
  const cut = () => {
    art.load.forEach(([u, v], i) => i === 0 ? ctx.moveTo(x(u), y(v)) : ctx.lineTo(x(u), y(v)));
    ctx.closePath();
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2, -h, w, h);
  cut();
  ctx.clip('evenodd');
  const pulling = gesture.force >= 0;
  const [handX, handY] = art.grip;
  const [pinX, pinY] = art.pivot;
  const dx = pinX - handX, dy = pinY - handY;
  const chainY = (t: number, sag: number) => handY + dy * t + 4 * sag * t * (1 - t);
  const chainCut = () => {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      if (i === 0) ctx.moveTo(x(handX), y(handY - 4));
      else ctx.lineTo(x(handX + dx * t), y(chainY(t, art.sag) - 4));
    }
    for (let i = 8; i >= 0; i--) ctx.lineTo(x(handX + dx * i / 8), y(chainY(i / 8, art.sag) + 4));
    ctx.closePath();
  };
  const [bx, by, ex, ey] = art.boot;
  const bootRect = () => ctx.rect(x(bx), y(by), x(ex) - x(bx), y(ey) - y(by));
  ctx.save();
  if (pulling) {
    ctx.beginPath();
    ctx.rect(-w / 2, -h, w, h);
    chainCut();
    bootRect();
    ctx.clip('evenodd');
  }
  blit();
  ctx.restore();
  if (pulling) {
    // Restore the mast behind the running chain from the adjacent strip of the same painting.
    ctx.save();
    ctx.beginPath();
    chainCut();
    ctx.clip();
    ctx.beginPath();
    ctx.rect(x(handX), -h, x(art.mastEnd) - x(handX), h);
    ctx.clip();
    ctx.translate(0, h * 9 / art.h);
    blit();
    ctx.restore();
    // Lift the heel under the trouser cuff, then plant it as the last link seats.
    ctx.save();
    ctx.translate(0, y(by));
    ctx.scale(1, 1 - (1 - gesture.force) * 0.19);
    ctx.translate(0, -y(by));
    ctx.beginPath();
    bootRect();
    ctx.clip();
    blit();
    ctx.restore();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(x(art.pivot[0]), y(art.pivot[1]));
  ctx.rotate(gesture.force * (pulling ? 0.25 : 0.16));
  ctx.translate(-x(art.pivot[0]), -y(art.pivot[1]));
  ctx.beginPath();
  cut();
  ctx.clip();
  blit();
  ctx.restore();

  if (!pulling) return;
  const slack = 20 * (1 - gesture.force);
  const width = w / art.w;
  const links = front ? 12 : 11;
  for (let i = 0; i < links; i++) {
    const t = (i + 0.5) / links;
    const angle = Math.atan2(dy + 4 * slack * (1 - 2 * t), dx);
    ctx.beginPath();
    ctx.ellipse(x(handX + dx * t), y(chainY(t, slack)), width * 5.8, width * (i % 2 ? 1.3 : 2.4), angle, 0, 2 * Math.PI);
    ctx.strokeStyle = '#39241b';
    ctx.lineWidth = width * 3.4;
    ctx.stroke();
    ctx.strokeStyle = i % 2 ? '#a88961' : '#e1c99a';
    ctx.lineWidth = width * 1.6;
    ctx.stroke();
  }
}

function mowerDebris(ctx: CanvasRenderingContext2D, front: boolean, height: number, { time, force, kind }: MobGesture): void {
  const dir = front ? -1 : 1;
  ctx.translate((front ? -0.33 : 0.43) * height, -(front ? 0.06 : 0.17) * height);
  if (kind === 'jam') {
    for (let i = 0; i < 3; i++) {
      const t = (time * 1.35 + i / 3) % 1;
      ctx.globalAlpha = 0.27 * Math.sin(t * Math.PI) * force;
      ctx.fillStyle = i === 1 ? '#706657' : '#ada08b';
      ctx.beginPath();
      ctx.ellipse(dir * t * height * 0.1, -t * height * 0.38, height * (0.023 + t * 0.073),
        height * (0.02 + t * 0.027), -0.24 * dir, 0, 2 * Math.PI);
      ctx.fill();
    }
    return;
  }
  ctx.lineWidth = Math.max(0.7, height * 0.014);
  for (let i = 0; i < 7; i++) {
    const t = (time * (2.1 + (i % 3) * 0.15) + i * 0.29) % 1;
    const dx = height * dir * t * (0.11 + i * 0.051);
    const dy = -height * (0.12 + (i % 3) * 0.073) * 4 * t * (1 - t);
    ctx.strokeStyle = i % 2 ? '#9f9e51' : '#d9bc63';
    ctx.globalAlpha = force * (1 - t) * 0.82;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx + dir * height * 0.031, dy - height * (0.025 - t * 0.045));
    ctx.stroke();
  }
}

function post(ctx: CanvasRenderingContext2D, front: boolean, height: number, { time, force }: MobGesture): void {
  const dir = front ? 1 : -1;
  const originX = dir * height * (front ? 0.37 : 0.19);
  const originY = -height * (front ? 0.48 : 0.53);
  for (let i = 0; i < 3; i++) {
    const t = time * (1.7 + i * 0.33) - i * 0.095;
    if (t <= 0 || t >= 1) continue;
    ctx.save();
    ctx.translate(originX + dir * height * t * (0.31 + i * 0.07),
      originY + height * t * (t * 0.43 - 0.36 - i * 0.14));
    ctx.rotate(t * dir * (4.8 + i * 1.35));
    ctx.globalAlpha = force * Math.sin(Math.PI * t) ** 0.65;
    const w = height * 0.089, h = height * 0.06;
    ctx.fillStyle = '#ead6a3';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = '#926a45';
    ctx.lineWidth = Math.max(0.55, height * 0.008);
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(0, h * 0.09);
    ctx.lineTo(w / 2, -h / 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** The extended pen, then the envelope at the sill and the tick on the receipt. */
function registered(ctx: CanvasRenderingContext2D, front: boolean, height: number, time: number): void {
  const dir = front ? 1 : -1;
  ctx.scale(dir * height, height);
  ctx.translate(front ? 0.37 : 0.19, front ? -0.48 : -0.53);
  const slide = Math.max(0, Math.min(1, (time - 0.85) / 0.1));
  ctx.fillStyle = '#ede0ba';
  ctx.fillRect(0.02 + slide * 0.12, 0.02 + slide * 0.38, 0.13, 0.078 * (1 - slide));
  ctx.fillStyle = '#ae483b';
  ctx.fillRect(0.12 + slide * 0.12, 0.03 + slide * 0.38, 0.025, 0.025 * (1 - slide));
  ctx.strokeStyle = '#cbd7dc';
  ctx.lineWidth = 0.019;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0.14, -0.085 + 0.075 * slide);
  ctx.stroke();
  if (time > 0.95) {
    ctx.strokeStyle = '#eee4cc';
    ctx.beginPath();
    ctx.moveTo(0.06, -0.04);
    ctx.lineTo(0.09, -0.015);
    ctx.lineTo(0.14, -0.075);
    ctx.stroke();
  }
}

function signal(ctx: CanvasRenderingContext2D, front: boolean, height: number, gesture: MobGesture): void {
  const speech = gesture.kind === 'speech';
  const mouths = speech ? (front ? [-0.38, -0.87] : [0.29, -0.88]) : (front ? [0.157, -0.793] : [0.213, -0.831]);
  const dir = speech && front ? -1 : 1;
  ctx.translate(mouths[0]! * height, mouths[1]! * height);
  ctx.scale(dir, 1);
  ctx.lineCap = 'round';
  ctx.strokeStyle = speech ? '#e7b466' : '#c5d0e6';
  ctx.lineWidth = height * (speech ? 0.020 : 0.013);
  const rate = speech ? 3 : 1.5;
  for (let i = 0; i < 3; i++) {
    const t = gesture.time * rate - i * (speech ? 0.21 : 0.25);
    if (t < 0) continue;
    const p = t % 1;
    const reach = height * (0.06 + p * (speech ? 0.5 : 0.29));
    ctx.globalAlpha = gesture.force * 0.77 * (1 - p) * Math.min(1, p * 10);
    ctx.beginPath();
    ctx.ellipse(0, 0, reach, reach * (speech ? 0.61 : 0.82), 0, -0.58, 0.58);
    ctx.stroke();
  }
}

export function drawMobGesture(ctx: CanvasRenderingContext2D, front: boolean, height: number, gesture: MobGesture): void {
  if (gesture.kind === 'hoist') return;
  ctx.save();
  switch (gesture.kind) {
    case 'rev':
    case 'jam': mowerDebris(ctx, front, height, gesture); break;
    case 'registered': registered(ctx, front, height, gesture.time); break;
    case 'delivery': post(ctx, front, height, gesture); break;
    case 'whistle':
    case 'speech': signal(ctx, front, height, gesture); break;
  }
  ctx.restore();
}

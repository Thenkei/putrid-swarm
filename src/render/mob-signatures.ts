export interface MobGesture {
  readonly kind: 'rev' | 'jam' | 'hoist' | 'delivery' | 'whistle' | 'speech';
  readonly time: number;
  readonly force: number;
}

// The hanging load is a separate cutout in the two painted wind-up poses.
// Source coordinates are divided by the sprite dimensions when drawing.
const HOIST = {
  front: { w: 331, h: 269, pivot: [252, 54], load: [[252, 54], [269, 61], [331, 84], [331, 178], [205, 178], [210, 77]] },
  back: { w: 302, h: 268, pivot: [231, 45], load: [[231, 45], [258, 53], [302, 66], [302, 154], [205, 154], [207, 91], [219, 64]] },
} as const;

export function drawHoist(
  ctx: CanvasRenderingContext2D, front: boolean, w: number, h: number, force: number, blit: () => void,
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
  blit();
  ctx.restore();

  ctx.save();
  ctx.translate(x(art.pivot[0]), y(art.pivot[1]));
  ctx.rotate(force * 0.133);
  ctx.translate(-x(art.pivot[0]), -y(art.pivot[1]));
  ctx.beginPath();
  cut();
  ctx.clip();
  blit();
  ctx.restore();
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
    case 'delivery': post(ctx, front, height, gesture); break;
    case 'whistle':
    case 'speech': signal(ctx, front, height, gesture); break;
  }
  ctx.restore();
}

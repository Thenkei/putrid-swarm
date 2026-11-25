// The bite starts under the torn sleeve. Its branches climb past the cuff and spread across the hand.

type VeinPoint = readonly [x: number, y: number];

interface Vein {
  readonly start: number;
  readonly end: number;
  readonly width: number;
  readonly points: readonly VeinPoint[];
}

// Coordinates on the bitten arm sprite. The tied sprite has the same arm with extra space for the rope.
const VEINS: readonly Vein[] = [
  {
    start: .015, end: .77, width: 3.3,
    points: [
      [.54, .548], [.49, .506], [.51, .472], [.45, .437], [.47, .405], [.43, .371], [.46, .334],
      [.435, .301], [.48, .267], [.46, .231], [.5, .204], [.48, .175], [.51, .152],
    ],
  },
  {
    start: .07, end: .44, width: 2.5,
    points: [[.54, .548], [.63, .565], [.61, .598], [.67, .627], [.64, .662], [.7, .687], [.68, .726]],
  },
  {
    start: .21, end: .54, width: 1.8,
    points: [[.45, .437], [.35, .427], [.31, .404], [.26, .397], [.24, .374]],
  },
  {
    start: .4, end: .73, width: 2.2,
    points: [[.46, .334], [.36, .315], [.38, .289], [.33, .276], [.29, .245], [.26, .226]],
  },
  {
    start: .53, end: .88, width: 2.4,
    points: [[.48, .267], [.56, .273], [.61, .247], [.69, .237], [.71, .204], [.78, .193], [.82, .169]],
  },
  {
    start: .71, end: .96, width: 1.7,
    points: [[.48, .175], [.39, .158], [.4, .131], [.35, .108], [.37, .084], [.35, .057]],
  },
  {
    start: .77, end: 1, width: 1.6,
    points: [[.51, .152], [.56, .13], [.54, .103], [.59, .073], [.58, .043]],
  },
];

const saturate = (value: number): number => Math.min(1, Math.max(0, value));

function bruise(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, core: string, edge: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const tint = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  tint.addColorStop(0, core);
  tint.addColorStop(.48, edge);
  tint.addColorStop(1, 'transparent');
  ctx.fillStyle = tint;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

/** Paint infection over the arm already drawn on its own transparent layer. */
export function drawArmInfection(ctx: CanvasRenderingContext2D, progress: number, pulse: number, tied: boolean): void {
  if (progress <= 0) return;
  const { width, height } = ctx.canvas;
  const armWidth = height * 210 / 640;
  const offset = tied ? (width - armWidth) * .08 : 0;
  const strength = saturate(progress * 4);
  const climb = saturate((progress - .22) / .78);

  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const x = offset + armWidth * .54;
  bruise(ctx, x, height * .545, armWidth * (.38 + progress * .34), height * (.08 + progress * .21),
    `rgba(42, 27, 43, ${.48 + strength * .27})`, `rgba(76, 52, 72, ${strength * .47})`);
  bruise(ctx, x - armWidth * .07, height * (.38 - climb * .23), armWidth * (.33 + climb * .42), height * (.075 + climb * .1),
    `rgba(49, 77, 66, ${climb * .7})`, `rgba(91, 112, 70, ${climb * .45})`);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const vein of VEINS) {
    const reveal = saturate((progress - vein.start) / (vein.end - vein.start));
    if (reveal === 0) continue;
    const segments = (vein.points.length - 1) * reveal;
    const length = Math.ceil(segments);
    ctx.beginPath();
    ctx.moveTo(offset + vein.points[0]![0] * armWidth, vein.points[0]![1] * height);
    for (let i = 1; i <= length; i++) {
      const [fromX, fromY] = vein.points[i - 1]!;
      const [toX, toY] = vein.points[i]!;
      // Curve through each bend, ending precisely at the growing tip of the branch.
      const t = i === length ? Math.min(1, segments - i + 1) : .5;
      ctx.quadraticCurveTo(
        offset + fromX * armWidth, fromY * height,
        offset + (fromX + (toX - fromX) * t) * armWidth, (fromY + (toY - fromY) * t) * height,
      );
    }
    const opacity = Math.min(1, .46 + reveal * .62);
    ctx.strokeStyle = `rgba(79, 42, 72, ${opacity * (.35 + pulse * .17)})`;
    ctx.lineWidth = vein.width * 3.25;
    ctx.stroke();
    ctx.strokeStyle = `rgba(27, 41, 37, ${opacity * .94})`;
    ctx.lineWidth = vein.width * (1.2 + pulse * .27);
    ctx.stroke();
    ctx.strokeStyle = `rgba(150, 154, 94, ${opacity * (.24 + pulse * .12)})`;
    ctx.lineWidth = vein.width * .32;
    ctx.stroke();
  }
  ctx.restore();
}

import type { GardenEscort } from '../core/garden-escort';
import { lightPool, patrolCel } from './epic-night-light';
import { drawGardenGesture, gardenLaundry, paintGardenPlate, sheetContact, signalWindow, windowIsRight } from './garden-scenery';
import { applyCctv, calmMotion, drawRetune } from './lighting';
import neighbourArt from './epic-neighbour.webp';

const WIDTH = 900;
const HEIGHT = 390;
const TRACK = 295;
const PICTURE = { x: 0, y: 16, w: WIDTH, h: 328 };
let neighbourSheet: HTMLImageElement | undefined;
const escortPose = new WeakMap<GardenEscort, { walking: boolean; garden: number; changed: number }>();
const walkFrames = [0, 1, 2, 1] as const;

/** All six painted poses share the same scale, but the kneeling boots sit higher in the sheet. */
function paintedNeighbour(ctx: CanvasRenderingContext2D, x: number, game: GardenEscort, still: boolean, lifting: boolean, acknowledging: boolean): number | null {
  if (!neighbourSheet) {
    neighbourSheet = new Image();
    neighbourSheet.decoding = 'async';
    neighbourSheet.src = neighbourArt;
  }
  if (!neighbourSheet.complete || !neighbourSheet.naturalWidth) return null;
  let pose = escortPose.get(game);
  if (!pose || pose.garden !== game.garden) {
    pose = { walking: game.walking, garden: game.garden, changed: -1 };
    escortPose.set(game, pose);
  }
  if (pose.walking !== game.walking) {
    pose.walking = game.walking;
    pose.changed = game.time;
  }
  const settling = !still && game.time - pose.changed < .16;
  const walk = still ? 1 : walkFrames[Math.floor(game.position * 2.7) % walkFrames.length]!;
  const frame = settling ? 3 : game.walking ? walk : game.watched || game.alert > .12 ? 5 : 4;
  const anchorX = [131, 115, 123, 127, 110, 112][frame]!;
  const anchorY = frame < 3 ? 254 : 236;
  const scale = .335;
  const sway = game.walking && !still ? Math.sin(game.position * 8) * .8 : 0;
  lightPool(ctx, x, TRACK + 1, game.walking ? 22 : 24, 5, '#0a1316cf');
  lightPool(ctx, x, TRACK - (game.walking ? 45 : 28), 33, 34, '#e0d1a42b');
  const looking = !game.walking && !game.watched && !settling;
  const gesture = acknowledging ? 1 : lifting ? 2 : looking ? 0 : -1;
  if (gesture >= 0 && drawGardenGesture(ctx, gesture, x, TRACK, windowIsRight(game.garden, x), still ? 0 : game.position * 4.25)) {
    return TRACK - (gesture === 2 ? 87 : 75);
  }
  ctx.drawImage(neighbourSheet, frame % 3 * 256, Math.floor(frame / 3) * 256, 256, 256,
    x - anchorX * scale, TRACK - anchorY * scale + sway, 256 * scale, 256 * scale);
  return TRACK - (settling ? 74 : game.walking ? 89 : 66);
}

function line(ctx: CanvasRenderingContext2D, points: number[], color: string, width: number) {
  ctx.beginPath();
  ctx.moveTo(points[0]!, points[1]!);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i]!, points[i + 1]!);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function neighbour(ctx: CanvasRenderingContext2D, x: number, walking: boolean, time: number) {
  const crouch = walking ? 0 : 15;
  const swing = walking ? Math.sin(9 * time) * 6 : 0;
  lightPool(ctx,x,TRACK,20,5,'#0d1514bf');
  ctx.save();
  ctx.translate(x, TRACK);
  ctx.scale(1.25,1.25);
  ctx.lineCap = 'round';
  const hip=-20+crouch*.55;
  for (const leg of [-1,1]) {
    const foot=leg*swing;
    line(ctx,[leg*2,hip,4+leg*2+foot*.55,-11+crouch*.23,foot-3*leg,-3], leg===1?'#414d4c':'#283331',5.7);
    line(ctx,[foot-3*leg,-3,foot+2-3*leg,-2], '#202624',4);
  }
  ctx.translate(walking?0:3,crouch*.78);
  ctx.rotate(walking?-.04:.12);
  const coat=ctx.createLinearGradient(-8,0,10,0);coat.addColorStop(0,'#a47437');coat.addColorStop(.35,'#dab05f');coat.addColorStop(1,'#af843f');
  ctx.fillStyle=coat;ctx.strokeStyle='#5c553b';ctx.lineWidth=1;
  const body=new Path2D('M-7 -18 Q-7 -28 -2 -35 Q1 -40 8 -36 L10 -30 6 -20 5 -15 Q-2 -14 -9 -16 Z');
  ctx.fill(body);ctx.stroke(body);
  line(ctx,[-4,-32,-6,-25,-8,-21],'#e6c775',1);
  line(ctx,[4,-32,2+swing*.6,-24,7+swing,-22],'#9b733a',5.4);
  line(ctx,[7+swing,-22,10+swing,-22.5],'#bba184',2.8);
  ctx.fillStyle='#dac6a4';ctx.fill(new Path2D('M3 -38 Q2 -45 9 -45 Q14 -45 14 -41 L16 -39 14 -37 12 -34 7 -35 Z'));
  ctx.fillStyle='#5a4d42';ctx.fill(new Path2D('M2 -41 Q0 -49 9 -49 Q14 -49 14 -45 L18 -43 14 -42 8 -44 4 -40 Z'));
  ctx.restore();
}


/** Keep all positions in metres until projection so the painted cues agree with the simulation. */
export function drawGarden(canvas: HTMLCanvasElement, game: GardenEscort, cameraName: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { length, shelter, patrols } = game.layout;
  const x = (metres: number) => 52 + metres / length * 790;
  const still = calmMotion();
  const time = still ? 0 : game.time;
  ctx.fillStyle = '#131713';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  paintGardenPlate(ctx, game.garden);
  const elapsed = game.time - game.signalTime;
  // He understands a lamp at once. His back foot stays planted for the raised palm,
  // then catches up during the first stride. The progress strip always uses real metres.
  const pushOff = game.lamp && game.advance ? Math.max(0, Math.min(1, (elapsed - .13) / .15)) : 1;
  const cx = x(pushOff === 1 ? game.position : game.signalPosition + (game.position - game.signalPosition) * pushOff);
  const coverDepth = Math.max(0, Math.min(1, game.position - shelter[0], shelter[1] - game.position));
  const handX = cx + 39;
  const acknowledging = game.advance && (game.lamp ? elapsed < .23 : elapsed >= .10 && elapsed < .40);
  const lifting = !acknowledging && game.garden === 1 && game.walking && sheetContact(handX) > 0;
  if (game.advance) signalWindow(ctx, game.garden, game.lamp);
  gardenLaundry(ctx, game.garden, handX, TRACK - coverDepth * 16 - 81, lifting, time);
  // Match the cool exposure of the main yard cameras before drawing lit subjects.
  ctx.fillStyle = 'rgba(12, 27, 40, .22)';
  ctx.fillRect(0, 16, WIDTH, 328);

  // A signal comes from the operator's window. Wet earth picks it up across the lane.
  if (game.advance) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    lightPool(ctx, WIDTH * .5, TRACK + 14, 450, 28, game.lamp ? '#eabe663d' : '#cdc4a51c');
    ctx.restore();
  }
  for (const [index, patrol] of patrols.entries()) {
    const centre = game.patrolAt(index);
    const facing = game.patrolAt(index, .001) >= centre ? 1 : -1;
    // The patrol walks behind its gaze. Close the gap as it turns at either end.
    const toTurn = Math.min(x(centre) - x(patrol.from), x(patrol.to) - x(centre));
    const feet = x(centre) - facing * Math.min(38, Math.max(0, toTurn) * .5);
    const back = TRACK - 23;
    lightPool(ctx, feet, back, 20, 4, '#111412c9');
    ctx.save();
    ctx.shadowColor = '#b4c3c4';
    ctx.shadowBlur = 1.2;
    ctx.shadowOffsetX = -0.8;
    patrolCel(ctx, feet, back, 64, facing, time + index);
    ctx.restore();
    const left = x(centre - patrol.width / 2);
    const right = x(centre + patrol.width / 2);
    const alert = game.walking && game.watched && Math.abs(game.position - centre) <= patrol.width / 2;
    const gaze = ctx.createLinearGradient(0, back - 49, 0, TRACK + 5);
    gaze.addColorStop(0, '#f0bd7210');
    gaze.addColorStop(1, alert ? '#e6944199' : '#e2af6552');
    ctx.fillStyle = gaze;
    ctx.beginPath();
    ctx.moveTo(feet + facing * 6, back - 49);
    ctx.lineTo(left, TRACK + 5);
    ctx.lineTo(right, TRACK + 5);
    ctx.closePath();
    ctx.fill();
    line(ctx, [left, TRACK, left, TRACK + 5, right, TRACK + 5, right, TRACK], '#efba7f', 1.4);
  }

  const shelterLeft = x(shelter[0]), shelterRight = x(shelter[1]);
  ctx.save();
  ctx.setLineDash([5, 4]);
  line(ctx, [shelterLeft, TRACK + 10, shelterRight, TRACK + 10], game.hidden ? '#d1e2b5' : '#afc5a9bd', 2);
  ctx.restore();
  for (let i = 1; i <= 4 && game.position > i * .24; i++) {
    ctx.fillStyle = '#302b25a0';
    ctx.beginPath();
    ctx.ellipse(cx - 7 * i, TRACK + (i % 2) * 2, 3, 1.5, -.13, 0, Math.PI * 2);
    ctx.fill();
  }
  // The safe part of the trail bends in towards the hedge, clothesline or greenhouse.
  ctx.save();
  ctx.translate(0, -coverDepth * 16);
  const headY = paintedNeighbour(ctx, cx, game, still, lifting, acknowledging);
  if (headY === null) neighbour(ctx, cx, game.walking, time);
  const marker = headY ?? TRACK - 72;
  line(ctx, [cx - 4, marker, cx, marker + 3, cx + 4, marker], '#21251f', 4);
  line(ctx, [cx - 4, marker, cx, marker + 3, cx + 4, marker], '#f0d898', 2);
  if (game.alert > .035) {
    // Keep the buildup close to the coat so an operator watching the feet can still react.
    const left = cx - 15, y = marker - 7;
    ctx.fillStyle = '#161a18';
    ctx.fillRect(left - 1, y - 1, 32, 5);
    ctx.fillStyle = '#f0af69';
    ctx.fillRect(left, y, 30 * Math.min(1, game.alert / .93), 3);
  }
  ctx.restore();

  applyCctv(ctx, PICTURE, time, .64);
  if (game.garden > 0) drawRetune(ctx, PICTURE, game.time);

  // The same amber indicators and black equipment strip as the surveillance desk.
  ctx.font = 'bold 18px Consolas, monospace';
  ctx.fillStyle = '#e4d6b5';
  ctx.fillText('CAM 0' + (game.garden + 1) + ' / ' + cameraName.toLocaleUpperCase(), 16, 373);
  const start = 520, width = 350, y = 364;
  ctx.fillStyle = '#564d3d';
  ctx.fillRect(start, y, width, 5);
  ctx.fillStyle = '#a6b59b';
  ctx.fillRect(start + shelter[0] / length * width, y - 2, (shelter[1] - shelter[0]) / length * width, 9);
  ctx.fillStyle = '#e4ad62';
  ctx.fillRect(start, y, game.position / length * width, 5);
  ctx.fillStyle = '#fff1c1';
  ctx.fillRect(start + game.position / length * width - 2, y - 4, 4, 13);
}

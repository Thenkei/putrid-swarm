import { CLOTHESLINE, CLOTHESLINE_POSTS } from '../core/map';
import type { Enemy } from '../core/night';
import { sprite } from '../engine/assets';
import { smoothstep } from './noise';
import { world, type Rot } from './projection';
import postUrl from '../assets/laundry-timber-post.webp';

/** Local painting coordinates shared with the cub moving beneath the hem. */
export const laundryMount = { x: 447, y: 338, scale: .36 };
const centre = world(0, CLOTHESLINE.x, CLOTHESLINE.y);
function paintedPost(post: typeof CLOTHESLINE_POSTS[number]) {
  const foot = world(0, post.x, post.y);
  return { x: laundryMount.x + (foot.x-centre.x)/laundryMount.scale,
    foot: laundryMount.y + (foot.y-centre.y)/laundryMount.scale, w: 67, h: 172 };
}
const farPost = paintedPost(CLOTHESLINE_POSTS[0]);
const nearPost = paintedPost(CLOTHESLINE_POSTS[1]);
const span = nearPost.x - farPost.x;
export const laundry = { left: farPost.x + .15*span, right: nearPost.x - .15*span, top:192, hem:338 };

// Measure contact along the wire in world space. The opposite camera sees the
// same two feet in reverse order, with the nearer one still lower on screen.
export function laundryX(gx: number, rot: Rot) {
  const t = (gx-CLOTHESLINE_POSTS[0].x)/(CLOTHESLINE_POSTS[1].x-CLOTHESLINE_POSTS[0].x);
  return farPost.x + (rot === 0 ? t : 1-t)*span;
}
type Post = typeof farPost;
let timber: HTMLImageElement | undefined;

// The painted upright meets the stone at 47% of its width. Each rope threads a
// different iron eye along the crossbeam, including in the reversed yard view.
function eye(post: Post, u: number, v: number) {
  return { x: post.x + (u - .47) * post.w, y: post.foot - (1 - v) * post.h };
}
const lines = ([[.88,.074,7], [.57,.144,12], [.24,.21,9]] as const).map(([u,v,sag]) => ({
  from: eye(farPost,u,v), to: eye(nearPost,u,v), sag,
}));
const carryingLine = lines[1]!;
function wireY(line: typeof carryingLine, x: number) {
  const t = (x-line.from.x)/(line.to.x-line.from.x);
  return line.from.y + (line.to.y-line.from.y)*t + 4*line.sag*t*(1-t);
}

function drawPost(ctx: CanvasRenderingContext2D, post: Post) {
  ctx.fillStyle = '#26221852';
  ctx.beginPath();
  ctx.ellipse(post.x + 5, post.foot - 1, 16, 4, -.09, 0, Math.PI*2);
  ctx.fill();
  if (timber?.naturalWidth) {
    ctx.drawImage(timber, post.x - .47*post.w, post.foot - post.h, post.w, post.h);
  } else {
    ctx.fillStyle = '#75614b';
    ctx.fillRect(post.x-5,post.foot-post.h+10,10,post.h-10);
    ctx.fillRect(post.x-18,post.foot-post.h+10,40,5);
  }
}

interface ClothContact { x: number; pressure: number; width: number }

/** A shoulder has to meet the hanging fabric, not just overlap it on screen. */
export function zombieClothContacts(enemies: readonly Pick<Enemy,'x'|'y'|'alive'|'type'|'crawlDepth'>[], rot: Rot = 0): ClothContact[] {
  const contacts: ClothContact[] = [];
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const dx = enemy.x - CLOTHESLINE.x, dy = enemy.y - CLOTHESLINE.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) continue;
    const x = laundryX(enemy.x, rot);
    if (x < laundry.left-30 || x > laundry.right+30) continue;
    const pressure = 1-smoothstep(.06,.48,Math.abs(dy));
    if (pressure <= 0) continue;
    const low = enemy.type === 'dog' || enemy.type === 'boar';
    contacts.push({x, pressure:pressure*(low ? .55 : 1-.5*enemy.crawlDepth), width:enemy.type === 'brute' ? 74 : low ? 38 : 54});
  }
  return contacts;
}

export function drawBarnLaundry(ctx: CanvasRenderingContext2D, cubX: number | null, trailingX: number, air: number, pressure: number, sheet = true, bodies: readonly ClothContact[] = [], rot: Rot = 0) {
  if (!timber) { timber = new Image(); timber.src = postUrl; }
  const cloth = sprite('moon_laundry');
  const { left, right, top, hem } = laundry;
  const width = right - left, height = hem - top;
  ctx.save();
  drawPost(ctx, farPost);
  drawPost(ctx, nearPost);
  for (const line of lines) {
    const { from, to, sag } = line;
    ctx.beginPath();
    ctx.moveTo(from.x,from.y);
    ctx.quadraticCurveTo((from.x+to.x)/2,(from.y+to.y)/2+2*sag,to.x,to.y);
    ctx.strokeStyle = '#464239'; ctx.lineWidth = 2.7; ctx.stroke();
    ctx.strokeStyle = '#b1a68d'; ctx.lineWidth = 1.15; ctx.stroke();
  }
  // The spare pegs stay clipped together at the end nearest the house.
  for (const offset of [12,20,29]) {
    const x = rot === 0 ? farPost.x+offset : nearPost.x-offset;
    ctx.save(); ctx.translate(x,wireY(carryingLine,x)); ctx.rotate((offset-20)*.012);
    ctx.fillStyle='#544333'; ctx.fillRect(-2,-4,4.5,11);
    ctx.fillStyle='#d7ba84'; ctx.fillRect(-1.6,-4,2.7,9);
    ctx.fillStyle='#6e6c62'; ctx.fillRect(-2,.5,4.5,1.4);
    ctx.restore();
  }
  if (!sheet || !cloth) { ctx.restore(); return; }
  // Keep both pegs on the sagging line. The shoulder pushes a ridge through the
  // weave; its wake falls a little later. Most of the motion stays below mid-height.
  const strips = 64, seam = .42;
  function profile(x: number) {
    const contact = cubX === null ? 0 : 1 - smoothstep(6, 55, Math.abs(x - cubX));
    const trailing = cubX === null ? 0 : 1 - smoothstep(3, 47, Math.abs(x - trailingX));
    let shoulder = 0;
    for (const body of bodies) {
      const bulge = 1-smoothstep(4,body.width,Math.abs(x-body.x));
      shoulder = Math.max(shoulder,body.pressure*bulge);
    }
    const lift = Math.max(pressure*Math.max(37*contact,24*trailing), 68*shoulder);
    const fullness = Math.sin(Math.PI * (x-left) / width);
    const ripple = fullness * (2.2*Math.sin(air*1.7+(x-left)*.031) + 1.2*Math.sin(air*.82));
    const pinnedY = wireY(carryingLine,x) - 4;
    return { pin: pinnedY, fold: pinnedY + height * seam - lift * .12 - 14*shoulder, hem: pinnedY + height - lift + ripple };
  }
  let a = profile(left);
  for (let i = 0; i < strips; i++) {
    const sx = i * cloth.w / strips, sw = cloth.w / strips;
    const w = width / strips, x = left + i * w;
    const b = profile(x + w);
    // Sample one extra destination pixel from the neighbouring yarns; fractional
    // transforms would otherwise leave fine transparent lines in the linen.
    const overlap = 1.2, sampled = sw + overlap * cloth.w / width;
    ctx.save(); ctx.transform(1, (b.pin-a.pin)/w, 0, 1, x, a.pin);
    ctx.drawImage(cloth.img, sx, 0, sampled, cloth.h * seam, 0, 0, w + overlap, Math.max(a.fold-a.pin,b.fold-b.pin)+.8);
    ctx.restore();
    // Shear the bottom ribbon along the hem tangent. Adjacent pieces meet at
    // the same point, including the steep side where the shoulders lift it.
    ctx.save(); ctx.transform(1, (b.hem-a.hem)/w, 0, 1, x, a.hem);
    const lowerHeight = Math.max(a.hem-a.fold, b.hem-b.fold) + .8;
    ctx.drawImage(cloth.img, sx, cloth.h * seam, sampled, cloth.h * (1-seam), 0, -lowerHeight, w + overlap, lowerHeight);
    ctx.restore();
    a = b;
  }
  ctx.restore();
}

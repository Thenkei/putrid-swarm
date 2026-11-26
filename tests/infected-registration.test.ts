import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import manifest from '../public/assets/manifest.json';
import { ENEMIES } from '../src/core/data/enemies';
import { newGame } from '../src/core/game';
import { ENTRIES } from '../src/core/map';
import { HIT_REACTION_SECONDS, NightSim, type Enemy } from '../src/core/night';
import { SECTOR_IDS, type EnemyTypeId } from '../src/core/types';
import { DOOR_OUTWARD, doorStance } from '../src/house-layout';
import { drawEnemy, drawFallen, shoulderAt } from '../src/render/infected';
import { mobCycle, mobGaitSheets } from '../src/render/mob-cycles';
import mowerGait from '../src/render/mower-gait.json';
import { project, unproject, type Rot, type View } from '../src/render/projection';

const assets = vi.hoisted(() => new Map<string, { w: number; h: number; img: { key: string; naturalWidth: number; naturalHeight: number } }>());
const shadow = vi.hoisted(() => vi.fn<(ctx: unknown, x: number, y: number) => void>());
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('../src/engine/assets', () => ({ sprite: (key: string) => assets.get(key) }));
vi.mock('../src/render/shadows', () => ({ contactShadow: shadow }));
vi.mock('../src/render/lighting', () => ({ calmMotion: () => motion.reduced }));
beforeAll(() => {
  for (const [key, entry] of Object.entries({ ...manifest, ...mobGaitSheets })) {
    assets.set(key, { ...entry, img: { key, naturalWidth: entry.w, naturalHeight: entry.h } });
  }
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
});
afterAll(() => vi.unstubAllGlobals());

const views = [0, 1] as const;
const camera = (rot: Rot): View => ({ rot, zoom: rot ? 1.42 : .82, cx: 9, cy: 11, x: 40, y: 60, w: 720, h: 440 });
const frame = { time: 3, night: false, devices: [] };
const types = Object.keys(ENEMIES) as EnemyTypeId[];
const headings = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
function actor(type: EnemyTypeId): Enemy {
  const def = ENEMIES[type];
  return { id: 5, type, def, x: 9, y: 11, fx: 0, fy: 1, hp: def.hp, target: 'grange',
    action: 'walk', crawlLog: null, crawlDepth: 0, travel: 0, moveSpeed: def.speed, actionSeconds: .28,
    blowRecovery: 0, gripTarget: null, nettedFor: 0, stunnedFor: 0, hasteFor: 0, lureFor: 0, lureDevice: null,
    lit: false, shielded: false, windup: 0, cooldown: 0, hitFlash: 0, offsetX: 0, offsetY: 0, trampled: new Set(), boss: null, alive: true };
}

// Record the production blit, including all transforms between the painted pixel and screen.
type Matrix = [number, number, number, number, number, number];
function capture() {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const blits: { key: string; left: number; top: number; sw: number; sh: number; pixel: (x: number, y: number) => { x: number; y: number } }[] = [];
  const ctx = new Proxy({
    save() { stack.push([...m]); }, restore() { m = stack.pop()!; },
    translate(x: number, y: number) { m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; },
    scale(x: number, y: number) { m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; },
    transform(a: number, b: number, c: number, d: number, x: number, y: number) {
      const [u,v,w,z,tx,ty] = m;
      m = [u*a+w*b,v*a+z*b,u*c+w*d,v*c+z*d,tx+u*x+w*y,ty+v*x+z*y];
    },
    rotate(angle: number) {
      const [a, b, c, d, e, f] = m, cos = Math.cos(angle), sin = Math.sin(angle);
      m = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f];
    },
    drawImage(img: { key?: string }, left: number, top: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
      if (!img.key) return;
      const [a, b, c, d, e, f] = m;
      blits.push({ key: img.key, left, top, sw, sh, pixel(x, y) {
        const u = dx + (x - left) * dw / sw, v = dy + (y - top) * dh / sh;
        return { x: e + a * u + c * v, y: f + b * u + d * v };
      } });
    },
  }, { get: (obj, key) => Reflect.get(obj, key) ?? (() => {}) }) as unknown as CanvasRenderingContext2D;
  return { ctx, blits };
}

describe('infected registration on the yard', () => {
  it.each(['shambler', 'runner', 'brute'] as const)('keeps the hands planted while the %s leans into a rail', type => {
    const e = actor(type);
    Object.assign(e, { action: 'attack', gripTarget: 3 });
    for (const rot of views) {
      const draw = (seconds: number) => {
        e.actionSeconds = seconds;
        const sample = capture();
        drawEnemy(sample.ctx, camera(rot), frame, e);
        return sample.blits;
      };
      const contact = draw(.31)[0]!;
      const [hands, torso] = draw(.49);
      expect(hands!.key).toBe('defense_mob_poses');
      const wrist = [hands!.left + (rot ? 163 : 75), hands!.top + (rot ? 55 : 78)] as const;
      expect(hands!.pixel(...wrist)).toEqual(contact.pixel(...wrist));
      const head = [hands!.left + (rot ? 135 : 110), hands!.top + 40] as const;
      const initial = hands!.pixel(...head), leaned = torso!.pixel(...head);
      expect(Math.hypot(initial.x - leaned.x, initial.y - leaned.y)).toBeGreaterThan(1);
    }
  });

  it.each(SECTOR_IDS)('knocks toward the painted %s door and walks away from its sill', sector => {
    const sim = new NightSim(5, newGame(421).yard, 421);
    const e = actor('mail'), entry = ENTRIES[sector], [nx, ny] = DOOR_OUTWARD[sector];
    e.x = entry.x + .5 + .8 * nx;
    e.y = entry.y + .5 + .8 * ny;
    e.target = sector;
    e.boss = { phase: 'advance', timer: 0, sector, knocks: 0, ability: 0, laneIndex: 0, waypoints: [], speechTarget: null };
    sim.barricades[sector].hp = 100;
    sim.enemies.push(e);
    let previous = doorStance(e), knocks = 0, gripping = false, departing = false;
    for (let tick = 0; tick < 480; tick++) {
      sim.step(1 / 60);
      const posed = doorStance(e), grip = e.gripTarget === sector;
      if (grip) {
        expect(posed.fx).toBeCloseTo(-nx, 8);
        expect(posed.fy).toBeCloseTo(-ny, 8);
      }
      if (!gripping && grip) {
        knocks++;
        for (const rot of views) {
          const view = camera(rot), actual = capture(), inward = capture();
          drawEnemy(actual.ctx, view, frame, posed);
          drawEnemy(inward.ctx, view, frame, { ...posed, fx: -nx, fy: -ny, gripTarget: null });
          const cel = actual.blits[0]!, reference = inward.blits[0]!;
          expect(cel.key).toBe(reference.key);
          expect(cel.pixel(cel.left, cel.top)).toEqual(reference.pixel(reference.left, reference.top));
        }
      }
      gripping = grip;
      if (e.target !== sector) {
        departing = true;
        const view = camera(0), p = project(view, posed.x, posed.y), last = project(view, previous.x, previous.y);
        expect(Math.hypot(p.x - last.x, p.y - last.y) / view.zoom).toBeLessThan(6);
        if (!posed.threshold) break;
      }
      previous = posed;
    }
    expect(knocks).toBe(2);
    expect(departing).toBe(true);
    expect(doorStance(e).threshold).toBeUndefined();
  });

  it.each(['stride', 'vault'] as const)('keeps the deer facing along its path through every %s pose', async action => {
    const e = actor('deer'), stride = mobCycle('deer')!.stride;
    const keys = action === 'stride' ? ['mob_gait_deer'] :
      ['front', 'back'].flatMap(view => ['x', 'a', 'b'].map(pose => 'en_deer_' + view + '_' + pose));
    const images = new Map(await Promise.all(keys.map(async key => [key,
      await sharp('public/assets/sprites/' + key + '.webp').ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ] as const)));
    if (action === 'vault') e.vault = { start: 0, length: 1 };
    for (const rot of views) for (const [fx, fy] of [[0, 1], [1, 0]] as const) for (let step = 0; step < 16; step++) {
      Object.assign(e, { fx, fy, travel: (step + .5) / 16 * (action === 'vault' ? 1 : stride) });
      const { ctx, blits } = capture();
      drawEnemy(ctx, camera(rot), frame, e);
      const cel = blits[0]!, { data, info } = images.get(cel.key)!;
      const ink = (x: number, y: number) => data[4 * ((cel.top + y) * info.width + cel.left + x) + 3]! > 128;
      let top = 0;
      while (top < cel.sh && !Array.from({ length: cel.sw }, (_, x) => ink(x, top)).some(Boolean)) top++;
      const bandCentre = (from: number, to: number) => {
        let area = 0, sum = 0;
        for (let y = Math.round(top + from * (cel.sh - top)); y < top + to * (cel.sh - top); y++) {
          for (let x = 0; x < cel.sw; x++) if (ink(x, y)) { area++; sum += x; }
        }
        return cel.pixel(cel.left + sum / area, cel.top).x;
      };
      // The antlers always sit ahead of the torso. Compare on one scanline to exclude the vault's body lean.
      const forward = (fx - fy) * (rot ? -1 : 1);
      expect((bandCentre(0, .22) - bandCentre(.38, .68)) * forward, cel.key + ' at step ' + step).toBeGreaterThan(0);
    }
  });

  it.each(types)('%s retains every painted stride frame and its lead foot when the camera turns', async type => {
    const e = actor(type), mower = type === 'mower', key = mower ? 'boss_mower_gait' : 'mob_gait_' + type;
    const { data, info } = await sharp('public/assets/sprites/' + key + '.webp').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const used = new Set<number>();
    for (const action of (mower ? ['walk', 'charge'] as const : ['walk'] as const)) {
      e.action = action;
      const stride = mower ? action === 'charge' ? mowerGait.chargeStride : mowerGait.walkStride : mobCycle(type)!.stride;
      for (let step = 0; step < 16; step++) {
        e.travel = (step + .5) * stride / 16;
        const banks = views.map(rot => {
          const v = camera(rot);
          const directions = [[0, 1], [1, 0]].map(([fx, fy]) => {
            Object.assign(e, { fx, fy });
            const { ctx, blits } = capture();
            drawEnemy(ctx, v, frame, e);
            return blits[0]!;
          });
          const [cel, reflected] = directions;
          expect(cel!.key).toBe(key);
          expect([reflected!.key, reflected!.left, reflected!.top]).toEqual([key, cel!.left, cel!.top]);
          const across = (blit: typeof cel) => blit!.pixel(blit!.left + blit!.sw, blit!.top).x - blit!.pixel(blit!.left, blit!.top).x;
          expect(across(cel)).toBeCloseTo(-across(reflected), 7);
          const { left, top, sw, sh } = cel!;
          const index = top / sh * (info.width / sw) + left / sw;
          let foot = sh - 1;
          while (foot >= 0) {
            const row = ((top + foot) * info.width + left) * 4;
            let painted = 0;
            for (let x = 0; x < sw; x++) if (data[row + x * 4 + 3]! >= 160) painted++;
            if (painted >= 3) break;
            foot--;
          }
          expect(foot / sh).toBeGreaterThan(mower ? .8 : .94);
          expect(foot).toBeLessThan(sh - 1);
          used.add(index);
          return index;
        });
        expect(banks[1]! - banks[0]!).toBe(16);
      }
    }
    expect(used.size).toBe(mower ? 64 : 32);
  });

  it('places both mower boots on their authored tracks in walk, charge and reduced motion', async () => {
    const { data, info } = await sharp('public/assets/sprites/boss_mower_gait.webp').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { standingHeight, renderHeight, cellWidth, cellHeight, atlasScale, walkStride, chargeStride, groundPadding } = mowerGait;
    const e = actor('mower');
    for (const rot of views) for (const bank of ['walk', 'charge', 'still'] as const) {
      const rear = rot === 1, dir = rear ? 1 : -1, charging = bank === 'charge', stride = charging ? chargeStride : walkStride;
      const dx = (cellWidth - (rear ? 225 : 280)) / 2, dy = cellHeight - standingHeight - groundPadding;
      const homes = rear ? [[102, 220], [53, 239]] as const : [[180, 214], [153, 229]] as const;
      for (let step = 0; step < (bank === 'still' ? 1 : 16); step++) {
        e.action = charging ? 'charge' : 'walk'; e.travel = (step + .5) * stride / 16;
        const { ctx, blits } = capture();
        motion.reduced = bank === 'still';
        try { drawEnemy(ctx, camera(rot), frame, e); } finally { motion.reduced = false; }
        const cel = blits[0]!;
        expect(cel.top / cel.sh * 8 + cel.left / cel.sw).toBe(bank === 'still' ? 64 + rot : (charging ? 32 : 0) + rot * 16 + step);
        for (const [leg, [hx, hy]] of homes.entries()) {
          const phase = (step / 16 + leg * .5) % 1, support = charging ? .47 : .56;
          if (phase > support && bank !== 'still') continue;
          // A supporting boot travels backward at world speed along the 2:1 yard lane.
          const offset = bank === 'still' ? 0 : (.5 * support - phase) * stride * 32 * standingHeight / renderHeight;
          const sx = (dx + hx + dir * offset) * atlasScale, sy = (dy + hy - dir * .5 * offset) * atlasScale;
          let nearest = Infinity;
          for (let y = Math.floor(sy) - 4; y <= Math.ceil(sy) + 4; y++) for (let x = Math.floor(sx) - 4; x <= Math.ceil(sx) + 4; x++) {
            if (data[((cel.top + y) * info.width + cel.left + x) * 4 + 3]! >= 175) nearest = Math.min(nearest, Math.hypot(x - sx, y - sy));
          }
          expect(nearest).toBeLessThan(4);
        }
      }
    }
  });

  it.each(['runner', 'mail', 'dog', 'boar', 'deer'] as const)('%s plants a boot or paw when halted or restrained', async type => {
    const e = actor(type);
    const { data, info } = await sharp('public/assets/sprites/defense_mob_poses.webp').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const rot of views) for (const state of ['idle', 'net', 'stun']) {
      e.action = 'idle'; e.nettedFor = state === 'net' ? 1 : 0; e.stunnedFor = state === 'stun' ? 1 : 0;
      const { ctx, blits } = capture();
      drawEnemy(ctx, camera(rot), frame, e);
      const cel = blits[0]!;
      expect([cel.key, cel.left, cel.top]).toEqual(['defense_mob_poses', rot * 224, types.indexOf(type) * 144]);
      let soles = 0;
      for (let y = cel.top + 137; y < cel.top + 144; y++) for (let x = cel.left; x < cel.left + 224; x++) {
        if (data[(y * info.width + x) * 4 + 3]! >= 160) soles++;
      }
      expect(soles).toBeGreaterThan(8);
    }
  });

  it.each(types)('%s lunges, recoils, slides and presents its shoulder along its grid heading', type => {
    const e = actor(type);
    for (const [fx, fy] of headings) for (const rot of views) {
      Object.assign(e, { fx, fy });
      const v = camera(rot);
      const aligned = (x: number, y: number, sign: number) => {
        const p = unproject(v, x, y), dx = p.gx - e.x, dy = p.gy - e.y;
        expect(dx * fy - dy * fx).toBeCloseTo(0, 6);
        expect((dx * fx + dy * fy) * sign).toBeGreaterThan(0);
      };
      const shoulder = shoulderAt(v, e);
      aligned(shoulder.x, shoulder.y, 1);
      for (const recoil of [false, true]) {
        e.action = 'attack';
        e.hitFlash = recoil ? HIT_REACTION_SECONDS * .8 : 0;
        const { ctx, blits } = capture();
        drawEnemy(ctx, v, frame, e);
        const [, x, y] = shadow.mock.lastCall!;
        aligned(x, y - v.zoom, recoil ? -1 : 1);
        const cel = blits[0]!;
        const boot = cel.pixel(cel.left + cel.sw / 2, cel.top + cel.sh);
        expect(boot.x).toBeCloseTo(x, 6);
        expect(boot.y).toBeCloseTo(y + 2 * v.zoom, 6);
      }
      drawFallen(capture().ctx, v, frame, { ...e, age: 1.2 });
      const [, x, y] = shadow.mock.lastCall!;
      aligned(x, y, -1);
    }
  });

  it('keeps painted crawl contacts on the ground through each stroke, restraint, impact and collapse', async () => {
    const { data, info } = await sharp('public/assets/sprites/defense_crawl.webp').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const dead = await sharp('public/assets/sprites/defense_mob_poses.webp').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Source columns through the front and back supporting limbs, in each stroke.
    const limbs = [
      [[64, 148], [66, 148], [68, 142], [53, 152]],
      [[60, 152], [46, 148], [50, 140], [34, 132]],
      [[39, 177], [35, 189], [83, 174], [40, 197]],
      [[68, 136], [35, 168], [53, 155], [34, 178]],
    ] as const;
    for (const type of ['runner', 'dog'] as const) for (const rot of views) {
      const v = camera(rot), e = actor(type), strokes = new Set<number>();
      Object.assign(e, { action: 'crawl', crawlDepth: 1 });
      const check = (fallen: boolean) => {
        const { ctx, blits } = capture();
        if (fallen) drawFallen(ctx, v, frame, { ...e, age: .15 });
        else drawEnemy(ctx, v, frame, e);
        const cel = blits[0]!;
        expect(cel.key).toBe('defense_crawl');
        const row = Math.floor(cel.top / 148), column = cel.left / 216;
        expect(row).toBe((type === 'dog' ? 2 : 0) + rot);
        const points = limbs[row]![column]!.map(x => {
          const sx = cel.left + x;
          let sy = (row + 1) * 148 - 1;
          while (sy >= row * 148 && data[(sy * info.width + sx) * 4 + 3]! < 172) sy--;
          expect(sy).toBeGreaterThanOrEqual(cel.top);
          return cel.pixel(sx, sy);
        });
        const mid = unproject(v, (points[0]!.x + points[1]!.x) / 2, (points[0]!.y + points[1]!.y) / 2);
        const [, x, y] = shadow.mock.lastCall!, ground = unproject(v, x, y - (fallen ? 0 : v.zoom));
        expect(Math.hypot(mid.gx - ground.gx, mid.gy - ground.gy)).toBeLessThan(.045);
        strokes.add(column);
      };
      for (let i = 0; i < 16; i++) { e.travel = i * .06; check(false); }
      expect(strokes.size).toBe(3);
      e.nettedFor = 1; check(false);
      e.hitFlash = HIT_REACTION_SECONDS * .5; check(false);
      check(true);
      const { ctx, blits } = capture();
      drawFallen(ctx, v, frame, { ...e, age: .241 });
      const cel = blits[0]!;
      expect(cel.key).toBe('defense_mob_poses');
      let mx = 0, my = 0, weight = 0;
      for (let y = cel.top; y < cel.top + cel.sh; y++) for (let x = cel.left; x < cel.left + cel.sw; x++) {
        const ink = dead.data[(y * dead.info.width + x) * 4 + 3]!;
        if (ink < 128) continue;
        weight += ink; mx += ink * x; my += ink * y;
      }
      const centre = cel.pixel(mx / weight, my / weight), [, x, y] = shadow.mock.lastCall!;
      expect(Math.hypot(centre.x - x, centre.y - y) / v.zoom).toBeLessThan(1);
    }
  });
});

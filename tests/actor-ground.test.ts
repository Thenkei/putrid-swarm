import { afterAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { mopedPath } from '../src/core/epics';
import { SECTOR_IDS, type EnemyTypeId } from '../src/core/types';
import { drawFallen } from '../src/render/infected';
import { drawMopedBlast, mopedMount } from '../src/render/moped';
import { hitsMopedWreck } from '../src/render/moped-wreck';
import { project, unproject, type Rot, type View } from '../src/render/projection';

vi.mock('../src/engine/assets', () => ({
  sprite: (key: string) => key === 'defense_mob_poses' ? { w: 2688, h: 1584, img: {} } : undefined,
}));
vi.mock('../src/render/shadows', () => ({ contactShadow() {} }));
vi.hoisted(() => vi.stubGlobal('Image', class { naturalWidth = 768; complete = true; }));
afterAll(() => vi.unstubAllGlobals());

const camera = (rot: Rot): View => ({ rot, zoom: rot ? 1.48 : .72, cx: 13, cy: 8, x: 32, y: 40, w: 920, h: 550 });
const sides = [0, 1] as const;

describe('actor and vehicle contacts under a camera turn', () => {
  it.each(SECTOR_IDS)('keeps both moped tyres on the %s track at the same world coordinates', async sector => {
    const { data, info } = await sharp('public/assets/sprites/epic_moped_art.webp')
      .resize(480, 320, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const [from, to] = mopedPath(sector);
    const contacts = sides.map(rot => {
      const v = camera(rot), root = project(v, from.x, from.y), end = project(v, to.x, to.y);
      const [a, b, , , e, f] = mopedMount(Math.atan2(end.y - root.y, end.x - root.x), true);
      return [86, 401].map(x => {
        let y = 319;
        while (y >= 0 && data[(y * info.width + x) * 4 + 3]! < 160) y--;
        const u = -31 + x * 62 / 480, w = -34 + y * 41.33 / 320;
        const result = unproject(v, root.x + (a * u + e) * v.zoom, root.y + (b * u + w + f) * v.zoom);
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        expect(Math.abs((result.gx - from.x) * (to.y - from.y) - (result.gy - from.y) * (to.x - from.x)) / distance).toBeLessThan(.025);
        return result;
      });
    });
    for (const [i, contact] of contacts[0]!.entries()) {
      expect(Math.hypot(contact.gx - contacts[1]![i]!.gx, contact.gy - contacts[1]![i]!.gy)).toBeLessThan(.04);
    }
  });

  it.each(SECTOR_IDS)('keeps the freed wheel inspectable on the %s skid', sector => {
    const [from, end] = mopedPath(sector);
    const distance = Math.hypot(end.x - from.x, end.y - from.y);
    const wreck = { x: end.x + 1.05 * (end.x - from.x) / distance, y: end.y + 1.05 * (end.y - from.y) / distance };
    for (const rot of sides) {
      const v = camera(rot), root = project(v, wreck.x, wreck.y), start = project(v, from.x, from.y);
      const angle = Math.atan2(root.y - start.y, root.x - start.x);
      const x = root.x + 20 * Math.cos(angle) * v.zoom, y = root.y + (20 * Math.sin(angle) - 12 * .36) * v.zoom;
      expect(hitsMopedWreck(v, sector, x, y)).toBe(true);
      expect(hitsMopedWreck(v, sector, x + 22 * Math.cos(angle) * v.zoom, y + 22 * Math.sin(angle) * v.zoom)).toBe(false);
    }
  });

  it('keeps the fire at impact and the rising smoke downwind in both cameras', () => {
    const path = mopedPath('grange'), impact = path[1];
    const ride = { sector: 'grange' as const, path, impact, start: 0, blastAt: 1, departed: true,
      hit: new Set<number>(), bladeKills: 0, blastKills: 0 };
    const feet = [[186, 346], [181, 350], [130, 353]] as const;
    const seen = new Set<number>();
    for (const age of [.18, .62, 1.7]) for (const rot of sides) {
      const v = { ...camera(rot), cx: impact.x, cy: impact.y }, centre = project(v, impact.x, impact.y);
      let scaleX = 1, scaleY = 1, tx = 0, ty = 0;
      const stack: [number, number, number, number][] = [];
      const ctx = { beginPath() {}, rect() {}, clip() {}, fillRect() {}, createRadialGradient: () => ({ addColorStop() {} }),
        save() { stack.push([scaleX, scaleY, tx, ty]); }, restore() { [scaleX, scaleY, tx, ty] = stack.pop()!; },
        translate(x: number, y: number) { tx += scaleX * x; ty += scaleY * y; }, scale(x: number, y: number) { scaleX *= x; scaleY *= y; },
        drawImage(_: unknown, left: number, top: number, sw: number, sh: number, x: number, y: number, w: number, h: number) {
          const cel = left / sw + 2 * top / sh, [cx, cy] = feet[cel]!;
          const drift = cel === 2 ? 5 * age : 0;
          expect(Math.abs((tx + scaleX * (x + cx * w / sw) - centre.x) / v.zoom - (rot ? -drift : drift))).toBeLessThan(4);
          expect(Math.abs((ty + scaleY * (y + cy * h / sh) - centre.y) / v.zoom + drift)).toBeLessThan(3);
          seen.add(cel);
        } };
      drawMopedBlast(ctx as unknown as CanvasRenderingContext2D, v, ride, 1 + age);
    }
    expect(seen.size).toBe(3);
  });

  it('draws the settled silhouettes over the same patch for every species from both sides', async () => {
    const types: EnemyTypeId[] = ['shambler', 'runner', 'brute', 'dog', 'boar', 'deer', 'mower', 'mechanic', 'mail', 'chief', 'mayor'];
    const { data, info } = await sharp('public/assets/sprites/defense_mob_poses.webp').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const type of types) {
      const footprints = sides.map(rot => {
        const v = camera(rot);
        let sx = 1, sy = 1, tx = 0, ty = 0;
        let foot = { gx: Infinity, gy: Infinity };
        const ctx = { save() {}, restore() {}, translate(x: number, y: number) { tx += sx * x; ty += sy * y; },
          scale(x: number, y: number) { sx *= x; sy *= y; },
          drawImage(_: unknown, left: number, top: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
            let px = 0, py = 0, mass = 0;
            for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
              const ink = data[((top + y) * info.width + left + x) * 4 + 3]!;
              if (ink < 128) continue;
              mass += ink; px += x * ink; py += y * ink;
            }
            foot = unproject(v, tx + sx * (dx + dw * px / (sw * mass)), ty + sy * (dy + dh * py / (sh * mass)));
          } };
        drawFallen(ctx as unknown as CanvasRenderingContext2D, v, { time: 5, night: false },
          { type, id: 5, x: 8.5, y: 13.5, fx: 1, fy: 0, age: 1.5 });
        return foot;
      });
      expect(Math.hypot(footprints[0]!.gx - footprints[1]!.gx, footprints[0]!.gy - footprints[1]!.gy), type).toBeLessThan(.055);
    }
  });
});

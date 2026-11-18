import { describe, expect, it } from 'vitest';
import { PROPS, propAt } from '../src/core/map';
import { project, unproject, type View } from '../src/render/projection';
import { SAVER_BOX, SAVER_CORNER_AT, SAVER_LOGO, saverAt } from '../src/engine/saver';

describe('the screensaver on the title monitor', () => {
  const W = SAVER_BOX.w - SAVER_LOGO.w;
  const H = SAVER_BOX.h - SAVER_LOGO.h;
  const cornered = (t: number): boolean => {
    const at = saverAt(t);
    return Math.min(at.x, W - at.x) < 0.01 && Math.min(at.y, H - at.y) < 0.01;
  };

  it('never leaves the tube', () => {
    for (let t = 0; t < 300; t += 0.37) {
      const at = saverAt(t);
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThanOrEqual(W);
      expect(at.y).toBeGreaterThanOrEqual(0);
      expect(at.y).toBeLessThanOrEqual(H);
    }
  });

  it('lands exactly in a corner when promised, and not by accident before', () => {
    expect(cornered(SAVER_CORNER_AT)).toBe(true);
    for (let t = 0; t < SAVER_CORNER_AT - 0.1; t += 0.02) expect(cornered(t), `at ${t.toFixed(2)} s`).toBe(false);
  });

  it('counts an edge each time it turns, so its colour changes on every bounce', () => {
    let last = saverAt(0).hits;
    let turns = 0;
    for (let t = 0.05; t < 60; t += 0.05) {
      const hits = saverAt(t).hits;
      expect(hits).toBeGreaterThanOrEqual(last);
      if (hits > last) turns++;
      last = hits;
    }
    expect(turns).toBeGreaterThan(8);
  });
});

describe('poking the scenery of the yard', () => {
  it('finds the break and the well under the pointer, on every cell of their footprint and from both sides, and nothing else', () => {
    for (const rot of [0, 1] as const) {
      const view: View = { rot, zoom: 0.69, cx: 11, cy: 11, x: 292, y: 56, w: 976, h: 652 };
      const under = (gx: number, gy: number, kinds: Parameters<typeof propAt>[2]) => {
        const p = project(view, gx, gy);
        const g = unproject(view, p.x, p.y);
        return propAt(g.gx, g.gy, kinds);
      };
      for (const prop of PROPS.filter((p) => p.kind === 'car' || p.kind === 'well')) {
        for (let dx = 0; dx < prop.w; dx++) {
          for (let dy = 0; dy < prop.h; dy++) {
            expect(under(prop.x + dx + 0.5, prop.y + dy + 0.5, ['car', 'well'])).toBe(prop.kind);
            expect(under(prop.x + dx + 0.5, prop.y + dy + 0.5, ['mailbox'])).toBeNull();
          }
        }
      }
      expect(under(8.5, 14.5, ['car', 'well'])).toBeNull();
    }
  });
});

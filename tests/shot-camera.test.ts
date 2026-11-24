import { expect, it } from 'vitest';
import { OVER, PLATE, pointOnShot, shotTransform } from '../src/scenes/shot-camera';

const shot = { plate: 'tree', focusY: .8 };

it('pins a prop and fingertip to the same stage position when pan is clamped', () => {
  const cam = { x: -900, y: 2000, zoom: 1.5 };
  expect(pointOnShot(shot, cam, { x: 0, y: PLATE.h - OVER * shot.focusY })).toEqual({ x: 0, y: 720 });
});

it('keeps every rotated stage corner within the plate even at minimum zoom', () => {
  for (const roll of [-.025, .025]) {
    const [a, b, c, d, e, f] = shotTransform(shot, { x: -300, y: 1000, zoom: 1, roll });
    const det = a * d - b * c;
    for (const [x, y] of [[0, 0], [1280, 0], [1280, 720], [0, 720]] as const) {
      const px = (d * (x - e) - c * (y - f)) / det;
      const py = (a * (y - f) - b * (x - e)) / det;
      expect(px).toBeGreaterThanOrEqual(-1e-8);
      expect(px).toBeLessThanOrEqual(PLATE.w + 1e-8);
      expect(py).toBeGreaterThanOrEqual(-OVER * shot.focusY - 1e-8);
      expect(py).toBeLessThanOrEqual(PLATE.h - OVER * shot.focusY + 1e-8);
    }
  }
});

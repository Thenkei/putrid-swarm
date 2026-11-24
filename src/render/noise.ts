// Deterministic noise for the scenery. Nothing here touches Math.random: the same coordinates
// always give the same value, so both sides of the house and every camera show the same ground.

export { smoothstep, clamp01 } from '../core/math';

/** A stable 0..1 number for an integer lattice point. */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1, one feature per unit. */
export function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal noise, 0..1: `octaves` layers of value noise, each twice as fine and half as strong. */
export function fbm(x: number, y: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, y * frequency, seed + i * 101) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

/**
 * Fractal noise that repeats every `period` units on both axes, 0..1: for pictures laid as a
 * repeating pattern (drifting cloud shadow, ground mist) that must not show where they wrap.
 */
export function periodicFbm(x: number, y: number, period: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amplitude = 0.5;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    const wrap = period * frequency;
    const px = x * frequency;
    const py = y * frequency;
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const x0 = ((ix % wrap) + wrap) % wrap;
    const y0 = ((iy % wrap) + wrap) % wrap;
    const x1 = (x0 + 1) % wrap;
    const y1 = (y0 + 1) % wrap;
    const s = seed + i * 101;
    const a = hash2(x0, y0, s);
    const b = hash2(x1, y0, s);
    const c = hash2(x0, y1, s);
    const d = hash2(x1, y1, s);
    sum += (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

/** A small seeded generator for scatter that must come out the same on every run. */
export function seeded(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

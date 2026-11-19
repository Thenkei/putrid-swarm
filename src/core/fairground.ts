export const COURSE = [
  { from: 8, to: 39, seconds: 2.5 },
  { from: 33, to: 65, seconds: 2.1 },
  { from: 59, to: 89, seconds: 1.8 },
] as const;

export const GATE_WINDOW = { opens: 0.58, closes: 0.88 } as const;

export function gateResult(progress: number): 'early' | 'caught' | 'late' {
  if (progress < GATE_WINDOW.opens) return 'early';
  return progress <= GATE_WINDOW.closes ? 'caught' : 'late';
}

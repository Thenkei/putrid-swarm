/** The cub reaches the threshold after the last infected passes and needs 1.2 seconds to cross. */
export const PACK_CYCLE = 8;
export const PACK_GAP = 3;
export const PACK_RETURN = 7;
export const CUB_CROSSING = 1.2;

export const packPhase = (time: number): number => time % PACK_CYCLE;

/** A gap cannot be carried into the next cycle. Both instants belong to this opening. */
export function gatePassage(openedAt: number, now: number): 'impact' | 'crossing' | 'through' {
  const returnsAt = Math.floor(openedAt / PACK_CYCLE) * PACK_CYCLE + PACK_RETURN;
  if (packPhase(openedAt) < PACK_GAP || now >= returnsAt) return 'impact';
  return now >= openedAt + CUB_CROSSING ? 'through' : 'crossing';
}

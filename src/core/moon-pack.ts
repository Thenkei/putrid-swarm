/** The cub reaches the threshold after the last infected passes and needs 1.2 seconds to cross. */
export const PACK_CYCLE = 8;
export const PACK_GAP = 3;
export const PACK_RETURN = 7;
export const CUB_CROSSING = 1.2;

export const packPhase = (time: number): number => time % PACK_CYCLE;

/** A gap cannot be carried into the next cycle. Both instants belong to this opening. */
export function gatePassage(openedAt: number, now: number): 'impact' | 'crossing' | 'through' {
  const opened = packPhase(openedAt);
  if (opened < PACK_GAP || opened + now - openedAt >= PACK_RETURN) return 'impact';
  return now - openedAt >= CUB_CROSSING ? 'through' : 'crossing';
}

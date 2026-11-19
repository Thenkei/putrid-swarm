import { createRng } from './rng';
import { shuffled } from './scavenge';
import type { Dispute, GameState } from './types';

export const APPRAISAL_FLAG = 'dealer:appraised';

/** The tags and folded rival bid are fixed for the saved dispute, without spending campaign RNG. */
export function radioAppraisal(state: Pick<GameState, 'seed' | 'day'>, dispute: Pick<Dispute, 'spot'>) {
  const rng = createRng(state.seed ^ Math.imul(state.day, 16777619) ^ Math.imul(dispute.spot + 1, 2246822519));
  const sticker = rng.int(9, 18) * 10;
  const markdown = rng.int(1, 4) * 10;
  const correct = sticker - markdown;
  const dealer = correct - 10;
  const bids = shuffled([dealer, correct, correct + 10], rng);
  return { sticker, markdown, correct, dealer, bids };
}

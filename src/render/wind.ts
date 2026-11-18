import { calmMotion } from './lighting';
import { smoothstep } from './noise';
import type { Rot } from './projection';

/** A gust travels across the lot in grid space. Nearby stems share its push and recover at
 * slightly different rates. Reversing the camera reverses the visible direction of travel. */
export function windAt(time: number, gx: number, gy: number, trait: number, rot: Rot): number {
  if (calmMotion()) return 0;
  const distance = gx * 0.32 + gy * 0.19;
  const front = 0.5 + 0.33 * Math.sin(time * 0.79 - distance) + 0.17 * Math.sin(time * 0.43 - distance * 0.71 + 2.4);
  const gust = smoothstep(0.22, 0.87, front);
  const flutter = Math.sin(time * 3.1 - distance * 1.4 + trait * 2.8);
  const recovery = Math.sin(time * 1.68 - distance + trait * 0.9);
  const bend = gust * (0.73 + 0.24 * flutter) + 0.14 * recovery;
  return rot === 0 ? bend : -bend;
}

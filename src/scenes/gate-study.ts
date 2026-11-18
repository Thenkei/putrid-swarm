// Dev-only entry on a separate origin. Reload to replay exactly the same first-night wave.
import { newGame } from '../core/game';
import { build } from '../core/yard';
import type { App, Scene } from '../engine/app';
import { S } from '../engine/i18n';
import { DayScene } from './day';
import { enableYardModels } from './yard-renderer';

export async function gateStudy(app: App): Promise<() => Scene> {
  let state = newGame(42);
  state = { ...state, inventory: { wood: 14, scrap: 12, springs: 5, wire: 5, battery: 3 } };
  // Put the barrier in the approach to the palisade gap and the lamp just inside the fence.
  const placements = [['barrier', 10, 17], ['floodlight', 12, 15]] as const;
  for (const [type, x, y] of placements) {
    const placed = build(state, type, x, y);
    if (!placed.ok) throw new Error('Invalid gate study layout: ' + placed.error.code);
    state = placed.value;
  }
  app.state = state;
  let unavailable = false;
  try {
    await enableYardModels();
  } catch {
    unavailable = true;
  }
  return () => {
    if (unavailable) requestAnimationFrame(() => app.toast(S().day.no3d, 'error'));
    return new DayScene(app);
  };
}

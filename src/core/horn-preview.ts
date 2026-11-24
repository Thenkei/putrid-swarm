import { DEVICES } from './data/devices';
import { idx } from './map';
import { computeField, nextStep, traceRoute } from './pathing';
import type { Cell } from './types';

/** A representative turn from the drawn walking routes when the horn is fired. */
export function previewHornTurn(
  horn: Cell,
  routes: readonly (readonly Cell[])[],
  traffic: ReadonlyMap<number, number>,
  fences: ReadonlySet<number>,
): readonly Cell[] {
  const field = computeField(horn, { blocked: fences });
  let start: Cell | undefined;
  let busiest = 0;
  for (const route of routes) {
    for (let i = 0; i + 1 < route.length; i++) {
      const cell = route[i]!;
      const count = traffic.get(idx(cell.x, cell.y)) ?? 0;
      if (count <= busiest || Math.hypot(cell.x - horn.x, cell.y - horn.y) > DEVICES.horn.radius) continue;
      const towardsHorn = nextStep(field, cell.x, cell.y, fences);
      const towardsDoor = route[i + 1]!;
      if (!towardsHorn || (towardsHorn.x === towardsDoor.x && towardsHorn.y === towardsDoor.y)) continue;
      busiest = count;
      start = cell;
    }
  }
  // Show only the opening steps. The time left on the horn and the walker decide how far it goes.
  return start ? traceRoute(field, start, fences).slice(0, 4) : [];
}

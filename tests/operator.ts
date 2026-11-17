// A simple automatic camera operator and a few reference layouts, shared by tests and the balance tool.
// It plays like an attentive but not clairvoyant player: it reacts to what is inside a trap's reach.

import { BARRICADE, DEVICES, isManual } from '../src/core/data/devices';
import { DAY_HOURS, LOCATIONS, SEARCH_HOURS } from '../src/core/data/locations';
import { ENTRIES, LANES, isBuildable } from '../src/core/map';
import type { NightSim } from '../src/core/night';
import { ORCHARD, daylight } from '../src/core/orchard';
import type { Cost, DeviceTypeId, GameState, SectorId } from '../src/core/types';
import { SECTOR_IDS } from '../src/core/types';
import { build, reinforceBarricade } from '../src/core/yard';

/**
 * Call once per tick. Plays like a player who follows the desk: it fires a manual trap when the
 * simulation flags it as worth firing, and leaves the automatic ones alone. `reaction` throttles
 * decisions to mimic a human looking at one camera at a time.
 */
export function operate(sim: NightSim, reaction = 0.15): void {
  if (Math.floor(sim.time / reaction) === Math.floor((sim.time - 1 / 60) / reaction)) return;
  for (const d of sim.devices) {
    if (d.state === 'armed' && isManual(d.type) && sim.opportunity(d.id).now) sim.trigger(d.id);
  }
}

/**
 * The same player, bound to the desk the way the player is: it fires only what the camera on screen
 * shows, follows the thumbnails' cue to another camera, and goes through `act`, so a one-handed night
 * makes it wait for its hand exactly as it makes the player wait. It does not press again while a
 * press is still waiting for the hand.
 */
export function operateDesk(sim: NightSim, reaction = 0.15): void {
  if (Math.floor(sim.time / reaction) === Math.floor((sim.time - 1 / 60) / reaction)) return;
  if ((sim.handView()?.queue.length ?? 0) > 0) return;
  const cued = (sector: SectorId) => sim.manualDevicesIn(sector).filter((d) => sim.opportunity(d.id).now);
  const here = cued(sim.camera);
  if (here.length > 0) {
    for (const device of here) sim.act({ kind: 'fire', deviceId: device.id });
    return;
  }
  // Nothing to fire here: go where a thumbnail shows a cue, the busiest first (what Space does).
  let best: SectorId | null = null;
  let bestScore = 0;
  for (const sector of SECTOR_IDS) {
    if (sector === sim.camera || cued(sector).length === 0) continue;
    const threat = sim.threat(sector);
    const score = 8 + threat.atDoor * 3 + threat.count + (threat.boss ? 6 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = sector;
    }
  }
  if (best) sim.act({ kind: 'look', sector: best });
}

/** Places `type` on the door lane of `sector`, `back` cells out from the door and `side` cells off the lane. */
function place(state: GameState, sector: SectorId, type: DeviceTypeId, back: number, side: number): GameState {
  const lane = LANES[sector];
  const cell = lane[lane.length - 1 - back];
  if (!cell) return state;
  const vertical = sector === 'portail' || sector === 'arriere';
  const x = cell.x + (vertical ? side : 0);
  const y = cell.y + (vertical ? 0 : side);
  if (!isBuildable(x, y)) return state;
  const result = build(state, type, x, y);
  return result.ok ? result.value : state;
}

export type Tier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** One thing a careful player adds to the yard: a device on a door lane, or a door reinforced. */
type BuildStep =
  | { readonly tier: Tier; readonly kind: 'place'; readonly sector: SectorId; readonly type: DeviceTypeId; readonly back: number; readonly side: number }
  | { readonly tier: Tier; readonly kind: 'door'; readonly sector: SectorId };

const at = (tier: Tier, sector: SectorId, type: DeviceTypeId, back: number, side: number): BuildStep => ({ tier, kind: 'place', sector, type, back, side });
const all = (tier: Tier, type: DeviceTypeId, back: number, side: number): BuildStep[] => SECTOR_IDS.map((sector) => at(tier, sector, type, back, side));

/** The reference yard, in the order it is built: each tier adds roughly one good day of scavenging. */
const BUILD_ORDER: readonly BuildStep[] = [
  at(1, 'portail', 'log', 2, 1),
  at(1, 'grange', 'spikes', 3, 0),
  at(1, 'arriere', 'spikes', 3, 0),

  at(2, 'verger', 'spikes', 3, 0),
  at(2, 'grange', 'log', 2, 1),
  at(2, 'portail', 'net', 5, 0),
  at(2, 'arriere', 'log', 2, 1),

  at(3, 'verger', 'log', 2, 1),
  ...all(3, 'spikes', 1, 0),
  at(3, 'grange', 'net', 5, 0),
  at(3, 'arriere', 'net', 5, 0),
  at(3, 'portail', 'barrier', 4, 0),
  ...SECTOR_IDS.map((sector): BuildStep => ({ tier: 3, kind: 'door', sector })),

  at(4, 'verger', 'net', 5, 0),
  ...all(4, 'floodlight', 3, -1),
  ...all(4, 'log', 4, -1),
  at(4, 'portail', 'horn', 6, 2),
  at(4, 'grange', 'barrier', 4, 0),

  ...all(5, 'spikes', 5, 1),
  ...all(5, 'net', 3, 1),
  at(5, 'arriere', 'barrier', 4, 0),
  at(5, 'verger', 'barrier', 4, 0),
  at(5, 'grange', 'horn', 6, 2),

  ...all(6, 'log', 6, 1),
  ...all(6, 'spikes', 7, 0),
  ...all(6, 'floodlight', 6, -2),
  at(6, 'arriere', 'horn', 6, 2),
  at(6, 'verger', 'horn', 6, 2),
];

const RICH = { wood: 999, scrap: 999, springs: 999, wire: 999, battery: 999 } as const;
const units = (cost: Cost): number => Object.values(cost).reduce((sum, n) => sum + (n ?? 0), 0);

/** Applies one step; also says what it cost, in resources and in hours of work at the refuge. */
function apply(state: GameState, step: BuildStep): { state: GameState; units: number; hours: number } {
  if (step.kind === 'door') {
    const result = reinforceBarricade(state, step.sector);
    if (!result.ok) return { state, units: 0, hours: 0 };
    return { state: result.value, units: units(BARRICADE.reinforceCost), hours: BARRICADE.reinforceHours };
  }
  const before = state.yard.devices.length;
  const next = place(state, step.sector, step.type, step.back, step.side);
  if (next.yard.devices.length === before) return { state, units: 0, hours: 0 };
  return { state: next, units: units(DEVICES[step.type].cost), hours: DEVICES[step.type].buildHours };
}

/**
 * Reference layouts of increasing investment. Tier 0 is the starting yard; each tier adds roughly
 * one good day of scavenging.
 */
export function layout(base: GameState, tier: Tier): GameState {
  let s: GameState = { ...base, inventory: { ...RICH }, hoursLeft: 999 };
  for (const step of BUILD_ORDER) if (step.tier <= tier) s = apply(s, step).state;
  return { ...s, inventory: base.inventory, hoursLeft: base.hoursLeft };
}

// ───────────────────────────── What a day of daylight buys ─────────────────────────────

/** Daylight of each day of a run, from day 1: whole, or one-armed from the morning after night 2. */
export function daylightOfDays(arms: 1 | 2, days: number): number[] {
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    if (arms === 2 || day <= ORCHARD.night) return DAY_HOURS;
    const hours = daylight({ orchard: 'maimed' });
    return day === ORCHARD.night + 1 ? hours - ORCHARD.faintHours : hours;
  });
}

/** Daylight a careful player spends every day after the first on what the night broke: doors, traps, the house. */
export const UPKEEP_HOURS = 1;

/**
 * The share of the rest that ends up in the yard. The plan below is perfect — the best spot open, the
 * drive split over its spots, never a wasted trip — and a day is not: encounters, half-empty boots,
 * second thoughts. At this share two arms stand behind most of tier 3 on night 3, tier 4 on night 5
 * and tier 5 on night 7: a lean yard on purpose, so that what one arm costs shows while the house
 * still has a margin to lose.
 */
export const USEFUL_SHARE = 0.55;

/** A search spot as the day model sees it: what it holds on average, what it costs with its share of the drive, from which day. */
interface Spot {
  readonly units: number;
  readonly hours: number;
  readonly from: number;
}

/** Every spot of the village, richest per hour first. Places are emptied for good, so this is all there is. */
const SPOTS: readonly Spot[] = Object.values(LOCATIONS)
  .flatMap((location) =>
    location.spots.map((spot) => ({
      units: Object.values(spot.loot).reduce((sum, [min, max]) => sum + (min + max) / 2, 0),
      hours: SEARCH_HOURS + (location.travelHours * 2) / location.spots.length,
      from: location.unlockDay,
    })),
  )
  .sort((a, b) => b.units / b.hours - a.units / a.hours);

/**
 * The yard a careful player stands behind on the evening of `night`, day by day: each day's daylight,
 * less the upkeep, goes into searching the richest spots open that day and building the reference
 * order as soon as there is enough to build the next piece. Resources are counted as interchangeable
 * units; encounters and the boot's limits are left out. The yard is whole every evening, so this is
 * the best case — for both runs alike.
 */
export function yardBy(base: GameState, days: readonly number[], night: number): { state: GameState; steps: number; units: number } {
  let s: GameState = { ...base, inventory: { ...RICH }, hoursLeft: 999 };
  const left = [...SPOTS];
  let stock = 0;
  let steps = 0;
  let found = 0;
  for (let day = 1; day <= night; day++) {
    let hours = ((days[day - 1] ?? DAY_HOURS) - (day > 1 ? UPKEEP_HOURS : 0)) * USEFUL_SHARE;
    for (;;) {
      const step = BUILD_ORDER[steps];
      const next = step ? apply(s, step) : null;
      if (next && stock >= next.units && hours >= next.hours) {
        stock -= next.units;
        hours -= next.hours;
        s = next.state;
        steps++;
        continue;
      }
      const spot = left.findIndex((candidate) => candidate.from <= day && candidate.hours <= hours);
      if (!next || spot < 0) break;
      const [taken] = left.splice(spot, 1) as [Spot];
      stock += taken.units;
      found += taken.units;
      hours -= taken.hours;
    }
  }
  return { state: { ...s, inventory: base.inventory, hoursLeft: base.hoursLeft }, steps, units: Math.round(found) };
}

/** How far along the reference tiers a number of build steps is, as "tier 3 + 2". */
export function tierOf(steps: number): string {
  const done = BUILD_ORDER.slice(0, steps);
  const full = Math.max(0, ...([0, 1, 2, 3, 4, 5, 6] as Tier[]).filter((tier) => BUILD_ORDER.filter((s) => s.tier <= tier).length <= steps));
  const extra = done.filter((s) => s.tier > full).length;
  return extra > 0 ? `${full}+${extra}` : `${full}`;
}

export const layoutCost = (state: GameState): Record<string, number> => {
  const total: Record<string, number> = {};
  for (const d of state.yard.devices) for (const [k, v] of Object.entries(DEVICES[d.type].cost)) total[k] = (total[k] ?? 0) + (v ?? 0);
  return total;
};

export const doors = ENTRIES;

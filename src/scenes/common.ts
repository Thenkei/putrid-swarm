// Pieces shared by several scenes: plates, resource chips, key labels.

import { epicFlag, mopedCargo } from '../core/epics';
import { hasLeftArm } from '../core/orchard';
import type { Cost, GameState, Inventory, ResourceId } from '../core/types';
import { RESOURCE_IDS } from '../core/types';
import { STAGE_H, STAGE_W } from '../engine/app';
import { assetUrl, sprite } from '../engine/assets';
import { audio, type Sfx } from '../engine/audio';
import { sayAny } from '../engine/voice';
import { el } from '../engine/dom';
import { S, isSingular } from '../engine/i18n';

// ───────────────────────────── The protagonist as he is ─────────────────────────────

/** Pictures the protagonist is in that have a twin with his left sleeve empty and knotted, `<key>_one_arm`. */
const ONE_ARMED_TWINS: ReadonlySet<string> = new Set([
  'plate_control_room',
  'plate_morning',
  'plate_loc_garage',
  'plate_town',
  'plate_trunk',
  'plate_return',
  'plate_village',
  'plate_van',
  'plate_finale_swarmed',
]);

/** Whether the run on screen has lost the arm. No run (title, menus) is two arms. */
export const oneArmed = (state: Pick<GameState, 'orchard'> | null | undefined): boolean => (state ? !hasLeftArm(state) : false);

/**
 * The picture to show for `key`: once the orchard has taken the arm, the twin he has one arm in.
 * A twin that is missing (not generated, still loading) falls back on the picture itself.
 */
export function heroArt(key: string, armless: boolean): string {
  if (!armless || !ONE_ARMED_TWINS.has(key)) return key;
  const twin = `${key}_one_arm`;
  return sprite(twin) ? twin : key;
}

/**
 * Draws a plate so it covers the stage, with an optional slow push-in. `focusY` picks the vertical crop (0 top … 1 bottom).
 * `oneArmed` shows the protagonist as he is once the orchard has taken his arm, in the pictures he is in.
 */
export function drawPlate(ctx: CanvasRenderingContext2D, key: string, options: { zoom?: number; focusX?: number; focusY?: number; alpha?: number; oneArmed?: boolean } = {}) {
  const art = sprite(heroArt(key, options.oneArmed ?? false));
  if (!art) {
    ctx.fillStyle = '#1b1610';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    return null;
  }
  const zoom = options.zoom ?? 1;
  const scale = Math.max(STAGE_W / art.w, STAGE_H / art.h) * zoom;
  const w = art.w * scale;
  const h = art.h * scale;
  const x = (STAGE_W - w) * (options.focusX ?? 0.5);
  const y = (STAGE_H - h) * (options.focusY ?? 0.5);
  ctx.globalAlpha = options.alpha ?? 1;
  ctx.drawImage(art.img, x, y, w, h);
  ctx.globalAlpha = 1;
  return { x, y, w, h };
}

/** Where a point of a plate (as a 0..1 fraction of the image) lands on the stage, for the same cover framing. */
export function platePoint(key: string, fx: number, fy: number, focusY = 0.5): { x: number; y: number } {
  const art = sprite(key);
  if (!art) return { x: fx * STAGE_W, y: fy * STAGE_H };
  const scale = Math.max(STAGE_W / art.w, STAGE_H / art.h);
  const w = art.w * scale;
  const h = art.h * scale;
  return { x: (STAGE_W - w) / 2 + fx * w, y: (STAGE_H - h) * focusY + fy * h };
}

/** Rarest first: when a find mixes resources, the most precious one is the one that is heard. */
const LOOT_SOUND_ORDER: readonly ResourceId[] = ['battery', 'springs', 'wire', 'scrap', 'wood'];

/** The pick-up sound for what was found: the resource there is most of, the rarest winning a tie. */
export function lootSfx(loot: Cost): Sfx | null {
  let best: ResourceId | null = null;
  for (const id of LOOT_SOUND_ORDER) {
    const amount = loot[id] ?? 0;
    if (amount > 0 && (best === null || amount > (loot[best] ?? 0))) best = id;
  }
  return best === null ? null : `loot_${best}`;
}

const tripsSpoken = new Set<string>();
/** How often the protagonist comments on a trip after the first one of the day. */
const LATER_TRIP_CHANCE = 0.6;

/** Getting into the break (`car`) or back from it (`home`): always remarked on once a day, then now and then. */
export function tripLine(moment: 'car' | 'home', state: Pick<GameState, 'day' | 'orchard'>): void {
  const key = `${moment}:${state.day}`;
  if (tripsSpoken.has(key) && Math.random() > LATER_TRIP_CHANCE) return;
  if (sayAny(moment, { oneArmed: oneArmed(state) }) > 0) tripsSpoken.add(key);
}

/** Door, then starter: leaving somewhere in the break. */
export function carDeparture(): void {
  audio.play('car_door');
  window.setTimeout(() => audio.play('engine'), 350);
}

export function resourceChip(id: ResourceId, amount: number | string, extraClass = ''): HTMLElement {
  const url = assetUrl(`icons_${id}`);
  const icon = url ? el('img', {}) : el('span', { text: '▪' });
  if (url) (icon as HTMLImageElement).src = url;
  return el('span', { class: `res ${extraClass}`.trim(), title: S().res[id] }, [icon, String(amount)]);
}

/** A cost line; resources the inventory cannot cover are marked. */
export function costLine(cost: Cost, inventory?: Inventory, prefix = ''): HTMLElement {
  const chips = RESOURCE_IDS.filter((id) => (cost[id] ?? 0) > 0).map((id) =>
    resourceChip(id, `${prefix}${cost[id]}`, inventory && inventory[id] < (cost[id] ?? 0) ? 'short' : ''),
  );
  return el('span', { class: 'cost' }, chips.length > 0 ? chips : [el('span', { class: 'muted', text: S().day.nothing })]);
}

export function inventoryBar(inventory: Inventory): HTMLElement {
  return el(
    'span',
    { class: 'cost' },
    RESOURCE_IDS.map((id) => resourceChip(id, inventory[id])),
  );
}

export function returnCargoBar(state: GameState): HTMLElement[] {
  if (!state.outing) return [];
  const withMoped = epicFlag(state, 'loaded');
  const s = S();
  return [
    el('span', { class: 'muted', text: withMoped ? s.encounter.arrival.withMoped : s.loc.trunk }),
    inventoryBar(withMoped ? mopedCargo(state.outing.trunk).kept : state.outing.trunk),
  ];
}

export function describeCost(cost: Cost): string {
  return RESOURCE_IDS.filter((id) => (cost[id] ?? 0) > 0)
    .map((id) => `${cost[id]} ${isSingular(cost[id] ?? 0) ? S().resOne[id] : S().res[id].toLowerCase()}`)
    .join(', ');
}


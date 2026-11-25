// The one hand at the night desk, shown on the trap bar: which row of keys it is on, how far it is on
// its way to the other one, and what is waiting for it. Nothing here decides anything: the rules are
// NightSim's (`act`, `handView`); this only makes them readable, so a press that waits never looks lost.

import type { DeskPress, HandRow, HandView, NightSim } from '../core/night';
import { sectorOf } from '../core/map';
import type { SectorId } from '../core/types';
import { SECTOR_IDS } from '../core/types';
import { assetUrl } from '../engine/assets';
import { el } from '../engine/dom';
import { S } from '../engine/i18n';
import { trapKeyLabels } from '../engine/keys';

export { cameraAwaitingHand } from '../core/night';

const COACH_KEY = 'putrid-swarm.coach-hand';

/** Whether the one-handed desk has already been explained on this machine. */
export function handCoachSeen(): boolean {
  try {
    return localStorage.getItem(COACH_KEY) === '1';
  } catch {
    return false;
  }
}

export function markHandCoachSeen(): void {
  try {
    localStorage.setItem(COACH_KEY, '1');
  } catch {
    // Non-fatal: the explanation will simply be offered again.
  }
}

/** What the desk will do for each waiting press, as the key that was pressed for it. */
function keyOf(press: DeskPress, sim: NightSim, camera: SectorId): string {
  switch (press.kind) {
    case 'look':
      return String(SECTOR_IDS.indexOf(press.sector) + 1);
    case 'key':
      return trapKeyLabels()[press.slot] ?? '?';
    case 'fire': {
      const device = sim.device(press.deviceId);
      if (!device) return '?';
      const sector = sectorOf(device.x, device.y);
      const slot = sim.manualDevicesIn(sector).findIndex(d => d.id === device.id);
      const label = trapKeyLabels()[slot] ?? S().device[device.type].name.slice(0, 1);
      return sector === camera ? label : `${SECTOR_IDS.indexOf(sector) + 1}·${label}`;
    }
  }
}

/**
 * The hand-fired traps of the camera on screen that a waiting press will fire, so their buttons can
 * say the hand is coming. A trap key waiting behind a camera change belongs to the next camera.
 */
export function trapsAwaitingHand(view: HandView | null, sim: NightSim): Set<number> {
  const ids = new Set<number>();
  if (!view) return ids;
  let camera: SectorId = sim.camera;
  for (const press of view.queue) {
    if (press.kind === 'look') camera = press.sector;
    else if (press.kind === 'fire') ids.add(press.deviceId);
    else if (camera === sim.camera) {
      const device = sim.manualDevicesIn(camera)[press.slot];
      if (device) ids.add(device.id);
    }
  }
  return ids;
}

/** Where the hand is drawn along the gauge: 0 over the traps, 1 over the cameras, ½ when it is free for either. */
function position(view: HandView): number {
  const side = (row: HandRow): number => (row === 'traps' ? 0 : 1);
  const head = view.queue[0];
  if (view.row === null) return 0.5;
  const from = side(view.row);
  if (head) {
    const to = side(head.kind === 'look' ? 'cameras' : 'traps');
    return from + (to - from) * view.ready;
  }
  return view.ready >= 1 ? 0.5 : from;
}

/** The gauge on the trap bar. Kept as one element so the bar can be rebuilt around it. */
export class HandGauge {
  readonly root: HTMLElement;
  private readonly traps: HTMLElement;
  private readonly cameras: HTMLElement;
  private readonly glyph: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly queue: HTMLElement;
  private signature = '';

  constructor() {
    const s = S().night.hand;
    this.traps = el('span', { class: 'hand-pad', text: s.traps });
    this.cameras = el('span', { class: 'hand-pad', text: s.cameras });
    const url = assetUrl('desk_hand_open');
    this.glyph = url ? el('img', { class: 'hand-glyph' }) : el('span', { class: 'hand-glyph', text: '✋' });
    if (url) (this.glyph as HTMLImageElement).src = url;
    this.meter = el('i');
    this.queue = el('span', { class: 'hand-queue' });
    this.root = el('div', { class: 'hand-gauge' }, [
      el('b', { class: 'hand-title', text: s.title }),
      el('div', { class: 'hand-track' }, [this.traps, this.cameras, this.glyph]),
      el('span', { class: 'hand-meter' }, [this.meter]),
      this.queue,
    ]);
  }

  sync(view: HandView, sim: NightSim): void {
    const waiting = view.queue.length > 0;
    const free = view.row === null || view.ready >= 1;
    this.root.classList.toggle('wait', waiting);
    this.traps.classList.toggle('on', free || view.row === 'traps');
    this.cameras.classList.toggle('on', free || view.row === 'cameras');
    // From the middle of one pad to the middle of the other.
    this.glyph.style.left = `${25 + position(view) * 50}%`;
    this.meter.style.width = `${(free ? 1 : view.ready) * 100}%`;
    let camera = sim.camera;
    const keys = view.queue.map(press => {
      if (press.kind === 'look') camera = press.sector;
      return keyOf(press, sim, camera);
    });
    const signature = keys.join(' ');
    if (signature !== this.signature) {
      this.signature = signature;
      this.queue.replaceChildren(...keys.map((key) => el('b', { text: key })));
    }
  }

  /** Too much was already waiting: the gauge says it, briefly. */
  refuse(): void {
    this.root.classList.add('full');
    window.setTimeout(() => this.root.classList.remove('full'), 260);
  }
}

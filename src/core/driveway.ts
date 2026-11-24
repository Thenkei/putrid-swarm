import { carManeuver, MANEUVER_SECONDS } from './car-path';
import { idx, inGrid, isBuildable } from './map';
import type { Cell, DeviceInstance, DeviceTypeId, YardState } from './types';

interface Contact {
  readonly at: number;
  readonly sideX: number;
  readonly sideY: number;
}

// Use the wagon's oriented body throughout the reverse, turn and run down the track.
// The contact time is also the cue for the sound and the movement on screen.
const swept = new Map<number, Contact>();
for (let frame = 0; frame <= Math.ceil(MANEUVER_SECONDS * 60); frame++) {
  const at = frame / 60;
  const { position, yaw } = carManeuver(at);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (let y = Math.floor(position.y) - 2; y <= Math.floor(position.y) + 2; y++) {
    for (let x = Math.floor(position.x) - 2; x <= Math.floor(position.x) + 2; x++) {
      if (!inGrid(x, y) || swept.has(idx(x, y))) continue;
      const dx = x + .5 - position.x;
      const dy = y + .5 - position.y;
      const side = dx * c + dy * s;
      if (Math.abs(side) > .95 || Math.abs(-dx * s + dy * c) > 1.6) continue;
      const sign = side < 0 ? -1 : 1;
      swept.set(idx(x, y), { at, sideX: sign * c, sideY: sign * s });
    }
  }
}

export function onDriveway(x: number, y: number): boolean {
  return inGrid(x, y) && swept.has(idx(x, y));
}

export interface DrivewayImpact {
  readonly before: DeviceInstance;
  readonly after: DeviceInstance;
  readonly at: number;
}

const neighbours: readonly Cell[] = [
  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
  { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

function shoulder(device: DeviceInstance, contact: Contact, occupied: Set<number>): Cell | undefined {
  const bySide = (step: Cell) => step.x * contact.sideX + step.y * contact.sideY;
  // Prefer the nearest shoulder, on the side the body is pushing toward.
  const distance = (step: Cell) => Math.abs(step.x) + Math.abs(step.y);
  const directions = [...neighbours].sort((a, b) => distance(a) - distance(b) || bySide(b) - bySide(a));
  for (const step of directions) {
    const x = device.x + step.x;
    const y = device.y + step.y;
    if (step.x && step.y && !isBuildable(x, device.y) && !isBuildable(device.x, y)) continue;
    if (isBuildable(x, y) && !onDriveway(x, y) && !occupied.has(idx(x, y))) return { x, y };
  }
  return undefined;
}

export function breaksUnderWagon(type: DeviceTypeId): boolean {
  return type === 'log' || type === 'net' || type === 'floodlight';
}

export function drivewayImpacts(yard: YardState): DrivewayImpact[] {
  const contacts = yard.devices.flatMap(before => {
    const contact = swept.get(idx(before.x, before.y));
    return contact && !before.broken && (breaksUnderWagon(before.type) || before.type === 'horn') ? [{ before, contact }] : [];
  }).sort((a, b) => a.contact.at - b.contact.at || a.before.id - b.before.id);
  const occupied = new Set(yard.devices.map(d => idx(d.x, d.y)));
  const impacts: DrivewayImpact[] = [];
  for (const { before, contact } of contacts) {
    let after: DeviceInstance;
    if (breaksUnderWagon(before.type)) {
      after = { ...before, broken: true, hp: 0 };
    } else {
      const to = shoulder(before, contact, occupied);
      if (!to) continue;
      occupied.add(idx(to.x, to.y));
      after = { ...before, ...to };
    }
    impacts.push({ before, after, at: contact.at });
  }
  return impacts;
}

export function driveThroughYard(yard: YardState): YardState {
  const impacts = drivewayImpacts(yard);
  if (!impacts.length) return yard;
  const changed = new Map(impacts.map(({ after }) => [after.id, after]));
  return { ...yard, devices: yard.devices.map(device => changed.get(device.id) ?? device) };
}

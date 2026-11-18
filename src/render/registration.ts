import type { Prop, PropKind } from '../core/map';
import { project, type Point, type Rot, type View } from './projection';

/** Normalized pixel coordinates of the physical ground contact in the source painting. */
export type Foot = readonly [x: number, y: number];
export const BOTTOM_CENTRE: Foot = [0.5, 1];

// Paired landmarks measured on the artwork: wheelbase centre, masonry base, post base or
// trunk at soil level. Roofs, canopies, buckets and batteries are outside these footprints.
export const PROP_FEET: Readonly<Record<PropKind, readonly [Foot, Foot]>> = {
  car: [[0.50, 0.76], [0.54, 0.745]], well: [[0.455, 0.895], [0.50, 0.89]],
  woodpile: [[0.496, 0.833], [0.497, 0.834]], veg: [[0.50, 0.681], [0.50, 0.678]],
  apple: [[0.46, 0.932], [0.486, 0.931]], oak: [[0.494, 0.926], [0.466, 0.932]],
  rock: [[0.49, 0.812], [0.487, 0.812]], barrel: [[0.504, 0.901], [0.50, 0.90]],
  mailbox: [[0.606, 0.955], [0.414, 0.956]], bush: [[0.494, 0.89], [0.488, 0.896]],
};

export function propRoot(view: View, prop: Prop): Point {
  return project(view, prop.x + prop.w / 2, prop.y + prop.h / 2);
}

/** Position on screen of the source's top-left after registration, including a camera-facing mirror. */
export function spriteRect(root: Point, w: number, h: number, foot: Foot, flip = false) {
  return { x: root.x - w * (flip ? 1 - foot[0] : foot[0]), y: root.y - h * foot[1], w, h };
}

// The lateral foundation corners are opposite corners of the house's ground rectangle;
// their midpoint is the same world point from the two sides, even with the protruding steps.
const HOUSE_BASE: Record<Rot, Point> = { 0: { x: 382, y: 659 }, 1: { x: 389, y: 635 } };
export const HOUSE_PAINT_SCALE = 300 / 760;
export function houseOffset(rot: Rot, x: number, y: number): { dx: number; lift: number } {
  const base = HOUSE_BASE[rot];
  return { dx: (x - base.x) * HOUSE_PAINT_SCALE, lift: (base.y - y) * HOUSE_PAINT_SCALE };
}

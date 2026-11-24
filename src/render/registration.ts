import type { Prop, PropKind } from '../core/map';
import { project, TH, TW, type Point, type Rot, type View } from './projection';

/** Normalized pixel coordinates of the physical ground contact in the source painting. */
export type Foot = readonly [x: number, y: number];
/** Corrects the slope and foreshortening of a painting about its ground contact. */
export interface PaintFit {
  readonly shearY: number;
  readonly scaleY: number;
  /** For a raised rail, the line through its planted supports in fitted, unmirrored screen space. */
  readonly support?: { readonly slope: number; readonly interceptPerHeight: number };
}
export const BOTTOM_CENTRE: Foot = [0.5, 1];

type Landmark = readonly [x: number, y: number];

/** Register the three visible feet of a rectangular frame to the two grid axes. */
export function fitGroundFrame(width: number, height: number, span: number, left: Landmark, near: Landmark, right: Landmark) {
  const leftSlope = (near[1] - left[1]) / (near[0] - left[0]);
  const rightSlope = (right[1] - near[1]) / (right[0] - near[0]);
  const slope = TH / TW;
  const scaleY = 2 * slope / (leftSlope - rightSlope);
  return {
    h: span * height / (right[0] - left[0]),
    foot: [(left[0] + right[0]) / (2 * width), (left[1] + right[1]) / (2 * height)] as Foot,
    fit: { shearY: slope - scaleY * leftSlope, scaleY },
  };
}

// The planters occupy two cells along +x. The narrower firewood shelter fits inside
// one blocked cell. Measure the bases of the posts, excluding roof and foliage.
const beds = [
  fitGroundFrame(253, 230, 85, [16,189], [166,227], [239,138]),
  fitGroundFrame(342, 320, 85, [20,274], [219,315], [316,206]),
] as const;
const shelter = [
  fitGroundFrame(231, 230, 40, [23,206], [69,227], [203,183]),
  fitGroundFrame(316, 320, 40, [35,277], [89,315], [280,274]),
] as const;

// Both cameras see the near pair of tyres. Register their midpoint to the same
// screen offset from the parking-space centre as the front and boarding paintings.
const frontWheelOffset = { x: (137 + 268) / 2 - 320 * .5, y: (239 + 170) / 2 - 242 * .76 };
const rearCarFit: PaintFit = { shearY: -TH / TW - (148 - 222) / (268 - 137), scaleY: 1 };
const rearCarFoot: Foot = [.5, ((222 + 148) / 2 - frontWheelOffset.y + rearCarFit.shearY * frontWheelOffset.x) / 225];

// Paired landmarks measured on the artwork: wheelbase centre, masonry base, post base or
// trunk at soil level. Roofs, canopies, buckets and batteries are outside these footprints.
export const PROP_FEET: Readonly<Record<PropKind, readonly [Foot, Foot]>> = {
  car: [[0.50, 0.76], rearCarFoot], well: [[0.455, 0.895], [0.50, 0.89]],
  woodpile: [shelter[0].foot, shelter[1].foot], veg: [beds[0].foot, beds[1].foot],
  apple: [[0.46, 0.932], [0.486, 0.931]], oak: [[0.494, 0.926], [0.466, 0.932]],
  rock: [[0.49, 0.812], [0.487, 0.812]], barrel: [[0.504, 0.901], [0.50, 0.90]],
  mailbox: [[0.606, 0.955], [0.414, 0.956]], bush: [[0.494, 0.89], [0.488, 0.896]],
};

export function propMount(kind: PropKind, rot: Rot, height: number): { h: number; foot: Foot; fit?: PaintFit } {
  if (kind === 'veg') return beds[rot];
  if (kind === 'woodpile') return shelter[rot];
  const foot = PROP_FEET[kind][rot];
  return kind === 'car' && rot === 1 ? { h: height * 225 / 242, foot, fit: rearCarFit } : { h: height, foot };
}

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

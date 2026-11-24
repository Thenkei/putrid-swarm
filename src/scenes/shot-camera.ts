import { STAGE_H, STAGE_W } from '../engine/app';

export const PLATE = { w: 1280, h: 853 } as const;
export const OVER = PLATE.h - STAGE_H;

export interface Cam { x: number; y: number; zoom: number; roll?: number }
export interface Shot { readonly plate: string; readonly focusY: number }
export interface ShotLayer<Place> { shot: Shot; cam: Cam; alpha: number; place?: Place }

/** One affine matrix for a painted plate, everything drawn on it, and screen-space fingertips. */
export function shotTransform(shot: Shot, cam: Cam): [number, number, number, number, number, number] {
  const cos = Math.cos(cam.roll ?? 0), sin = Math.sin(cam.roll ?? 0);
  const width = Math.abs(cos) * STAGE_W + Math.abs(sin) * STAGE_H;
  const height = Math.abs(sin) * STAGE_W + Math.abs(cos) * STAGE_H;
  const zoom = Math.max(1, cam.zoom, width / PLATE.w, height / PLATE.h);
  const halfW = width / (2 * zoom), halfH = height / (2 * zoom);
  const top = -OVER * shot.focusY;
  const x = Math.min(PLATE.w - halfW, Math.max(halfW, cam.x));
  const y = Math.min(top + PLATE.h - halfH, Math.max(top + halfH, cam.y));
  const a = cos * zoom, b = sin * zoom;
  return [a, b, -b, a, STAGE_W / 2 - a * x + b * y, STAGE_H / 2 - b * x - a * y];
}

export function pointOnShot(shot: Shot, cam: Cam, point: { x: number; y: number }) {
  const [a, b, c, d, e, f] = shotTransform(shot, cam);
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

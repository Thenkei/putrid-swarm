// The title monitor's screensaver: where its logo is at any moment. Pure arithmetic, so the promise it
// makes — a corner, exactly, at a known time — can be tested.

/** Seconds the desk is left alone before the monitor starts its screensaver. */
export const SAVER_AFTER = 40;
/** Seconds into the screensaver at which the logo lands exactly in a corner: the thing everyone waits for. */
export const SAVER_CORNER_AT = 24;
export const SAVER_BOX = { w: 553, h: 399 } as const;
export const SAVER_LOGO = { w: 168, h: 46 } as const;
const SAVER_SPEED = { x: 61, y: 43 } as const;

/** A point going back and forth between 0 and `span`, from how far it has travelled in all. */
const bounce = (travelled: number, span: number): number => {
  const lap = ((travelled % (2 * span)) + 2 * span) % (2 * span);
  return lap <= span ? lap : 2 * span - lap;
};

/**
 * Where the screensaver's logo is `t` seconds in, and how many times it has hit an edge. It starts where
 * it must to be in a corner at `SAVER_CORNER_AT` exactly: both edges reached in the same instant.
 */
export function saverAt(t: number): { x: number; y: number; hits: number } {
  const w = SAVER_BOX.w - SAVER_LOGO.w;
  const h = SAVER_BOX.h - SAVER_LOGO.h;
  const x0 = (w - ((SAVER_SPEED.x * SAVER_CORNER_AT) % w)) % w;
  const y0 = (h - ((SAVER_SPEED.y * SAVER_CORNER_AT) % h)) % h;
  const u = x0 + SAVER_SPEED.x * t;
  const v = y0 + SAVER_SPEED.y * t;
  return { x: bounce(u, w), y: bounce(v, h), hits: Math.floor(u / w + 1e-6) + Math.floor(v / h + 1e-6) };
}

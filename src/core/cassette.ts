// The contact sheet is stored in playback order. Timestamps are simulation seconds,
// so a slow display or fast-forwarded night still plays back at the right speed.
export const TAPE = { width: 320, height: 144, columns: 8, frames: 64, fps: 8 } as const;

export interface MorningTape {
  readonly image: string;
  readonly times: readonly number[];
}

export function isMorningTape(value: unknown): value is MorningTape {
  if (!value || typeof value !== 'object' || !('image' in value) || !('times' in value)) return false;
  const { image, times } = value;
  return typeof image === 'string' && image.startsWith('data:image/jpeg;base64,') && image.length < 2_000_000
    && Array.isArray(times) && times.length >= 2 && times.length <= TAPE.frames
    && times.every((t, i) => typeof t === 'number' && Number.isFinite(t) && t >= 0 && (!i || t > times[i - 1]))
    && times.at(-1) - times[0] <= 8.01;
}

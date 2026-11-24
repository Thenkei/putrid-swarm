import { SECTOR_IDS, type SectorId } from './types';

export interface DefenseTake {
  readonly kind: 'defense';
  readonly sector: SectorId;
  readonly feed: SectorId;
  readonly started: number;
}

function isDefenseTake(take: unknown): take is DefenseTake {
  return typeof take === 'object' && take !== null && 'kind' in take && take.kind === 'defense'
    && 'sector' in take && SECTOR_IDS.includes(take.sector as SectorId)
    && 'feed' in take && SECTOR_IDS.includes(take.feed as SectorId)
    && 'started' in take && typeof take.started === 'number' && Number.isFinite(take.started) && take.started >= 0;
}

// The contact sheet is stored in playback order. Timestamps are simulation seconds,
// so a slow display or fast-forwarded night still plays back at the right speed.
export const TAPE = { width: 320, height: 144, columns: 8, frames: 64, fps: 8 } as const;

export interface MorningTape {
  readonly image: string;
  readonly times: readonly number[];
  /** Actual shot times on the same clock as the recorded camera frames. */
  readonly shots?: readonly number[];
  readonly defense?: DefenseTake;
}

export function isMorningTape(value: unknown): value is MorningTape {
  if (!value || typeof value !== 'object' || !('image' in value) || !('times' in value)) return false;
  const { image, times } = value;
  return typeof image === 'string' && image.startsWith('data:image/jpeg;base64,') && image.length < 2_000_000
    && Array.isArray(times) && times.length >= 2 && times.length <= TAPE.frames
    && times.every((t, i) => typeof t === 'number' && Number.isFinite(t) && t >= 0 && (!i || t > times[i - 1]))
    && times.at(-1) - times[0] <= 8.01
    && (!('defense' in value) || isDefenseTake(value.defense))
    && (!('shots' in value) || (Array.isArray(value.shots) && value.shots.length <= 3
      && value.shots.every((t, i, shots) => Number.isFinite(t) && t >= times[0] && t <= times.at(-1) && (!i || t > shots[i - 1]))));
}

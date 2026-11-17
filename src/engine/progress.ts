// What this browser keeps from one run to the next, apart from the save itself: the endings seen
// (core/endings.ts says which there are) and the best songs on the mower, one per way of playing.
// Storage may be missing, full, blocked or hand-edited: reading never throws and never trusts it,
// writing failing only means the count starts again.

import { mergeSeen, parseOrchardLegacy, parseSeen, tallyOf, withSeen, type Chapter, type EndingId, type Tally } from '../core/endings';
import { parseRecord, recordAfter, type JamMode, type JamRecord, type JamResult, type RecordOutcome } from '../core/finale';

const ENDINGS_KEY = 'putrid-swarm.endings';
/** Where the orchard counted its own endings before there was one list. Read, never written again. */
const LEGACY_ORCHARD_KEY = 'putrid-swarm.orchard.seen';
const RECORD_KEY = (mode: JamMode): string => `putrid-swarm.jam.record.${mode}`;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[progress] could not keep ${key}`, error);
  }
}

/** Every ending this browser has seen, old orchard count included. */
export const seenEndings = (): EndingId[] => mergeSeen(parseSeen(read(ENDINGS_KEY)), parseOrchardLegacy(read(LEGACY_ORCHARD_KEY)));

/** Notes an ending as seen. Says whether it was the first time. */
export function rememberEnding(id: EndingId): boolean {
  const { seen, first } = withSeen(seenEndings(), id);
  if (first) write(ENDINGS_KEY, seen);
  return first;
}

/** How many endings have been seen, in one chapter or in all. */
export const endingsTally = (chapter?: Chapter): Tally => tallyOf(seenEndings(), chapter);

export const jamRecord = (mode: JamMode): JamRecord | null => parseRecord(read(RECORD_KEY(mode)));

/** Weighs a song against the record of its mode, and keeps whichever is better. */
export function keepJam(result: JamResult): RecordOutcome {
  const outcome = recordAfter(jamRecord(result.mode), result);
  write(RECORD_KEY(result.mode), outcome.record);
  return outcome;
}

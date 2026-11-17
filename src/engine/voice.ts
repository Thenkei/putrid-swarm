// Spoken lines with their subtitle. The subtitle is the source of truth for meaning: it shows
// with the sound off, when a recording is missing, and carries the translation in English.

import type { Strings } from '../i18n/fr';
import { audio } from './audio';
import { Decks } from './deck';
import { S } from './i18n';

export type VoiceId = keyof Strings['voice'];

const said = new Set<string>();
const decks = new Decks<VoiceId>();

const numbered = (stem: string, count: number): readonly VoiceId[] => Array.from({ length: count }, (_, i) => (i === 0 ? stem : `${stem}_${i + 1}`) as VoiceId);

/** Moments that come back day after day have several lines, so the same one is not heard every time. */
export const LINES = {
  car: numbered('vo_car', 10),
  home: numbered('vo_home', 10),
  nightfall: numbered('vo_nightfall', 4),
  dawn: numbered('vo_dawn', 4),
  praise: ['vo_good_1', 'vo_good_2', 'vo_good_3'],
  smoke: ['vo_egg_smoke_1', 'vo_egg_smoke_2', 'vo_egg_smoke_3'],
} as const satisfies Record<string, readonly VoiceId[]>;
let hideTimer: number | null = null;

const host = (): HTMLElement | null => document.getElementById('subtitle');

/** Reading time for a line that has no recording. */
const readingSeconds = (text: string): number => Math.min(6, 1.2 + text.length * 0.055);

export interface SayOptions {
  /** Hide the subtitle when the same words are already on screen. */
  readonly subtitle?: boolean;
  /** Cut off a line in progress instead of being dropped. */
  readonly interrupt?: boolean;
}

/** Speaks a line. Returns its duration in seconds, or 0 if it was dropped because another line is running. */
export function say(id: VoiceId, options: SayOptions = {}): number {
  if (audio.speaking && !options.interrupt) return 0;
  const text = S().voice[id];
  const seconds = audio.say(id, options.interrupt ?? false) || readingSeconds(text);
  if (options.subtitle !== false) showSubtitle(text, seconds + 0.6);
  return seconds;
}

/** Speaks a line the first time `key` is seen in this session; later calls are ignored. */
export function sayOnce(key: string, id: VoiceId, options: SayOptions = {}): number {
  if (said.has(key)) return 0;
  const seconds = say(id, options);
  if (seconds > 0) said.add(key);
  return seconds;
}

export type Moment = keyof typeof LINES;

/** The next line for a recurring moment, never the one picked last time. */
export const pickLine = (moment: Moment): VoiceId => decks.next(moment, LINES[moment]) as VoiceId;

/** Speaks one of the lines written for a recurring moment. A line is only used up when it can be said. */
export function sayAny(moment: Moment, options: SayOptions = {}): number {
  if (audio.speaking && !options.interrupt) return 0;
  return say(pickLine(moment), options);
}

export function showSubtitle(text: string, seconds: number): void {
  const node = host();
  if (!node) return;
  node.textContent = text;
  node.classList.add('on');
  if (hideTimer !== null) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    node.classList.remove('on');
    hideTimer = null;
  }, seconds * 1000);
}

/** Cuts the current line and its subtitle (scene changes, skipping a cut-scene). */
export function hush(): void {
  audio.stopVoice();
  if (hideTimer !== null) window.clearTimeout(hideTimer);
  hideTimer = null;
  host()?.classList.remove('on');
}

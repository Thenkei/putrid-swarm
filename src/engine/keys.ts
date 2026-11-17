// What is printed on the keys the game is played with.
//
// The game reads keys by where they are (`event.code`), so the same fingers work on any layout; what
// it shows must be what is printed on them. Three sources, best first: the browser's layout map
// (Chromium only), what the keyboard itself said the last time one of those keys was pressed
// (everywhere), and a guess from the language.

import { getLang } from './i18n';

/** The physical top-left letter row: under the left hand on any layout. */
export const TRAP_KEY_CODES = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY'] as const;
export const DIGIT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4'] as const;
export const NUMPAD_CODES = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'] as const;

const AZERTY = ['A', 'Z', 'E', 'R', 'T', 'Y'] as const;
const QWERTY = ['Q', 'W', 'E', 'R', 'T', 'Y'] as const;
const QWERTZ = ['Q', 'W', 'E', 'R', 'T', 'Z'] as const;
type Row = readonly string[];

/** One key is enough to tell the three common rows apart. */
const TELLS: readonly { readonly code: string; readonly label: string; readonly row: Row }[] = [
  { code: 'KeyQ', label: 'A', row: AZERTY },
  { code: 'KeyW', label: 'Z', row: AZERTY },
  { code: 'KeyY', label: 'Z', row: QWERTZ },
  { code: 'KeyQ', label: 'Q', row: QWERTY },
  { code: 'KeyW', label: 'W', row: QWERTY },
];

export interface KeyLabels {
  /** The row the browser reported, when it can. */
  readonly mapped: Row | null;
  /** The row a key press gave away. */
  readonly told: Row | null;
  /** What each key said when it was pressed, by code. */
  readonly heard: Readonly<Record<string, string>>;
}

export const NO_LABELS: KeyLabels = { mapped: null, told: null, heard: {} };

/** A key went down: `code` is where it is, `key` what it types. Returns the same object when nothing was learned. */
export function learn(labels: KeyLabels, code: string, key: string): KeyLabels {
  if (!(TRAP_KEY_CODES as readonly string[]).includes(code)) return labels;
  // Dead keys, modifiers and combinations say nothing about what is printed on the key.
  if (key.length !== 1 || !/\p{L}/u.test(key)) return labels;
  const label = key.toUpperCase();
  if (labels.heard[code] === label) return labels;
  const tell = TELLS.find((candidate) => candidate.code === code && candidate.label === label)?.row;
  // Another row altogether (a second keyboard, a layout switched): what the other keys said no longer holds.
  if (tell && tell !== labels.told) return { ...labels, told: tell, heard: { [code]: label } };
  // A key that tells nothing apart, a QWERTY "E" say, leaves the row as it was known.
  return { ...labels, heard: { ...labels.heard, [code]: label } };
}

/** The six labels to show, for a language whose usual keyboard is the last resort. */
export function rowOf(labels: KeyLabels, lang: 'fr' | 'en'): Row {
  if (labels.mapped) return labels.mapped;
  const base = labels.told ?? (lang === 'fr' ? AZERTY : QWERTY);
  return TRAP_KEY_CODES.map((code, index) => labels.heard[code] ?? (base[index] as string));
}

// ───────────────────────────── The one keyboard in front of the player ─────────────────────────────

let current: KeyLabels = NO_LABELS;
let shown: { readonly of: KeyLabels; readonly lang: string; readonly row: Row } | null = null;

interface KeyboardLayoutApi {
  getLayoutMap(): Promise<{ get(code: string): string | undefined }>;
}

/** Ask the browser what those physical keys are labelled. Not every browser can say. */
export async function resolveKeyLabels(): Promise<void> {
  const keyboard = (navigator as Navigator & { keyboard?: KeyboardLayoutApi }).keyboard;
  if (!keyboard?.getLayoutMap) return;
  try {
    const map = await keyboard.getLayoutMap();
    const labels = TRAP_KEY_CODES.map((code) => map.get(code)?.toUpperCase());
    if (labels.every((label): label is string => typeof label === 'string' && label.length === 1)) {
      current = { ...current, mapped: labels };
    }
  } catch {
    // Not available (permissions, browser): what the keys say when pressed stands in.
  }
}

/** Every key press goes through here (engine/app.ts). True when the labels on screen are now out of date. */
export function hearKey(code: string, key: string): boolean {
  const next = learn(current, code, key);
  if (next === current) return false;
  const before = trapKeyLabels().join('');
  current = next;
  return trapKeyLabels().join('') !== before;
}

/** The six labels as they should be shown now. The same array until something changes, so it is cheap to ask every frame. */
export function trapKeyLabels(): Row {
  const lang = getLang();
  if (shown?.of !== current || shown.lang !== lang) shown = { of: current, lang, row: rowOf(current, lang) };
  return shown.row;
}

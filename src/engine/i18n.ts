import { en } from '../i18n/en';
import { fr, type Strings } from '../i18n/fr';

export type Lang = 'fr' | 'en';
const TABLES: Readonly<Record<Lang, Strings>> = { fr, en };
const STORAGE_KEY = 'putrid-swarm.lang';

let current: Lang = 'fr';

export function initLang(): Lang {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the default still applies.
  }
  if (stored === 'fr' || stored === 'en') current = stored;
  else current = navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  document.documentElement.lang = current;
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Non-fatal: the choice simply will not survive a reload.
  }
}

export const getLang = (): Lang => current;

export const line = (french: string, english: string): string => current === 'fr' ? french : english;

/** Typed access to the whole table, for structured lookups (`S().device[type].name`). */
export const S = (): Strings => TABLES[current];

/** French counts zero and one as singular; English only one. */
export const isSingular = (n: number): boolean => (current === 'fr' ? Math.abs(n) < 2 : n === 1);

/** Fills `{name}` placeholders, and picks a word by number with `{n:pièce|pièces}`. */
export function fmt(template: string, params: Readonly<Record<string, string | number>> = {}): string {
  return template
    .replace(/\{(\w+):([^|}]*)\|([^}]*)\}/g, (match, key: string, one: string, many: string) => (key in params ? (isSingular(Number(params[key])) ? one : many) : match))
    .replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

/** Hours as the game shows them: `0.5` → "0,5" in French, "0.5" in English. */
export function hours(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return current === 'fr' ? text.replace('.', ',') : text;
}

/** A daylight budget or travel duration, distinct from a clock time such as 10:15. */
export function durationLabel(hours: number): string {
  const total = Math.round(hours * 60);
  const whole = Math.floor(total / 60);
  const minutes = total % 60;
  if (!whole) return `${minutes} min`;
  const hourPart = current === 'fr' ? `${whole} h` : `${whole}h`;
  if (!minutes) return hourPart;
  return current === 'fr' ? `${hourPart} ${minutes}` : `${hourPart} ${minutes}m`;
}

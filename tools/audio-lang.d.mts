export const LANGS: readonly string[];
export const DUBS: Readonly<Record<string, { readonly code: string }>>;
export function respell(words: string): string;
export function englishText(entry: { readonly id: string; readonly text: string }): string;
export function voicesIn(lang: string): readonly { readonly id: string; readonly kind: string; readonly text: string; readonly source?: string; readonly lang?: string; readonly slot?: number }[];
export function allEntries(): readonly { readonly id: string; readonly kind: string }[];

export const MODELS: Readonly<Record<string, string>>;
export const VOICES: Readonly<Record<string, { readonly id: string; readonly name: string }>>;
export const AUDIO: readonly { readonly id: string; readonly kind: string; readonly text: string; readonly role?: string }[];

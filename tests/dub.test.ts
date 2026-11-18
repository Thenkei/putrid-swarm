import { describe, expect, it } from 'vitest';
import { LINE_SECONDS } from '../src/core/radio';
import { en } from '../src/i18n/en';
import { englishText, respell, voicesIn } from '../tools/audio-lang.mjs';
import { AUDIO } from '../tools/audio-manifest.mjs';

interface Recorded {
  readonly file: string;
  readonly kind: string;
  readonly seconds: number;
}
const recorded: Record<string, Recorded> = Object.values(import.meta.glob<Record<string, Recorded>>('../public/assets/audio/manifest.json', { eager: true, import: 'default' }))[0] ?? {};

const voices = AUDIO.filter((entry) => entry.kind === 'voice');
const spoken = (text: string): string => text.replace(/\[[^\]]*\]\s*/g, '').trim();
const unquoted = (text: string): string => text.replace(/^“\s*/, '').replace(/\s*”$/, '');

describe('the English voices', () => {
  it('say exactly what the English subtitle shows (respelled where a spelling misleads the voice), with the delivery of the French line', () => {
    for (const entry of voices) {
      const subtitle = entry.id === 'vo_broadcast' ? en.intro.broadcast : en.voice[entry.id as keyof typeof en.voice];
      expect(subtitle, entry.id).toBeTruthy();
      const text = englishText(entry);
      expect(spoken(text), entry.id).toBe(respell(unquoted(subtitle)));
      // Every delivery tag of the French line is still there, the leading ones in the lead.
      const tags = (t: string): string[] => t.match(/\[[^\]]*\]/g) ?? [];
      expect(tags(text), entry.id).toEqual(tags(entry.text));
      expect(text.startsWith('[')).toBe(entry.text.startsWith('['));
    }
  });

  it('have a recording for every line that has a French one', () => {
    const dub = voicesIn('en');
    expect(dub).toHaveLength(voices.length);
    for (const entry of dub) {
      expect(recorded[entry.id], `${entry.id} is not recorded`).toBeDefined();
      expect(recorded[entry.id]?.file).toBe(`${entry.id}.mp3`);
      expect(recorded[entry.source ?? ''], entry.source).toBeDefined();
    }
  });

  it('end inside the time the radio gives each line, which was measured on the French', () => {
    for (const [line, slot] of Object.entries(LINE_SECONDS)) {
      const seconds = recorded[`en/${line}`]?.seconds ?? 0;
      expect(seconds, line).toBeGreaterThan(0);
      expect(seconds, `en/${line} is ${seconds}s for a slot of ${slot}s`).toBeLessThanOrEqual(slot + 0.05);
    }
  });
});

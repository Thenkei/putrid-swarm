// Spoken lines in a second language. French is the source: tools/audio-manifest.mjs has each line's
// text, voice and delivery. The English line is not written twice: it is the English subtitle
// (src/i18n/en.ts), said with the delivery tags of the French one — so what is heard is what is read.
//
// Run through tsx (the package scripts do), since this reads the game's own TypeScript tables.

import { en } from '../src/i18n/en.ts';
import { LINE_SECONDS } from '../src/core/radio.ts';
import { AUDIO } from './audio-manifest.mjs';

export const LANGS = ['fr', 'en'];

/** Languages other than the source that have recordings, with the ElevenLabs language code. */
export const DUBS = { en: { code: 'en' } };

/**
 * Where a tag in the middle of a French line goes in the English one: the words it comes before.
 * A line with such a tag and no entry here fails the build of the list rather than lose its pause.
 */
const INNER_TAGS = {
  vo_cb_ham_gone: { '[pause]': 'CQ, CQ…' },
  vo_cb_dealer_owes_re_keep: { '[sighs]': 'That’s worse.' },
  vo_cb_dealer_grudge_re_lie: { '[pause]': 'Fine.' },
  vo_cb_dealer_grudge_re_planks: { '[pause]': 'The committee' },
  vo_cb_camper_grudge_re_refuse: { '[pause]': 'They won’t' },
  vo_finale_dawn: { '[beat]': 'They want' },
};

/**
 * Words the voices say wrong when spelled as they are written, and the spelling that makes them say it
 * right. The subtitle keeps the real word. (French voices read "CQ" as "sécu" and "flour" as "floor";
 * "See-Q" is how the letters sound, and "flower" is how flour is said.)
 */
const RESPELLED = [
  [/\bCQ\b/g, 'See-Q'],
  [/\bFlour\b/g, 'Flower'],
  [/\bflour\b/g, 'flower'],
];

/** The words as they are sent to the voice: the subtitle's, respelled where the spelling misleads it. */
export const respell = (words) => RESPELLED.reduce((text, [from, to]) => text.replace(from, to), words);

const LEADING = /^(\[[^\]]*\]\s*)+/;
/** Subtitles put a quoted voice in quotation marks; nobody pronounces those. */
const unquoted = (text) => text.replace(/^[“«]\s*/, '').replace(/\s*[”»]$/, '');

const subtitleOf = (id) => (id === 'vo_broadcast' ? en.intro.broadcast : en.voice[id]);

/** The text sent to the voice for `entry` in English: the French delivery, the English words. */
export function englishText(entry) {
  const subtitle = subtitleOf(entry.id);
  if (!subtitle) throw new Error(`${entry.id}: no English subtitle to say`);
  const lead = (LEADING.exec(entry.text) ?? [''])[0];
  let words = unquoted(subtitle);
  const inner = entry.text.slice(lead.length).match(/\[[^\]]*\]/g) ?? [];
  for (const tag of inner) {
    const before = INNER_TAGS[entry.id]?.[tag];
    if (!before || !words.includes(before)) throw new Error(`${entry.id}: no place in the English line for ${tag}`);
    words = words.replace(before, `${tag} ${before}`);
  }
  return `${lead}${respell(words)}`;
}

/**
 * Every voice entry as it is recorded in `lang`: the manifest's own for French; for a dub, the same
 * entry with the translated text, filed under `<lang>/<id>`. `slot` is how long the game gives the line
 * when its length is part of the rules (the radio is heard piece by piece over a fixed time).
 */
export function voicesIn(lang) {
  const voices = AUDIO.filter((entry) => entry.kind === 'voice');
  if (lang === 'fr') return voices;
  if (!DUBS[lang]) throw new Error(`No dub in "${lang}"; known: ${Object.keys(DUBS).join(', ')}`);
  return voices.map((entry) => ({ ...entry, source: entry.id, id: `${lang}/${entry.id}`, lang, text: englishText(entry), slot: LINE_SECONDS[entry.id] }));
}

/** Every entry of every language, the source first. */
export const allEntries = () => [...AUDIO, ...Object.keys(DUBS).flatMap(voicesIn)];
